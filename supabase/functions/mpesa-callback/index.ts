import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Any global holding EdgeRuntime type without importing.
// deno-lint-ignore no-explicit-any
const ER: any = (globalThis as any).EdgeRuntime;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ok = () =>
    new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const payload = await req.json();
    const stk = payload?.Body?.stkCallback;
    if (!stk) return ok();

    const checkoutId: string = stk.CheckoutRequestID;
    const resultCode: number = stk.ResultCode;

    const work = async () => {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      if (resultCode === 0) {
        const items: Array<{ Name: string; Value: unknown }> = stk.CallbackMetadata?.Item ?? [];
        const receipt = items.find(i => i.Name === "MpesaReceiptNumber")?.Value as string | undefined;
        const { error } = await admin
          .from("transactions")
          .update({ status: "completed", reference: receipt ?? checkoutId })
          .eq("checkout_request_id", checkoutId);
        if (error) console.error("Update success failed", error);
      } else {
        const { error } = await admin
          .from("transactions")
          .update({ status: "failed", description: stk.ResultDesc ?? "M-Pesa cancelled" })
          .eq("checkout_request_id", checkoutId);
        if (error) console.error("Update fail failed", error);
      }
    };

    // ACK Safaricom instantly; finish DB write in the background.
    if (ER?.waitUntil) ER.waitUntil(work());
    else await work();

    return ok();
  } catch (e) {
    console.error("Callback error", e);
    return ok();
  }
});
