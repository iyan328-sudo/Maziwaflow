import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Users,
  ClipboardList,
  MessageCircleQuestion,
  TrendingUp,
  AlertTriangle,
  Tags,
  Wallet,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin-dashboard")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Maziwaflow Mobile" },
      { name: "description", content: "System-wide analytics and management overview." },
      { property: "og:title", content: "Admin Dashboard — Maziwaflow Mobile" },
      { property: "og:description", content: "System-wide analytics and management overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDashboard,
});

type Stats = {
  totalCollections: number;
  totalKg: number;
  totalFarmers: number;
  openEnquiries: number;
  rejectedCount: number;
  acceptedCount: number;
  pendingCount: number;
};

const STATUS_COLORS: Record<string, string> = {
  Accepted: "var(--color-maziwa-green)",
  "Pending Test": "var(--color-maziwa-orange)",
  Rejected: "var(--color-destructive)",
};

const GRADE_COLORS: Record<string, string> = {
  "Grade A": "var(--color-maziwa-green)",
  "Grade B": "var(--color-maziwa-blue)",
  "Grade C": "var(--color-maziwa-orange)",
  Rejected: "var(--color-destructive)",
};

function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dailyData, setDailyData] = useState<{ day: string; kg: number }[]>([]);
  const [gradeData, setGradeData] = useState<{ name: string; value: number }[]>([]);
  const [recentEnquiries, setRecentEnquiries] = useState<
    { id: string; subject: string; status: string; created_at: string }[]
  >([]);
  const [prices, setPrices] = useState<{ grade: string; price_per_ksh: number }[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("collections").select("quantity_kg, status, quality_grade, collected_at"),
      supabase.from("farmers").select("farmer_code", { count: "exact", head: true }),
      supabase
        .from("enquiries")
        .select("id, subject, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("milk_prices").select("grade, price_per_ksh").order("grade"),
    ]).then(([cols, farmersCount, enq, pricesResp]) => {
      setPrices((pricesResp.data as { grade: string; price_per_ksh: number }[]) ?? []);
      const collections = cols.data ?? [];
      const totalKg = collections
        .filter((c) => c.status !== "Rejected")
        .reduce((a, c) => a + Number(c.quantity_kg), 0);

      setStats({
        totalCollections: collections.length,
        totalKg,
        totalFarmers: farmersCount.count ?? 0,
        openEnquiries: (enq.data ?? []).filter((e) => e.status === "Open").length,
        rejectedCount: collections.filter((c) => c.status === "Rejected").length,
        acceptedCount: collections.filter((c) => c.status === "Accepted").length,
        pendingCount: collections.filter((c) => c.status === "Pending Test").length,
      });

      // Daily data for last 7 days
      const days: { day: string; kg: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const kg = collections
          .filter((c) => {
            const cd = new Date(c.collected_at);
            return cd >= d && cd < next && c.status !== "Rejected";
          })
          .reduce((a, c) => a + Number(c.quantity_kg), 0);
        days.push({ day: d.toLocaleDateString("en-KE", { weekday: "short" }), kg });
      }
      setDailyData(days);

      // Grade distribution
      const gradeMap: Record<string, number> = {};
      collections.forEach((c) => {
        gradeMap[c.quality_grade] = (gradeMap[c.quality_grade] ?? 0) + 1;
      });
      setGradeData(Object.entries(gradeMap).map(([name, value]) => ({ name, value })));

      setRecentEnquiries((enq.data as typeof recentEnquiries) ?? []);
    });
  }, []);

  const statusData = stats
    ? [
        { name: "Accepted", value: stats.acceptedCount },
        { name: "Pending Test", value: stats.pendingCount },
        { name: "Rejected", value: stats.rejectedCount },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <AppShell title="Admin Overview" subtitle="System-wide analytics" back={false}>
      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-maziwa-green-deep" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Volume</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">
            {stats ? stats.totalKg.toFixed(1) : "—"} <span className="text-sm">kg</span>
          </p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-4 text-maziwa-blue" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Collections</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">{stats?.totalCollections ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-maziwa-purple" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Farmers</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">{stats?.totalFarmers ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-maziwa-orange-deep" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Open Tickets</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">{stats?.openEnquiries ?? "—"}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Button
          asChild
          className="h-auto flex-col gap-1.5 rounded-lg bg-maziwa-green py-3 text-sm font-bold hover:bg-maziwa-green-deep"
        >
          <Link to="/receive-milk">
            <TrendingUp className="size-5" />
            Receive Milk
          </Link>
        </Button>
        <Button
          asChild
          className="h-auto flex-col gap-1.5 rounded-lg bg-maziwa-blue py-3 text-sm font-bold hover:bg-maziwa-blue/90"
        >
          <Link to="/farmers">
            <Users className="size-5" />
            Farmers
          </Link>
        </Button>
        <Button
          asChild
          className="h-auto flex-col gap-1.5 rounded-lg bg-maziwa-soft py-3 text-sm font-bold hover:bg-maziwa-soft-deep"
        >
          <Link to="/collections">
            <ClipboardList className="size-5" />
            Collections
          </Link>
        </Button>
        <Button
          asChild
          className="h-auto flex-col gap-1.5 rounded-lg bg-maziwa-orange py-3 text-sm font-bold hover:bg-maziwa-orange-deep"
        >
          <Link to="/enquiries">
            <MessageCircleQuestion className="size-5" />
            Enquiries
          </Link>
        </Button>
        <Button
          asChild
          className="h-auto flex-col gap-1.5 rounded-lg bg-maziwa-purple py-3 text-sm font-bold hover:bg-maziwa-purple/90"
        >
          <Link to="/milk-prices">
            <Tags className="size-5" />
            Milk Prices
          </Link>
        </Button>
        <Button
          asChild
          className="h-auto flex-col gap-1.5 rounded-lg bg-maziwa-blue py-3 text-sm font-bold hover:bg-maziwa-blue/90"
        >
          <Link to="/payments">
            <Wallet className="size-5" />
            Payments
          </Link>
        </Button>
        <Button
          asChild
          className="h-auto flex-col gap-1.5 rounded-lg bg-maziwa-orange py-3 text-sm font-bold hover:bg-maziwa-orange-deep"
        >
          <Link to="/daily-summary">
            <CalendarDays className="size-5" />
            Daily Summary
          </Link>
        </Button>
        <Button
          asChild
          className="h-auto flex-col gap-1.5 rounded-lg bg-maziwa-blue py-3 text-sm font-bold hover:bg-maziwa-blue/90"
        >
          <Link to="/staff">
            <ShieldCheck className="size-5" />
            Staff
          </Link>
        </Button>
      </div>

      {/* Current prices */}
      {prices.length > 0 && (
        <ShellCard>
          <div className="mb-3 flex items-center gap-2">
            <Tags className="size-5 text-maziwa-green-deep" />
            <div>
              <h2 className="font-bold">Current Milk Prices</h2>
              <p className="text-xs text-muted-foreground">Buying price per kg by grade</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {prices.map((p) => (
              <div
                key={p.grade}
                className="rounded-lg bg-muted/40 p-3 text-center ring-1 ring-border/60"
              >
                <p className="text-xs font-bold text-muted-foreground uppercase">{p.grade}</p>
                <p className="mt-1 text-lg font-extrabold">KSh {Number(p.price_per_ksh)}</p>
              </div>
            ))}
          </div>
        </ShellCard>
      )}

      {/* Charts */}
      <ShellCard>
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="size-5 text-maziwa-blue" />
          <div>
            <h2 className="font-bold">Daily Volume — Last 7 Days</h2>
            <p className="text-xs text-muted-foreground">Accepted milk intake (kg)</p>
          </div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  fontSize: "0.75rem",
                }}
              />
              <Bar dataKey="kg" fill="var(--color-maziwa-blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ShellCard>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Status breakdown */}
        <ShellCard>
          <h2 className="mb-4 font-bold">Status Breakdown</h2>
          {statusData.length > 0 ? (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_COLORS[entry.name] ?? "var(--color-muted)"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border)",
                      fontSize: "0.75rem",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
          )}
        </ShellCard>

        {/* Grade distribution */}
        <ShellCard>
          <h2 className="mb-4 font-bold">Grade Distribution</h2>
          {gradeData.length > 0 ? (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={gradeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {gradeData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={GRADE_COLORS[entry.name] ?? "var(--color-muted)"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border)",
                      fontSize: "0.75rem",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
          )}
        </ShellCard>
      </div>

      {/* Recent enquiries */}
      <div className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Recent Enquiries</h2>
          <Button asChild variant="link" className="text-sm font-semibold text-maziwa-blue">
            <Link to="/enquiries">View all</Link>
          </Button>
        </div>
        {recentEnquiries.length === 0 ? (
          <ShellCard>
            <p className="py-4 text-center text-sm text-muted-foreground">No enquiries yet.</p>
          </ShellCard>
        ) : (
          <ul className="space-y-2.5">
            {recentEnquiries.map((e) => (
              <li key={e.id} className="rounded-lg bg-card p-3.5 ring-1 ring-border/60">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{e.subject}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                      e.status === "Open"
                        ? "bg-maziwa-orange/15 text-maziwa-orange-deep"
                        : e.status === "Answered"
                          ? "bg-maziwa-green/15 text-maziwa-green-deep"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {e.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString("en-KE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
