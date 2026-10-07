import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function baseUrl() {
  return Deno.env.get("MPESA_ENVIRONMENT") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function callbackUrl(value: string | undefined, secret: string): string {
  if (!value) throw new Error("B2C callback URLs are not configured");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("B2C callback URLs must use HTTPS");
  url.searchParams.set("token", secret);
  return url.toString();
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
  if (!consumerKey || !consumerSecret) throw new Error("Daraja credentials are not configured");

  const response = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` },
  });
  if (!response.ok) throw new Error(`Daraja authentication failed (${response.status})`);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Daraja did not return an access token");

  const { error } = await supabase.from("mpesa_auth_tokens").insert({
    access_token: body.access_token,
    expires_at: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
  });
  if (error) throw new Error(`Could not cache Daraja token: ${error.message}`);
  return body.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let payout:
    { transaction_id: string; farmer_code: string; phone: string; amount_ksh: number } | undefined;
  let supabase: ReturnType<typeof createClient> | undefined;
  try {
    const accessToken = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse({ error: "Authentication required" }, 401);

    supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user)
      return jsonResponse({ error: "Invalid or expired session" }, 401);

    const body = (await req.json()) as { payment_id?: unknown };
    if (
      typeof body.payment_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.payment_id,
      )
    ) {
      return jsonResponse({ error: "A valid payment ID is required" }, 400);
    }

    const initiatorName = Deno.env.get("MPESA_INITIATOR_NAME");
    const securityCredential = Deno.env.get("MPESA_SECURITY_CREDENTIAL");
    const shortcode = Deno.env.get("MPESA_SHORTCODE");
    const callbackSecret = Deno.env.get("MPESA_CALLBACK_SECRET");
    if (!initiatorName || !securityCredential || !shortcode || !callbackSecret) {
      throw new Error(
        "MPESA_INITIATOR_NAME, MPESA_SECURITY_CREDENTIAL, MPESA_SHORTCODE and MPESA_CALLBACK_SECRET must be configured",
      );
    }
    const resultUrl = callbackUrl(Deno.env.get("MPESA_B2C_RESULT_URL"), callbackSecret);
    const timeoutUrl = callbackUrl(Deno.env.get("MPESA_B2C_TIMEOUT_URL"), callbackSecret);
    const token = await getAccessToken(supabase);

    const { data, error: reserveError } = await supabase
      .rpc("reserve_mpesa_b2c_payout", {
        p_payment_id: body.payment_id,
        p_initiated_by: authData.user.id,
      })
      .single();
    if (reserveError) return jsonResponse({ error: reserveError.message }, 400);
    payout = data;

    const response = await fetch(`${baseUrl()}/mpesa/b2c/v1/paymentrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        InitiatorName: initiatorName,
        SecurityCredential: securityCredential,
        CommandID: "BusinessPayment",
        Amount: payout.amount_ksh,
        PartyA: shortcode,
        PartyB: payout.phone,
        Remarks: `Milk payment ${payout.farmer_code}`,
        QueueTimeOutURL: timeoutUrl,
        ResultURL: resultUrl,
        Occasion: payout.farmer_code,
      }),
    });
    const result = (await response.json()) as {
      ResponseCode?: string;
      ResponseDescription?: string;
      errorMessage?: string;
      ConversationID?: string;
      OriginatorConversationID?: string;
    };
    if (
      !response.ok ||
      result.ResponseCode !== "0" ||
      !result.ConversationID ||
      !result.OriginatorConversationID
    ) {
      const reason =
        result.errorMessage ?? result.ResponseDescription ?? "Daraja rejected the payout";
      const { error: transactionError } = await supabase
        .from("mpesa_transactions")
        .update({ status: "failed", result_desc: reason, updated_at: new Date().toISOString() })
        .eq("id", payout.transaction_id);
      if (transactionError)
        throw new Error(`Could not mark rejected payout failed: ${transactionError.message}`);
      const { error: paymentError } = await supabase
        .from("payments")
        .update({ status: "completed" })
        .eq("id", body.payment_id)
        .is("reference", null);
      if (paymentError)
        throw new Error(`Could not reopen payment after rejected payout: ${paymentError.message}`);
      return jsonResponse({ error: reason }, 502);
    }

    const { error: updateError } = await supabase
      .from("mpesa_transactions")
      .update({
        conversation_id: result.ConversationID,
        originator_conversation_id: result.OriginatorConversationID,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.transaction_id);
    if (updateError) {
      throw new Error(
        `Daraja accepted the payout, but tracking update failed: ${updateError.message}`,
      );
    }

    return jsonResponse({
      success: true,
      transaction_id: payout.transaction_id,
      conversation_id: result.ConversationID,
      originator_conversation_id: result.OriginatorConversationID,
      customer_message: result.ResponseDescription,
    });
  } catch (error) {
    console.error("M-Pesa B2C payout initiation failed", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Could not initiate payout" },
      500,
    );
  }
});
