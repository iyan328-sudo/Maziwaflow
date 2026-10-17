import { createFileRoute, Outlet, redirect, isRedirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RoleProvider, type Role } from "@/components/RoleViewContext";
import { Button } from "@/components/ui/button";
import { RotateCw, LogIn } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1. Verify Authentication State with Multi-tier Session Fallback
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

    // Direct localStorage cache inspection as ultimate fallback
    if (!user && typeof window !== "undefined") {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
            const val = localStorage.getItem(key);
            if (val) {
              const parsed = JSON.parse(val);
              if (parsed?.user) {
                user = parsed.user;
                break;
              }
            }
          }
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
  errorComponent: ({ error, reset }) => {
    // Only forward genuine TanStack Router redirects
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

    // For any runtime component exceptions, DO NOT sign out or redirect to /auth
    console.error("Authenticated layout error:", error);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-background">
        <div className="max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-lg">
          <h2 className="text-lg font-bold text-foreground">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A temporary view error occurred while rendering the page. Your session is active.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button
              onClick={() => {
                if (reset) reset();
                else window.location.reload();
              }}
              className="gap-2 bg-maziwa-blue text-white"
            >
              <RotateCw className="size-4" />
              <span>Reload Page</span>
            </Button>
            <Button asChild variant="outline">
              <Link to="/auth">
                <LogIn className="mr-2 size-4" />
                <span>Go to Login</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
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
