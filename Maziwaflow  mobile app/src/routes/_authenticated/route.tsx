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
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Could not load signed-in user's role:", profileError);
      throw new Error("Could not load your account role. Please try again.");
    }
    if (!profile) {
      throw new Error("No role is assigned to your account. Contact an administrator.");
    }
    if (profile.role !== "admin" && profile.role !== "farmer" && profile.role !== "clerk") {
      throw new Error("Your account has an unrecognized role. Contact an administrator.");
    }
    return { user: data.user, role: profile.role };
  },
  errorComponent: RoleLoadError,
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
