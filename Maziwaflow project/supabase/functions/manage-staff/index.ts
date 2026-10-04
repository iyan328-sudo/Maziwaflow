import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    return new Response(null, { status: 200, headers: corsHeaders });
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
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse(401, { error: "Invalid or expired session" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return jsonResponse(403, { error: "Only admins can manage staff accounts" });
    }

    const body: StaffPayload = await req.json();

    if (body.action === "create") {
      if (!body.email || !body.password || !body.role) {
        return jsonResponse(400, { error: "Email, password, and role are required" });
      }
      if (body.role !== "clerk" && body.role !== "admin") {
        return jsonResponse(400, { error: "Role must be clerk or admin" });
      }
      if (body.password.length < 8) {
        return jsonResponse(400, { error: "Password must be at least 8 characters" });
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
          return jsonResponse(409, { error: "An account with this email already exists" });
        }
        return jsonResponse(400, { error: createError.message });
      }

      return jsonResponse(201, {
        id: newUser.user.id,
        email: newUser.user.email,
        message: "Staff account created successfully",
      });
    }

    if (body.action === "update_role") {
      if (!body.user_id || !body.role) {
        return jsonResponse(400, { error: "User ID and role are required" });
      }
      if (body.role !== "clerk" && body.role !== "admin") {
        return jsonResponse(400, { error: "Role must be clerk or admin" });
      }

      // Prevent self-demotion to avoid locking yourself out
      if (body.user_id === userData.user.id) {
        return jsonResponse(400, { error: "You cannot change your own role" });
      }

      const { error } = await supabase
        .from("profiles")
        .update({ role: body.role })
        .eq("id", body.user_id);

      if (error) {
        return jsonResponse(400, { error: error.message });
      }

      return jsonResponse(200, { message: "Role updated successfully" });
    }

    if (body.action === "reset_password") {
      if (!body.user_id || !body.password) {
        return jsonResponse(400, { error: "User ID and password are required" });
      }
      if (body.password.length < 8) {
        return jsonResponse(400, { error: "Password must be at least 8 characters" });
      }

      const { error } = await supabase.auth.admin.updateUserById(body.user_id, {
        password: body.password,
      });

      if (error) {
        return jsonResponse(400, { error: error.message });
      }

      return jsonResponse(200, { message: "Password reset successfully" });
    }

    return jsonResponse(400, { error: "Unknown action" });
  } catch (err) {
    return jsonResponse(500, { error: String(err) });
  }
});

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
