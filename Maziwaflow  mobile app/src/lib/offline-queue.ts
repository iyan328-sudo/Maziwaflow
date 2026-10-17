const PENDING_COLLECTIONS_KEY = "maziwa_pending_collections";
const PENDING_FARMERS_KEY = "maziwa_pending_farmers";
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
  price_per_ksh?: number | null;
  collected_at: string;
  received_by: string;
  queued_at: string;
  synced: boolean;
  error: string | null;
};

export type PendingFarmer = {
  localId: string;
  farmer_code: string;
  full_name: string;
  phone: string;
  location: string | null;
  queued_at: string;
  synced: boolean;
  error: string | null;
};

let syncPromise: Promise<SyncSummary> | null = null;

export type FarmersCache = { farmer_code: string; full_name: string; phone?: string | null; location?: string | null }[];
export type PricesCache = Record<string, number>;

// ---- Collections Queue ----
export function getPendingCollections(): PendingCollection[] {
  try {
    const raw = localStorage.getItem(PENDING_COLLECTIONS_KEY);
    return raw ? (JSON.parse(raw) as PendingCollection[]) : [];
  } catch {
    return [];
  }
}

export function savePendingCollections(items: PendingCollection[]): boolean {
  try {
    localStorage.setItem(PENDING_COLLECTIONS_KEY, JSON.stringify(items));
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

// ---- Farmers (Member Registration) Queue ----
export function getPendingFarmers(): PendingFarmer[] {
  try {
    const raw = localStorage.getItem(PENDING_FARMERS_KEY);
    return raw ? (JSON.parse(raw) as PendingFarmer[]) : [];
  } catch {
    return [];
  }
}

export function savePendingFarmers(items: PendingFarmer[]): boolean {
  try {
    localStorage.setItem(PENDING_FARMERS_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function addPendingFarmer(farmer: PendingFarmer): boolean {
  const items = getPendingFarmers();
  items.push(farmer);
  if (!savePendingFarmers(items)) return false;

  // Also optimistically append to cached farmers so offline collection immediately finds them
  const cached = getCachedFarmers();
  if (!cached.some((c) => c.farmer_code === farmer.farmer_code)) {
    cached.push({
      farmer_code: farmer.farmer_code,
      full_name: farmer.full_name,
      phone: farmer.phone,
      location: farmer.location,
    });
    cacheFarmers(cached);
  }

  notifyUpdate();
  return true;
}

export function removePendingFarmer(localId: string) {
  const items = getPendingFarmers().filter((i) => i.localId !== localId);
  savePendingFarmers(items);
  notifyUpdate();
}

export function updatePendingFarmer(localId: string, patch: Partial<PendingFarmer>) {
  const items = getPendingFarmers().map((i) =>
    i.localId === localId ? { ...i, ...patch } : i,
  );
  savePendingFarmers(items);
  notifyUpdate();
}

export function getTotalPendingCount(): number {
  return (
    getPendingCollections().filter((c) => !c.synced).length +
    getPendingFarmers().filter((f) => !f.synced).length
  );
}

// ---- Caches ----
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

// ---- Synchronization ----
export type SyncPayload = {
  farmer_code: string;
  quantity_kg: number;
  quality_grade: string;
  status: string;
  price_per_ksh?: number | null;
  collected_at: string;
  received_by: string;
};

export type SyncResult = {
  localId: string;
  success: boolean;
  error: string | null;
};

export type SyncSummary = {
  farmersSynced: number;
  farmersFailed: number;
  collectionsSynced: number;
  collectionsFailed: number;
};

export function clearAllPendingRecords(): void {
  try {
    localStorage.removeItem(PENDING_COLLECTIONS_KEY);
    localStorage.removeItem(PENDING_FARMERS_KEY);
    notifyUpdate();
  } catch {
    // ignore
  }
}

export async function syncPendingFarmers(): Promise<SyncResult[]> {
  const pending = getPendingFarmers().filter((f) => !f.synced);
  if (pending.length === 0) return [];

  const { supabase } = await import("@/integrations/supabase/client");
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) return [];

  const results: SyncResult[] = [];

  for (const item of pending) {
    const payload: { farmer_code: string; full_name: string; location?: string | null } = {
      farmer_code: item.farmer_code,
      full_name: item.full_name,
    };
    if (item.location) payload.location = item.location;

    const { error } = await supabase.from("farmers").upsert(
      payload,
      { onConflict: "farmer_code" },
    );

    if (error) {
      console.warn("Farmer sync error:", error.message);
      results.push({ localId: item.localId, success: false, error: error.message });
      updatePendingFarmer(item.localId, { error: error.message });
      // Remove corrupted items if schema error
      if (error.message.includes("schema cache") || error.code === "PGRST204") {
        removePendingFarmer(item.localId);
      }
    } else {
      results.push({ localId: item.localId, success: true, error: null });
      removePendingFarmer(item.localId);
    }
  }

  return results;
}

export function syncPendingCollections(
  buildInsert: (p: PendingCollection) => SyncPayload,
): Promise<SyncResult[]> {
  return syncPendingCollectionsNow(buildInsert);
}

async function syncPendingCollectionsNow(
  _buildInsert: (p: PendingCollection) => SyncPayload,
): Promise<SyncResult[]> {
  const pending = getPendingCollections().filter((p) => !p.synced);
  if (pending.length === 0) return [];

  const { supabase } = await import("@/integrations/supabase/client");
  const { data: sess } = await supabase.auth.getSession();
  const currentUser = sess?.session?.user;
  if (!currentUser) return [];

  const results: SyncResult[] = [];

  for (const item of pending) {
    const insertPayload: {
      farmer_code: string;
      quantity_kg: number;
      quality_grade: string;
      status: string;
      collected_at: string;
      received_by?: string;
    } = {
      farmer_code: item.farmer_code,
      quantity_kg: Number(item.quantity_kg),
      quality_grade: item.quality_grade || "A",
      status: item.status || "Accepted",
      collected_at: item.collected_at,
    };

    if (currentUser?.id) {
      insertPayload.received_by = currentUser.id;
    } else if (item.received_by) {
      insertPayload.received_by = item.received_by;
    }

    const { error } = await supabase.from("collections").insert(insertPayload);

    if (error) {
      console.warn("Collection sync error:", error.message);
      results.push({ localId: item.localId, success: false, error: error.message });
      updatePendingCollection(item.localId, { error: error.message });

      // Automatically purge corrupted offline test items that reference nonexistent columns or schema mismatches
      if (
        error.message.includes("schema cache") ||
        error.message.includes("does not exist") ||
        error.code === "PGRST204" ||
        item.error?.includes("client_sync_id")
      ) {
        removePendingCollection(item.localId);
      }
    } else {
      results.push({ localId: item.localId, success: true, error: null });
      removePendingCollection(item.localId);
    }
  }

  return results;
}

export function syncAllPending(
  buildInsert?: (p: PendingCollection) => SyncPayload,
): Promise<SyncSummary> {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session?.user) {
      return {
        farmersSynced: 0,
        farmersFailed: 0,
        collectionsSynced: 0,
        collectionsFailed: 0,
      };
    }

    // 1. Sync pending farmers first so foreign keys resolve
    const farmerResults = await syncPendingFarmers();
    const farmersSynced = farmerResults.filter((r) => r.success).length;
    const farmersFailed = farmerResults.filter((r) => !r.success).length;

    // 2. Sync pending collections
    const defaultBuildInsert = (p: PendingCollection): SyncPayload => ({
      farmer_code: p.farmer_code,
      quantity_kg: p.quantity_kg,
      quality_grade: p.quality_grade,
      status: p.status,
      price_per_ksh: null,
      collected_at: p.collected_at,
      received_by: p.received_by,
    });

    const collectionResults = await syncPendingCollectionsNow(buildInsert || defaultBuildInsert);
    const collectionsSynced = collectionResults.filter((r) => r.success).length;
    const collectionsFailed = collectionResults.filter((r) => !r.success).length;

    return {
      farmersSynced,
      farmersFailed,
      collectionsSynced,
      collectionsFailed,
    };
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

const UPDATE_EVENT = "maziwa-offline-queue-updated";

function notifyUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
}

export function onQueueUpdate(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(UPDATE_EVENT, cb);
  return () => window.removeEventListener(UPDATE_EVENT, cb);
}
