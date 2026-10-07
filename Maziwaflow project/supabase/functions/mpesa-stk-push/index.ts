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
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) throw new Error(`Could not verify account role: ${profileError.message}`);
    if (profile?.role !== "admin" && profile?.role !== "clerk") {
      return jsonResponse({ error: "Only admins and clerks can initiate M-Pesa payments" }, 403);
    }

    const body = await req.json();
    const { phone, amount, farmer_code, payment_id } = body;

    if (
      typeof phone !== "string" ||
      !phone.trim() ||
      typeof farmer_code !== "string" ||
      !farmer_code.trim() ||
      amount == null
    ) {
      return jsonResponse({ error: "phone, farmer_code, and amount are required" }, 400);
    }
    const farmerCode = farmer_code.trim();

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 1) {
      return jsonResponse({ error: "amount must be a positive number" }, 400);
    }
    const requestedAmount = Math.floor(amountNum);
    const formattedPhone = formatPhone(phone);
    if (!/^254[17]\d{8}$/.test(formattedPhone)) {
      return jsonResponse({ error: "Enter a valid Kenyan mobile number" }, 400);
    }
    if (
      payment_id != null &&
      (typeof payment_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          payment_id,
        ))
    ) {
      return jsonResponse({ error: "Invalid payment ID" }, 400);
    }

    const { data: farmer, error: farmerError } = await supabase
      .from("farmers")
      .select("farmer_code")
      .eq("farmer_code", farmerCode)
      .maybeSingle();
    if (farmerError) throw new Error(`Could not verify farmer: ${farmerError.message}`);
    if (!farmer) return jsonResponse({ error: "Farmer not found" }, 400);

    if (payment_id) {
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("farmer_code, net_ksh")
        .eq("id", payment_id)
        .maybeSingle();
      if (paymentError) throw new Error(`Could not verify payment: ${paymentError.message}`);
      if (
        !payment ||
        payment.farmer_code !== farmerCode ||
        Math.floor(Number(payment.net_ksh)) !== requestedAmount
      ) {
        return jsonResponse(
          { error: "Payment does not match the selected farmer and amount" },
          400,
        );
      }
    }

    const shortcode = getEnv("MPESA_SHORTCODE", "174379");
    const passkey = getEnv("MPESA_PASSKEY");
    const callbackUrl = getEnv("MPESA_CALLBACK_URL");
    const callbackSecret = getEnv("MPESA_CALLBACK_SECRET");

    if (!passkey) {
      return jsonResponse({ error: "MPESA_PASSKEY is not configured" }, 500);
    }
    if (!callbackUrl) {
      return jsonResponse({ error: "MPESA_CALLBACK_URL is not configured" }, 500);
    }
    if (!callbackSecret) {
      return jsonResponse({ error: "MPESA_CALLBACK_SECRET is not configured" }, 500);
    }
    const callback = new URL(callbackUrl);
    if (callback.protocol !== "https:") {
      return jsonResponse({ error: "MPESA_CALLBACK_URL must use HTTPS" }, 500);
    }
    callback.searchParams.set("token", callbackSecret);

    const token = await getAccessToken();
    const timestamp = generateTimestamp();
    const password = generatePassword(shortcode, passkey, timestamp);

    const partyA = formattedPhone;

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: requestedAmount,
      PartyA: partyA,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callback.toString(),
      AccountReference: farmerCode,
      TransactionDesc: `Payment for ${farmerCode}`,
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

    const { data: txRow, error: transactionError } = await supabase
      .from("mpesa_transactions")
      .insert({
        farmer_code: farmerCode,
        payment_id: payment_id ?? null,
        transaction_type: "stk_push",
        phone: formattedPhone,
        amount_ksh: requestedAmount,
        checkout_request_id: stkBody.CheckoutRequestID,
        merchant_request_id: stkBody.MerchantRequestID,
        status: "pending",
        initiated_by: authData.user.id,
      })
      .select("id")
      .single();
    if (transactionError) {
      throw new Error(
        `M-Pesa prompt sent, but transaction tracking could not be saved: ${transactionError.message}`,
      );
    }

    return jsonResponse({
      success: true,
      checkout_request_id: stkBody.CheckoutRequestID,
      merchant_request_id: stkBody.MerchantRequestID,
      transaction_id: txRow?.id,
      customer_message: stkBody.CustomerMessage,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
