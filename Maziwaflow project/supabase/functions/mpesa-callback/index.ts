import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type StkCallback = {
  CheckoutRequestID?: unknown;
  MerchantRequestID?: unknown;
  ResultCode?: unknown;
  ResultDesc?: unknown;
  CallbackMetadata?: { Item?: { Name?: string; Value?: string | number }[] };
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBaseUrl(): string {
  return Deno.env.get("MPESA_ENVIRONMENT") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function generateTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function getAccessToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: existing, error: cacheError } = await supabase
    .from("mpesa_auth_tokens")
    .select("access_token, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cacheError) throw new Error(`Could not read Daraja token cache: ${cacheError.message}`);
  if (existing && new Date(existing.expires_at) > new Date(Date.now() + 60_000)) {
    return existing.access_token;
  }

  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
  if (!consumerKey || !consumerSecret) {
    throw new Error("Daraja credentials are not configured");
  }

  const auth = btoa(`${consumerKey}:${consumerSecret}`);
  const response = await fetch(`${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) throw new Error(`Daraja authentication failed (${response.status})`);

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Daraja did not return an access token");

  const expiresIn = body.expires_in ?? 3600;
  const { error: insertError } = await supabase.from("mpesa_auth_tokens").insert({
    access_token: body.access_token,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });
  if (insertError) throw new Error(`Could not cache Daraja token: ${insertError.message}`);
  return body.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const callbackSecret = Deno.env.get("MPESA_CALLBACK_SECRET");
    if (!callbackSecret) {
      return jsonResponse({ error: "Callback authentication is not configured" }, 500);
    }
    const suppliedSecret = new URL(req.url).searchParams.get("token");
    if (!suppliedSecret || suppliedSecret !== callbackSecret) {
      return jsonResponse({ error: "Unauthorized callback" }, 401);
    }

    const body = await req.json();
    const stk = body?.Body?.stkCallback as StkCallback | undefined;
    const b2c = body?.Result as
      | {
          ConversationID?: unknown;
          OriginatorConversationID?: unknown;
          ResultCode?: unknown;
          ResultDesc?: unknown;
          TransactionID?: unknown;
          ResultParameters?: { ResultParameter?: { Key?: string; Value?: string | number }[] };
        }
      | undefined;
    const transactionType = stk ? "stk_push" : "b2c";
    const callback = stk ?? b2c;
    if (!callback) return jsonResponse({ error: "Invalid callback structure" }, 400);

    const checkoutRequestId = stk?.CheckoutRequestID;
    const merchantRequestId = stk?.MerchantRequestID;
    const conversationId = b2c?.ConversationID;
    const originatorConversationId = b2c?.OriginatorConversationID;
    const hasResultCode = callback.ResultCode != null;
    const resultCode = Number(callback.ResultCode);
    if (
      (transactionType === "stk_push" &&
        (typeof checkoutRequestId !== "string" || typeof merchantRequestId !== "string")) ||
      (transactionType === "b2c" &&
        (typeof conversationId !== "string" || typeof originatorConversationId !== "string")) ||
      (transactionType === "stk_push" && !hasResultCode) ||
      (hasResultCode && !Number.isInteger(resultCode))
    ) {
      return jsonResponse({ error: "Invalid callback structure" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: transaction, error: transactionError } = await supabase
      .from("mpesa_transactions")
      .select(
        "id, transaction_type, checkout_request_id, merchant_request_id, conversation_id, originator_conversation_id, amount_ksh, phone, status",
      )
      .eq(
        transactionType === "stk_push" ? "checkout_request_id" : "originator_conversation_id",
        transactionType === "stk_push" ? checkoutRequestId : originatorConversationId,
      )
      .maybeSingle();

    if (transactionError) {
      throw new Error(`Could not load M-Pesa transaction: ${transactionError.message}`);
    }
    if (!transaction) return jsonResponse({ error: "Unknown checkout request" }, 404);
    if (transaction.transaction_type !== transactionType) {
      return jsonResponse({ error: "Transaction type does not match" }, 400);
    }
    if (
      (stk && transaction.merchant_request_id !== merchantRequestId) ||
      (b2c &&
        (transaction.conversation_id !== conversationId ||
          transaction.originator_conversation_id !== originatorConversationId))
    ) {
      return jsonResponse({ error: "Provider request identifiers do not match" }, 400);
    }
    if (transaction.status !== "pending") {
      return jsonResponse({ received: true });
    }
    if (!hasResultCode) {
      const { error: timeoutError } = await supabase
        .from("mpesa_transactions")
        .update({
          result_desc: String(
            callback.ResultDesc ?? "Daraja request timed out; awaiting final result",
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id);
      if (timeoutError) throw new Error(`Could not record Daraja timeout: ${timeoutError.message}`);
      return jsonResponse({ received: true });
    }
    if (b2c && resultCode === 0 && typeof b2c.TransactionID !== "string") {
      return jsonResponse(
        { error: "Successful B2C callback must contain a transaction receipt" },
        400,
      );
    }

    if (stk) {
      const shortcode = Deno.env.get("MPESA_SHORTCODE") ?? "174379";
      const passkey = Deno.env.get("MPESA_PASSKEY");
      if (!passkey) throw new Error("MPESA_PASSKEY is not configured");

      const timestamp = generateTimestamp();
      const password = btoa(shortcode + passkey + timestamp);
      const queryResponse = await fetch(`${getBaseUrl()}/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getAccessToken(supabase)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        }),
      });
      const queryResult = (await queryResponse.json()) as {
        ResponseCode?: string;
        CheckoutRequestID?: string;
        MerchantRequestID?: string;
        ResultCode?: string | number;
      };
      if (!queryResponse.ok || queryResult.ResponseCode !== "0") {
        throw new Error(`Daraja transaction query failed (${queryResponse.status})`);
      }
      if (
        queryResult.CheckoutRequestID !== checkoutRequestId ||
        (queryResult.MerchantRequestID && queryResult.MerchantRequestID !== merchantRequestId) ||
        queryResult.ResultCode == null ||
        !Number.isInteger(Number(queryResult.ResultCode)) ||
        Number(queryResult.ResultCode) !== resultCode
      ) {
        return jsonResponse({ error: "Callback does not match Daraja transaction status" }, 400);
      }
    }

    const metadataValue = (name: string) =>
      stk?.CallbackMetadata?.Item?.find((item) => item.Name === name)?.Value;
    const b2cMetadataValue = (key: string) =>
      b2c?.ResultParameters?.ResultParameter?.find((item) => item.Key === key)?.Value;
    const receiptValue = stk ? metadataValue("MpesaReceiptNumber") : b2c?.TransactionID;
    const amountValue = stk ? metadataValue("Amount") : b2cMetadataValue("TransactionAmount");
    const phoneValue = metadataValue("PhoneNumber");
    const receipt = receiptValue == null ? null : String(receiptValue);
    const amount = amountValue == null ? null : Number(amountValue);
    const phone = phoneValue == null ? null : String(phoneValue);

    if (
      resultCode === 0 &&
      (!receipt ||
        !Number.isFinite(amount) ||
        Math.floor(Number(transaction.amount_ksh)) !== amount ||
        (stk && transaction.phone !== phone))
    ) {
      return jsonResponse({ error: "Callback payment details do not match the transaction" }, 400);
    }

    const { error: applyError } = await supabase.rpc("apply_mpesa_callback", {
      p_transaction_id: transaction.id,
      p_checkout_request_id: checkoutRequestId ?? null,
      p_merchant_request_id: merchantRequestId ?? null,
      p_conversation_id: conversationId ?? null,
      p_originator_conversation_id: originatorConversationId ?? null,
      p_result_code: resultCode,
      p_result_desc: String(callback.ResultDesc ?? ""),
      p_receipt: receipt,
      p_amount: amount,
      p_phone: phone,
    });
    if (applyError) throw new Error(`Could not apply M-Pesa callback: ${applyError.message}`);

    return jsonResponse({ received: true });
  } catch (error) {
    console.error("M-Pesa callback processing failed", error);
    return jsonResponse({ error: "Callback processing failed" }, 500);
  }
});
