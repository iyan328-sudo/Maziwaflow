const PENDING_KEY = "maziwa_pending_collections";
const FARMERS_CACHE_KEY = "maziwa_farmers_cache";
const PRICES_CACHE_KEY = "maziwa_prices_cache";
const CACHED_AT_KEY = "maziwa_cache_timestamp";

export type PendingCollection = {
  localId: string;
  farmer_code: string;
  farmer_name: string;
  quantity_kg: number;
  quality_grade: string;
  status: string;
  collected_at: string;
  received_by: string;
  queued_at: string;
  synced: boolean;
  error: string | null;
};

let syncPromise: Promise<SyncResult[]> | null = null;

type FarmersCache = { farmer_code: string; full_name: string }[];
type PricesCache = Record<string, number>;

export function getPendingCollections(): PendingCollection[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingCollection[]) : [];
  } catch {
    return [];
  }
}

export function savePendingCollections(items: PendingCollection[]): boolean {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function addPendingCollection(item: PendingCollection): boolean {
  const items = getPendingCollections();
  items.push(item);
  if (!savePendingCollections(items)) return false;
  notifyUpdate();
  return true;
}

export function removePendingCollection(localId: string) {
  const items = getPendingCollections().filter((i) => i.localId !== localId);
  savePendingCollections(items);
  notifyUpdate();
}

export function updatePendingCollection(localId: string, patch: Partial<PendingCollection>) {
  const items = getPendingCollections().map((i) =>
    i.localId === localId ? { ...i, ...patch } : i,
  );
  savePendingCollections(items);
  notifyUpdate();
}

export function getCachedFarmers(): FarmersCache {
  try {
    const raw = localStorage.getItem(FARMERS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as FarmersCache) : [];
  } catch {
    return [];
  }
}

export function cacheFarmers(farmers: FarmersCache) {
  try {
    localStorage.setItem(FARMERS_CACHE_KEY, JSON.stringify(farmers));
    localStorage.setItem(CACHED_AT_KEY, Date.now().toString());
  } catch {
    // ignore
  }
}

export function getCachedPrices(): PricesCache {
  try {
    const raw = localStorage.getItem(PRICES_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PricesCache) : {};
  } catch {
    return {};
  }
}

export function cachePrices(prices: PricesCache) {
  try {
    localStorage.setItem(PRICES_CACHE_KEY, JSON.stringify(prices));
  } catch {
    // ignore
  }
}

export function getCacheAgeMs(): number | null {
  try {
    const raw = localStorage.getItem(CACHED_AT_KEY);
    return raw ? Date.now() - Number(raw) : null;
  } catch {
    return null;
  }
}

type SyncPayload = {
  farmer_code: string;
  quantity_kg: number;
  quality_grade: string;
  status: string;
  collected_at: string;
  received_by: string;
};

type SyncResult = {
  localId: string;
  success: boolean;
  error: string | null;
};

export function syncPendingCollections(
  buildInsert: (p: PendingCollection) => SyncPayload,
): Promise<SyncResult[]> {
  if (syncPromise) return syncPromise;
  syncPromise = syncPendingCollectionsNow(buildInsert).finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function syncPendingCollectionsNow(
  buildInsert: (p: PendingCollection) => SyncPayload,
): Promise<SyncResult[]> {
  const pending = getPendingCollections().filter((p) => !p.synced);
  if (pending.length === 0) return [];

  const { supabase } = await import("@/integrations/supabase/client");
  const results: SyncResult[] = [];

  for (const item of pending) {
    const payload = buildInsert(item);
    const { error } = await supabase.from("collections").upsert(
      { ...payload, client_sync_id: item.localId },
      { onConflict: "client_sync_id", ignoreDuplicates: true },
    );
    if (error) {
      results.push({ localId: item.localId, success: false, error: error.message });
      updatePendingCollection(item.localId, { error: error.message });
    } else {
      results.push({ localId: item.localId, success: true, error: null });
      removePendingCollection(item.localId);
    }
  }

  return results;
}

const UPDATE_EVENT = "maziwa-offline-queue-updated";

function notifyUpdate() {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function onQueueUpdate(cb: () => void): () => void {
  window.addEventListener(UPDATE_EVENT, cb);
  return () => window.removeEventListener(UPDATE_EVENT, cb);
}
