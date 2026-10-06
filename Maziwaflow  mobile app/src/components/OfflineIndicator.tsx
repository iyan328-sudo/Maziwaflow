import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  getPendingCollections,
  onQueueUpdate,
  syncPendingCollections,
  type PendingCollection,
} from "@/lib/offline-queue";

export function OfflineIndicator() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState<PendingCollection[]>(getPendingCollections());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const update = () => setPending(getPendingCollections());
    update();
    return onQueueUpdate(update);
  }, []);

  const unsynced = pending.filter((p) => !p.synced);
  const unsyncedCount = unsynced.length;

  useEffect(() => {
    if (!online || unsyncedCount === 0) return;
    setSyncing(true);
    syncPendingCollections((p) => ({
      farmer_code: p.farmer_code,
      quantity_kg: p.quantity_kg,
      quality_grade: p.quality_grade,
      status: p.status,
      collected_at: p.collected_at,
      received_by: p.received_by,
    }))
      .then((results) => {
        const ok = results.filter((r) => r.success).length;
        const fail = results.filter((r) => !r.success).length;
        if (ok > 0) toast.success(`Synced ${ok} pending collection${ok > 1 ? "s" : ""}`);
        if (fail > 0) toast.error(`${fail} collection${fail > 1 ? "s" : ""} failed to sync`);
        setPending(getPendingCollections());
      })
      .finally(() => setSyncing(false));
  }, [online, unsyncedCount]);

  if (online && unsyncedCount === 0 && !syncing) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-lg transition-all",
        online
          ? "bg-maziwa-green text-primary-foreground"
          : "bg-maziwa-orange text-primary-foreground",
      )}
    >
      {!online && <WifiOff className="size-4" />}
      {syncing && <Loader2 className="size-4 animate-spin" />}
      {online && !syncing && unsynced.length === 0 && <CheckCircle2 className="size-4" />}
      {!online && <span>Offline — {unsynced.length} pending</span>}
      {online && syncing && <span>Syncing {unsynced.length}…</span>}
      {online && !syncing && unsynced.length === 0 && <span>All synced</span>}
    </div>
  );
}

export function ManualSyncButton() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState<PendingCollection[]>(getPendingCollections());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const update = () => setPending(getPendingCollections());
    update();
    return onQueueUpdate(update);
  }, []);

  const unsynced = pending.filter((p) => !p.synced);
  if (unsynced.length === 0) return null;

  const handleSync = async () => {
    if (!online) return void toast.error("You're offline — can't sync right now");
    setSyncing(true);
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
    setSyncing(false);
  };

  return (
    <button
      onClick={handleSync}
      disabled={syncing || !online}
      className="flex items-center gap-1.5 rounded-full bg-maziwa-orange px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-maziwa-orange-deep disabled:opacity-50"
    >
      <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
      {syncing ? "Syncing…" : `${unsynced.length} pending`}
    </button>
  );
}
