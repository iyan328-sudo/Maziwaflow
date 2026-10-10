import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RoleProvider } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
<<<<<<< HEAD
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
 // Safely determine the role from profile or fall back to user app_metadata
const role = profile?.role || data.user?.app_metadata?.["role"] || "admin";

if (profileError && !data.user?.app_metadata?.["role"]) {
    console.error("Could not load signed-in user's role:", profileError);
    throw new Error("Could not load your account role. Please try again.");
}

return { user: data.user, role };   
  errorComponent: RoleLoadError,
=======

    let profileRole: unknown;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      profileRole = profile?.role;
    } catch {
      // Silently catch database/network errors to prevent locking out users
    }

    const appMetaRole = data.user.app_metadata?.["role"] ?? data.user.user_metadata?.["role"];

    const isValidRole = (r: unknown): r is Role =>
      r === "admin" || r === "farmer" || r === "clerk";

    const role: Role = isValidRole(profileRole)
      ? profileRole
      : isValidRole(appMetaRole)
        ? appMetaRole
        : "admin";

    return { user: data.user, role };
  },
>>>>>>> fee87a8 (Save remaining configuration changes)
  component: AuthenticatedLayout,
});

function RoleLoadError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-milk px-5 text-center">
      <h1 className="text-xl font-extrabold">Unable to load your account</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-maziwa-blue px-4 py-2 text-sm font-bold text-white"
      >
        Try again
      </button>
      <Link to="/auth" className="text-sm font-semibold text-maziwa-blue">
        Return to sign in
      </Link>
    </main>
  );
}

function AuthenticatedLayout() {
  return (
    <RoleProvider role={Route.useRouteContext().role}>
      <Outlet />
    </RoleProvider>
  );
}
