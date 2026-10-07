import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Milk,
  KeyRound,
  MessageCircleQuestion,
  ClipboardList,
  LogOut,
  Users,
  BarChart3,
  CreditCard,
  Bell,
  TrendingUp,
  Wallet,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRole, type Role } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Maziwaflow Mobile" },
      { name: "description", content: "Main menu" },
      { property: "og:title", content: "Dashboard — Maziwaflow Mobile" },
      { property: "og:description", content: "Main menu" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type RouteTarget =
  | "/receive-milk"
  | "/change-password"
  | "/collections"
  | "/daily-summary"
  | "/enquiries"
  | "/farmers"
  | "/farmer-dashboard"
  | "/admin-dashboard"
  | "/lipa-pole-pole"
  | "/notifications"
  | "/milk-prices"
  | "/payments"
  | "/staff";

type Action = { label: string; icon: LucideIcon; className: string; to?: RouteTarget };

const ALL_ACTIONS: Action[] = [
  {
    label: "Receive Milk",
    icon: Milk,
    className: "bg-maziwa-green hover:bg-maziwa-green-deep",
    to: "/receive-milk",
  },
  {
    label: "Change Password",
    icon: KeyRound,
    className: "bg-maziwa-purple hover:bg-maziwa-purple/90",
    to: "/change-password",
  },
  {
    label: "Enquiries",
    icon: MessageCircleQuestion,
    className: "bg-maziwa-orange hover:bg-maziwa-orange-deep",
    to: "/enquiries",
  },
  {
    label: "View Collections",
    icon: ClipboardList,
    className: "bg-maziwa-soft hover:bg-maziwa-soft-deep",
    to: "/collections",
  },
  {
    label: "Daily Summary",
    icon: CalendarDays,
    className: "bg-maziwa-orange hover:bg-maziwa-orange-deep",
    to: "/daily-summary",
  },
  {
    label: "Farmer Directory",
    icon: Users,
    className: "bg-maziwa-blue hover:bg-maziwa-blue/90",
    to: "/farmers",
  },
  {
    label: "My Deliveries",
    icon: BarChart3,
    className: "bg-maziwa-green hover:bg-maziwa-green-deep",
    to: "/farmer-dashboard",
  },
  {
    label: "Admin Overview",
    icon: BarChart3,
    className: "bg-maziwa-blue hover:bg-maziwa-blue/90",
    to: "/admin-dashboard",
  },
  {
    label: "Lipa Pole Pole",
    icon: CreditCard,
    className: "bg-maziwa-purple hover:bg-maziwa-purple/90",
    to: "/lipa-pole-pole",
  },
  {
    label: "Notifications",
    icon: Bell,
    className: "bg-maziwa-soft hover:bg-maziwa-soft-deep",
    to: "/notifications",
  },
  {
    label: "Milk Prices",
    icon: TrendingUp,
    className: "bg-maziwa-green hover:bg-maziwa-green-deep",
    to: "/milk-prices",
  },
  {
    label: "Payments",
    icon: Wallet,
    className: "bg-maziwa-blue hover:bg-maziwa-blue/90",
    to: "/payments",
  },
  {
    label: "Staff Accounts",
    icon: ShieldCheck,
    className: "bg-maziwa-blue hover:bg-maziwa-blue/90",
    to: "/staff",
  },
];

const ROLE_ACTIONS: Record<Role, string[]> = {
  clerk: [
    "Receive Milk",
    "Daily Summary",
    "Enquiries",
    "View Collections",
    "Farmer Directory",
    "Change Password",
    "Logout",
  ],
  farmer: [
    "My Deliveries",
    "Payments",
    "Lipa Pole Pole",
    "Notifications",
    "Enquiries",
    "View Collections",
    "Change Password",
    "Logout",
  ],
  admin: [
    "Admin Overview",
    "Receive Milk",
    "Milk Prices",
    "Daily Summary",
    "Payments",
    "Lipa Pole Pole",
    "Enquiries",
    "View Collections",
    "Farmer Directory",
    "Staff Accounts",
    "Notifications",
    "Change Password",
    "Logout",
  ],
};

const ROLE_LABELS: Record<Role, string> = { clerk: "Clerk", farmer: "Farmer", admin: "Admin" };

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const role = useRole();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setName(data?.full_name ?? null));
  }, [user.id]);

  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const visibleActions = ALL_ACTIONS.filter((a) => ROLE_ACTIONS[role].includes(a.label));

  return (
    <AppShell
      title="Maziwaflow Mobile"
      subtitle={name ? `Karibu, ${name}` : "Dairy Collection System"}
      back={false}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase">Signed in as</p>
          <p className="text-sm font-semibold text-foreground">{ROLE_LABELS[role]}</p>
        </div>
        <span className="rounded-full bg-maziwa-blue/10 px-3 py-1 text-xs font-bold text-maziwa-blue">
          {ROLE_LABELS[role]}
        </span>
      </div>
      <ShellCard>
        <div className="mb-5">
          <p className="text-xs font-bold text-muted-foreground uppercase">
            {ROLE_LABELS[role]} menu
          </p>
        </div>
        <nav className="flex flex-col gap-3.5" aria-label="Main menu">
          {visibleActions.map((a) => (
            <Button
              key={a.label}
              type="button"
              onClick={() => (a.to ? navigate({ to: a.to }) : undefined)}
              className={`pill-action h-auto ${a.className}`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
                <a.icon className="size-[1.125rem]" aria-hidden="true" />
              </span>
              <span className="flex-1">{a.label}</span>
            </Button>
          ))}
          <Button
            type="button"
            onClick={logout}
            className="pill-action h-auto bg-maziwa-brown hover:bg-maziwa-brown-deep"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
              <LogOut className="size-[1.125rem]" aria-hidden="true" />
            </span>
            <span className="flex-1">Logout</span>
          </Button>
        </nav>
      </ShellCard>
      <p className="mt-6 text-center text-xs text-muted-foreground">Maziwaflow Mobile · v2.0</p>
    </AppShell>
  );
}
