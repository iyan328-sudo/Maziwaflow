import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  CalendarDays,
  TrendingUp,
  Users,
  IndianRupee,
  Printer,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/daily-summary")({
  head: () => ({
    meta: [
      { title: "Daily Summary — Maziwaflow Mobile" },
      {
        name: "description",
        content: "End-of-day collection summary with totals and per-farmer breakdown.",
      },
      { property: "og:title", content: "Daily Summary — Maziwaflow Mobile" },
      {
        property: "og:description",
        content: "End-of-day collection summary with totals and per-farmer breakdown.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DailySummary,
});

type Collection = {
  id: string;
  farmer_code: string;
  quantity_kg: number;
  quality_grade: string;
  status: string;
  collected_at: string;
  price_per_ksh: number | null;
  farmers: { full_name: string } | null;
};

const STATUS_STYLE: Record<string, string> = {
  Accepted: "bg-maziwa-green/15 text-maziwa-green-deep",
  "Pending Test": "bg-maziwa-orange/15 text-maziwa-orange-deep",
  Rejected: "bg-destructive/15 text-destructive",
  Voided: "bg-muted text-muted-foreground line-through",
};

const GRADE_COLORS: Record<string, string> = {
  "Grade A": "text-maziwa-green-deep",
  "Grade B": "text-maziwa-blue",
  "Grade C": "text-maziwa-orange-deep",
  Rejected: "text-destructive",
};

const fmtKsh = (n: number) =>
  `KSh ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });
const fmtFullDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function DailySummary() {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<Collection[] | null>(null);

  useEffect(() => {
    const dayStart = new Date(date + "T00:00:00").toISOString();
    const dayEnd = new Date(date + "T23:59:59").toISOString();
    supabase
      .from("collections")
      .select(
        "id, farmer_code, quantity_kg, quality_grade, status, collected_at, price_per_ksh, farmers(full_name)",
      )
      .gte("collected_at", dayStart)
      .lte("collected_at", dayEnd)
      .order("collected_at", { ascending: true })
      .then(({ data }) => setRows((data as Collection[]) ?? []));
  }, [date]);

  const activeRows = useMemo(() => (rows ?? []).filter((r) => r.status !== "Voided"), [rows]);

  const acceptedRows = useMemo(
    () => activeRows.filter((r) => r.status === "Accepted"),
    [activeRows],
  );

  const totalKg = acceptedRows.reduce((a, r) => a + Number(r.quantity_kg), 0);
  const totalValue = acceptedRows.reduce(
    (a, r) => a + Number(r.quantity_kg) * Number(r.price_per_ksh ?? 0),
    0,
  );
  const totalDeliveries = activeRows.length;
  const farmerCount = new Set(activeRows.map((r) => r.farmer_code)).size;

  const rejectedCount = activeRows.filter((r) => r.status === "Rejected").length;
  const pendingCount = activeRows.filter((r) => r.status === "Pending Test").length;

  const gradeBreakdown = useMemo(() => {
    const map: Record<string, { kg: number; count: number; value: number }> = {};
    acceptedRows.forEach((r) => {
      const entry = map[r.quality_grade] ?? { kg: 0, count: 0, value: 0 };
      map[r.quality_grade] = entry;
      entry.kg += Number(r.quantity_kg);
      entry.count += 1;
      entry.value += Number(r.quantity_kg) * Number(r.price_per_ksh ?? 0);
    });
    return Object.entries(map)
      .map(([grade, v]) => ({ grade, ...v }))
      .sort((a, b) => b.kg - a.kg);
  }, [acceptedRows]);

  const farmerBreakdown = useMemo(() => {
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

  function exportCsv() {
    const headers = [
      "Farmer Code",
      "Farmer Name",
      "Quantity (kg)",
      "Grade",
      "Status",
      "Price/kg",
      "Value (KSh)",
      "Time",
    ];
    const lines = activeRows.map((r) => {
      const val =
        r.status === "Accepted" ? Number(r.quantity_kg) * Number(r.price_per_ksh ?? 0) : 0;
      return [
        r.farmer_code,
        r.farmers?.full_name ?? "",
        r.quantity_kg,
        r.quality_grade,
        r.status,
        r.price_per_ksh ?? "",
        val.toFixed(0),
        fmtTime(r.collected_at),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-summary-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return void toast.error("Pop-up blocked. Please allow pop-ups to print.");
    const farmerRowsHtml = farmerBreakdown
      .map(
        (f) => `
      <tr>
        <td>${f.name}</td>
        <td>${f.code}</td>
        <td style="text-align:right">${f.deliveries}</td>
        <td style="text-align:right">${f.kg.toFixed(1)} kg</td>
        <td style="text-align:right">${fmtKsh(f.value)}</td>
      </tr>`,
      )
      .join("");
    const gradeRowsHtml = gradeBreakdown
      .map(
        (g) => `
      <tr>
        <td>${g.grade}</td>
        <td style="text-align:right">${g.count}</td>
        <td style="text-align:right">${g.kg.toFixed(1)} kg</td>
        <td style="text-align:right">${fmtKsh(g.value)}</td>
      </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Maziwaflow — Daily Summary ${date}</title>
      <style>
        body{font-family:system-ui,sans-serif;margin:32px;color:#1a1a1a}
        h1{font-size:22px;margin:0 0 4px}
        h2{font-size:14px;font-weight:400;color:#666;margin:0 0 8px}
        .date{font-size:16px;font-weight:bold;margin-bottom:24px}
        .summary{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
        .summary div{border:1px solid #ddd;border-radius:8px;padding:12px 16px;min-width:100px}
        .summary p{margin:0;font-size:10px;text-transform:uppercase;color:#999}
        .summary span{font-size:18px;font-weight:bold}
        .section{margin-bottom:24px}
        .section h3{font-size:14px;margin:0 0 8px;border-bottom:2px solid #ddd;padding-bottom:4px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
        th{text-align:left;border-bottom:2px solid #ddd;padding:6px;text-transform:uppercase;font-size:10px;color:#999}
        td{border-bottom:1px solid #eee;padding:6px}
        .footer{margin-top:32px;font-size:11px;color:#999;text-align:center}
        @media print{body{margin:16px}}
      </style></head><body>
      <h1>Maziwaflow Mobile</h1>
      <h2>Daily Collection Summary</h2>
      <div class="date">${fmtFullDate(date)}</div>
      <div class="summary">
        <div><p>Total Volume</p><span>${totalKg.toFixed(1)} kg</span></div>
        <div><p>Total Value</p><span>${fmtKsh(totalValue)}</span></div>
        <div><p>Deliveries</p><span>${totalDeliveries}</span></div>
        <div><p>Farmers</p><span>${farmerCount}</span></div>
        ${rejectedCount > 0 ? `<div><p>Rejected</p><span>${rejectedCount}</span></div>` : ""}
        ${pendingCount > 0 ? `<div><p>Pending Test</p><span>${pendingCount}</span></div>` : ""}
      </div>
      <div class="section">
        <h3>Grade Breakdown</h3>
        <table><thead><tr><th>Grade</th><th style="text-align:right">Deliveries</th><th style="text-align:right">Volume</th><th style="text-align:right">Value</th></tr></thead>
        <tbody>${gradeRowsHtml}</tbody></table>
      </div>
      <div class="section">
        <h3>Per-Farmer Breakdown</h3>
        <table><thead><tr><th>Farmer</th><th>ID</th><th style="text-align:right">Deliveries</th><th style="text-align:right">Volume</th><th style="text-align:right">Value</th></tr></thead>
        <tbody>${farmerRowsHtml}</tbody></table>
      </div>
      <div class="footer">Maziwaflow Mobile — Generated ${new Date().toLocaleString("en-KE")}</div>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  const isToday = date === todayISO();

  return (
    <AppShell title="Daily Summary" subtitle="End-of-day collection report" wide>
      {/* Date navigation */}
      <div className="mb-4 flex items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          className="size-10 shrink-0 rounded-lg"
          onClick={() => setDate(shiftDate(date, -1))}
          aria-label="Previous day"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <div className="relative flex-1">
          <CalendarDays className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="date"
            className={`${fieldClass} pl-10`}
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <Button
          size="icon"
          variant="outline"
          className="size-10 shrink-0 rounded-lg"
          onClick={() => setDate(shiftDate(date, 1))}
          disabled={isToday}
          aria-label="Next day"
        >
          <ChevronRight className="size-5" />
        </Button>
        {!isToday && (
          <Button
            size="sm"
            variant="outline"
            className="h-10 shrink-0 rounded-lg"
            onClick={() => setDate(todayISO())}
          >
            Today
          </Button>
        )}
      </div>

      <p className="mb-4 text-sm font-semibold text-muted-foreground">{fmtFullDate(date)}</p>

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
            <p className="text-xs font-bold text-muted-foreground uppercase">Total Value</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">{fmtKsh(totalValue)}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-maziwa-orange-deep" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Deliveries</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">{totalDeliveries}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-maziwa-purple" />
            <p className="text-xs font-bold text-muted-foreground uppercase">Farmers</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold">{farmerCount}</p>
        </div>
      </div>

      {rows === null ? (
        <ShellCard>
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </ShellCard>
      ) : activeRows.length === 0 ? (
        <ShellCard>
          <div className="py-10 text-center">
            <CalendarDays className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No collections recorded on this day.
            </p>
          </div>
        </ShellCard>
      ) : (
        <>
          {/* Status summary bar */}
          {(rejectedCount > 0 || pendingCount > 0) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {acceptedRows.length > 0 && (
                <span className="rounded-full bg-maziwa-green/15 px-3 py-1 text-xs font-bold text-maziwa-green-deep">
                  {acceptedRows.length} Accepted
                </span>
              )}
              {pendingCount > 0 && (
                <span className="rounded-full bg-maziwa-orange/15 px-3 py-1 text-xs font-bold text-maziwa-orange-deep">
                  {pendingCount} Pending Test
                </span>
              )}
              {rejectedCount > 0 && (
                <span className="rounded-full bg-destructive/15 px-3 py-1 text-xs font-bold text-destructive">
                  {rejectedCount} Rejected
                </span>
              )}
            </div>
          )}

          {/* Grade breakdown */}
          {gradeBreakdown.length > 0 && (
            <ShellCard>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold">Grade Breakdown</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={exportCsv}
                  >
                    <Download className="size-3.5" /> CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={printReport}
                  >
                    <Printer className="size-3.5" /> Print
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                      <th className="py-2 pr-3">Grade</th>
                      <th className="pr-3 text-right">Deliveries</th>
                      <th className="pr-3 text-right">Volume (kg)</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeBreakdown.map((g) => (
                      <tr key={g.grade} className="border-b border-border/40 last:border-0">
                        <td className="py-2.5 pr-3">
                          <span className={`font-bold ${GRADE_COLORS[g.grade] ?? ""}`}>
                            {g.grade}
                          </span>
                        </td>
                        <td className="pr-3 text-right">{g.count}</td>
                        <td className="pr-3 text-right font-bold">{g.kg.toFixed(1)}</td>
                        <td className="text-right font-semibold text-maziwa-green-deep">
                          {fmtKsh(g.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ShellCard>
          )}

          {/* Per-farmer breakdown */}
          {farmerBreakdown.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-3 font-bold">Per-Farmer Breakdown</h3>
              <ShellCard>
                {/* Mobile cards */}
                <ul className="space-y-2.5 sm:hidden">
                  {farmerBreakdown.map((f) => (
                    <li key={f.code} className="rounded-lg bg-muted/50 p-3.5 ring-1 ring-border/60">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold">{f.name}</p>
                          <p className="text-xs text-muted-foreground">{f.code}</p>
                        </div>
                        <p className="text-lg font-extrabold whitespace-nowrap">
                          {f.kg.toFixed(1)} kg
                        </p>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {f.deliveries} {f.deliveries === 1 ? "delivery" : "deliveries"}
                        </span>
                        <span className="font-semibold text-maziwa-green-deep">
                          {fmtKsh(f.value)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Desktop table */}
                <table className="hidden w-full text-sm sm:table">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                      <th className="py-2 pr-3">Farmer</th>
                      <th className="pr-3">ID</th>
                      <th className="pr-3 text-right">Deliveries</th>
                      <th className="pr-3 text-right">Volume (kg)</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {farmerBreakdown.map((f) => (
                      <tr key={f.code} className="border-b border-border/40 last:border-0">
                        <td className="py-2.5 pr-3 font-semibold">{f.name}</td>
                        <td className="pr-3 text-muted-foreground">{f.code}</td>
                        <td className="pr-3 text-right">{f.deliveries}</td>
                        <td className="pr-3 text-right font-bold">{f.kg.toFixed(1)}</td>
                        <td className="text-right font-semibold text-maziwa-green-deep">
                          {fmtKsh(f.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ShellCard>
            </div>
          )}

          {/* Full collection log */}
          <div className="mt-4">
            <h3 className="mb-3 font-bold">All Collections ({activeRows.length})</h3>
            <ShellCard>
              <ul className="space-y-2">
                {activeRows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {r.farmers?.full_name ?? r.farmer_code}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          · {r.farmer_code}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtTime(r.collected_at)} · {r.quality_grade}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-bold">{Number(r.quantity_kg)} kg</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status] ?? ""}`}
                      >
                        {r.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </ShellCard>
          </div>
        </>
      )}
    </AppShell>
  );
}
