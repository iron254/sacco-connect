import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isTrustedMpesaCaller } from "../_shared/mpesaAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// deno-lint-ignore no-explicit-any
const ER: any = (globalThis as any).EdgeRuntime;

// C2B Confirmation URL — called after debit. Always ACK so Safaricom doesn't retry forever.
// Handles STK tail (updates pending row) and Paybill pull (inserts new completed deposit).

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ack = () =>
    new Response(JSON.stringify({ ResultCode: "0", ResultDesc: "Accepted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("[c2b-confirmation]", JSON.stringify(payload));

    const billRef: string = (payload?.BillRefNumber ?? "").toString().trim();
    const amount = Number(payload?.TransAmount ?? 0);
    const mpesaReceipt: string | undefined = payload?.TransID;
    const phone: string | undefined = payload?.MSISDN?.toString();
    const checkoutRequestId: string | undefined = payload?.CheckoutRequestID;

    if (!billRef || !Number.isFinite(amount) || amount <= 0) return ack();

    const work = async () => {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      // 1) STK tail — mark existing pending row complete.
      if (checkoutRequestId) {
        const { data: existing } = await admin
          .from("transactions")
          .select("id, status")
          .eq("checkout_request_id", checkoutRequestId)
          .maybeSingle();
        if (existing) {
          if (existing.status !== "completed") {
            await admin
              .from("transactions")
              .update({ status: "completed", reference: mpesaReceipt ?? checkoutRequestId })
              .eq("id", existing.id);
          }
          return;
        }
      }

      // 2) Paybill pull — resolve member and insert completed deposit.
      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("member_number", billRef)
        .maybeSingle();
      if (!profile) return;

      const { data: wallet } = await admin
        .from("wallets")
        .select("id")
        .eq("user_id", profile.id)
        .eq("wallet_type", "savings")
        .maybeSingle();
      if (!wallet) return;

      // Idempotency: unique index on (reference) where method='mpesa' protects us.
      const { error } = await admin.from("transactions").insert({
        user_id: profile.id,
        wallet_id: wallet.id,
        tx_type: "deposit",
        amount,
        currency: "KES",
        status: "completed",
        method: "mpesa",
        reference: mpesaReceipt ?? null,
        description: `M-Pesa Paybill deposit${phone ? ` from ${phone}` : ""}`,
      });
      if (error && !String(error.message).includes("duplicate")) {
        console.error("c2b insert failed", error);
      }
    };

    if (ER?.waitUntil) ER.waitUntil(work());
    else await work();

    return ack();
  } catch (e) {
    console.error("[c2b-confirmation] error:", e);
    return ack();
  }
});
