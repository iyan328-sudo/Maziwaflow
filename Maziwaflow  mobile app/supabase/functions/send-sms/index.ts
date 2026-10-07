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

    return jsonResponse(
      req,
      { sent: false, error: "SMS delivery is not configured" },
      503,
    );
  } catch (error) {
    console.error("SMS request failed", error);
    return jsonResponse(req, { error: "Could not process the SMS request" }, 500);
  }
});
