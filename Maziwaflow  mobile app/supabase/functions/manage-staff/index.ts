import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCorsHeaders,
  getSecurityHeaders,
  isRateLimited,
  jsonResponse,
} from "../_shared/security.ts";

const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

interface StaffPayload {
  action: "create" | "update_role" | "reset_password";
  email?: string;
  password?: string;
  full_name?: string;
  collection_centre?: string;
  role?: "clerk" | "admin";
  user_id?: string;
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(req, { error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse(req, { error: "Invalid or expired session" }, 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return jsonResponse(req, { error: "Only admins can manage staff accounts" }, 403);
    }

    const body: StaffPayload = await req.json();

    if (body.action === "create") {
      if (!body.email || !body.password || !body.role) {
        return jsonResponse(req, { error: "Email, password, and role are required" }, 400);
      }
      if (body.role !== "clerk" && body.role !== "admin") {
        return jsonResponse(req, { error: "Role must be clerk or admin" }, 400);
      }
      if (body.password.length < 8) {
        return jsonResponse(req, { error: "Password must be at least 8 characters" }, 400);
      }

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          full_name: body.full_name ?? "",
          collection_centre: body.collection_centre ?? "",
          role: body.role,
        },
      });

      if (createError) {
        if (createError.message.includes("already")) {
          return jsonResponse(req, { error: "An account with this email already exists" }, 409);
        }
        return jsonResponse(req, { error: createError.message }, 400);
      }

      return jsonResponse(
        req,
        {
          id: newUser.user.id,
          email: newUser.user.email,
          message: "Staff account created successfully",
        },
        201,
      );
    }

    if (body.action === "update_role") {
      if (!body.user_id || !body.role) {
        return jsonResponse(req, { error: "User ID and role are required" }, 400);
      }
      if (body.role !== "clerk" && body.role !== "admin") {
        return jsonResponse(req, { error: "Role must be clerk or admin" }, 400);
      }

      // Prevent self-demotion to avoid locking yourself out
      if (body.user_id === userData.user.id) {
        return jsonResponse(req, { error: "You cannot change your own role" }, 400);
      }

      const { error } = await supabase
        .from("profiles")
        .update({ role: body.role })
        .eq("id", body.user_id);

      if (error) {
        return jsonResponse(req, { error: error.message }, 400);
      }

      return jsonResponse(req, { message: "Role updated successfully" }, 200);
    }

    if (body.action === "reset_password") {
      if (!body.user_id || !body.password) {
        return jsonResponse(req, { error: "User ID and password are required" }, 400);
      }
      if (body.password.length < 8) {
        return jsonResponse(req, { error: "Password must be at least 8 characters" }, 400);
      }

      const { error } = await supabase.auth.admin.updateUserById(body.user_id, {
        password: body.password,
      });

      if (error) {
        return jsonResponse(req, { error: error.message }, 400);
      }

      return jsonResponse(req, { message: "Password reset successfully" }, 200);
    }

    return jsonResponse(req, { error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse(req, { error: String(err) }, 500);
  }
});
