import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Wallet,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Download,
  Printer,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Smartphone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRole } from "@/components/RoleViewContext";
import { MpesaCheckoutModal } from "@/components/MpesaCheckoutModal";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Maziwaflow Mobile" },
      { name: "description", content: "Farmer payouts and Lipa Pole Pole deductions." },
      { property: "og:title", content: "Payments — Maziwaflow Mobile" },
      { property: "og:description", content: "Farmer payouts and Lipa Pole Pole deductions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Payments,
});

type Payment = {
  id: string;
  farmer_code: string;
  period_start: string;
  period_end: string;
  gross_ksh: number;
  deduction_ksh: number;
  net_ksh: number;
  status: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  farmers: { full_name: string } | null;
  deductions: { id: string; amount_ksh: number; type: string; description: string | null }[];
};

type FarmerBalance = {
  farmer_code: string;
  full_name: string;
  total_earnings: number;
  total_paid: number;
  total_deductions: number;
  total_net_paid: number;
  outstanding_balance: number;
  unpaid_earnings: number;
  collection_count: number;
  unpaid_count: number;
  last_paid_at: string | null;
};

const fmtKsh = (n: number) =>
  `KSh ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const fmtFullDate = (s: string) =>
  new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-maziwa-green/15 text-maziwa-green-deep",
  pending: "bg-maziwa-orange/15 text-maziwa-orange-deep",
  cancelled: "bg-destructive/15 text-destructive",
};

function Payments() {
  const role = useRole();
  const { user } = Route.useRouteContext();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [balances, setBalances] = useState<FarmerBalance[] | null>(null);
  const [farmers, setFarmers] = useState<{ farmer_code: string; full_name: string }[]>([]);
  const [farmerFilter, setFarmerFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [mpesaTarget, setMpesaTarget] = useState<{
    farmerCode: string;
    farmerName: string;
    phone: string;
    amount: number;
    paymentId?: string;
  } | null>(null);
  const [form, setForm] = useState({
    farmer_code: "",
    period_start: daysAgoISO(7),
    period_end: todayISO(),
    payment_method: "M-Pesa",
    reference: "",
    notes: "",
  });

  useEffect(() => {
    if (role === "admin" || role === "clerk") {
      loadAllPayments();
      loadBalances();
      supabase
        .from("farmers")
        .select("farmer_code, full_name")
        .order("farmer_code")
        .then(({ data }) => setFarmers(data ?? []));
    } else if (role === "farmer") {
      supabase
        .from("farmers")
        .select("farmer_code")
        .eq("linked_user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setFarmerFilter(data.farmer_code);
            loadFarmerPayments(data.farmer_code);
          } else {
            setPayments([]);
          }
        });
    }
  }, [role, user.id]);

  function loadAllPayments() {
    supabase
      .from("payments")
      .select("*, farmers(full_name), deductions(id, amount_ksh, type, description)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPayments((data as Payment[]) ?? []));
  }

  function loadFarmerPayments(code: string) {
    supabase
      .from("payments")
      .select("*, farmers(full_name), deductions(id, amount_ksh, type, description)")
      .eq("farmer_code", code)
      .order("created_at", { ascending: false })
      .then(({ data }) => setPayments((data as Payment[]) ?? []));
  }

  function loadBalances() {
    supabase
      .from("farmer_balances")
      .select("*")
      .order("outstanding_balance", { ascending: false })
      .then(({ data }) => setBalances((data as FarmerBalance[]) ?? []));
  }

  async function processPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!form.farmer_code) return void toast.error("Select a farmer");
    if (form.period_start > form.period_end)
      return void toast.error("Start date must be before end date");
    setBusy(true);
    const { data, error } = await supabase.rpc("process_payment", {
      p_farmer_code: form.farmer_code,
      p_period_start: new Date(form.period_start + "T00:00:00").toISOString(),
      p_period_end: new Date(form.period_end + "T23:59:59").toISOString(),
      p_payment_method: form.payment_method || null,
      p_reference: form.reference || null,
      p_notes: form.notes || null,
      p_processed_by: user.id,
    });
    setBusy(false);
    if (error) return void toast.error("Could not process payment: " + error.message);
    const result = data as {
      net_ksh?: number;
      deduction_ksh?: number;
      gross_ksh?: number;
      plan_deducted?: boolean;
      collections_paid?: number;
      message?: string;
    };
    if (result?.message) {
      return void toast.info(result.message);
    }
    toast.success(
      `Payment processed: ${fmtKsh(result?.net_ksh ?? 0)} net` +
        (result?.collections_paid ? ` (${result.collections_paid} collections paid)` : "") +
        (result?.plan_deducted
          ? ` (${fmtKsh(result?.deduction_ksh ?? 0)} Lipa Pole Pole deducted)`
          : ""),
    );
    setShowAdd(false);
    setForm({ ...form, reference: "", notes: "" });
    loadAllPayments();
    loadBalances();
  }

  const visiblePayments = farmerFilter
    ? (payments ?? []).filter((p) => p.farmer_code === farmerFilter)
    : (payments ?? []);

  const totalGross = visiblePayments.reduce((a, p) => a + Number(p.gross_ksh), 0);
  const totalDeductions = visiblePayments.reduce((a, p) => a + Number(p.deduction_ksh), 0);
  const totalNet = visiblePayments.reduce((a, p) => a + Number(p.net_ksh), 0);

  const totalOutstanding = (balances ?? []).reduce((a, b) => a + Number(b.outstanding_balance), 0);
  const totalUnpaidEarnings = (balances ?? []).reduce((a, b) => a + Number(b.unpaid_earnings), 0);

  const canCreate = role === "admin" || role === "clerk";
  const showLedgerButton = canCreate;

  async function openMpesa(p: Payment) {
    const { data: farmer } = await supabase
      .from("farmers")
      .select("phone")
      .eq("farmer_code", p.farmer_code)
      .maybeSingle();
    setMpesaTarget({
      farmerCode: p.farmer_code,
      farmerName: p.farmers?.full_name ?? p.farmer_code,
      phone: farmer?.phone ?? "",
      amount: Number(p.net_ksh),
      paymentId: p.id,
    });
  }

  function exportCsv() {
    const headers = [
      "Date",
      "Farmer Code",
      "Farmer Name",
      "Period Start",
      "Period End",
      "Gross (KSh)",
      "Deduction (KSh)",
      "Net (KSh)",
      "Method",
      "Reference",
      "Status",
    ];
    const lines = visiblePayments.map((p) =>
      [
        new Date(p.created_at).toLocaleDateString("en-KE"),
        p.farmer_code,
        p.farmers?.full_name ?? "",
        fmtFullDate(p.period_start),
        fmtFullDate(p.period_end),
        p.gross_ksh,
        p.deduction_ksh,
        p.net_ksh,
        p.payment_method ?? "",
        p.reference ?? "",
        p.status,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${farmerFilter || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportLedgerCsv() {
    const headers = [
      "Farmer Code",
      "Farmer Name",
      "Total Earnings (KSh)",
      "Total Paid (KSh)",
      "Total Deductions (KSh)",
      "Net Paid (KSh)",
      "Outstanding (KSh)",
      "Unpaid Earnings (KSh)",
      "Accepted Collections",
      "Unpaid Collections",
      "Last Paid",
    ];
    const lines = (balances ?? []).map((b) =>
      [
        b.farmer_code,
        b.full_name,
        Number(b.total_earnings).toFixed(0),
        Number(b.total_paid).toFixed(0),
        Number(b.total_deductions).toFixed(0),
        Number(b.total_net_paid).toFixed(0),
        Number(b.outstanding_balance).toFixed(0),
        Number(b.unpaid_earnings).toFixed(0),
        b.collection_count,
        b.unpaid_count,
        b.last_paid_at ? fmtFullDate(b.last_paid_at) : "Never",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "farmer-ledger-balances.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function printStatement() {
    const farmerName = farmerFilter
      ? (farmers.find((f) => f.farmer_code === farmerFilter)?.full_name ?? farmerFilter)
      : "All Farmers";
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return void toast.error("Pop-up blocked. Please allow pop-ups to print.");
    const rowsHtml = visiblePayments
      .map(
        (p) => `
      <tr>
        <td>${fmtFullDate(p.created_at)}</td>
        <td>${p.farmers?.full_name ?? p.farmer_code}</td>
        <td>${fmtFullDate(p.period_start)} — ${fmtFullDate(p.period_end)}</td>
        <td style="text-align:right">${fmtKsh(Number(p.gross_ksh))}</td>
        <td style="text-align:right">${Number(p.deduction_ksh) > 0 ? fmtKsh(Number(p.deduction_ksh)) : "—"}</td>
        <td style="text-align:right;font-weight:bold">${fmtKsh(Number(p.net_ksh))}</td>
        <td>${p.payment_method ?? "—"}</td>
        <td>${p.reference ?? "—"}</td>
      </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Maziwaflow — Payment Statement</title>
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
      <h2>Payment Statement</h2>
      <div class="meta">
        <div><strong>Farmer</strong>${farmerName}</div>
        <div><strong>Generated</strong>${new Date().toLocaleString("en-KE")}</div>
      </div>
      <div class="summary">
        <div><p>Gross Paid</p><span>${fmtKsh(totalGross)}</span></div>
        <div><p>Deductions</p><span>${fmtKsh(totalDeductions)}</span></div>
        <div><p>Net Paid</p><span>${fmtKsh(totalNet)}</span></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Farmer</th><th>Period</th><th style="text-align:right">Gross</th><th style="text-align:right">Deduction</th><th style="text-align:right">Net</th><th>Method</th><th>Reference</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="footer">Maziwaflow Mobile — Generated ${new Date().toLocaleString("en-KE")}</div>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  return (
    <AppShell title="Payments" subtitle="Farmer payouts & deductions" wide>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Gross Paid</p>
          <p className="text-xl font-extrabold">{payments ? fmtKsh(totalGross) : "—"}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Deductions</p>
          <p className="text-xl font-extrabold text-maziwa-purple">
            {payments ? fmtKsh(totalDeductions) : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Net Paid</p>
          <p className="text-xl font-extrabold text-maziwa-green-deep">
            {payments ? fmtKsh(totalNet) : "—"}
          </p>
        </div>
      </div>

      {canCreate && balances && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-maziwa-orange/10 p-4 ring-1 ring-maziwa-orange/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-maziwa-orange-deep" />
              <p className="text-xs font-bold text-maziwa-orange-deep uppercase">
                Outstanding Balances
              </p>
            </div>
            <p className="mt-1 text-2xl font-extrabold text-maziwa-orange-deep">
              {fmtKsh(totalOutstanding)}
            </p>
          </div>
          <div className="rounded-lg bg-card p-4 ring-1 ring-border">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="size-4 text-maziwa-green-deep" />
              <p className="text-xs font-bold text-muted-foreground uppercase">Unpaid Earnings</p>
            </div>
            <p className="mt-1 text-2xl font-extrabold">{fmtKsh(totalUnpaidEarnings)}</p>
          </div>
        </div>
      )}

      <ShellCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">{role === "farmer" ? "My Payment History" : "All Payments"}</h2>
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <select
                className={`${fieldClass} w-auto min-w-40`}
                value={farmerFilter}
                onChange={(e) => setFarmerFilter(e.target.value)}
              >
                <option value="">All farmers</option>
                {farmers.map((f) => (
                  <option key={f.farmer_code} value={f.farmer_code}>
                    {f.farmer_code} — {f.full_name}
                  </option>
                ))}
              </select>
            )}
            {showLedgerButton && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-lg"
                onClick={() => setShowLedger(true)}
              >
                <BookOpen className="size-4" /> Ledger
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-lg"
              onClick={printStatement}
              disabled={visiblePayments.length === 0}
            >
              <Printer className="size-4" /> Statement
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-lg"
              onClick={exportCsv}
              disabled={visiblePayments.length === 0}
            >
              <Download className="size-4" /> CSV
            </Button>
            {canCreate && (
              <Button
                size="sm"
                className="bg-maziwa-green text-primary-foreground hover:bg-maziwa-green-deep"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="size-4" /> New Payment
              </Button>
            )}
          </div>
        </div>

        {payments === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : visiblePayments.length === 0 ? (
          <div className="py-10 text-center">
            <Wallet className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {role === "farmer"
                ? "No payments have been recorded for you yet."
                : "No payments recorded yet."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visiblePayments.map((p) => (
              <li key={p.id} className="rounded-lg bg-muted/40 p-4 ring-1 ring-border/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[p.status] ?? ""}`}
                      >
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </span>
                      {p.payment_method && (
                        <span className="text-xs text-muted-foreground">{p.payment_method}</span>
                      )}
                    </div>
                    <p className="mt-1.5 font-bold">{p.farmers?.full_name ?? p.farmer_code}</p>
                    <p className="text-xs text-muted-foreground">
                      Period: {fmtDate(p.period_start)} — {fmtDate(p.period_end)}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs sm:flex sm:gap-4">
                      <span className="flex items-center gap-1">
                        <ArrowUpCircle className="size-3.5 text-maziwa-green-deep" />
                        Gross: <strong>{fmtKsh(p.gross_ksh)}</strong>
                      </span>
                      {Number(p.deduction_ksh) > 0 && (
                        <span className="flex items-center gap-1">
                          <ArrowDownCircle className="size-3.5 text-maziwa-purple" />
                          Deducted: <strong>{fmtKsh(p.deduction_ksh)}</strong>
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-semibold text-maziwa-green-deep">
                        Net: <strong>{fmtKsh(p.net_ksh)}</strong>
                      </span>
                    </div>
                    {p.deductions && p.deductions.length > 0 && (
                      <div className="mt-2 rounded-md bg-maziwa-purple/8 p-2 ring-1 ring-maziwa-purple/15">
                        <p className="text-xs font-semibold text-maziwa-purple">
                          Deduction breakdown:
                        </p>
                        {p.deductions.map((d) => (
                          <p key={d.id} className="text-xs text-muted-foreground">
                            {d.type === "lipa_pole_pole" ? "Lipa Pole Pole" : d.type}:{" "}
                            {fmtKsh(d.amount_ksh)}
                            {d.description ? ` — ${d.description}` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                    {p.reference && (
                      <p className="mt-1 text-xs text-muted-foreground">Ref: {p.reference}</p>
                    )}
                    {canCreate && p.status === "completed" && !p.reference && (
                      <button
                        onClick={() => openMpesa(p)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-maziwa-green/10 px-3 py-1.5 text-xs font-bold text-maziwa-green-deep ring-1 ring-maziwa-green/20 transition hover:bg-maziwa-green/20"
                      >
                        <Smartphone className="size-3.5" /> Pay via M-Pesa
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(p.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ShellCard>

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <Receipt className="size-5 text-maziwa-green-deep" />
              <h2 className="font-bold">Process Farmer Payment</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              This will calculate earnings from unpaid accepted collections in the selected period,
              automatically deduct any active Lipa Pole Pole installment, and record the net payout.
              Collections already paid in a prior payment are excluded.
            </p>
            <form onSubmit={processPayment} className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="pay_farmer">
                  Farmer
                </label>
                <select
                  id="pay_farmer"
                  className={fieldClass}
                  value={form.farmer_code}
                  onChange={(e) => setForm((s) => ({ ...s, farmer_code: e.target.value }))}
                >
                  <option value="">Select farmer…</option>
                  {farmers.map((f) => (
                    <option key={f.farmer_code} value={f.farmer_code}>
                      {f.farmer_code} — {f.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="pay_start">
                    Period Start
                  </label>
                  <input
                    id="pay_start"
                    type="date"
                    className={fieldClass}
                    value={form.period_start}
                    onChange={(e) => setForm((s) => ({ ...s, period_start: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="pay_end">
                    Period End
                  </label>
                  <input
                    id="pay_end"
                    type="date"
                    className={fieldClass}
                    value={form.period_end}
                    onChange={(e) => setForm((s) => ({ ...s, period_end: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="pay_method">
                  Payment Method
                </label>
                <select
                  id="pay_method"
                  className={fieldClass}
                  value={form.payment_method}
                  onChange={(e) => setForm((s) => ({ ...s, payment_method: e.target.value }))}
                >
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="pay_ref">
                  Reference (optional)
                </label>
                <input
                  id="pay_ref"
                  className={fieldClass}
                  value={form.reference}
                  onChange={(e) => setForm((s) => ({ ...s, reference: e.target.value }))}
                  placeholder="e.g. MPESA receipt number"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="pay_notes">
                  Notes (optional)
                </label>
                <input
                  id="pay_notes"
                  className={fieldClass}
                  value={form.notes}
                  onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                  placeholder="Any additional notes"
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="pill-action h-auto justify-center bg-maziwa-green hover:bg-maziwa-green-deep disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" />} Process Payment
              </Button>
            </form>
          </div>
        </div>
      )}

      {showLedger && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowLedger(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-card shadow-xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-2">
                <BookOpen className="size-5 text-maziwa-blue" />
                <h2 className="font-bold">Farmer Ledger — Running Balances</h2>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={exportLedgerCsv}
                  disabled={!balances || balances.length === 0}
                >
                  <Download className="size-3.5" /> CSV
                </Button>
                <button
                  onClick={() => setShowLedger(false)}
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-auto p-5">
              {balances === null ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : balances.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No farmer balances to display.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                      <th className="py-2 pr-2">Farmer</th>
                      <th className="pr-2 text-right">Earned</th>
                      <th className="pr-2 text-right">Paid</th>
                      <th className="pr-2 text-right">Deducted</th>
                      <th className="pr-2 text-right">Net Paid</th>
                      <th className="pr-2 text-right">Owed</th>
                      <th className="pr-2 text-right">Unpaid Coll.</th>
                      <th className="text-right">Last Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => {
                      const owed = Number(b.outstanding_balance);
                      const owedClass =
                        owed > 0
                          ? "text-maziwa-orange-deep font-bold"
                          : owed < 0
                            ? "text-muted-foreground"
                            : "text-maziwa-green-deep font-bold";
                      return (
                        <tr key={b.farmer_code} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-2">
                            <p className="font-semibold">{b.full_name}</p>
                            <p className="text-xs text-muted-foreground">{b.farmer_code}</p>
                          </td>
                          <td className="pr-2 text-right font-semibold">
                            {fmtKsh(Number(b.total_earnings))}
                          </td>
                          <td className="pr-2 text-right">{fmtKsh(Number(b.total_paid))}</td>
                          <td className="pr-2 text-right text-maziwa-purple">
                            {Number(b.total_deductions) > 0
                              ? fmtKsh(Number(b.total_deductions))
                              : "—"}
                          </td>
                          <td className="pr-2 text-right text-maziwa-green-deep font-semibold">
                            {fmtKsh(Number(b.total_net_paid))}
                          </td>
                          <td className={`pr-2 text-right ${owedClass}`}>
                            {owed > 0 && <AlertCircle className="mr-1 inline size-3" />}
                            {owed === 0 && <CheckCircle2 className="mr-1 inline size-3" />}
                            {fmtKsh(Math.abs(owed))}
                            {owed < 0 && " (overpaid)"}
                          </td>
                          <td className="pr-2 text-right text-xs">
                            {b.unpaid_count > 0
                              ? `${b.unpaid_count} of ${b.collection_count}`
                              : `0 of ${b.collection_count}`}
                          </td>
                          <td className="text-right text-xs text-muted-foreground whitespace-nowrap">
                            {b.last_paid_at ? fmtDate(b.last_paid_at) : "Never"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {mpesaTarget && (
        <MpesaCheckoutModal
          open={!!mpesaTarget}
          onClose={() => {
            setMpesaTarget(null);
            loadAllPayments();
          }}
          farmerCode={mpesaTarget.farmerCode}
          farmerName={mpesaTarget.farmerName}
          defaultPhone={mpesaTarget.phone}
          amount={mpesaTarget.amount}
          paymentId={mpesaTarget.paymentId}
          onSuccess={() => {
            loadAllPayments();
            loadBalances();
          }}
        />
      )}
    </AppShell>
  );
}
