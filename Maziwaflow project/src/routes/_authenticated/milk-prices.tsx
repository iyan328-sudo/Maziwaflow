import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, TrendingUp, Award, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRole } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated/milk-prices")({
  head: () => ({
    meta: [
      { title: "Milk Prices & Compensation — Maziwaflow Mobile" },
      { name: "description", content: "Admin: manage milk buying prices and clerk compensation." },
      { property: "og:title", content: "Milk Prices & Compensation — Maziwaflow Mobile" },
      { property: "og:description", content: "Admin: manage milk buying prices and clerk compensation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MilkPrices,
});

export type Price = {
  id: string;
  grade: string;
  price_per_ksh: number;
  effective_from: string;
  updated_at: string;
};

const GRADE_COLORS: Record<string, string> = {
  "Grade A": "bg-maziwa-green/15 text-maziwa-green-deep",
  "Grade B": "bg-maziwa-blue/15 text-maziwa-blue",
  "Grade C": "bg-maziwa-orange/15 text-maziwa-orange-deep",
};

const fmtKsh = (n: number) =>
  `KSh ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

export const CLERK_COMMISSION_KEY = "maziwa_clerk_commission_rate";
export const DEFAULT_CLERK_COMMISSION = 2.0;

export function getClerkCommissionRate(): number {
  if (typeof window === "undefined") return DEFAULT_CLERK_COMMISSION;
  try {
    const val = localStorage.getItem(CLERK_COMMISSION_KEY);
    return val ? parseFloat(val) : DEFAULT_CLERK_COMMISSION;
  } catch {
    return DEFAULT_CLERK_COMMISSION;
  }
}

function MilkPrices() {
  const role = useRole();
  const { user } = Route.useRouteContext();
  const [prices, setPrices] = useState<Price[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [clerkRate, setClerkRate] = useState<string>(String(getClerkCommissionRate()));
  const [clerkPriceId, setClerkPriceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPrices();
  }, []);

  function loadPrices() {
    supabase
      .from("milk_prices")
      .select("id, grade, price_per_ksh, effective_from, updated_at")
      .order("grade")
      .then(({ data }) => {
        const list = (data as Price[]) ?? [];
        setPrices(list);
        const map: Record<string, string> = {};
        let foundClerk = false;

        list.forEach((p) => {
          map[p.grade] = String(p.price_per_ksh);
          if (p.grade === "Clerk Commission") {
            foundClerk = true;
            setClerkPriceId(p.id);
            setClerkRate(String(p.price_per_ksh));
            localStorage.setItem(CLERK_COMMISSION_KEY, String(p.price_per_ksh));
          }
        });
        if (!foundClerk) {
          const cached = getClerkCommissionRate();
          setClerkRate(String(cached));
        }
        setEdits(map);
      });
  }

  async function savePrice(p: Price) {
    const val = Number(edits[p.grade]);
    if (!val || val <= 0) return void toast.error("Enter a valid price");
    if (val === Number(p.price_per_ksh)) return void toast.info("No change to save");
    setBusy(true);
    const { error } = await supabase
      .from("milk_prices")
      .update({
        price_per_ksh: val,
        effective_from: new Date().toISOString(),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    setBusy(false);
    if (error) return void toast.error("Could not update price.");
    toast.success(`${p.grade} price updated to ${fmtKsh(val)}/kg`);
    loadPrices();
  }

  async function saveClerkCommission() {
    const val = parseFloat(clerkRate);
    if (isNaN(val) || val < 0) return void toast.error("Enter a valid commission rate");
    setBusy(true);

    try {
      localStorage.setItem(CLERK_COMMISSION_KEY, String(val));
      window.dispatchEvent(new Event("maziwa-commission-rate-updated"));

      if (clerkPriceId) {
        const { error } = await supabase
          .from("milk_prices")
          .update({
            price_per_ksh: val,
            effective_from: new Date().toISOString(),
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clerkPriceId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("milk_prices").insert({
          grade: "Clerk Commission",
          price_per_ksh: val,
          effective_from: new Date().toISOString(),
          updated_by: user.id,
        });
        if (error && error.code !== "23505") throw error;
      }
      toast.success(`Clerk compensation rate updated to ${fmtKsh(val)}/liter`);
      loadPrices();
    } catch {
      toast.info(`Clerk compensation rate saved locally (${fmtKsh(val)}/liter)`);
    } finally {
      setBusy(false);
    }
  }

  const milkGrades = (prices ?? []).filter((p) => p.grade !== "Clerk Commission");

  if (role !== "admin") {
    return (
      <AppShell title="Milk Prices" subtitle="Current buying prices">
        <ShellCard>
          {prices === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="space-y-3">
              {milkGrades.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-muted/40 p-4 ring-1 ring-border/60"
                >
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${GRADE_COLORS[p.grade] ?? ""}`}
                  >
                    {p.grade}
                  </span>
                  <span className="text-xl font-extrabold">
                    {fmtKsh(p.price_per_ksh)}
                    <span className="text-sm font-normal text-muted-foreground">/kg</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ShellCard>
      </AppShell>
    );
  }

  return (
    <AppShell title="Milk Prices & Rates" subtitle="Set buying prices and clerk compensation" wide>
      <div className="mb-4 rounded-lg bg-maziwa-blue/8 p-4 ring-1 ring-maziwa-blue/15">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-5 text-maziwa-blue" />
          <p className="text-sm font-semibold text-maziwa-blue">
            Prices and clerk rates update instantly. New collections use these active rates in calculations and receipts.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Milk Quality Prices */}
        <ShellCard>
          <div className="mb-4 flex items-center gap-2">
            <Award className="size-5 text-maziwa-green-deep" />
            <div>
              <h2 className="font-bold">Farmer Milk Buying Prices</h2>
              <p className="text-xs text-muted-foreground">Buying price per kg by milk quality grade</p>
            </div>
          </div>

          {prices === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3.5">
              {milkGrades.map((p) => (
                <div key={p.id} className="rounded-lg bg-muted/40 p-3.5 ring-1 ring-border/60">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${GRADE_COLORS[p.grade] ?? ""}`}
                      >
                        {p.grade}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        <p>Updated: {fmtDate(p.updated_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                          KSh
                        </span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className={`${fieldClass} w-28 pl-12 text-center text-lg font-bold`}
                          value={edits[p.grade] ?? ""}
                          onChange={(e) => setEdits((s) => ({ ...s, [p.grade]: e.target.value }))}
                        />
                        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                          /kg
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="h-10 bg-maziwa-blue text-primary-foreground hover:bg-maziwa-blue/90"
                        disabled={busy}
                        onClick={() => savePrice(p)}
                      >
                        <Save className="size-4" /> Save
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ShellCard>

        {/* Clerk Compensation Management */}
        <ShellCard>
          <div className="mb-4 flex items-center gap-2">
            <Coins className="size-5 text-maziwa-orange-deep" />
            <div>
              <h2 className="font-bold">Clerk Compensation (Flat Rate)</h2>
              <p className="text-xs text-muted-foreground">Commission paid to collection clerks per liter received</p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 p-4 ring-1 ring-border/60">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              Clerks receive a flat commission for every liter of milk collected. Earnings are automatically accrued on their Clerk Dashboard in real time.
            </p>

            <div className="flex items-center justify-between gap-3 pt-2">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Commission Rate</p>
                <p className="text-xs text-muted-foreground">KSh per Liter / kg</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    KSh
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className={`${fieldClass} w-28 pl-12 text-center text-lg font-bold`}
                    value={clerkRate}
                    onChange={(e) => setClerkRate(e.target.value)}
                  />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                    /L
                  </span>
                </div>
                <Button
                  size="sm"
                  className="h-10 bg-maziwa-green text-primary-foreground hover:bg-maziwa-green-deep"
                  disabled={busy}
                  onClick={saveClerkCommission}
                >
                  <Save className="size-4" /> Save Rate
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-md bg-card p-3 ring-1 ring-border text-xs text-muted-foreground space-y-1">
              <p className="font-bold text-foreground">Example Calculation:</p>
              <p>• 150 liters collected × KSh {clerkRate || "0"}/L = <span className="font-semibold text-foreground">KSh {(150 * (parseFloat(clerkRate) || 0)).toFixed(2)}</span></p>
              <p>• 1,000 liters collected × KSh {clerkRate || "0"}/L = <span className="font-semibold text-foreground">KSh {(1000 * (parseFloat(clerkRate) || 0)).toFixed(2)}</span></p>
            </div>
          </div>
        </ShellCard>
      </div>
    </AppShell>
  );
}
