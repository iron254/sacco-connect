import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isTrustedMpesaCaller } from "../_shared/mpesaAuth.ts";

// Safaricom C2B Validation URL
// Called by Safaricom BEFORE the customer is debited. Must respond fast.
// Return ResultCode "0" to accept, anything else to reject.
// Common reject codes: C2B00011 Invalid MSISDN, C2B00012 Invalid Account Number,
// C2B00013 Invalid Amount, C2B00014 Invalid KYC, C2B00015 Invalid Shortcode, C2B00016 Other.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("[c2b-validation] payload:", JSON.stringify(payload));

    const billRef: string = (payload?.BillRefNumber ?? "").toString().trim();
    const amount = Number(payload?.TransAmount ?? 0);

    if (!billRef) {
      return new Response(
        JSON.stringify({ ResultCode: "C2B00012", ResultDesc: "Invalid Account Number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ ResultCode: "C2B00013", ResultDesc: "Invalid Amount" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify the account (BillRefNumber) maps to a known member.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("member_number", billRef)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ ResultCode: "C2B00012", ResultDesc: "Invalid Account Number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ResultCode: "0", ResultDesc: "Accepted" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[c2b-validation] error:", e);
    return new Response(
      JSON.stringify({ ResultCode: "C2B00016", ResultDesc: "Other Error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
