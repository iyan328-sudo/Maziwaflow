import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCorsHeaders,
  getSecurityHeaders,
  isRateLimited,
  jsonResponse,
} from "../_shared/security.ts";

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...getCorsHeaders(req), ...getSecurityHeaders() },
    });
  }
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);
  if (isRateLimited(req)) return jsonResponse(req, { error: "Too many requests" }, 429);

  try {
    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return jsonResponse(req, { error: "Authentication is required" }, 401);

    const service = createServiceClient();
    const { data: auth, error: authError } = await service.auth.getUser(token);
    if (authError || !auth.user) {
      return jsonResponse(req, { error: "Invalid or expired session" }, 401);
    }

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin" && profile?.role !== "clerk") {
      return jsonResponse(req, { error: "Only admins and clerks can request SMS alerts" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const {
      phone,
      farmer_name,
      farmer_code,
      quantity_kg,
      quality_grade,
      price_per_ksh,
      total_payout_ksh,
      collection_id,
      custom_message,
    } = body;

    const receiptRef =
      collection_id ? String(collection_id).slice(0, 8).toUpperCase() : `RC-${Date.now().toString(36).toUpperCase()}`;

    const smsMessage =
      custom_message ||
      `MaziwaFlow Receipt: Confirmed ${quantity_kg ?? 0}kg ${quality_grade ?? "milk"} from ${farmer_name || farmer_code || "Member"}. Rate: KSh ${price_per_ksh ?? 0}/kg. Total: KSh ${total_payout_ksh ?? 0}. Ref: ${receiptRef}`;

    console.log("[SMS Notification Prepared]", { phone, message: smsMessage });

    const atApiKey = Deno.env.get("AFRICASTALKING_API_KEY");
    const atUsername = Deno.env.get("AFRICASTALKING_USERNAME");

    if (atApiKey && atUsername && phone) {
      try {
        const atUrl = "https://api.africastalking.com/version1/messaging";
        const form = new URLSearchParams({
          username: atUsername,
          to: phone,
          message: smsMessage,
        });
        const atRes = await fetch(atUrl, {
          method: "POST",
          headers: {
            apiKey: atApiKey,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: form.toString(),
        });
        const atData = await atRes.json().catch(() => null);
        return jsonResponse(req, {
          success: atRes.ok,
          delivered: atRes.ok,
          simulated: false,
          recipient: phone,
          message: smsMessage,
          providerResponse: atData,
        });
      } catch (smsErr) {
        console.error("SMS carrier delivery failed, falling back to simulated status", smsErr);
      }
    }

    return jsonResponse(req, {
      success: true,
      delivered: false,
      simulated: true,
      recipient: phone || "None",
      message: smsMessage,
      info: "SMS simulated. Configure AFRICASTALKING_API_KEY in Supabase secrets for carrier dispatch.",
    });
  } catch (error) {
    console.error("SMS request failed", error);
    return jsonResponse(req, { error: "Could not process the SMS request" }, 500);
  }
});
