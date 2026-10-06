import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Search,
  CalendarDays,
  TrendingUp,
  Users,
  Download,
  Printer,
  Pencil,
  Ban,
  History,
  X,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRole } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated/collections")({
  head: () => ({
    meta: [
      { title: "View Collections — Maziwaflow Mobile" },
      {
        name: "description",
        content: "Browse recorded milk collections by farmer, quantity and grade.",
      },
      { property: "og:title", content: "View Collections — Maziwaflow Mobile" },
      {
        property: "og:description",
        content: "Browse recorded milk collections by farmer, quantity and grade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Collections,
});

type Row = {
  id: string;
  farmer_code: string;
  quantity_kg: number;
  quality_grade: string;
  status: string;
  collected_at: string;
  price_per_ksh: number | null;
  farmers: { full_name: string } | null;
};

type CollectionUpdate = {
  quantity_kg?: number;
  quality_grade?: string;
  status?: string;
};

type Correction = {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  corrected_by: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
};

type PeriodPreset = "all" | "today" | "week" | "month" | "custom";

const STATUS_STYLE: Record<string, string> = {
  Accepted: "bg-maziwa-green/15 text-maziwa-green-deep",
  "Pending Test": "bg-maziwa-orange/15 text-maziwa-orange-deep",
  Rejected: "bg-destructive/15 text-destructive",
  Voided: "bg-muted text-muted-foreground line-through",
};

const PRESET_LABELS: Record<PeriodPreset, string> = {
  all: "All Time",
  today: "Today",
  week: "This Week",
  month: "This Month",
  custom: "Custom",
};

const GRADES = ["Grade A", "Grade B", "Grade C", "Rejected"];
const STATUSES = ["Accepted", "Pending Test", "Rejected", "Voided"];

const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
const fmtFullDate = (s: string) =>
  new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const fmtKsh = (n: number) =>
  `KSh ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPresetRange(preset: PeriodPreset): { start: string; end: string } {
  const now = new Date();
  const end = toISODate(now);
  if (preset === "today") return { start: end, end };
  if (preset === "week") {
    const start = new Date(now);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    return { start: toISODate(start), end };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toISODate(start), end };
  }
  return { start: "", end: "" };
}

function Collections() {
  const role = useRole();
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [preset, setPreset] = useState<PeriodPreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [farmerFilter, setFarmerFilter] = useState("");
  const [farmersList, setFarmersList] = useState<{ farmer_code: string; full_name: string }[]>([]);
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({
    quantity_kg: "",
    quality_grade: "",
    status: "",
    reason: "",
  });
  const [voidTarget, setVoidTarget] = useState<Row | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [historyTarget, setHistoryTarget] = useState<Row | null>(null);
  const [corrections, setCorrections] = useState<Correction[] | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = role === "admin" || role === "clerk";

  const loadCollections = useCallback(() => {
    supabase
      .from("collections")
      .select(
        "id, farmer_code, quantity_kg, quality_grade, status, collected_at, price_per_ksh, farmers(full_name)",
      )
      .order("collected_at", { ascending: false })
      .then(({ data }) => setRows((data as Row[] | null) ?? []));
  }, []);

  useEffect(() => {
    loadCollections();
    supabase
      .from("farmers")
      .select("farmer_code, full_name")
      .order("farmer_code")
      .then(({ data }) => setFarmersList(data ?? []));
  }, [loadCollections]);

  const dateRange = useMemo(() => {
    if (preset === "custom") return { start: customStart, end: customEnd };
    if (preset === "all") return { start: "", end: "" };
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const startTs = dateRange.start ? new Date(dateRange.start + "T00:00:00").getTime() : 0;
    const endTs = dateRange.end ? new Date(dateRange.end + "T23:59:59").getTime() : Infinity;
    return (rows ?? []).filter((r) => {
      if (
        s &&
        !r.farmer_code.toLowerCase().includes(s) &&
        !r.farmers?.full_name.toLowerCase().includes(s)
      )
        return false;
      if (farmerFilter && r.farmer_code !== farmerFilter) return false;
      const ts = new Date(r.collected_at).getTime();
      if (ts < startTs || ts > endTs) return false;
      return true;
    });
  }, [rows, q, farmerFilter, dateRange]);

  const acceptedRows = filtered.filter((r) => r.status === "Accepted");
  const totalKg = acceptedRows.reduce((a, r) => a + Number(r.quantity_kg), 0);
  const totalValue = acceptedRows.reduce(
    (a, r) => a + Number(r.quantity_kg) * Number(r.price_per_ksh ?? 0),
    0,
  );

  const farmerSummary = useMemo(() => {
    const map: Record<string, { name: string; kg: number; deliveries: number; value: number }> = {};
    acceptedRows.forEach((r) => {
      const entry = map[r.farmer_code] ?? {
        name: r.farmers?.full_name ?? r.farmer_code,
        kg: 0,
        deliveries: 0,
        value: 0,
      };
      map[r.farmer_code] = entry;
      entry.kg += Number(r.quantity_kg);
      entry.deliveries += 1;
      entry.value += Number(r.quantity_kg) * Number(r.price_per_ksh ?? 0);
    });
    return Object.entries(map)
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.kg - a.kg);
  }, [acceptedRows]);

  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    acceptedRows.forEach((r) => {
      const day = toISODate(new Date(r.collected_at));
      map[day] = (map[day] ?? 0) + Number(r.quantity_kg);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([day, kg]) => ({
        day: new Date(day + "T00:00:00").toLocaleDateString("en-KE", {
          day: "numeric",
          month: "short",
        }),
        kg,
      }));
  }, [acceptedRows]);

  function exportCsv() {
    const headers = [
      "Farmer Code",
      "Farmer Name",
      "Quantity (kg)",
      "Grade",
      "Status",
      "Price/kg",
      "Value (KSh)",
      "Date",
      "Time",
    ];
    const lines = filtered.map((r) => {
      const val =
        r.status === "Accepted" ? Number(r.quantity_kg) * Number(r.price_per_ksh ?? 0) : 0;
      const d = new Date(r.collected_at);
      return [
        r.farmer_code,
        r.farmers?.full_name ?? "",
        r.quantity_kg,
        r.quality_grade,
        r.status,
        r.price_per_ksh ?? "",
        val.toFixed(0),
        d.toLocaleDateString("en-KE"),
        d.toLocaleTimeString("en-KE"),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `collections-${dateRange.start || "all"}-to-${dateRange.end || "now"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printStatement() {
    const farmerName = farmerFilter
      ? (farmersList.find((f) => f.farmer_code === farmerFilter)?.full_name ?? farmerFilter)
      : "All Farmers";
    const periodLabel = dateRange.start
      ? `${fmtFullDate(dateRange.start + "T00:00:00")} — ${fmtFullDate(dateRange.end + "T23:59:59")}`
      : "All Time";
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return void toast.error("Pop-up blocked. Please allow pop-ups to print.");
    const rowsHtml = filtered
      .map(
        (r) => `
      <tr>
        <td>${r.farmers?.full_name ?? r.farmer_code}</td>
        <td>${r.farmer_code}</td>
        <td style="text-align:right">${Number(r.quantity_kg)} kg</td>
        <td>${r.quality_grade}</td>
        <td>${r.price_per_ksh ? fmtKsh(Number(r.price_per_ksh)) : "—"}</td>
        <td style="text-align:right">${r.status === "Accepted" ? fmtKsh(Number(r.quantity_kg) * Number(r.price_per_ksh ?? 0)) : "—"}</td>
        <td>${fmtFullDate(r.collected_at)} ${fmtTime(r.collected_at)}</td>
        <td>${r.status}</td>
      </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Maziwaflow — Collection Statement</title>
      <style>
        body{font-family:system-ui,sans-serif;margin:32px;color:#1a1a1a}
        h1{font-size:20px;margin:0 0 4px}
        h2{font-size:14px;font-weight:400;color:#666;margin:0 0 24px}
        .meta{display:flex;gap:32px;margin-bottom:16px;font-size:13px}
        .meta strong{display:block;font-size:11px;text-transform:uppercase;color:#999}
        .summary{display:flex;gap:24px;margin-bottom:24px}
        .summary div{border:1px solid #ddd;border-radius:8px;padding:12px 16px;min-width:120px}
        .summary p{margin:0;font-size:11px;text-transform:uppercase;color:#999}
        .summary span{font-size:20px;font-weight:bold}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{text-align:left;border-bottom:2px solid #ddd;padding:8px;text-transform:uppercase;font-size:10px;color:#999}
        td{border-bottom:1px solid #eee;padding:8px}
        .footer{margin-top:32px;font-size:11px;color:#999;text-align:center}
        @media print{body{margin:16px}}
      </style></head><body>
      <h1>Maziwaflow Mobile</h1>
      <h2>Collection Statement</h2>
      <div class="meta">
        <div><strong>Farmer</strong>${farmerName}</div>
        <div><strong>Period</strong>${periodLabel}</div>
        <div><strong>Generated</strong>${new Date().toLocaleString("en-KE")}</div>
      </div>
      <div class="summary">
        <div><p>Records</p><span>${filtered.length}</span></div>
        <div><p>Accepted Volume</p><span>${totalKg.toFixed(1)} kg</span></div>
        <div><p>Total Value</p><span>${fmtKsh(totalValue)}</span></div>
      </div>
      <table>
        <thead><tr><th>Farmer</th><th>ID</th><th style="text-align:right">Qty</th><th>Grade</th><th>Price/kg</th><th style="text-align:right">Value</th><th>Date</th><th>Status</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="footer">Maziwaflow Mobile — Generated ${new Date().toLocaleString("en-KE")}</div>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  function openEdit(r: Row) {
    setEditTarget(r);
    setEditForm({
      quantity_kg: String(r.quantity_kg),
      quality_grade: r.quality_grade,
      status: r.status,
      reason: "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.reason.trim()) return void toast.error("A reason is required for corrections.");
    setBusy(true);
    const updates: CollectionUpdate = {};
    const correctionsToInsert: { field_name: string; old_value: string; new_value: string }[] = [];

    const newQty = Number(editForm.quantity_kg);
    if (!Number.isNaN(newQty) && newQty !== Number(editTarget.quantity_kg)) {
      updates.quantity_kg = newQty;
      correctionsToInsert.push({
        field_name: "quantity_kg",
        old_value: String(editTarget.quantity_kg),
        new_value: String(newQty),
      });
    }
    if (editForm.quality_grade !== editTarget.quality_grade) {
      updates.quality_grade = editForm.quality_grade;
      correctionsToInsert.push({
        field_name: "quality_grade",
        old_value: editTarget.quality_grade,
        new_value: editForm.quality_grade,
      });
    }
    if (editForm.status !== editTarget.status) {
      updates.status = editForm.status;
      correctionsToInsert.push({
        field_name: "status",
        old_value: editTarget.status,
        new_value: editForm.status,
      });
    }

    if (Object.keys(updates).length === 0) {
      setBusy(false);
      return void toast.error("No changes to save.");
    }

    const { error: updateError } = await supabase
      .from("collections")
      .update(updates)
      .eq("id", editTarget.id);

    if (updateError) {
      setBusy(false);
      return void toast.error("Could not update collection: " + updateError.message);
    }

    if (correctionsToInsert.length > 0) {
      const { error: corrError } = await supabase.from("collection_corrections").insert(
        correctionsToInsert.map((c) => ({
          collection_id: editTarget.id,
          farmer_code: editTarget.farmer_code,
          field_name: c.field_name,
          old_value: c.old_value,
          new_value: c.new_value,
          reason: editForm.reason.trim(),
          corrected_by: user.id,
        })),
      );
      if (corrError) {
        setBusy(false);
        return void toast.error("Collection updated but audit trail failed: " + corrError.message);
      }
    }

    setBusy(false);
    toast.success(`Collection corrected (${correctionsToInsert.length} field(s) changed)`);
    setEditTarget(null);
    loadCollections();
  }

  async function voidCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!voidTarget) return;
    if (!voidReason.trim()) return void toast.error("A reason is required to void a collection.");
    setBusy(true);

    const { error: updateError } = await supabase
      .from("collections")
      .update({ status: "Voided" })
      .eq("id", voidTarget.id);

    if (updateError) {
      setBusy(false);
      return void toast.error("Could not void collection: " + updateError.message);
    }

    const { error: corrError } = await supabase.from("collection_corrections").insert({
      collection_id: voidTarget.id,
      farmer_code: voidTarget.farmer_code,
      field_name: "status",
      old_value: voidTarget.status,
      new_value: "Voided",
      reason: voidReason.trim(),
      corrected_by: user.id,
    });

    setBusy(false);
    if (corrError)
      return void toast.error("Collection voided but audit trail failed: " + corrError.message);
    toast.success("Collection voided");
    setVoidTarget(null);
    setVoidReason("");
    loadCollections();
  }

  async function openHistory(r: Row) {
    setHistoryTarget(r);
    setCorrections(null);
    const { data } = await supabase
      .from("collection_corrections")
      .select(
        "id, field_name, old_value, new_value, reason, corrected_by, created_at, profiles(full_name)",
      )
      .eq("collection_id", r.id)
      .order("created_at", { ascending: false });
    setCorrections((data as Correction[]) ?? []);
  }

  return (
    <AppShell title="View Collections" subtitle="Browse milk deliveries with date filtering" wide>
      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-maziwa-green-deep" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Records</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">{filtered.length}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-maziwa-blue" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Accepted Vol</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">
            {totalKg.toFixed(1)} <span className="text-sm">kg</span>
          </p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-maziwa-purple" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Value</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">{fmtKsh(totalValue)}</p>
        </div>
      </div>

      {/* Filters bar */}
      <ShellCard>
        {/* Period presets */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "today", "week", "month", "custom"] as PeriodPreset[]).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={preset === p ? "default" : "outline"}
              className={`h-8 rounded-full text-xs font-bold ${preset === p ? "bg-maziwa-blue text-primary-foreground" : ""}`}
              onClick={() => setPreset(p)}
            >
              {PRESET_LABELS[p]}
            </Button>
          ))}
        </div>

        {/* Custom date range */}
        {preset === "custom" && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <div>
              <label className={labelClass} htmlFor="from_date">
                From
              </label>
              <input
                id="from_date"
                type="date"
                className={fieldClass}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="to_date">
                To
              </label>
              <input
                id="to_date"
                type="date"
                className={fieldClass}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Search + farmer filter + export buttons */}
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-32 flex-1">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${fieldClass} pl-10`}
              placeholder="Search farmer name or ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className={`${fieldClass} w-auto min-w-40`}
            value={farmerFilter}
            onChange={(e) => setFarmerFilter(e.target.value)}
          >
            <option value="">All farmers</option>
            {farmersList.map((f) => (
              <option key={f.farmer_code} value={f.farmer_code}>
                {f.farmer_code} — {f.full_name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-12 shrink-0 rounded-lg"
            onClick={printStatement}
            disabled={filtered.length === 0}
          >
            <Printer className="size-4" /> Statement
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-12 shrink-0 rounded-lg"
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            <Download className="size-4" /> CSV
          </Button>
          <Button
            asChild
            size="icon"
            className="size-12 shrink-0 rounded-lg bg-maziwa-green text-primary-foreground hover:bg-maziwa-green-deep"
          >
            <Link to="/receive-milk" aria-label="Receive milk">
              <Plus className="size-5" />
            </Link>
          </Button>
        </div>

        {/* Daily volume chart */}
        {dailyData.length > 1 && (
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <BarChartIcon />
              <h3 className="text-sm font-bold">Daily Volume (last 14 days)</h3>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
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
          </div>
        )}

        {/* Per-farmer summary */}
        {farmerSummary.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-sm font-bold">Per-Farmer Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3">Farmer</th>
                    <th className="pr-3 text-right">Deliveries</th>
                    <th className="pr-3 text-right">Volume (kg)</th>
                    <th className="pr-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {farmerSummary.map((f) => (
                    <tr key={f.code} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-3">
                        <p className="font-semibold">{f.name}</p>
                        <p className="text-xs text-muted-foreground">{f.code}</p>
                      </td>
                      <td className="pr-3 text-right">{f.deliveries}</td>
                      <td className="pr-3 text-right font-bold">{f.kg.toFixed(1)}</td>
                      <td className="pr-3 text-right font-semibold text-maziwa-green-deep">
                        {fmtKsh(f.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Collection records */}
        {rows === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No collections found for the selected period.
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="space-y-2.5 sm:hidden">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className={`rounded-lg bg-muted/50 p-3.5 ring-1 ring-border/60 ${r.status === "Voided" ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{r.farmers?.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.farmer_code} · {r.quality_grade}
                      </p>
                    </div>
                    <p className="text-lg font-extrabold whitespace-nowrap">
                      {Number(r.quantity_kg)} kg
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {fmtDate(r.collected_at)} · {fmtTime(r.collected_at)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-bold ${STATUS_STYLE[r.status] ?? ""}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.status === "Accepted" && r.price_per_ksh && (
                    <p className="mt-1 text-xs font-semibold text-maziwa-green-deep">
                      {fmtKsh(Number(r.quantity_kg) * Number(r.price_per_ksh))}
                    </p>
                  )}
                  {canEdit && r.status !== "Voided" && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="size-3" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-destructive"
                        onClick={() => setVoidTarget(r)}
                      >
                        <Ban className="size-3" /> Void
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => openHistory(r)}
                      >
                        <History className="size-3" /> Audit
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {/* Desktop table */}
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-2">Farmer</th>
                  <th className="pr-2">Farmer ID</th>
                  <th className="pr-2 text-right">Qty</th>
                  <th className="pr-2">Grade</th>
                  <th className="pr-2 text-right">Price/kg</th>
                  <th className="pr-2 text-right">Value</th>
                  <th className="pr-2">Time</th>
                  <th className="pr-2">Status</th>
                  {canEdit && <th className="pr-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-border/60 last:border-0 ${r.status === "Voided" ? "opacity-50" : ""}`}
                  >
                    <td className="py-3 pr-2 font-semibold">{r.farmers?.full_name}</td>
                    <td className="pr-2 text-muted-foreground">{r.farmer_code}</td>
                    <td className="pr-2 text-right font-bold">{Number(r.quantity_kg)} kg</td>
                    <td className="pr-2">{r.quality_grade}</td>
                    <td className="pr-2 text-right text-muted-foreground">
                      {r.price_per_ksh ? fmtKsh(Number(r.price_per_ksh)) : "—"}
                    </td>
                    <td className="pr-2 text-right font-semibold text-maziwa-green-deep">
                      {r.status === "Accepted" && r.price_per_ksh
                        ? fmtKsh(Number(r.quantity_kg) * Number(r.price_per_ksh))
                        : "—"}
                    </td>
                    <td className="pr-2 whitespace-nowrap">
                      {fmtDate(r.collected_at)}, {fmtTime(r.collected_at)}
                    </td>
                    <td>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status] ?? ""}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="pr-2">
                        <div className="flex justify-end gap-1">
                          {r.status !== "Voided" && (
                            <>
                              <button
                                onClick={() => openEdit(r)}
                                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                onClick={() => setVoidTarget(r)}
                                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="Void"
                              >
                                <Ban className="size-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => openHistory(r)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Audit history"
                          >
                            <History className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </ShellCard>

      {/* Edit modal */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="size-5 text-maziwa-blue" />
                <h2 className="font-bold">Correct Collection</h2>
              </div>
              <button
                onClick={() => setEditTarget(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {editTarget.farmers?.full_name} · {fmtFullDate(editTarget.collected_at)} ·{" "}
              {Number(editTarget.quantity_kg)} kg · {editTarget.quality_grade}
            </p>
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="edit_qty">
                  Quantity (kg)
                </label>
                <input
                  id="edit_qty"
                  type="number"
                  step="0.1"
                  className={fieldClass}
                  value={editForm.quantity_kg}
                  onChange={(e) => setEditForm((s) => ({ ...s, quantity_kg: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit_grade">
                  Quality Grade
                </label>
                <select
                  id="edit_grade"
                  className={fieldClass}
                  value={editForm.quality_grade}
                  onChange={(e) => setEditForm((s) => ({ ...s, quality_grade: e.target.value }))}
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="edit_status">
                  Status
                </label>
                <select
                  id="edit_status"
                  className={fieldClass}
                  value={editForm.status}
                  onChange={(e) => setEditForm((s) => ({ ...s, status: e.target.value }))}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="edit_reason">
                  Reason for correction <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="edit_reason"
                  rows={3}
                  className={fieldClass}
                  placeholder="Explain why this correction is being made (required for audit trail)"
                  value={editForm.reason}
                  onChange={(e) => setEditForm((s) => ({ ...s, reason: e.target.value }))}
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="pill-action h-auto justify-center bg-maziwa-blue hover:bg-maziwa-blue/90 disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" />} Save Correction
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Void confirm modal */}
      {voidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setVoidTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban className="size-5 text-destructive" />
                <h2 className="font-bold">Void Collection</h2>
              </div>
              <button
                onClick={() => setVoidTarget(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {voidTarget.farmers?.full_name} · {fmtFullDate(voidTarget.collected_at)} ·{" "}
              {Number(voidTarget.quantity_kg)} kg · {voidTarget.status}
            </p>
            <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Voiding marks this collection as cancelled. It will be excluded from earnings and
              payment calculations. The original values are preserved in the audit trail.
            </p>
            <form onSubmit={voidCollection} className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="void_reason">
                  Reason for voiding <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="void_reason"
                  rows={3}
                  className={fieldClass}
                  placeholder="Explain why this collection is being voided (required for audit trail)"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="pill-action h-auto justify-center bg-destructive hover:bg-destructive/90 disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" />} Void Collection
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Audit history modal */}
      {historyTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setHistoryTarget(null)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-card p-6 shadow-xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="size-5 text-maziwa-purple" />
                <h2 className="font-bold">Correction History</h2>
              </div>
              <button
                onClick={() => setHistoryTarget(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {historyTarget.farmers?.full_name} · {historyTarget.farmer_code} ·{" "}
              {fmtFullDate(historyTarget.collected_at)}
            </p>
            {corrections === null ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : corrections.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No corrections have been made to this collection.
              </p>
            ) : (
              <ul className="space-y-3 max-h-80 overflow-y-auto">
                {corrections.map((c) => (
                  <li key={c.id} className="rounded-lg bg-muted/40 p-3 ring-1 ring-border/60">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-maziwa-purple">
                        {c.field_name.replace(/_/g, " ")}
                      </span>
                      <span className="text-muted-foreground">
                        {fmtFullDate(c.created_at)} {fmtTime(c.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground line-through">
                        {c.old_value ?? "—"}
                      </span>
                      {" → "}
                      <span className="font-semibold">{c.new_value ?? "—"}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Reason: {c.reason}</p>
                    {c.profiles?.full_name && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        By: {c.profiles.full_name}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function BarChartIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-maziwa-blue"
    >
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}
