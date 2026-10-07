import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCorsHeaders,
  getSecurityHeaders,
  isRateLimited,
  jsonResponse,
} from "../_shared/security.ts";

type StkRequest = {
  phone: string;
  amount: number;
  farmer_code: string;
  payment_id: string;
};

function response(req: Request, data: unknown, status = 200): Response {
  return jsonResponse(req, data, status);
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

function formatPhone(phone: string): string {
  let normalized = phone.replace(/[\s-]/g, "");
  if (normalized.startsWith("+")) normalized = normalized.slice(1);
  if (normalized.startsWith("0")) normalized = `254${normalized.slice(1)}`;
  if (normalized.length === 9) normalized = `254${normalized}`;
  return normalized;
}

function parsePayload(value: unknown): StkRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const farmerCode = typeof body.farmer_code === "string" ? body.farmer_code.trim() : "";
  const paymentId = typeof body.payment_id === "string" ? body.payment_id.trim() : "";
  const amount = Number(body.amount);

  if (
    !phone ||
    !farmerCode ||
    farmerCode.length > 50 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      paymentId,
    ) ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > 100_000
  ) {
    return null;
  }

  return {
    phone,
    amount,
    farmer_code: farmerCode,
    payment_id: paymentId,
  };
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getAccessToken(): Promise<string> {
  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
  if (!consumerKey || !consumerSecret) {
    throw new Error("M-Pesa consumer credentials are not configured");
  }

  const baseUrl =
    Deno.env.get("MPESA_ENVIRONMENT") === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  const result = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` },
  });
  if (!result.ok) throw new Error(`Daraja authentication failed (${result.status})`);

  const body = await result.json();
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("Daraja did not return an access token");
  }
  return body.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...getCorsHeaders(req), ...getSecurityHeaders() },
    });
  }
  if (req.method !== "POST") return response(req, { error: "Method not allowed" }, 405);
  if (isRateLimited(req)) return response(req, { error: "Too many requests" }, 429);

  try {
    const service = createServiceClient();
    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response(req, { error: "Authentication is required" }, 401);

    const { data: auth, error: authError } = await service.auth.getUser(token);
    if (authError || !auth.user) {
      return response(req, { error: "Invalid or expired session" }, 401);
    }

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin" && profile?.role !== "clerk") {
      return response(req, { error: "Only admins and clerks can initiate payments" }, 403);
    }

    const payload = parsePayload(await req.json());
    if (!payload) {
      return response(
        req,
        { error: "Provide a valid Kenyan phone, farmer code, payment ID, and whole-KSh amount" },
        400,
      );
    }
    const formattedPhone = formatPhone(payload.phone);
    if (!/^254\d{9}$/.test(formattedPhone)) {
      return response(req, { error: "Enter a valid Kenyan phone number" }, 400);
    }

    const { data: payment, error: paymentError } = await service
      .from("payments")
      .select("farmer_code, net_ksh, status")
      .eq("id", payload.payment_id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (
      !payment ||
      payment.farmer_code !== payload.farmer_code ||
      Number(payment.net_ksh) !== payload.amount ||
      payment.status !== "pending"
    ) {
      return response(req, { error: "Payment does not match an unpaid payment record" }, 409);
    }

    const shortcode = Deno.env.get("MPESA_SHORTCODE");
    const passkey = Deno.env.get("MPESA_PASSKEY");
    const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL");
    if (!shortcode || !passkey || !callbackUrl) {
      return response(req, { error: "M-Pesa payment settings are incomplete" }, 500);
    }
    if (new URL(callbackUrl).protocol !== "https:") {
      return response(req, { error: "The M-Pesa callback URL must use HTTPS" }, 500);
    }

    const now = timestamp();
    const baseUrl =
      Deno.env.get("MPESA_ENVIRONMENT") === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";
    const accessToken = await getAccessToken();
    const { data: reservationData, error: reservationError } = await service.rpc(
      "reserve_mpesa_transaction",
      {
        p_payment_id: payload.payment_id,
        p_farmer_code: payload.farmer_code,
        p_phone: formattedPhone,
        p_amount: payload.amount,
        p_initiated_by: auth.user.id,
      },
    );
    if (reservationError) throw reservationError;
    if (
      !reservationData ||
      typeof reservationData !== "object" ||
      Array.isArray(reservationData)
    ) {
      throw new Error("M-Pesa transaction reservation returned an invalid response");
    }
    const reservation = reservationData as Record<string, unknown>;
    if (
      typeof reservation.transaction_id !== "string" ||
      typeof reservation.status !== "string" ||
      typeof reservation.created !== "boolean"
    ) {
      throw new Error("M-Pesa transaction reservation is incomplete");
    }
    const transactionId = reservation.transaction_id;
    if (!reservation.created) {
      if (
        (reservation.status === "pending" || reservation.status === "verifying") &&
        typeof reservation.checkout_request_id === "string"
      ) {
        return response(req, {
          success: true,
          checkout_request_id: reservation.checkout_request_id,
          transaction_id: transactionId,
          customer_message: "Payment request already in progress.",
        });
      }
      return response(
        req,
        {
          error: "This payment requires manual verification; do not retry it.",
          requires_review: true,
        },
        409,
      );
    }

    const stkResponse = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: btoa(`${shortcode}${passkey}${now}`),
        Timestamp: now,
        TransactionType: "CustomerPayBillOnline",
        Amount: payload.amount,
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: payload.farmer_code,
        TransactionDesc: `Payment for ${payload.farmer_code}`,
      }),
    });
    const stk = await stkResponse.json();
    if (!stkResponse.ok || stk.ResponseCode !== "0") {
      const reason = String(stk.errorMessage ?? stk.ResponseDescription ?? "STK push failed");
      const { error: failureError } = await service.rpc("fail_mpesa_payment", {
        p_payment_id: payload.payment_id,
        p_status: "failed",
      });
      if (failureError) throw failureError;
      const { error: updateError } = await service
        .from("mpesa_transactions")
        .update({ status: "failed", result_desc: reason })
        .eq("id", transactionId)
        .eq("status", "initiating");
      if (updateError) throw updateError;
      return response(req, { error: reason }, 400);
    }
    if (
      typeof stk.CheckoutRequestID !== "string" ||
      typeof stk.MerchantRequestID !== "string"
    ) {
      throw new Error("Daraja response did not contain checkout request identifiers");
    }

    const { error: updateError } = await service
      .from("mpesa_transactions")
      .update({
        checkout_request_id: stk.CheckoutRequestID,
        merchant_request_id: stk.MerchantRequestID,
        status: "pending",
      })
      .eq("id", transactionId)
      .eq("status", "initiating");
    if (updateError) throw updateError;

    return response(req, {
      success: true,
      checkout_request_id: stk.CheckoutRequestID,
      transaction_id: transactionId,
      customer_message: stk.CustomerMessage,
    });
  } catch (error) {
    console.error("M-Pesa STK initiation failed", error);
    return response(req, { error: "Could not initiate the M-Pesa payment" }, 500);
  }
});
