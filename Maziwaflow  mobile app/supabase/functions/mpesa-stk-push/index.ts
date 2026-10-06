import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCorsHeaders,
  getSecurityHeaders,
  isRateLimited,
  jsonResponse,
} from "../_shared/security.ts";

const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

function validatePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, message: "Request body must be an object" };
  }

  const value = payload as Record<string, unknown>;
  const phone = typeof value.phone === "string" ? value.phone.trim() : "";
  const amount = Number(value.amount);

  if (!phone || !/^\+?[1-9]\d{8,14}$/.test(phone)) {
    return { valid: false, message: "Valid phone number is required" };
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return { valid: false, message: "Amount must be a positive number up to 100000" };
  }

  return {
    valid: true,
    data: {
      phone,
      amount,
      farmer_code:
        typeof value.farmer_code === "string" ? value.farmer_code.trim().slice(0, 50) : undefined,
      payment_id:
        typeof value.payment_id === "string" ? value.payment_id.trim().slice(0, 100) : undefined,
      initiated_by:
        typeof value.initiated_by === "string"
          ? value.initiated_by.trim().slice(0, 100)
          : undefined,
    },
  };
}

function getEnv(key: string, fallback = ""): string {
  return Deno.env.get(key) ?? fallback;
}

function getBaseUrl(): string {
  const env = getEnv("MPESA_ENVIRONMENT", "sandbox");
  return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
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

function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  const raw = shortcode + passkey + timestamp;
  return btoa(raw);
}

async function getAccessToken(): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: existing } = await supabase
    .from("mpesa_auth_tokens")
    .select("access_token, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && new Date(existing.expires_at) > new Date(Date.now() + 60_000)) {
    return existing.access_token;
  }

  const consumerKey = getEnv("MPESA_CONSUMER_KEY");
  const consumerSecret = getEnv("MPESA_CONSUMER_SECRET");

  if (!consumerKey || !consumerSecret) {
    throw new Error("MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be configured");
  }

  const auth = btoa(`${consumerKey}:${consumerSecret}`);
  const baseUrl = getBaseUrl();

  const resp = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Daraja auth failed (${resp.status}): ${text}`);
  }

  const body = await resp.json();
  const accessToken: string = body.access_token;
  const expiresIn: number = body.expires_in ?? 3600;

  await supabase.from("mpesa_auth_tokens").insert({
    access_token: accessToken,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });

  return accessToken;
}

function formatPhone(phone: string): string {
  let p = phone.replace(/\s+/g, "").replace(/-/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("254")) return p;
  if (p.length === 9) return "254" + p;
  return p;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin");
    const headers =
      origin && allowedOrigins.has(origin)
        ? getCorsHeaders(req)
        : { "Access-Control-Allow-Origin": "null", Vary: "Origin" };
    return new Response(null, { status: 200, headers: { ...headers, ...getSecurityHeaders() } });
  }

  if (isRateLimited(req)) {
    return jsonResponse(req, { error: "Too many requests" }, 429);
  }

  try {
    const parsed = validatePayload(await req.json());
    if (!parsed.valid) {
      return jsonResponse(req, { error: parsed.message }, 400);
    }

    const { phone, amount, farmer_code, payment_id, initiated_by } = parsed.data;
    const amountNum = Number(amount);

    const shortcode = getEnv("MPESA_SHORTCODE", "174379");
    const passkey = getEnv("MPESA_PASSKEY");
    const callbackUrl = getEnv("MPESA_CALLBACK_URL");

    if (!passkey) {
      return jsonResponse({ error: "MPESA_PASSKEY is not configured" }, 500);
    }
    if (!callbackUrl) {
      return jsonResponse({ error: "MPESA_CALLBACK_URL is not configured" }, 500);
    }

    const token = await getAccessToken();
    const timestamp = generateTimestamp();
    const password = generatePassword(shortcode, passkey, timestamp);
    const formattedPhone = formatPhone(phone);

    const partyA = formattedPhone;

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.floor(amountNum),
      PartyA: partyA,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: farmer_code ?? "Maziwaflow",
      TransactionDesc: `Payment for ${farmer_code ?? "milk collection"}`,
    };

    const baseUrl = getBaseUrl();
    const stkResp = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stkPayload),
    });

    const stkBody = await stkResp.json();

    if (!stkResp.ok || stkBody.ResponseCode !== "0") {
      return jsonResponse(
        {
          error: stkBody.errorMessage ?? stkBody.ResponseDescription ?? "STK push failed",
          details: stkBody,
        },
        400,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: txRow } = await supabase
      .from("mpesa_transactions")
      .insert({
        farmer_code: farmer_code ?? null,
        payment_id: payment_id ?? null,
        phone: formattedPhone,
        amount_ksh: amountNum,
        checkout_request_id: stkBody.CheckoutRequestID,
        merchant_request_id: stkBody.MerchantRequestID,
        status: "pending",
        initiated_by: initiated_by ?? null,
      })
      .select("id")
      .single();

    return jsonResponse(req, {
      success: true,
      checkout_request_id: stkBody.CheckoutRequestID,
      merchant_request_id: stkBody.MerchantRequestID,
      transaction_id: txRow?.id,
      customer_message: stkBody.CustomerMessage,
    });
  } catch (err) {
    return jsonResponse(req, { error: String(err) }, 500);
  }
});
