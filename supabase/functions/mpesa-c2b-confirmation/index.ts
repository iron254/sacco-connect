import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Safaricom C2B Confirmation URL
// Called AFTER the customer has been debited successfully.
// We always acknowledge with ResultCode "0" so Safaricom does not retry forever.
// Handles BOTH:
//   - Push flow (STK): if a pending transaction exists with this checkout_request_id we mark it completed.
//   - Pull flow (Paybill/Till): no prior row exists — we insert a completed deposit using BillRefNumber as member id.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ack = () =>
    new Response(JSON.stringify({ ResultCode: "0", ResultDesc: "Accepted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("[c2b-confirmation] payload:", JSON.stringify(payload));

    const billRef: string = (payload?.BillRefNumber ?? "").toString().trim();
    const amount = Number(payload?.TransAmount ?? 0);
    const mpesaReceipt: string | undefined = payload?.TransID;
    const phone: string | undefined = payload?.MSISDN?.toString();
    const checkoutRequestId: string | undefined = payload?.CheckoutRequestID;

    if (!billRef || !Number.isFinite(amount) || amount <= 0) {
      console.warn("[c2b-confirmation] invalid payload, acking anyway");
      return ack();
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) If this is the tail of an STK push, just complete that transaction.
    if (checkoutRequestId) {
      const { data: existing } = await supabase
        .from("transactions")
        .select("id, status")
        .eq("checkout_request_id", checkoutRequestId)
        .maybeSingle();

      if (existing) {
        if (existing.status !== "completed") {
          await supabase
            .from("transactions")
            .update({
              status: "completed",
              mpesa_receipt: mpesaReceipt ?? null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        }
        return ack();
      }
    }

    // 2) Pull flow: resolve member by BillRefNumber (their member_number).
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("member_number", billRef)
      .maybeSingle();

    if (!profile) {
      console.warn("[c2b-confirmation] unknown member_number:", billRef);
      return ack();
    }

    const { data: wallet } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", profile.id)
      .eq("wallet_type", "savings")
      .maybeSingle();

    if (!wallet) {
      console.warn("[c2b-confirmation] no savings wallet for user:", profile.id);
      return ack();
    }

    // Idempotency on TransID.
    if (mpesaReceipt) {
      const { data: dup } = await supabase
        .from("transactions")
        .select("id")
        .eq("mpesa_receipt", mpesaReceipt)
        .maybeSingle();
      if (dup) return ack();
    }

    await supabase.from("transactions").insert({
      user_id: profile.id,
      wallet_id: wallet.id,
      transaction_type: "deposit",
      payment_method: "mpesa",
      amount,
      status: "completed",
      phone_number: phone ?? null,
      mpesa_receipt: mpesaReceipt ?? null,
      completed_at: new Date().toISOString(),
      description: "M-Pesa Paybill deposit",
    });

    return ack();
  } catch (e) {
    console.error("[c2b-confirmation] error:", e);
    // Always ack so Safaricom does not retry indefinitely.
    return ack();
  }
});
