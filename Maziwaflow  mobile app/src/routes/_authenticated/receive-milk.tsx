import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, WifiOff, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  addPendingCollection,
  cacheFarmers,
  cachePrices,
  getCachedFarmers,
  getCachedPrices,
  getPendingCollections,
  onQueueUpdate,
  removePendingCollection,
  syncPendingCollections,
  type PendingCollection,
} from "@/lib/offline-queue";

export const Route = createFileRoute("/_authenticated/receive-milk")({
  head: () => ({
    meta: [
      { title: "Receive Milk — Maziwaflow Mobile" },
      { name: "description", content: "Record a new milk delivery from a dairy farmer." },
      { property: "og:title", content: "Receive Milk — Maziwaflow Mobile" },
      { property: "og:description", content: "Record a new milk delivery from a dairy farmer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReceiveMilk,
});

const GRADES = ["Grade A", "Grade B", "Grade C", "Rejected"] as const;
const statusFor = (g: string) =>
  g === "Rejected" ? "Rejected" : g === "Grade C" ? "Pending Test" : "Accepted";

const schema = z.object({
  farmer_code: z.string().min(1, "Select a farmer"),
  quantity_kg: z.coerce
    .number()
    .positive("Quantity must be above 0")
    .max(9999, "Quantity too large"),
  quality_grade: z.enum(GRADES),
  collected_at: z.string().min(1, "Enter the collection time"),
});

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function ReceiveMilk() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const online = useOnlineStatus();
  const [farmers, setFarmers] =
    useState<{ farmer_code: string; full_name: string }[]>(getCachedFarmers());
  const [priceMap, setPriceMap] = useState<Record<string, number>>(getCachedPrices());
  const [usingCache, setUsingCache] = useState(!online);
  const [pending, setPending] = useState<PendingCollection[]>(getPendingCollections());
  const [f, setF] = useState({
    farmer_code: "",
    quantity_kg: "",
    quality_grade: "Grade A",
    collected_at: nowLocal(),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onQueueUpdate(() => setPending(getPendingCollections()));
  }, []);

  useEffect(() => {
    if (!online) return;
    supabase
      .from("farmers")
      .select("farmer_code, full_name")
      .order("farmer_code")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFarmers(data);
          cacheFarmers(data);
          setUsingCache(false);
        }
      });
    supabase
      .from("milk_prices")
      .select("grade, price_per_ksh")
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data ?? []).forEach((p: { grade: string; price_per_ksh: number }) => {
          map[p.grade] = Number(p.price_per_ksh);
        });
        if (Object.keys(map).length > 0) {
          setPriceMap(map);
          cachePrices(map);
        }
      });
  }, [online]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = schema.safeParse(f);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);

    if (!online) {
      const farmer = farmers.find((x) => x.farmer_code === p.data.farmer_code);
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      addPendingCollection({
        localId,
        farmer_code: p.data.farmer_code,
        farmer_name: farmer?.full_name ?? p.data.farmer_code,
        quantity_kg: p.data.quantity_kg,
        quality_grade: p.data.quality_grade,
        status: statusFor(p.data.quality_grade),
        collected_at: new Date(p.data.collected_at).toISOString(),
        received_by: user.id,
        queued_at: new Date().toISOString(),
        synced: false,
        error: null,
      });
      toast.success(
        `Saved offline — ${p.data.quantity_kg} kg from ${farmer?.full_name ?? p.data.farmer_code}. Will sync when online.`,
      );
      setBusy(false);
      setF({
        farmer_code: "",
        quantity_kg: "",
        quality_grade: "Grade A",
        collected_at: nowLocal(),
      });
      return;
    }

    const { error } = await supabase.from("collections").insert({
      farmer_code: p.data.farmer_code,
      quantity_kg: p.data.quantity_kg,
      quality_grade: p.data.quality_grade,
      status: statusFor(p.data.quality_grade),
      collected_at: new Date(p.data.collected_at).toISOString(),
      received_by: user.id,
    });
    if (error) {
      setBusy(false);
      return void toast.error("Could not save collection. Please try again.");
    }

    const farmer = farmers.find((x) => x.farmer_code === p.data.farmer_code);
    toast.success(
      `Recorded ${p.data.quantity_kg} kg from ${farmer?.full_name ?? p.data.farmer_code}`,
    );

    if (p.data.quality_grade !== "Rejected") {
      try {
        const { data: farmerRow } = await supabase
          .from("farmers")
          .select("phone")
          .eq("farmer_code", p.data.farmer_code)
          .maybeSingle();

        const { data: cumRows } = await supabase
          .from("collections")
          .select("quantity_kg")
          .eq("farmer_code", p.data.farmer_code)
          .eq("status", "Accepted");

        const cumulativeKg = (cumRows ?? []).reduce((a, r) => a + Number(r.quantity_kg), 0);

        const smsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`;
        await fetch(smsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            farmer_code: p.data.farmer_code,
            farmer_name: farmer?.full_name,
            phone: farmerRow?.phone ?? null,
            quantity_kg: p.data.quantity_kg,
            cumulative_kg: cumulativeKg,
            collected_at: new Date(p.data.collected_at).toLocaleString("en-KE"),
          }),
        });
      } catch {
        // SMS failure shouldn't block the collection save
      }
    }

    setBusy(false);
    navigate({ to: "/collections" });
  }

  async function handleSyncNow() {
    const results = await syncPendingCollections((p) => ({
      farmer_code: p.farmer_code,
      quantity_kg: p.quantity_kg,
      quality_grade: p.quality_grade,
      status: p.status,
      collected_at: p.collected_at,
      received_by: p.received_by,
    }));
    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    if (ok > 0) toast.success(`Synced ${ok} pending collection${ok > 1 ? "s" : ""}`);
    if (fail > 0) toast.error(`${fail} collection${fail > 1 ? "s" : ""} failed to sync`);
    setPending(getPendingCollections());
  }

  return (
    <AppShell title="Receive Milk" subtitle="New collection entry">
      {!online && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-maziwa-orange/10 p-3 ring-1 ring-maziwa-orange/30">
          <WifiOff className="size-4 shrink-0 text-maziwa-orange-deep" />
          <p className="text-xs font-semibold text-maziwa-orange-deep">
            You're offline. Collections will be saved locally and synced automatically when you
            reconnect.
          </p>
        </div>
      )}
      {online && usingCache && farmers.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 p-3 ring-1 ring-border/60">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">
            Showing cached farmer list. Will refresh when connection is confirmed.
          </p>
        </div>
      )}
      {pending.filter((p) => !p.synced).length > 0 && (
        <ShellCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">
              Pending Sync ({pending.filter((p) => !p.synced).length})
            </h3>
            {online && (
              <Button
                size="sm"
                onClick={handleSyncNow}
                className="h-7 rounded-full bg-maziwa-blue px-3 text-xs font-bold hover:bg-maziwa-blue/90"
              >
                Sync Now
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {pending
              .filter((p) => !p.synced)
              .map((p) => (
                <li
                  key={p.localId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 p-2.5 ring-1 ring-border/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {p.quantity_kg} kg — {p.farmer_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(p.collected_at).toLocaleString("en-KE", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {p.error ? ` · Error: ${p.error}` : " · Queued"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      removePendingCollection(p.localId);
                      setPending(getPendingCollections());
                    }}
                    className="shrink-0 text-xs font-bold text-destructive hover:text-destructive/80"
                  >
                    Discard
                  </button>
                </li>
              ))}
          </ul>
        </ShellCard>
      )}
      <ShellCard>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className={labelClass} htmlFor="farmer">
              Farmer ID
            </label>
            <select
              id="farmer"
              className={fieldClass}
              value={f.farmer_code}
              onChange={set("farmer_code")}
            >
              <option value="">Select farmer…</option>
              {farmers.map((x) => (
                <option key={x.farmer_code} value={x.farmer_code}>
                  {x.farmer_code} — {x.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="qty">
              Milk Quantity (kg)
            </label>
            <input
              id="qty"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              className={fieldClass}
              value={f.quantity_kg}
              onChange={set("quantity_kg")}
              placeholder="e.g. 45"
            />
          </div>
          <div>
            <span className={labelClass}>Quality Grade</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => (
                <Button
                  key={g}
                  type="button"
                  variant="ghost"
                  onClick={() => setF((s) => ({ ...s, quality_grade: g }))}
                  className={`h-11 rounded-full text-sm font-bold ring-1 transition ${
                    f.quality_grade === g
                      ? g === "Rejected"
                        ? "bg-destructive text-destructive-foreground ring-destructive hover:bg-destructive/90 hover:text-destructive-foreground"
                        : "bg-maziwa-green text-primary-foreground ring-maziwa-green hover:bg-maziwa-green-deep hover:text-primary-foreground"
                      : "bg-background text-foreground ring-border hover:ring-maziwa-green"
                  }`}
                >
                  {g}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="time">
              Timestamp
            </label>
            <input
              id="time"
              type="datetime-local"
              className={fieldClass}
              value={f.collected_at}
              onChange={set("collected_at")}
            />
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="pill-action mt-1 h-auto justify-center bg-maziwa-green hover:bg-maziwa-green-deep disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save Collection
          </Button>
          {f.quantity_kg &&
          Number(f.quantity_kg) > 0 &&
          f.quality_grade !== "Rejected" &&
          priceMap[f.quality_grade] ? (
            <div className="flex items-center justify-between rounded-lg bg-maziwa-green/8 p-3.5 ring-1 ring-maziwa-green/15">
              <span className="text-sm font-semibold text-maziwa-green-deep">Estimated value</span>
              <span className="text-lg font-extrabold text-maziwa-green-deep">
                KSh{" "}
                {(Number(f.quantity_kg) * (priceMap[f.quality_grade] ?? 0)).toLocaleString("en-KE")}
              </span>
            </div>
          ) : null}
        </form>
      </ShellCard>
    </AppShell>
  );
}
