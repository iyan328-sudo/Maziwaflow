import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, CreditCard, Check, X, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRole } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated/lipa-pole-pole")({
  head: () => ({
    meta: [
      { title: "Lipa Pole Pole — Maziwaflow Mobile" },
      { name: "description", content: "Installment credit plan for registered farmers." },
      { property: "og:title", content: "Lipa Pole Pole — Maziwaflow Mobile" },
      { property: "og:description", content: "Installment credit plan for registered farmers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LipaPolePole,
});

type Plan = {
  id: string;
  farmer_code: string;
  status: string;
  credit_limit_ksh: number;
  total_deducted_ksh: number;
  installment_amount_ksh: number;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  farmers: { full_name: string; phone: string | null } | null;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-maziwa-orange/15 text-maziwa-orange-deep",
  approved: "bg-maziwa-blue/15 text-maziwa-blue",
  active: "bg-maziwa-green/15 text-maziwa-green-deep",
  paused: "bg-muted text-muted-foreground",
  closed: "bg-destructive/15 text-destructive",
};

const fmtKsh = (n: number) => `KSh ${Number(n).toLocaleString("en-KE")}`;

function LipaPolePole() {
  const role = useRole();
  const { user } = Route.useRouteContext();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [farmers, setFarmers] = useState<
    { farmer_code: string; full_name: string; phone: string | null }[]
  >([]);
  const [farmerPlan, setFarmerPlan] = useState<Plan | null>(null);
  const [farmerCode, setFarmerCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    farmer_code: "",
    credit_limit_ksh: "5000",
    installment_amount_ksh: "500",
  });

  useEffect(() => {
    if (role === "admin") {
      loadAllPlans();
      supabase
        .from("farmers")
        .select("farmer_code, full_name, phone")
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
            setFarmerCode(data.farmer_code);
            supabase
              .from("lipa_pole_pole")
              .select("*, farmers(full_name, phone)")
              .eq("farmer_code", data.farmer_code)
              .maybeSingle()
              .then(({ data: plan }) => setFarmerPlan((plan as Plan) ?? null));
          }
        });
    }
  }, [role, user.id]);

  function loadAllPlans() {
    supabase
      .from("lipa_pole_pole")
      .select("*, farmers(full_name, phone)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPlans((data as Plan[]) ?? []));
  }

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.farmer_code) return void toast.error("Select a farmer");
    setBusy(true);
    const { error } = await supabase.from("lipa_pole_pole").insert({
      farmer_code: addForm.farmer_code,
      credit_limit_ksh: Number(addForm.credit_limit_ksh) || 5000,
      installment_amount_ksh: Number(addForm.installment_amount_ksh) || 500,
      status: "pending",
    });
    setBusy(false);
    if (error) return void toast.error("Could not create plan. The farmer may already have one.");
    toast.success("Lipa Pole Pole plan created");
    setShowAdd(false);
    setAddForm({ farmer_code: "", credit_limit_ksh: "5000", installment_amount_ksh: "500" });
    loadAllPlans();
  }

  async function updateStatus(plan: Plan, status: string) {
    const updates: {
      status: string;
      updated_at: string;
      approved_by?: string;
      approved_at?: string;
    } = { status, updated_at: new Date().toISOString() };
    if (status === "approved" || status === "active") {
      updates.approved_by = user.id;
      updates.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("lipa_pole_pole").update(updates).eq("id", plan.id);
    if (error) return void toast.error("Could not update plan status.");
    toast.success(`Plan ${status}`);
    loadAllPlans();
  }

  if (role === "farmer") {
    return (
      <AppShell title="Lipa Pole Pole" subtitle="Installment Credit Plan">
        <ShellCard>
          {!farmerCode ? (
            <div className="py-8 text-center">
              <CreditCard className="mx-auto size-12 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Your account is not linked to a farmer record yet. Please contact your admin to be
                registered.
              </p>
            </div>
          ) : !farmerPlan ? (
            <div className="py-8 text-center">
              <CreditCard className="mx-auto size-12 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                You are not enrolled in the Lipa Pole Pole plan. Contact your admin to apply.
              </p>
            </div>
          ) : farmerPlan.status === "pending" ? (
            <div className="py-6 text-center">
              <Clock className="mx-auto size-12 text-maziwa-orange-deep" />
              <p className="mt-3 font-bold">Application Pending</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your Lipa Pole Pole application is awaiting admin approval.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Credit Plan Details</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[farmerPlan.status] ?? ""}`}
                >
                  {farmerPlan.status.charAt(0).toUpperCase() + farmerPlan.status.slice(1)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3.5">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Credit Limit</p>
                  <p className="mt-1 text-xl font-extrabold">
                    {fmtKsh(farmerPlan.credit_limit_ksh)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3.5">
                  <p className="text-xs font-bold text-muted-foreground uppercase">
                    Deducted So Far
                  </p>
                  <p className="mt-1 text-xl font-extrabold">
                    {fmtKsh(farmerPlan.total_deducted_ksh)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3.5">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Installment</p>
                  <p className="mt-1 text-xl font-extrabold">
                    {fmtKsh(farmerPlan.installment_amount_ksh)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3.5">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Remaining</p>
                  <p className="mt-1 text-xl font-extrabold">
                    {fmtKsh(
                      Number(farmerPlan.credit_limit_ksh) - Number(farmerPlan.total_deducted_ksh),
                    )}
                  </p>
                </div>
              </div>
              {farmerPlan.notes && (
                <div className="rounded-lg bg-muted/30 p-3.5">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Notes</p>
                  <p className="mt-1 text-sm">{farmerPlan.notes}</p>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg bg-maziwa-green/8 p-3.5 ring-1 ring-maziwa-green/15">
                <Check className="size-5 shrink-0 text-maziwa-green-deep" />
                <p className="text-sm text-maziwa-green-deep">
                  {farmerPlan.status === "active"
                    ? "Your plan is active. Deductions are applied to your milk payments."
                    : farmerPlan.status === "paused"
                      ? "Your plan is currently paused. No deductions are being made."
                      : "Plan status: " + farmerPlan.status}
                </p>
              </div>
            </div>
          )}
        </ShellCard>
      </AppShell>
    );
  }

  return (
    <AppShell title="Lipa Pole Pole" subtitle="Manage farmer credit plans" wide>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Total Plans</p>
          <p className="text-2xl font-extrabold">{plans?.length ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Active</p>
          <p className="text-2xl font-extrabold text-maziwa-green-deep">
            {plans?.filter((p) => p.status === "active").length ?? "—"}
          </p>
        </div>
        <div className="rounded-lg bg-card p-4 ring-1 ring-border">
          <p className="text-xs font-bold text-muted-foreground uppercase">Pending</p>
          <p className="text-2xl font-extrabold text-maziwa-orange-deep">
            {plans?.filter((p) => p.status === "pending").length ?? "—"}
          </p>
        </div>
      </div>

      <ShellCard>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">All Credit Plans</h2>
          <Button
            size="sm"
            className="bg-maziwa-purple text-primary-foreground hover:bg-maziwa-purple/90"
            onClick={() => setShowAdd(true)}
          >
            <CreditCard className="size-4" /> New Plan
          </Button>
        </div>

        {plans === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : plans.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No Lipa Pole Pole plans yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {plans.map((p) => (
              <li key={p.id} className="rounded-lg bg-muted/40 p-4 ring-1 ring-border/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[p.status] ?? ""}`}
                      >
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </span>
                    </div>
                    <p className="mt-2 font-bold">{p.farmers?.full_name ?? p.farmer_code}</p>
                    <p className="text-xs text-muted-foreground">{p.farmer_code}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <span>
                        Limit: <strong>{fmtKsh(p.credit_limit_ksh)}</strong>
                      </span>
                      <span>
                        Deducted: <strong>{fmtKsh(p.total_deducted_ksh)}</strong>
                      </span>
                      <span>
                        Installment: <strong>{fmtKsh(p.installment_amount_ksh)}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {p.status === "pending" && (
                      <Button
                        size="sm"
                        className="h-8 bg-maziwa-green text-primary-foreground hover:bg-maziwa-green-deep"
                        onClick={() => updateStatus(p, "active")}
                      >
                        <Check className="size-3.5" /> Approve
                      </Button>
                    )}
                    {p.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => updateStatus(p, "paused")}
                      >
                        Pause
                      </Button>
                    )}
                    {p.status === "paused" && (
                      <Button
                        size="sm"
                        className="h-8 bg-maziwa-green text-primary-foreground hover:bg-maziwa-green-deep"
                        onClick={() => updateStatus(p, "active")}
                      >
                        Resume
                      </Button>
                    )}
                    {(p.status === "active" || p.status === "paused") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => updateStatus(p, "closed")}
                      >
                        <X className="size-3.5" /> Close
                      </Button>
                    )}
                  </div>
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
            <h2 className="mb-4 font-bold">New Lipa Pole Pole Plan</h2>
            <form onSubmit={addPlan} className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="lp_farmer">
                  Farmer
                </label>
                <select
                  id="lp_farmer"
                  className={fieldClass}
                  value={addForm.farmer_code}
                  onChange={(e) => setAddForm((s) => ({ ...s, farmer_code: e.target.value }))}
                >
                  <option value="">Select farmer…</option>
                  {farmers.map((f) => (
                    <option key={f.farmer_code} value={f.farmer_code}>
                      {f.farmer_code} — {f.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="lp_limit">
                  Credit Limit (KSh)
                </label>
                <input
                  id="lp_limit"
                  type="number"
                  className={fieldClass}
                  value={addForm.credit_limit_ksh}
                  onChange={(e) => setAddForm((s) => ({ ...s, credit_limit_ksh: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lp_inst">
                  Installment Amount (KSh)
                </label>
                <input
                  id="lp_inst"
                  type="number"
                  className={fieldClass}
                  value={addForm.installment_amount_ksh}
                  onChange={(e) =>
                    setAddForm((s) => ({ ...s, installment_amount_ksh: e.target.value }))
                  }
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="pill-action h-auto justify-center bg-maziwa-purple hover:bg-maziwa-purple/90 disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" />} Create Plan
              </Button>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
