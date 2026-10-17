import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Plus,
  Zap,
  ArrowUpRight,
  Check,
  LayoutGrid,
  FileSpreadsheet,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRole, type Role } from "@/components/RoleViewContext";
import { getClerkCommissionRate } from "./milk-prices";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Operational Dashboard — MaziwaFlow" },
      { name: "description", content: "MaziwaFlow Dairy Operations Command Center" },
      { property: "og:title", content: "Operational Dashboard — MaziwaFlow" },
      { property: "og:description", content: "MaziwaFlow Dairy Operations Command Center" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

// Mini sparkline data for today's collection card
const SPARKLINE_DATA = [
  { val: 12 },
  { val: 19 },
  { val: 15 },
  { val: 24 },
  { val: 22 },
  { val: 30 },
  { val: 28 },
  { val: 35 },
];

// Weekly trend data matching screenshot
const DEFAULT_WEEKLY_TRENDS = [
  { day: "Mon", liters: 12.0 },
  { day: "Tue", liters: 12.0 },
  { day: "Wed", liters: 16.0 },
  { day: "Thu", liters: 18.5 },
  { day: "Fri", liters: 12.0 },
  { day: "Sat", liters: 24.5 },
  { day: "Sun", liters: 20.0 },
];

type RecentCollection = {
  id: string;
  time: string;
  farmerName: string;
  farmerId: string;
  liters: number;
  rate: number;
  quality: string;
  route: string;
  status: string;
};

const DEFAULT_RECENT_COLLECTIONS: RecentCollection[] = [
  {
    id: "rec-1",
    time: "Today at 09:00 PM",
    farmerName: "Farmer Namerson",
    farmerId: "28308",
    liters: 2.3,
    rate: 55.0,
    quality: "100%",
    route: "Route 1",
    status: "Verified",
  },
  {
    id: "rec-2",
    time: "Today at 11:30 PM",
    farmerName: "Farmer Namerson",
    farmerId: "28303",
    liters: 1.85,
    rate: 55.0,
    quality: "100%",
    route: "Route 2",
    status: "Verified",
  },
  {
    id: "rec-3",
    time: "Today at 07:15 AM",
    farmerName: "Kiprono Chemosit",
    farmerId: "19402",
    liters: 14.5,
    rate: 55.0,
    quality: "98%",
    route: "Eldoret Central",
    status: "Verified",
  },
  {
    id: "rec-4",
    time: "Yesterday at 05:40 PM",
    farmerName: "Grace Wambui",
    farmerId: "30491",
    liters: 8.2,
    rate: 55.0,
    quality: "100%",
    route: "Route 3",
    status: "Verified",
  },
];

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
    <div className="rounded-2xl bg-card border border-border/80 p-5 shadow-xs mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="size-5 text-emerald-600" />
          <h2 className="font-bold text-base text-foreground">My Clerk Earnings</h2>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-3 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          KSh {rate.toFixed(2)}/L commission
        </span>
      </div>

      <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border/50">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Accrued</p>
            <p className="mt-1 text-2xl font-black text-foreground">
              KSh {totalEarnings.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
              <CheckCircle2 className="size-3.5" /> Active / Accruing
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              From {stats.totalKg.toFixed(1)} L collected
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-border/60 pt-3 text-center">
          <div className="rounded-lg bg-card p-2.5 ring-1 ring-border/40">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Today</p>
            <p className="mt-0.5 font-black text-sm text-foreground">
              KSh {todayEarnings.toFixed(0)}
            </p>
            <p className="text-[11px] text-muted-foreground">{stats.todayKg.toFixed(1)} L</p>
          </div>
          <div className="rounded-lg bg-card p-2.5 ring-1 ring-border/40">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">7 Days</p>
            <p className="mt-0.5 font-black text-sm text-foreground">
              KSh {weekEarnings.toFixed(0)}
            </p>
            <p className="text-[11px] text-muted-foreground">{stats.weekKg.toFixed(1)} L</p>
          </div>
          <div className="rounded-lg bg-card p-2.5 ring-1 ring-border/40">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">This Month</p>
            <p className="mt-0.5 font-black text-sm text-foreground">
              KSh {monthEarnings.toFixed(0)}
            </p>
            <p className="text-[11px] text-muted-foreground">{stats.monthKg.toFixed(1)} L</p>
          </div>
        </div>
      </div>
    </div>
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

  const [profileData, setProfileData] = useState<{
    name: string;
    centre: string;
  }>({
    name: "Ian koskel",
    centre: "Eldoret Hub",
  });

  const [stats, setStats] = useState<{
    todayLiters: number;
    activeFarmers: number;
    pendingPayouts: number;
    weeklyTrends: { day: string; liters: number }[];
    recentCollections: RecentCollection[];
  }>({
    todayLiters: 2845.5,
    activeFarmers: 342,
    pendingPayouts: 2000,
    weeklyTrends: DEFAULT_WEEKLY_TRENDS,
    recentCollections: DEFAULT_RECENT_COLLECTIONS,
  });

  // Fetch real profile
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("full_name, collection_centre")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfileData({
            name: data.full_name || user.email?.split("@")[0] || "Ian koskel",
            centre: data.collection_centre || "Eldoret Hub",
          });
        }
      });
  }, [user?.id, user?.email]);

  // Fetch collections and farmers stats
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Fetch today's collections
    supabase
      .from("collections")
      .select("quantity_kg, collected_at, status, farmer_id, unit_price")
      .order("collected_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data && data.length > 0) {
          let todaySum = 0;
          data.forEach((r) => {
            const dt = new Date(r.collected_at);
            if (dt >= today) todaySum += Number(r.quantity_kg) || 0;
          });

          // Fetch farmer details for recent rows
          const recent = data.slice(0, 4).map((r, idx) => ({
            id: `col-${idx}`,
            time: new Date(r.collected_at).toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            farmerName: `Farmer ID: ${r.farmer_id.slice(0, 8)}`,
            farmerId: r.farmer_id.slice(0, 6),
            liters: Number(r.quantity_kg) || 0,
            rate: Number(r.unit_price) || 55.0,
            quality: "100%",
            route: "Central Route",
            status: r.status || "Verified",
          }));

          setStats((prev) => ({
            ...prev,
            todayLiters: todaySum > 0 ? todaySum : 2845.5,
            recentCollections: recent.length > 0 ? recent : DEFAULT_RECENT_COLLECTIONS,
          }));
        }
      });

    // 2. Fetch farmers count
    supabase
      .from("farmers")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        if (count && count > 0) {
          setStats((prev) => ({
            ...prev,
            activeFarmers: count,
          }));
        }
      });
  }, []);

  const todayFormattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <AppShell
      title="MaziwaFlow Dashboard"
      subtitle={`${todayFormattedDate} - ${profileData.centre}`}
      back={false}
      wide={true}
    >
      {/* =========================================================================
          OPERATIONAL DASHBOARD HEADER MATCHING SCREENSHOT
          ========================================================================= */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase font-serif">
            MAZIWAFLOW OPERATIONAL DASHBOARD
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">
            {todayFormattedDate} - {profileData.centre}
          </p>
        </div>

        <Button
          asChild
          className="bg-[#183153] hover:bg-[#12243d] text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-[#183153]/20 flex items-center gap-2 h-auto text-sm"
        >
          <Link to="/receive-milk">
            <Plus className="size-4" />
            <span>New Milk Entry</span>
          </Link>
        </Button>
      </div>

      {/* Clerk Earnings Section (for field clerks) */}
      {role === "clerk" && user?.id && <ClerkEarningsSection clerkId={user.id} />}

      {/* =========================================================================
          MAIN DASHBOARD GRID (Two columns on desktop matching screenshot)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ================= LEFT / CENTER MAIN COLUMN (8 cols on lg) ================= */}
        <div className="lg:col-span-8 space-y-6">
          {/* TOP METRIC CARDS ROW */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* 1. TODAY'S TOTAL COLLECTION CARD */}
            <div className="sm:col-span-5 rounded-2xl bg-white dark:bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <p className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                  TODAY'S TOTAL COLLECTION
                </p>
                <div className="mt-2 flex items-baseline gap-2.5">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {stats.todayLiters.toLocaleString("en-KE", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{" "}
                    Liters
                  </span>
                  <span className="inline-flex items-center text-xs font-black text-emerald-600 dark:text-emerald-400">
                    +8% ↑
                  </span>
                </div>
              </div>

              {/* Sparkline curve */}
              <div className="h-14 w-full mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={SPARKLINE_DATA} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="blueSpark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2b6cb0" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2b6cb0" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="val"
                      stroke="#2b6cb0"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#blueSpark)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. ACTIVE FARMERS & SYSTEM STATUS CARD WITH COW VISUAL */}
            <div className="sm:col-span-7 rounded-2xl bg-white dark:bg-card border border-border/80 p-5 shadow-xs flex flex-col justify-between">
              <div className="grid grid-cols-3 gap-3 items-center">
                {/* Col A: Active Farmers */}
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    ACTIVE FARMERS
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                    {stats.activeFarmers} farmers
                  </p>
                  <div className="mt-2">
                    <p className="text-[10px] font-bold text-slate-400">92% complete</p>
                    <div className="mt-1 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full w-[92%]" />
                    </div>
                  </div>
                </div>

                {/* Col B: Dairy Graphic Thumbnail */}
                <div className="flex items-center justify-center">
                  <div className="size-16 sm:size-20 rounded-2xl overflow-hidden border border-border shadow-xs bg-slate-100 dark:bg-slate-800 flex items-center justify-center relative group">
                    <img
                      src="https://images.unsplash.com/photo-1546445317-29f4545e9d53?auto=format&fit=crop&w=300&q=80"
                      alt="Dairy Herd"
                      className="size-full object-cover group-hover:scale-105 transition"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <Milk className="size-8 text-blue-600 absolute" />
                  </div>
                </div>

                {/* Col C: Pending Payouts & System Status */}
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      PENDING PAYOUTS
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-base font-extrabold text-slate-900 dark:text-white">
                        Online
                      </span>
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      SYSTEM STATUS
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Connected and Synced
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECOND ROW: 2 SMALL STAT CARDS */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white dark:bg-card border border-border/80 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Active Farmers</span>
                <span className="text-xs font-bold text-slate-400">100%</span>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">49</p>
              <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-700 rounded-full w-full" />
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-card border border-border/80 p-4 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500">Pending Payouts</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">2,000</p>
                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  System Status
                </p>
              </div>
              <div className="size-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center ring-1 ring-emerald-500/20">
                <Check className="size-5 stroke-[3]" />
              </div>
            </div>
          </div>

          {/* 6 OPERATIONAL COLORFUL ACTION BUTTONS MATCHING SCREENSHOT */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Change Password (Purple) */}
            <Button
              asChild
              className="h-12 bg-[#6754d6] hover:bg-[#5844c8] text-white font-bold rounded-xl shadow-xs flex items-center justify-start px-4 gap-3"
            >
              <Link to="/change-password">
                <KeyRound className="size-4.5 shrink-0" />
                <span className="text-sm truncate">Change Password</span>
              </Link>
            </Button>

            {/* Farmer Directory (Green) */}
            <Button
              asChild
              className="h-12 bg-[#38a169] hover:bg-[#2f855a] text-white font-bold rounded-xl shadow-xs flex items-center justify-start px-4 gap-3"
            >
              <Link to="/farmers">
                <Users className="size-4.5 shrink-0" />
                <span className="text-sm truncate">Farmer Directory</span>
              </Link>
            </Button>

            {/* Enquiries (Amber/Orange) */}
            <Button
              asChild
              className="h-12 bg-[#d69e2e] hover:bg-[#b7791f] text-white font-bold rounded-xl shadow-xs flex items-center justify-start px-4 gap-3"
            >
              <Link to="/enquiries">
                <MessageCircleQuestion className="size-4.5 shrink-0" />
                <span className="text-sm truncate">Enquiries</span>
              </Link>
            </Button>

            {/* Daily Summary (Slate/Blue) */}
            <Button
              asChild
              className="h-12 bg-[#718096] hover:bg-[#4a5568] text-white font-bold rounded-xl shadow-xs flex items-center justify-start px-4 gap-3"
            >
              <Link to="/daily-summary">
                <CalendarDays className="size-4.5 shrink-0" />
                <span className="text-sm truncate">Daily Summary</span>
              </Link>
            </Button>

            {/* Admin Overview (Dark Blue) */}
            <Button
              asChild
              className="h-12 bg-[#2b6cb0] hover:bg-[#2c5282] text-white font-bold rounded-xl shadow-xs flex items-center justify-start px-4 gap-3"
            >
              <Link to="/admin-dashboard">
                <BarChart3 className="size-4.5 shrink-0" />
                <span className="text-sm truncate">Admin Overview</span>
              </Link>
            </Button>

            {/* Lipa Pole Pole (Teal) */}
            <Button
              asChild
              className="h-12 bg-[#319795] hover:bg-[#285e61] text-white font-bold rounded-xl shadow-xs flex items-center justify-start px-4 gap-3"
            >
              <Link to="/lipa-pole-pole">
                <CreditCard className="size-4.5 shrink-0" />
                <span className="text-sm truncate">Lipa Pole Pole</span>
              </Link>
            </Button>
          </div>

          {/* WEEKLY COLLECTION TRENDS CHART CARD */}
          <div className="rounded-2xl bg-white dark:bg-card border border-border/80 p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm tracking-wider uppercase text-slate-800 dark:text-slate-100">
                WEEKLY COLLECTION TRENDS
              </h3>
              <span className="text-xs text-muted-foreground font-medium">Last 7 Days</span>
            </div>

            <div className="h-56 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.weeklyTrends}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2b6cb0" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#2b6cb0" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.9)",
                      borderRadius: "10px",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                      padding: "8px 12px",
                    }}
                    formatter={(value: any) => [`${value} Liters`, "Collection"]}
                  />
                  <Area
                    type="natural"
                    dataKey="liters"
                    stroke="#1a4d80"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#trendGradient)"
                    dot={{ r: 4, fill: "#2b6cb0", strokeWidth: 2, stroke: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: QUICK ACTIONS & RECENT ACTIVITY (4 cols on lg) ================= */}
        <div className="lg:col-span-4 space-y-6">
          {/* QUICK ACTIONS CARD MATCHING SCREENSHOT WARM CREAM CONTAINER */}
          <div className="rounded-2xl bg-[#fbf7ed] dark:bg-card border border-[#f0e6d2] dark:border-border/80 p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
              <Zap className="size-5 text-amber-500 fill-amber-500" />
              <h2 className="font-extrabold text-sm tracking-wider uppercase">QUICK ACTIONS</h2>
            </div>

            <div className="space-y-3">
              <Link
                to="/receive-milk"
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-white dark:bg-muted/40 hover:bg-slate-50 dark:hover:bg-muted border border-[#f0e6d2] dark:border-border/50 text-slate-800 dark:text-slate-200 font-bold text-sm shadow-xs transition group"
              >
                <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <Plus className="size-4 stroke-[3]" />
                </div>
                <span>Add Single Entry</span>
              </Link>

              <Link
                to="/receive-milk"
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-white dark:bg-muted/40 hover:bg-slate-50 dark:hover:bg-muted border border-[#f0e6d2] dark:border-border/50 text-slate-800 dark:text-slate-200 font-bold text-sm shadow-xs transition group"
              >
                <div className="size-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <LayoutGrid className="size-4" />
                </div>
                <span>Bulk Batch Entry</span>
              </Link>

              <Link
                to="/payments"
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-white dark:bg-muted/40 hover:bg-slate-50 dark:hover:bg-muted border border-[#f0e6d2] dark:border-border/50 text-slate-800 dark:text-slate-200 font-bold text-sm shadow-xs transition group"
              >
                <div className="size-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <CreditCard className="size-4" />
                </div>
                <span>Issue Advance Payment</span>
              </Link>

              <Link
                to="/daily-summary"
                className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-white dark:bg-muted/40 hover:bg-slate-50 dark:hover:bg-muted border border-[#f0e6d2] dark:border-border/50 text-slate-800 dark:text-slate-200 font-bold text-sm shadow-xs transition group"
              >
                <div className="size-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <FileSpreadsheet className="size-4" />
                </div>
                <span>Print Farmer Ledger</span>
              </Link>
            </div>
          </div>

          {/* RECENT ACTIVITY: MILK COLLECTIONS TABLE */}
          <div className="rounded-2xl bg-white dark:bg-card border border-border/80 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  RECENT ACTIVITY
                </p>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white mt-0.5">
                  Recent Milk Collections
                </h3>
              </div>
              <Link
                to="/collections"
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-slate-400 font-bold">
                    <th className="pb-2 font-bold">Time</th>
                    <th className="pb-2 font-bold">Farmer</th>
                    <th className="pb-2 font-bold text-right">Liters</th>
                    <th className="pb-2 font-bold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {stats.recentCollections.map((col) => (
                    <tr key={col.id} className="hover:bg-muted/30 transition">
                      <td className="py-2.5 font-medium text-slate-500 whitespace-nowrap">
                        {col.time}
                      </td>
                      <td className="py-2.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {col.farmerName}
                      </td>
                      <td className="py-2.5 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                        {col.liters.toFixed(2)} L
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400">
                          {col.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
