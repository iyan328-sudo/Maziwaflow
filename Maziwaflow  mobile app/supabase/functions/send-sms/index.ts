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
  const quantityKg = Number(value.quantity_kg);
  const cumulativeKg = Number(value.cumulative_kg);

  if (!phone || !/^\+?[1-9]\d{8,14}$/.test(phone)) {
    return { valid: false, message: "Valid phone number is required" };
  }

  if (
    !Number.isFinite(quantityKg) ||
    quantityKg < 0 ||
    !Number.isFinite(cumulativeKg) ||
    cumulativeKg < 0
  ) {
    return { valid: false, message: "Quantity and cumulative totals must be valid numbers" };
  }

  return {
    valid: true,
    data: {
      collection_id:
        typeof value.collection_id === "string"
          ? value.collection_id.trim().slice(0, 100)
          : undefined,
      farmer_code:
        typeof value.farmer_code === "string" ? value.farmer_code.trim().slice(0, 50) : undefined,
      farmer_name:
        typeof value.farmer_name === "string" ? value.farmer_name.trim().slice(0, 100) : undefined,
      phone,
      quantity_kg: quantityKg,
      cumulative_kg: cumulativeKg,
      collected_at:
        typeof value.collected_at === "string" ? value.collected_at : new Date().toISOString(),
    },
  };
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

    const {
      collection_id,
      farmer_code,
      farmer_name,
      phone,
      quantity_kg,
      cumulative_kg,
      collected_at,
    } = parsed.data;

    const message = `MaziwaFlow: Hi ${farmer_name ?? farmer_code}, ${quantity_kg} kg of milk recorded on ${collected_at}. Your cumulative total is ${cumulative_kg} kg.`;

    // Placeholder for actual SMS gateway integration.
    // In production, this would call an SMS provider like Africa's Talking,
    // Twilio, or Vonage. The message is logged here for development.
    console.log(`SMS to ${phone}: ${message}`);

    // Record the SMS attempt in notifications metadata via service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await supabase.from("notifications").insert({
      user_id: null,
      farmer_code,
      title: "SMS Alert Sent",
      body: message,
      type: "collection",
      metadata: { collection_id, phone, channel: "sms" },
    });

    return jsonResponse(req, { sent: true, message }, 200);
  } catch (err) {
    return jsonResponse(req, { error: String(err) }, 500);
  }
});
