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
  Coins,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRole, type Role } from "@/components/RoleViewContext";
import { getClerkCommissionRate } from "./milk-prices";

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

function ClerkEarningsSection({ clerkId }: { clerkId: string }) {
  const [rate, setRate] = useState<number>(getClerkCommissionRate());
  const [stats, setStats] = useState<{
    totalKg: number;
    todayKg: number;
    weekKg: number;
    monthKg: number;
    loading: boolean;
  }>({
    totalKg: 0,
    todayKg: 0,
    weekKg: 0,
    monthKg: 0,
    loading: true,
  });

  useEffect(() => {
    function updateRate() {
      setRate(getClerkCommissionRate());
    }
    window.addEventListener("maziwa-commission-rate-updated", updateRate);
    return () => window.removeEventListener("maziwa-commission-rate-updated", updateRate);
  }, []);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    supabase
      .from("collections")
      .select("quantity_kg, status, collected_at")
      .eq("received_by", clerkId)
      .neq("status", "Rejected")
      .then(({ data }) => {
        const rows = data ?? [];
        let total = 0;
        let todayVal = 0;
        let weekVal = 0;
        let monthVal = 0;

        rows.forEach((r) => {
          const qty = Number(r.quantity_kg) || 0;
          total += qty;
          const dt = new Date(r.collected_at);
          if (dt >= today) todayVal += qty;
          if (dt >= weekAgo) weekVal += qty;
          if (dt >= monthStart) monthVal += qty;
        });

        setStats({
          totalKg: total,
          todayKg: todayVal,
          weekKg: weekVal,
          monthKg: monthVal,
          loading: false,
        });
      });
  }, [clerkId]);

  const totalEarnings = stats.totalKg * rate;
  const todayEarnings = stats.todayKg * rate;
  const weekEarnings = stats.weekKg * rate;
  const monthEarnings = stats.monthKg * rate;

  return (
    <ShellCard className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="size-5 text-maziwa-green-deep" />
          <h2 className="font-bold text-base">My Earnings</h2>
        </div>
        <span className="rounded-full bg-maziwa-green/15 px-2.5 py-0.5 text-xs font-bold text-maziwa-green-deep">
          KSh {rate.toFixed(2)}/L flat rate
        </span>
      </div>

      <div className="rounded-lg bg-muted/40 p-3.5 ring-1 ring-border/60">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Accrued</p>
            <p className="mt-0.5 text-2xl font-extrabold text-foreground">
              KSh {totalEarnings.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded-full bg-maziwa-blue/15 px-2 py-0.5 text-xs font-semibold text-maziwa-blue">
              <CheckCircle2 className="size-3" /> Active / Accruing
            </span>
            <p className="mt-1 text-[11px] text-muted-foreground">
              From {stats.totalKg.toFixed(1)} L collected
            </p>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
          <div className="rounded-md bg-card/80 p-2 ring-1 ring-border/40">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Today</p>
            <p className="mt-0.5 font-extrabold text-xs text-foreground">
              KSh {todayEarnings.toFixed(0)}
            </p>
            <p className="text-[10px] text-muted-foreground">{stats.todayKg.toFixed(1)} L</p>
          </div>
          <div className="rounded-md bg-card/80 p-2 ring-1 ring-border/40">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">7 Days</p>
            <p className="mt-0.5 font-extrabold text-xs text-foreground">
              KSh {weekEarnings.toFixed(0)}
            </p>
            <p className="text-[10px] text-muted-foreground">{stats.weekKg.toFixed(1)} L</p>
          </div>
          <div className="rounded-md bg-card/80 p-2 ring-1 ring-border/40">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">This Month</p>
            <p className="mt-0.5 font-extrabold text-xs text-foreground">
              KSh {monthEarnings.toFixed(0)}
            </p>
            <p className="text-[10px] text-muted-foreground">{stats.monthKg.toFixed(1)} L</p>
          </div>
        </div>
      </div>
    </ShellCard>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const context = Route.useRouteContext();
  const user = context?.user;
  const rawRole = useRole();
  const role: Role =
    rawRole === "clerk" || rawRole === "farmer" || rawRole === "admin"
      ? rawRole
      : "admin";
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setName(data.full_name);
        else if (user.email) setName(user.email.split("@")[0]);
      })
      .catch(() => {
        if (user.email) setName(user.email.split("@")[0]);
      });
  }, [user?.id, user?.email]);

  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const roleActions = ROLE_ACTIONS[role] ?? ROLE_ACTIONS.admin;
  const visibleActions = ALL_ACTIONS.filter((a) => roleActions.includes(a.label));
  const roleLabel = ROLE_LABELS[role] ?? "Administrator";

  return (
    <AppShell
      title="Maziwaflow Mobile"
      subtitle={name ? `Karibu, ${name}` : "Dairy Collection System"}
      back={false}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase">Signed in as</p>
          <p className="text-sm font-semibold text-foreground">{roleLabel}</p>
        </div>
        <span className="rounded-full bg-maziwa-blue/10 px-3 py-1 text-xs font-bold text-maziwa-blue">
          {roleLabel}
        </span>
      </div>

      {role === "clerk" && user?.id && <ClerkEarningsSection clerkId={user.id} />}

      <ShellCard>
        <div className="mb-5">
          <p className="text-xs font-bold text-muted-foreground uppercase">
            {roleLabel} menu
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
