import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RoleProvider, type Role } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    const role: Role =
      profile?.role === "admin" || profile?.role === "farmer" || profile?.role === "clerk"
        ? profile.role
        : "clerk";
    return { user: data.user, role };
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
