import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  getTotalPendingCount,
  onQueueUpdate,
  syncAllPending,
  clearAllPendingRecords,
} from "@/lib/offline-queue";
import { supabase } from "@/integrations/supabase/client";

export function OfflineIndicator() {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const update = () => setPendingCount(getTotalPendingCount());
    update();
    return onQueueUpdate(update);
  }, []);

  useEffect(() => {
    if (!online || pendingCount === 0 || syncing) return;

    // Only attempt automatic sync if the user has an active authenticated session
    supabase.auth.getSession().then(({ data }) => {
      if (!data?.session?.user) return;

      setSyncing(true);
      syncAllPending()
        .then((summary) => {
          const totalOk = summary.farmersSynced + summary.collectionsSynced;
          const totalFail = summary.farmersFailed + summary.collectionsFailed;
          if (totalOk > 0) {
            toast.success(
              `Synced ${totalOk} offline record${totalOk > 1 ? "s" : ""}${
                summary.farmersSynced > 0 ? ` (${summary.farmersSynced} members, ${summary.collectionsSynced} collections)` : ""
              }`,
            );
          }
          if (totalFail > 0) {
            toast.error(`${totalFail} record${totalFail > 1 ? "s" : ""} failed to sync`, {
              action: {
                label: "Clear Queue",
                onClick: () => {
                  clearAllPendingRecords();
                  toast.info("Offline sync queue cleared.");
                },
              },
            });
          }
          setPendingCount(getTotalPendingCount());
        })
        .finally(() => setSyncing(false));
    });
  }, [online, pendingCount]);

  if (online && pendingCount === 0 && !syncing) return null;

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
      {online && !syncing && pendingCount === 0 && <CheckCircle2 className="size-4" />}
      {!online && <span>Offline — {pendingCount} pending</span>}
      {online && syncing && <span>Syncing {pendingCount} records…</span>}
      {online && !syncing && pendingCount === 0 && <span>All synced</span>}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => {
            clearAllPendingRecords();
            toast.info("Cleared offline queue");
          }}
          title="Clear offline queue"
          className="ml-2 rounded-full bg-black/20 p-1 hover:bg-black/30 transition text-white"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  );
}

export function ManualSyncButton() {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const update = () => setPendingCount(getTotalPendingCount());
    update();
    return onQueueUpdate(update);
  }, []);

  if (pendingCount === 0) return null;

  const handleSync = async () => {
    if (!online) return void toast.error("You're offline — can't sync right now");
    setSyncing(true);
    try {
      const summary = await syncAllPending();
      const totalOk = summary.farmersSynced + summary.collectionsSynced;
      const totalFail = summary.farmersFailed + summary.collectionsFailed;
      if (totalOk > 0) {
        toast.success(
          `Synced ${totalOk} record${totalOk > 1 ? "s" : ""}${
            summary.farmersSynced > 0 ? ` (${summary.farmersSynced} members, ${summary.collectionsSynced} collections)` : ""
          }`,
        );
      }
      if (totalFail > 0) {
        toast.error(`${totalFail} record${totalFail > 1 ? "s" : ""} failed to sync`, {
          action: {
            label: "Clear Queue",
            onClick: () => {
              clearAllPendingRecords();
              toast.info("Offline sync queue cleared.");
            },
          },
        });
      }
    } finally {
      setPendingCount(getTotalPendingCount());
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleSync}
        disabled={syncing || !online}
        className="flex items-center gap-1.5 rounded-full bg-maziwa-orange px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-maziwa-orange-deep disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
        {syncing ? "Syncing…" : `${pendingCount} pending`}
      </button>
      <button
        type="button"
        onClick={() => {
          clearAllPendingRecords();
          toast.info("Offline queue cleared.");
        }}
        title="Clear offline records"
        className="rounded-full bg-muted/80 p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
