import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RoleProvider, type Role } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1. Verify Authentication State
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      throw redirect({
        to: "/auth",
      });
    }

    const user = authData.user;
    const isValidRole = (r: unknown): r is Role =>
      r === "admin" || r === "farmer" || r === "clerk";

    let resolvedRole: Role = "admin"; // Default fallback role

    // 2. Safely Attempt Profile Query
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn("Non-fatal: Failed to load user profile role, using default:", profileError);
      }

      if (!profileError && profile?.role && isValidRole(profile.role)) {
        resolvedRole = profile.role;
      } else {
        // Fallback to JWT metadata if table query returns null or error
        const metaRole =
          (user.app_metadata?.["role"] as string) ||
          (user.user_metadata?.["role"] as string);

        resolvedRole = isValidRole(metaRole) ? metaRole : "admin";
      }
    } catch (err) {
      console.warn("Non-fatal: Failed to load user profile role, using default:", err);
      const metaRole =
        (user.app_metadata?.["role"] as string) ||
        (user.user_metadata?.["role"] as string);

      resolvedRole = isValidRole(metaRole) ? metaRole : "admin";
    }

    // 3. Return Authenticated Context
    return {
      user,
      role: resolvedRole,
    };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <RoleProvider role={Route.useRouteContext().role}>
      <Outlet />
    </RoleProvider>
  );
}
