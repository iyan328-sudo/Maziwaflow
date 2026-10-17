import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RoleProvider, type Role } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1. Verify Authentication State with Session Fallback
    let user: any = null;

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!authError && authData?.user) {
        user = authData.user;
      }
    } catch {
      // ignore
    }

    // Check cached session if network or auth error occurred
    if (!user) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          user = sessionData.session.user;
        }
      } catch {
        // ignore
      }
    }

    if (!user) {
      throw redirect({
        to: "/auth",
      });
    }

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
  errorComponent: ({ error }) => {
    if (isRedirect(error)) {
      const target =
        (error as any)?.options?.to ||
        (error as any)?.headers?.get?.("Location") ||
        "/auth";
      if (typeof window !== "undefined") {
        window.location.replace(target);
        return null;
      }
      throw error;
    }
    if (typeof window !== "undefined") {
      window.location.replace("/auth");
      return null;
    }
    return null;
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const context = Route.useRouteContext();
  const rawRole = context?.role;
  const role: Role =
    rawRole === "clerk" || rawRole === "farmer" || rawRole === "admin"
      ? rawRole
      : "admin";

  return (
    <RoleProvider role={role}>
      <Outlet />
    </RoleProvider>
  );
}
