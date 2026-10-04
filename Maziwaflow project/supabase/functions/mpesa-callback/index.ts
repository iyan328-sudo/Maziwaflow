import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const callback = body?.Body?.stkCallback;
    if (!callback) {
      return jsonResponse({ error: "invalid callback structure" }, 400);
    }

    const checkoutRequestId: string = callback.CheckoutRequestID;
    const resultCode: number = callback.ResultCode;
    const resultDesc: string = callback.ResultDesc;
    const merchantRequestId: string = callback.MerchantRequestID;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (resultCode === 0) {
      const metadata: { Name: string; Value: string }[] = callback.CallbackMetadata?.Item ?? [];
      const receipt = metadata.find((m) => m.Name === "MpesaReceiptNumber")?.Value ?? null;
      const amount = metadata.find((m) => m.Name === "Amount")?.Value ?? null;
      const phoneNumber = metadata.find((m) => m.Name === "PhoneNumber")?.Value ?? null;

      await supabase
        .from("mpesa_transactions")
        .update({
          status: "completed",
          result_code: resultCode,
          result_desc: resultDesc,
          mpesa_receipt_number: receipt,
          updated_at: new Date().toISOString(),
        })
        .eq("checkout_request_id", checkoutRequestId);

      const { data: tx } = await supabase
        .from("mpesa_transactions")
        .select("id, farmer_code, payment_id, amount_ksh")
        .eq("checkout_request_id", checkoutRequestId)
        .maybeSingle();

      if (tx?.payment_id) {
        await supabase
          .from("payments")
          .update({
            reference: receipt,
            status: "completed",
          })
          .eq("id", tx.payment_id);
      }

      if (tx?.farmer_code) {
        await supabase.from("notifications").insert({
          user_id: null,
          farmer_code: tx.farmer_code,
          title: "M-Pesa Payment Received",
          body: `Payment of KSh ${amount ?? tx.amount_ksh} received. M-Pesa receipt: ${receipt ?? "N/A"}`,
          type: "mpesa_payment",
          metadata: { transaction_id: tx.id, receipt, amount, phone: phoneNumber },
        });
      }
    } else {
      const status = resultCode === 1032 ? "cancelled" : "failed";

      await supabase
        .from("mpesa_transactions")
        .update({
          status,
          result_code: resultCode,
          result_desc: resultDesc,
          updated_at: new Date().toISOString(),
        })
        .eq("checkout_request_id", checkoutRequestId);
    }

    return jsonResponse({ received: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
