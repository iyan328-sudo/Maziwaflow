import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ClipboardList,
  TrendingUp,
  Calendar,
  IndianRupee,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/farmer-dashboard")({
  head: () => ({
    meta: [
      { title: "Farmer Dashboard — Maziwaflow Mobile" },
      { name: "description", content: "View your milk delivery history and earnings." },
      { property: "og:title", content: "Farmer Dashboard — Maziwaflow Mobile" },
      { property: "og:description", content: "View your milk delivery history and earnings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FarmerDashboard,
});

type Collection = {
  id: string;
  quantity_kg: number;
  quality_grade: string;
  status: string;
  collected_at: string;
  price_per_ksh: number | null;
};

const FALLBACK_PRICE: Record<string, number> = {
  "Grade A": 55,
  "Grade B": 45,
  "Grade C": 35,
  Rejected: 0,
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });

const STATUS_STYLE: Record<string, string> = {
  Accepted: "bg-maziwa-green/15 text-maziwa-green-deep",
  "Pending Test": "bg-maziwa-orange/15 text-maziwa-orange-deep",
  Rejected: "bg-destructive/15 text-destructive",
};

function FarmerDashboard() {
  const { user } = Route.useRouteContext();
  const [profile, setProfile] = useState<{
    full_name: string | null;
    collection_centre: string | null;
  } | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [balance, setBalance] = useState<{
    total_earnings: number;
    total_paid: number;
    outstanding_balance: number;
    unpaid_earnings: number;
    unpaid_count: number;
    collection_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("full_name, collection_centre")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data);
        if (data?.full_name) {
          supabase
            .from("farmers")
            .select("farmer_code")
            .ilike("full_name", data.full_name)
            .maybeSingle()
            .then(({ data: farmer }) => {
              if (farmer) {
                supabase
                  .from("collections")
                  .select("id, quantity_kg, quality_grade, status, collected_at, price_per_ksh")
                  .eq("farmer_code", farmer.farmer_code)
                  .order("collected_at", { ascending: false })
                  .then(({ data: cols }) => {
                    setCollections((cols as Collection[]) ?? []);
                    setLoading(false);
                  });
                supabase
                  .from("farmer_balances")
                  .select(
                    "total_earnings, total_paid, outstanding_balance, unpaid_earnings, unpaid_count, collection_count",
                  )
                  .eq("farmer_code", farmer.farmer_code)
                  .maybeSingle()
                  .then(({ data: bal }) => setBalance(bal as typeof balance));
              } else {
                setLoading(false);
              }
            });
        } else {
          setLoading(false);
        }
      });
  }, [user.id]);

  const totalKg = collections
    .filter((c) => c.status !== "Rejected")
    .reduce((a, c) => a + Number(c.quantity_kg), 0);
  const totalEarnings = collections
    .filter((c) => c.status !== "Rejected")
    .reduce(
      (a, c) =>
        a + Number(c.quantity_kg) * (c.price_per_ksh ?? FALLBACK_PRICE[c.quality_grade] ?? 0),
      0,
    );
  const avgGrade =
    collections.length > 0 ? collections.filter((c) => c.status !== "Rejected").length : 0;

  const last7Days = (() => {
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
    return days;
  })();

  return (
    <AppShell title="My Deliveries" subtitle={profile?.full_name ?? "Farmer Portal"} back={false}>
      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-maziwa-green-deep" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Volume</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">
            {totalKg.toFixed(1)} <span className="text-sm">kg</span>
          </p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <IndianRupee className="size-4 text-maziwa-blue" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Earnings</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">
            {balance
              ? `KSh ${Number(balance.total_earnings).toLocaleString("en-KE")}`
              : `KSh ${totalEarnings.toLocaleString("en-KE")}`}
          </p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-maziwa-purple" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Paid So Far</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">
            {balance ? `KSh ${Number(balance.total_paid).toLocaleString("en-KE")}` : "—"}
          </p>
        </div>
        <div
          className={`rounded-lg p-4 ring-1 ${balance && Number(balance.outstanding_balance) > 0 ? "bg-maziwa-orange/10 ring-maziwa-orange/20" : "bg-card ring-border"}`}
        >
          <div className="flex items-center gap-2">
            {balance && Number(balance.outstanding_balance) > 0 ? (
              <ClipboardList className="size-4 text-maziwa-orange-deep" />
            ) : (
              <CheckCircle2 className="size-4 text-maziwa-green-deep" />
            )}
            <p className="text-xs font-bold text-muted-foreground uppercase">
              {balance && Number(balance.outstanding_balance) > 0 ? "Outstanding" : "Balance"}
            </p>
          </div>
          <p
            className={`mt-1 text-2xl font-extrabold ${balance && Number(balance.outstanding_balance) > 0 ? "text-maziwa-orange-deep" : "text-maziwa-green-deep"}`}
          >
            {balance
              ? `KSh ${Math.abs(Number(balance.outstanding_balance)).toLocaleString("en-KE")}`
              : "—"}
          </p>
          {balance && Number(balance.outstanding_balance) > 0 && balance.unpaid_count > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {balance.unpaid_count} unpaid {balance.unpaid_count === 1 ? "delivery" : "deliveries"}
            </p>
          )}
          {balance && Number(balance.outstanding_balance) <= 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">Fully settled</p>
          )}
        </div>
      </div>

      {/* 7-day chart */}
      <ShellCard>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold">Last 7 Days</h2>
            <p className="text-xs text-muted-foreground">Daily accepted volume (kg)</p>
          </div>
          <Calendar className="size-5 text-muted-foreground" />
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last7Days}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  fontSize: "0.75rem",
                }}
              />
              <Bar dataKey="kg" fill="var(--color-maziwa-green)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ShellCard>

      {/* Recent deliveries */}
      <div className="mt-4">
        <h2 className="mb-3 font-bold">Recent Deliveries</h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="size-6 animate-spin rounded-full border-2 border-maziwa-blue border-t-transparent" />
          </div>
        ) : collections.length === 0 ? (
          <ShellCard>
            <p className="py-6 text-center text-sm text-muted-foreground">
              No deliveries recorded yet. Your collections will appear here once a clerk logs them.
            </p>
          </ShellCard>
        ) : (
          <ul className="space-y-2.5">
            {collections.slice(0, 10).map((c) => (
              <li key={c.id} className="rounded-lg bg-card p-3.5 ring-1 ring-border/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{Number(c.quantity_kg)} kg</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(c.collected_at)} · {fmtTime(c.collected_at)} · {c.quality_grade}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[c.status] ?? ""}`}
                  >
                    {c.status}
                  </span>
                </div>
                {c.status !== "Rejected" && (
                  <p className="mt-1 text-xs font-semibold text-maziwa-green-deep">
                    Est. KSh{" "}
                    {(
                      Number(c.quantity_kg) *
                      (c.price_per_ksh ?? FALLBACK_PRICE[c.quality_grade] ?? 0)
                    ).toLocaleString("en-KE")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
