import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  wallet_id: z.string().uuid(),
  amount: z.number().positive().max(150000),
  phone: z.string().regex(/^(?:254|\+254|0)?(7\d{8}|1\d{8})$/, "Enter a valid Kenyan phone"),
});

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.length === 9) return "254" + digits;
  return digits;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// In-memory OAuth token cache (per isolate). Daraja tokens last ~1h.
let cachedToken: { token: string; expiresAt: number } | null = null;
async function getAccessToken(baseUrl: string, key: string, secret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;
  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + btoa(`${key}:${secret}`) },
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error("M-Pesa auth failed");
  const ttlMs = (Number(json.expires_in ?? 3599) - 60) * 1000;
  cachedToken = { token: json.access_token, expiresAt: now + ttlMs };
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const env = Deno.env.get("MPESA_ENV") === "production" ? "production" : "sandbox";
    const baseUrl = env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY")!;
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET")!;
    const shortcode = Deno.env.get("MPESA_SHORTCODE")!;
    const passkey = Deno.env.get("MPESA_PASSKEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.issues[0].message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { wallet_id, amount, phone } = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: wallet, error: wErr } = await admin.from("wallets").select("id, user_id").eq("id", wallet_id).maybeSingle();
    if (wErr || !wallet || wallet.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Wallet not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken(baseUrl, consumerKey, consumerSecret);
    } catch (e) {
      console.error("OAuth failed", e);
      return new Response(JSON.stringify({ error: "M-Pesa auth failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ts = timestamp();
    const password = btoa(`${shortcode}${passkey}${ts}`);
    const msisdn = normalizePhone(phone);
    const callbackSecret = Deno.env.get("MPESA_CALLBACK_SECRET") ?? "";
    const callbackUrl = `${supabaseUrl}/functions/v1/mpesa-callback?t=${encodeURIComponent(callbackSecret)}`;

    const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: msisdn,
        PartyB: shortcode,
        PhoneNumber: msisdn,
        CallBackURL: callbackUrl,
        AccountReference: "SACCO",
        TransactionDesc: "SACCO Deposit",
      }),
    });
    const stkJson = await stkRes.json();
    if (!stkRes.ok || stkJson.ResponseCode !== "0") {
      console.error("STK push failed", stkJson);
      // If token was rejected, invalidate cache so next call refetches.
      if (stkRes.status === 401) cachedToken = null;
      return new Response(JSON.stringify({ error: stkJson.errorMessage || stkJson.ResponseDescription || "STK push failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: txErr } = await admin.from("transactions").insert({
      user_id: user.id,
      wallet_id,
      tx_type: "deposit",
      amount,
      currency: "KES",
      status: "pending",
      method: "mpesa",
      reference: stkJson.CheckoutRequestID,
      checkout_request_id: stkJson.CheckoutRequestID,
      description: `M-Pesa STK push to ${msisdn}`,
    });
    if (txErr) console.error("Insert tx failed", txErr);

    return new Response(JSON.stringify({
      success: true,
      message: "Check your phone to complete the payment",
      checkout_request_id: stkJson.CheckoutRequestID,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("STK push error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
