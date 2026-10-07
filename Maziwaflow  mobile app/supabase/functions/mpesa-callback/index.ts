import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, getSecurityHeaders, jsonResponse } from "../_shared/security.ts";

type CallbackItem = { Name?: unknown; Key?: unknown; Value?: unknown };
type StkCallback = {
  Body?: {
    stkCallback?: {
      CheckoutRequestID?: unknown;
      MerchantRequestID?: unknown;
      ResultCode?: unknown;
      CallbackMetadata?: { Item?: unknown };
    };
  };
};
type StatusCallback = {
  Result?: {
    ConversationID?: unknown;
    ResultCode?: unknown;
    ResultDesc?: unknown;
    ResultParameters?: { ResultParameter?: unknown };
  };
};
type Transaction = {
  id: string;
  farmer_code: string;
  payment_id: string;
  phone: string;
  amount_ksh: number;
  checkout_request_id: string;
  merchant_request_id: string;
  status: string;
  mpesa_receipt_candidate: string | null;
  transaction_status_conversation_id: string | null;
};

function response(req: Request, data: unknown, status = 200): Response {
  return jsonResponse(req, data, status);
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getBaseUrl(): string {
  return Deno.env.get("MPESA_ENVIRONMENT") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function timestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

function normalizePhone(phone: string): string {
  let normalized = phone.replace(/[\s-]/g, "");
  if (normalized.startsWith("+")) normalized = normalized.slice(1);
  if (normalized.startsWith("0")) normalized = `254${normalized.slice(1)}`;
  if (normalized.length === 9) normalized = `254${normalized}`;
  return normalized;
}

function callbackValue(items: unknown, name: string): unknown {
  if (!Array.isArray(items)) return undefined;
  return (items as CallbackItem[]).find((item) => item?.Name === name || item?.Key === name)?.Value;
}

async function getAccessToken(): Promise<string> {
  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
  if (!consumerKey || !consumerSecret) {
    throw new Error("M-Pesa consumer credentials are not configured");
  }
  const result = await fetch(
    `${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` } },
  );
  if (!result.ok) throw new Error(`Daraja authentication failed (${result.status})`);
  const body = await result.json();
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("Daraja did not return an access token");
  }
  return body.access_token;
}

async function queryCheckout(checkoutRequestId: string) {
  const shortcode = Deno.env.get("MPESA_SHORTCODE");
  const passkey = Deno.env.get("MPESA_PASSKEY");
  if (!shortcode || !passkey) throw new Error("M-Pesa shortcode or passkey is not configured");
  const now = timestamp();
  const result = await fetch(`${getBaseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: btoa(`${shortcode}${passkey}${now}`),
      Timestamp: now,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  if (!result.ok) throw new Error(`Daraja STK query failed (${result.status})`);
  const body = await result.json();
  const resultCode = Number(body.ResultCode);
  if (body.ResponseCode !== "0" || !Number.isInteger(resultCode)) return null;
  return { resultCode, resultDesc: String(body.ResultDesc ?? "") };
}

async function requestTransactionStatus(
  receipt: string,
  checkoutRequestId: string,
): Promise<string> {
  const shortcode = Deno.env.get("MPESA_SHORTCODE");
  const initiator = Deno.env.get("MPESA_INITIATOR_NAME");
  const securityCredential = Deno.env.get("MPESA_SECURITY_CREDENTIAL");
  const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL");
  const resultUrl = Deno.env.get("MPESA_TRANSACTION_STATUS_RESULT_URL") ?? callbackUrl;
  const timeoutUrl = Deno.env.get("MPESA_TRANSACTION_STATUS_TIMEOUT_URL") ?? callbackUrl;
  if (!shortcode || !initiator || !securityCredential || !resultUrl || !timeoutUrl) {
    throw new Error("Daraja Transaction Status settings are incomplete");
  }
  if (new URL(resultUrl).protocol !== "https:" || new URL(timeoutUrl).protocol !== "https:") {
    throw new Error("Daraja result callback URLs must use HTTPS");
  }
  const result = await fetch(`${getBaseUrl()}/mpesa/transactionstatus/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Initiator: initiator,
      SecurityCredential: securityCredential,
      CommandID: "TransactionStatusQuery",
      TransactionID: receipt,
      PartyA: shortcode,
      IdentifierType: "4",
      ResultURL: resultUrl,
      QueueTimeOutURL: timeoutUrl,
      Remarks: "Verify M-Pesa receipt",
      Occasion: checkoutRequestId,
    }),
  });
  if (!result.ok) throw new Error(`Daraja Transaction Status request failed (${result.status})`);
  const body = await result.json();
  if (body.ResponseCode !== "0" || typeof body.ConversationID !== "string") {
    throw new Error("Daraja rejected the Transaction Status request");
  }
  return body.ConversationID;
}

async function setTransactionFailure(
  service: ReturnType<typeof createServiceClient>,
  transaction: Transaction,
  status: "failed" | "cancelled",
  code: number,
  description: string,
) {
  if (transaction.payment_id) {
    const { error: paymentError } = await service.rpc("fail_mpesa_payment", {
      p_payment_id: transaction.payment_id,
      p_status: status,
    });
    if (paymentError) throw paymentError;
  }

  const { error } = await service
    .from("mpesa_transactions")
    .update({
      status,
      result_code: code,
      result_desc: description,
      mpesa_receipt_candidate: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transaction.id)
    .in("status", ["pending", "verifying"]);
  if (error) throw error;
}

async function handleStkCallback(
  req: Request,
  body: StkCallback,
  service: ReturnType<typeof createServiceClient>,
) {
  const callback = body?.Body?.stkCallback;
  const checkoutRequestId = callback?.CheckoutRequestID;
  const merchantRequestId = callback?.MerchantRequestID;
  const callbackCode = Number(callback?.ResultCode);
  if (
    typeof checkoutRequestId !== "string" ||
    !checkoutRequestId ||
    typeof merchantRequestId !== "string" ||
    !merchantRequestId ||
    !Number.isInteger(callbackCode)
  ) {
    return response(req, { error: "Invalid STK callback" }, 400);
  }

  const { data, error } = await service
    .from("mpesa_transactions")
    .select(
      "id, farmer_code, payment_id, phone, amount_ksh, checkout_request_id, merchant_request_id, status, mpesa_receipt_candidate, transaction_status_conversation_id",
    )
    .eq("checkout_request_id", checkoutRequestId)
    .maybeSingle();
  if (error) throw error;
  const transaction = data as Transaction | null;
  if (!transaction || transaction.merchant_request_id !== merchantRequestId) {
    return response(req, { error: "Checkout request was not found" }, 404);
  }
  if (transaction.status !== "pending") {
    return response(req, { received: true, already_processed: true });
  }

  const verified = await queryCheckout(transaction.checkout_request_id);
  if (!verified) return response(req, { received: true, verifying: true });
  if (verified.resultCode !== callbackCode) {
    return response(req, { error: "STK callback does not match Daraja's result" }, 409);
  }
  if (verified.resultCode !== 0) {
    const status = verified.resultCode === 1032 ? "cancelled" : "failed";
    await setTransactionFailure(service, transaction, status, verified.resultCode, verified.resultDesc);
    return response(req, { received: true });
  }

  const items = callback.CallbackMetadata?.Item;
  const candidate = callbackValue(items, "MpesaReceiptNumber");
  const amount = Number(callbackValue(items, "Amount"));
  const phoneValue = callbackValue(items, "PhoneNumber");
  const phone = typeof phoneValue === "string" || typeof phoneValue === "number" ? String(phoneValue) : "";
  const receipt = typeof candidate === "string" ? candidate.trim() : "";
  if (
    !receipt ||
    !Number.isSafeInteger(amount) ||
    amount !== Number(transaction.amount_ksh) ||
    !/^254\d{9}$/.test(normalizePhone(phone)) ||
    normalizePhone(phone) !== normalizePhone(transaction.phone)
  ) {
    return response(req, { error: "STK callback payment details do not match the checkout" }, 409);
  }

  const { data: payment, error: paymentError } = await service
    .from("payments")
    .select("id, farmer_code, net_ksh, status")
    .eq("id", transaction.payment_id)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (
    !payment ||
    payment.farmer_code !== transaction.farmer_code ||
    Number(payment.net_ksh) !== Number(transaction.amount_ksh) ||
    payment.status !== "pending"
  ) {
    return response(req, { error: "Checkout does not match its pending payment" }, 409);
  }

  const conversationId = await requestTransactionStatus(receipt, checkoutRequestId);
  const { data: updated, error: updateError } = await service
    .from("mpesa_transactions")
    .update({
      status: "verifying",
      mpesa_receipt_candidate: receipt,
      transaction_status_conversation_id: conversationId,
      result_code: verified.resultCode,
      result_desc: "STK payment confirmed; verifying receipt with Daraja.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", transaction.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  return response(req, { received: true, verifying: Boolean(updated) });
}

async function handleStatusCallback(
  req: Request,
  body: StatusCallback,
  service: ReturnType<typeof createServiceClient>,
) {
  const result = body?.Result;
  const conversationId = result?.ConversationID;
  const resultCode = Number(result?.ResultCode);
  if (typeof conversationId !== "string" || !conversationId || !Number.isInteger(resultCode)) {
    return response(req, { error: "Invalid transaction status callback" }, 400);
  }

  const { data, error } = await service
    .from("mpesa_transactions")
    .select(
      "id, farmer_code, payment_id, phone, amount_ksh, checkout_request_id, merchant_request_id, status, mpesa_receipt_candidate, transaction_status_conversation_id",
    )
    .eq("transaction_status_conversation_id", conversationId)
    .maybeSingle();
  if (error) throw error;
  const transaction = data as Transaction | null;
  if (!transaction) return response(req, { error: "Transaction status request was not found" }, 404);
  if (transaction.status !== "verifying") {
    return response(req, { received: true, already_processed: true });
  }

  const description = String(result?.ResultDesc ?? "");
  if (resultCode !== 0) {
    await setTransactionFailure(service, transaction, "failed", resultCode, description);
    return response(req, { received: true });
  }

  const parameters = result?.ResultParameters?.ResultParameter;
  const receipt = String(callbackValue(parameters, "ReceiptNo") ?? "").trim();
  const amount = Number(callbackValue(parameters, "Amount"));
  const phoneValue = callbackValue(parameters, "PhoneNumber");
  const phone = typeof phoneValue === "string" || typeof phoneValue === "number" ? String(phoneValue) : "";
  if (
    !transaction.mpesa_receipt_candidate ||
    receipt !== transaction.mpesa_receipt_candidate ||
    !Number.isSafeInteger(amount) ||
    amount !== Number(transaction.amount_ksh) ||
    !/^254\d{9}$/.test(normalizePhone(phone)) ||
    normalizePhone(phone) !== normalizePhone(transaction.phone)
  ) {
    const { error } = await service
      .from("mpesa_transactions")
      .update({
        status: "verification_failed",
        result_code: resultCode,
        result_desc: "Daraja details did not match; manual verification is required.",
        mpesa_receipt_candidate: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transaction.id)
      .eq("status", "verifying");
    if (error) throw error;
    return response(req, { error: "Daraja transaction details do not match" }, 409);
  }

  const { error: paymentError } = await service.rpc("complete_mpesa_payment", {
    p_payment_id: transaction.payment_id,
    p_receipt: receipt,
  });
  if (paymentError) throw paymentError;

  const { data: updated, error: updateError } = await service
    .from("mpesa_transactions")
    .update({
      status: "completed",
      mpesa_receipt_number: receipt,
      mpesa_receipt_candidate: null,
      result_code: resultCode,
      result_desc: description || "Payment verified by Daraja.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", transaction.id)
    .eq("status", "verifying")
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return response(req, { received: true, already_processed: true });

  const { error: notificationError } = await service.from("notifications").insert({
    user_id: null,
    farmer_code: transaction.farmer_code,
    title: "M-Pesa Payment Received",
    body: `Payment of KSh ${Number(transaction.amount_ksh)} received. Receipt: ${receipt}`,
    type: "mpesa_payment",
    metadata: {
      transaction_id: transaction.id,
      receipt,
      amount: Number(transaction.amount_ksh),
    },
  });
  if (notificationError) console.error("M-Pesa notification insert failed", notificationError);
  return response(req, { received: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...getCorsHeaders(req), ...getSecurityHeaders() },
    });
  }
  if (req.method !== "POST") return response(req, { error: "Method not allowed" }, 405);

  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response(req, { error: "Callback body must be an object" }, 400);
    }
    const service = createServiceClient();
    if ("Body" in body) return await handleStkCallback(req, body as StkCallback, service);
    if ("Result" in body) return await handleStatusCallback(req, body as StatusCallback, service);
    return response(req, { error: "Unrecognized callback type" }, 400);
  } catch (error) {
    console.error("M-Pesa callback processing failed", error);
    return response(req, { error: "Could not process the M-Pesa callback" }, 500);
  }
});
