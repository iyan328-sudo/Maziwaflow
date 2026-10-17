import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2,
  WifiOff,
  Clock,
  Printer,
  CheckCircle2,
  ArrowRight,
  PlusCircle,
  Receipt,
  FileCheck2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, ShellCard, fieldClass, labelClass } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  syncAllPending,
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

const DEFAULT_PRICES: Record<string, number> = {
  "Grade A": 55,
  "Grade B": 45,
  "Grade C": 35,
  Rejected: 0,
};

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

type DeliveryReceipt = {
  receiptId: string;
  farmerCode: string;
  farmerName: string;
  phone?: string | null;
  quantityKg: number;
  qualityGrade: string;
  pricePerKg: number;
  totalPayout: number;
  collectedAt: string;
  clerkName: string;
  isOffline: boolean;
};

function ReceiveMilk() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const online = useOnlineStatus();
  const [farmers, setFarmers] = useState<
    { farmer_code: string; full_name: string; phone?: string | null }[]
  >(getCachedFarmers());
  const [priceMap, setPriceMap] = useState<Record<string, number>>(getCachedPrices());
  const [usingCache, setUsingCache] = useState(!online);
  const [pending, setPending] = useState<PendingCollection[]>(getPendingCollections());
  const [clerkName, setClerkName] = useState<string>("Staff Member");
  const [receipt, setReceipt] = useState<DeliveryReceipt | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const [f, setF] = useState({
    farmer_code: "",
    quantity_kg: "",
    quality_grade: "Grade A",
    collected_at: nowLocal(),
  });
  const [busy, setBusy] = useState(false);

  // Load clerk profile name
  useEffect(() => {
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          setClerkName(data.full_name);
        } else if (user.email) {
          setClerkName(user.email.split("@")[0]);
        }
      });
  }, [user.id, user.email]);

  useEffect(() => {
    return onQueueUpdate(() => setPending(getPendingCollections()));
  }, []);

  useEffect(() => {
    if (!online) return;
    supabase
      .from("farmers")
      .select("farmer_code, full_name, phone")
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

  function getActivePrice(grade: string): number {
    if (grade === "Rejected") return 0;
    return priceMap[grade] ?? DEFAULT_PRICES[grade] ?? 50;
  }

  const activeUnitPrice = getActivePrice(f.quality_grade);
  const calculatedLiveTotal =
    f.quantity_kg && Number(f.quantity_kg) > 0 && f.quality_grade !== "Rejected"
      ? Math.round(Number(f.quantity_kg) * activeUnitPrice * 100) / 100
      : 0;

  async function sendReceiptSms(payload: {
    phone?: string | null;
    farmer_name: string;
    farmer_code: string;
    quantity_kg: number;
    quality_grade: string;
    price_per_ksh: number;
    total_payout_ksh: number;
    collection_id: string;
  }) {
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: payload,
      });
      if (error) {
        console.warn("SMS edge dispatch warning:", error.message);
      } else {
        console.log("SMS receipt result:", data);
      }
    } catch (smsErr) {
      console.warn("SMS receipt trigger failed:", smsErr);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = schema.safeParse(f);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);

    const farmer = farmers.find((x) => x.farmer_code === p.data.farmer_code);
    const unitPrice = getActivePrice(p.data.quality_grade);
    const totalPayout =
      p.data.quality_grade === "Rejected"
        ? 0
        : Math.round(p.data.quantity_kg * unitPrice * 100) / 100;

    // OFFLINE MODE
    if (!online) {
      const localId = `off_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const saved = addPendingCollection({
        localId,
        farmer_code: p.data.farmer_code,
        farmer_name: farmer?.full_name ?? p.data.farmer_code,
        quantity_kg: p.data.quantity_kg,
        quality_grade: p.data.quality_grade,
        status: statusFor(p.data.quality_grade),
        price_per_ksh: unitPrice,
        collected_at: new Date(p.data.collected_at).toISOString(),
        received_by: user.id,
        queued_at: new Date().toISOString(),
        synced: false,
        error: null,
      });

      if (!saved) {
        setBusy(false);
        toast.error("Could not save offline. Free device storage and try again.");
        return;
      }

      toast.success(
        `Saved offline — ${p.data.quantity_kg} kg from ${farmer?.full_name ?? p.data.farmer_code}.`,
      );

      setReceipt({
        receiptId: `OFF-${localId.slice(-6).toUpperCase()}`,
        farmerCode: p.data.farmer_code,
        farmerName: farmer?.full_name ?? p.data.farmer_code,
        phone: farmer?.phone ?? null,
        quantityKg: p.data.quantity_kg,
        qualityGrade: p.data.quality_grade,
        pricePerKg: unitPrice,
        totalPayout,
        collectedAt: new Date(p.data.collected_at).toISOString(),
        clerkName,
        isOffline: true,
      });
      setShowReceipt(true);
      setBusy(false);
      return;
    }

    // ONLINE MODE
    const { data: inserted, error } = await supabase
      .from("collections")
      .insert({
        farmer_code: p.data.farmer_code,
        quantity_kg: p.data.quantity_kg,
        quality_grade: p.data.quality_grade,
        status: statusFor(p.data.quality_grade),
        price_per_ksh: unitPrice,
        collected_at: new Date(p.data.collected_at).toISOString(),
        received_by: user.id,
      })
      .select("id, collected_at")
      .maybeSingle();

    if (error) {
      setBusy(false);
      return void toast.error("Could not save collection. Please try again.");
    }

    const collectionId = inserted?.id || `REC-${Date.now().toString(36).toUpperCase()}`;

    // Send SMS receipt alert to farmer
    if (p.data.quality_grade !== "Rejected") {
      void sendReceiptSms({
        phone: farmer?.phone ?? null,
        farmer_name: farmer?.full_name ?? p.data.farmer_code,
        farmer_code: p.data.farmer_code,
        quantity_kg: p.data.quantity_kg,
        quality_grade: p.data.quality_grade,
        price_per_ksh: unitPrice,
        total_payout_ksh: totalPayout,
        collection_id: collectionId,
      });
    }

    toast.success(
      `Recorded ${p.data.quantity_kg} kg from ${farmer?.full_name ?? p.data.farmer_code}`,
    );

    setReceipt({
      receiptId: collectionId.slice(0, 8).toUpperCase(),
      farmerCode: p.data.farmer_code,
      farmerName: farmer?.full_name ?? p.data.farmer_code,
      phone: farmer?.phone ?? null,
      quantityKg: p.data.quantity_kg,
      qualityGrade: p.data.quality_grade,
      pricePerKg: unitPrice,
      totalPayout,
      collectedAt: inserted?.collected_at || new Date(p.data.collected_at).toISOString(),
      clerkName,
      isOffline: false,
    });
    setShowReceipt(true);
    setBusy(false);
  }

  function handleResetForNext() {
    setF({
      farmer_code: "",
      quantity_kg: "",
      quality_grade: "Grade A",
      collected_at: nowLocal(),
    });
    setShowReceipt(false);
  }

  async function handleSyncNow() {
    const summary = await syncAllPending();
    const totalSynced = summary.farmersSynced + summary.collectionsSynced;
    const totalFailed = summary.farmersFailed + summary.collectionsFailed;

    if (totalSynced > 0) {
      const parts = [];
      if (summary.farmersSynced > 0) parts.push(`${summary.farmersSynced} member(s)`);
      if (summary.collectionsSynced > 0) parts.push(`${summary.collectionsSynced} collection(s)`);
      toast.success(`Synced ${parts.join(" and ")} successfully!`);
    }
    if (totalFailed > 0) {
      toast.error(`${totalFailed} record(s) failed to sync. Check network and retry.`);
    }
    setPending(getPendingCollections());
  }

  return (
    <AppShell title="Receive Milk" subtitle="New collection entry">
      {!online && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-maziwa-orange/10 p-3 ring-1 ring-maziwa-orange/30">
          <WifiOff className="size-4 shrink-0 text-maziwa-orange-deep" />
          <p className="text-xs font-semibold text-maziwa-orange-deep">
            You're offline. Collections will be saved locally with receipts and synced
            automatically when you reconnect.
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
              Farmer / Member
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
                  {x.farmer_code} — {x.full_name} {x.phone ? `(${x.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="qty">
              Milk Quantity (kg / Liters)
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

          {/* Real-time Payout Calculation Callout */}
          {f.quantity_kg && Number(f.quantity_kg) > 0 ? (
            <div className="rounded-xl border border-maziwa-green/30 bg-maziwa-green/10 p-3.5 text-foreground">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Active Milk Price ({f.quality_grade})</span>
                <span className="font-semibold text-foreground">
                  KSh {activeUnitPrice.toFixed(2)} / kg
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-maziwa-green/20 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-maziwa-green-deep">
                  Calculated Farmer Payout
                </span>
                <span className="text-xl font-extrabold text-maziwa-green-deep">
                  KSh{" "}
                  {calculatedLiveTotal.toLocaleString("en-KE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="time">
              Collection Timestamp
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
            {busy && <Loader2 className="size-4 animate-spin mr-1.5" />}
            Save & Generate Receipt
          </Button>
        </form>
      </ShellCard>

      {/* DELIVERY RECEIPT MODAL DIALOG */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-md p-5 sm:p-6 print:m-0 print:p-0 print:border-none print:shadow-none">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-maziwa-green/15 text-maziwa-green-deep mb-2">
              <FileCheck2 className="size-6" />
            </div>
            <DialogTitle className="text-lg font-bold">Milk Delivery Receipt</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Official dairy collection confirmation receipt
            </DialogDescription>
          </DialogHeader>

          {receipt && (
            <div className="mt-2 space-y-4">
              <div className="flex items-center justify-between border-b pb-2 text-xs">
                <span className="text-muted-foreground">Receipt Number:</span>
                <span className="font-mono font-bold text-foreground">#{receipt.receiptId}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Sync Status:</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-[11px] ${
                    receipt.isOffline
                      ? "bg-maziwa-orange/15 text-maziwa-orange-deep"
                      : "bg-maziwa-green/15 text-maziwa-green-deep"
                  }`}
                >
                  <CheckCircle2 className="size-3" />
                  {receipt.isOffline ? "Queued Offline" : "Online Confirmed"}
                </span>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 space-y-2 text-xs ring-1 ring-border/50">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Farmer:</span>
                  <span className="font-semibold text-foreground">
                    {receipt.farmerCode} — {receipt.farmerName}
                  </span>
                </div>
                {receipt.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mobile Phone:</span>
                    <span className="font-mono text-foreground">{receipt.phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date & Time:</span>
                  <span className="text-foreground">
                    {new Date(receipt.collectedAt).toLocaleString("en-KE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quality Grade:</span>
                  <span className="font-semibold text-foreground">{receipt.qualityGrade}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivered Quantity:</span>
                  <span className="font-extrabold text-foreground">{receipt.quantityKg} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate per kg:</span>
                  <span className="text-foreground">KSh {receipt.pricePerKg.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receiving Clerk:</span>
                  <span className="text-foreground">{receipt.clerkName}</span>
                </div>
              </div>

              {/* Highlighted Total Payout */}
              <div className="rounded-xl border border-maziwa-green/30 bg-maziwa-green/10 p-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Calculated Farmer Payout
                </p>
                <p className="mt-0.5 text-2xl font-black text-maziwa-green-deep">
                  KSh{" "}
                  {receipt.totalPayout.toLocaleString("en-KE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>

              {receipt.phone ? (
                <p className="text-center text-[11px] text-muted-foreground">
                  An SMS receipt notification has been dispatched to {receipt.phone}.
                </p>
              ) : null}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1 print:hidden">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.print()}
                  className="h-10 text-xs font-bold gap-1.5"
                >
                  <Printer className="size-3.5" /> Print / Save
                </Button>
                <Button
                  type="button"
                  onClick={handleResetForNext}
                  className="h-10 text-xs font-bold gap-1.5 bg-maziwa-green hover:bg-maziwa-green-deep text-primary-foreground"
                >
                  <PlusCircle className="size-3.5" /> Next Delivery
                </Button>
              </div>

              <div className="pt-0 print:hidden">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowReceipt(false);
                    navigate({ to: "/collections" });
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  View All Collections <ArrowRight className="size-3" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
