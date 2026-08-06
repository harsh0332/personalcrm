/**
 * IndexedDB Offline Queue Manager for CallDesk
 * Queues dispositions logged while offline and syncs them reliably when connection returns.
 * NEVER displays success until confirmed by Supabase server.
 */

export interface QueuedDisposition {
  id: string;
  lead_id: string;
  lead_name: string;
  owner: string;
  disposition: string;
  note: string | null;
  followup_due_at: string | null;
  followup_reason: string | null;
  rating: number | null;
  call_duration_seconds: number;
  created_at: string;
  status: "pending" | "failed";
  retries: number;
  error_message?: string;
}

const DB_NAME = "calldesk_offline_db";
const STORE_NAME = "pending_dispositions";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enqueues a disposition written offline into IndexedDB.
 */
export async function enqueueOfflineDisposition(
  item: Omit<QueuedDisposition, "id" | "created_at" | "status" | "retries">
): Promise<QueuedDisposition> {
  const db = await openDB();
  const queuedItem: QueuedDisposition = {
    ...item,
    id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    created_at: new Date().toISOString(),
    status: "pending",
    retries: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(queuedItem);

    request.onsuccess = () => {
      window.dispatchEvent(new CustomEvent("offline_queue_changed"));
      resolve(queuedItem);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves all queued offline items.
 */
export async function getQueuedDispositions(): Promise<QueuedDisposition[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Removes a successfully synced item from IndexedDB.
 */
export async function removeQueuedDisposition(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      window.dispatchEvent(new CustomEvent("offline_queue_changed"));
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Updates a queued disposition (e.g. status: "failed", retries, error_message).
 */
export async function updateQueuedDisposition(item: QueuedDisposition): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);

    request.onsuccess = () => {
      window.dispatchEvent(new CustomEvent("offline_queue_changed"));
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Attempts to sync queued offline dispositions to Supabase server.
 */
export async function syncOfflineQueue(supabase: any): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  const items = await getQueuedDispositions();
  if (items.length === 0) return { synced: 0, failed: 0, errors: [] };

  let syncedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const item of items) {
    if (item.status === "failed" && item.retries >= 3) {
      // Already permanently failed, leave for manual user action
      failedCount++;
      continue;
    }

    try {
      const now = new Date().toISOString();

      // 1. Insert activity log
      const { error: actErr } = await supabase.from("activities").insert({
        owner: item.owner,
        lead_id: item.lead_id,
        kind: "call",
        disposition: item.disposition,
        note: item.note,
        occurred_at: item.created_at || now,
        call_duration_seconds: item.call_duration_seconds,
        performed_by: item.owner,
      });

      if (actErr) throw new Error(`Activity insert error: ${actErr.message}`);

      // 2. Insert followup if scheduled
      if (item.followup_due_at) {
        const { error: fllwErr } = await supabase.from("followups").insert({
          owner: item.owner,
          lead_id: item.lead_id,
          due_at: item.followup_due_at,
          reason: item.followup_reason || "Scheduled Followup",
        });

        if (fllwErr) throw new Error(`Followup insert error: ${fllwErr.message}`);
      }

      // 3. Update lead status
      const leadUpdate: Record<string, any> = {
        last_called_at: now,
        status: item.disposition === "converted" ? "won" : item.disposition,
      };

      if (item.disposition === "invalid" || item.disposition === "do_not_call") {
        leadUpdate.do_not_call = true;
      }
      if (item.rating !== null) {
        leadUpdate.rating = item.rating;
      }
      if (item.followup_due_at) {
        leadUpdate.next_action_at = item.followup_due_at;
      }

      const { error: leadErr } = await supabase
        .from("leads")
        .update(leadUpdate)
        .eq("id", item.lead_id);

      if (leadErr) throw new Error(`Lead update error: ${leadErr.message}`);

      // Sync Success: remove from IndexedDB
      await removeQueuedDisposition(item.id);
      syncedCount++;
    } catch (err: any) {
      item.retries += 1;
      item.error_message = err.message;

      if (item.retries >= 3) {
        item.status = "failed";
      }

      await updateQueuedDisposition(item);
      failedCount++;
      errors.push(`Lead ${item.lead_name}: ${err.message}`);
    }
  }

  window.dispatchEvent(new CustomEvent("offline_queue_changed"));
  return { synced: syncedCount, failed: failedCount, errors };
}
