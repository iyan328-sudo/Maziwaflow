import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRole } from "@/components/RoleViewContext";

export const Route = createFileRoute("/_authenticated/milk-prices")({
  head: () => ({
    meta: [
      { title: "Milk Prices — Maziwaflow Mobile" },
      { name: "description", content: "Admin: manage milk prices per quality grade." },
      { property: "og:title", content: "Milk Prices — Maziwaflow Mobile" },
      { property: "og:description", content: "Admin: manage milk prices per quality grade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MilkPrices,
});

type Price = {
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

function MilkPrices() {
  const role = useRole();
  const { user } = Route.useRouteContext();
  const [prices, setPrices] = useState<Price[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
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
        setPrices((data as Price[]) ?? []);
        const map: Record<string, string> = {};
        (data as Price[])?.forEach((p) => {
          map[p.grade] = String(p.price_per_ksh);
        });
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
              {prices.map((p) => (
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
    <AppShell title="Milk Prices" subtitle="Set buying prices per grade" wide>
      <div className="mb-4 rounded-lg bg-maziwa-blue/8 p-4 ring-1 ring-maziwa-blue/15">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-5 text-maziwa-blue" />
          <p className="text-sm font-semibold text-maziwa-blue">
            Prices update instantly. New collections will use the updated price. Historical records
            keep their original price.
          </p>
        </div>
      </div>

      <ShellCard>
        <h2 className="mb-4 font-bold">Current Milk Prices</h2>
        {prices === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {prices.map((p) => (
              <div key={p.id} className="rounded-lg bg-muted/40 p-4 ring-1 ring-border/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${GRADE_COLORS[p.grade] ?? ""}`}
                    >
                      {p.grade}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      <p>Effective since {fmtDate(p.effective_from)}</p>
                      <p>Last updated {fmtDate(p.updated_at)}</p>
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
    </AppShell>
  );
}
