"use client";

import { useState, useEffect, useCallback } from "react";
import { WifiOff, RefreshCw, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  getQueuedDispositions,
  syncOfflineQueue,
  removeQueuedDisposition,
  QueuedDisposition,
} from "@/lib/offline-queue";

export function OfflineStatusBanner() {
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [pendingQueue, setPendingQueue] = useState<QueuedDisposition[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const supabase = createClient();

  const refreshQueue = useCallback(async () => {
    const items = await getQueuedDispositions();
    setPendingQueue(items);
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    setSyncStatusMsg("Syncing offline queue to server...");

    try {
      const res = await syncOfflineQueue(supabase);
      if (res.synced > 0) {
        setSyncStatusMsg(`Successfully synced ${res.synced} offline disposition(s)!`);
        setTimeout(() => setSyncStatusMsg(null), 4000);
      } else if (res.failed > 0) {
        setSyncStatusMsg(`Sync issue: ${res.failed} item(s) require review.`);
      } else {
        setSyncStatusMsg(null);
      }
    } catch {
      setSyncStatusMsg("Failed to connect to server during sync retry.");
    } finally {
      setIsSyncing(false);
      refreshQueue();
    }
  }, [isSyncing, refreshQueue, supabase]);

  useEffect(() => {
    // Initial status check
    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
    }

    const handleOnline = () => {
      setIsOffline(false);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    const handleQueueChange = () => {
      refreshQueue();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline_queue_changed", handleQueueChange);

    refreshQueue();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline_queue_changed", handleQueueChange);
    };
  }, [refreshQueue, triggerSync]);

  const pendingItems = pendingQueue.filter((q) => q.status === "pending");
  const failedItems = pendingQueue.filter((q) => q.status === "failed");

  if (!isOffline && pendingQueue.length === 0 && !syncStatusMsg) {
    return null; // Clean state: online and zero queued items
  }

  return (
    <div className="sticky top-0 z-50 space-y-1 font-sans">
      {/* 1. OFFLINE PERSISTENT BANNER */}
      {isOffline && (
        <div className="bg-amber-950 border-b border-amber-800 text-amber-200 px-3 py-2 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span className="font-semibold">
              Offline Mode — Network unavailable. Phone calls and disposition queue active.
            </span>
          </div>
          {pendingItems.length > 0 && (
            <span className="bg-amber-900/90 text-amber-300 px-2 py-0.5 rounded font-mono text-[11px] font-bold border border-amber-700">
              {pendingItems.length} Pending Sync
            </span>
          )}
        </div>
      )}

      {/* 2. SYNC IN PROGRESS / SUCCESS NOTIFICATION */}
      {!isOffline && syncStatusMsg && (
        <div className="bg-emerald-950 border-b border-emerald-800 text-emerald-200 px-3 py-2 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            {isSyncing ? (
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="font-medium">{syncStatusMsg}</span>
          </div>
        </div>
      )}

      {/* 3. ONLINE PENDING SYNC BANNER */}
      {!isOffline && pendingItems.length > 0 && !isSyncing && (
        <div className="bg-zinc-900 border-b border-zinc-800 text-zinc-200 px-3 py-2 text-xs flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-medium">
              {pendingItems.length} queued disposition(s) waiting to sync to server.
            </span>
          </div>
          <Button
            size="sm"
            onClick={triggerSync}
            className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-[11px] h-7 px-2.5"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Sync Now
          </Button>
        </div>
      )}

      {/* 4. PERMANENT FAILURE ALERT BANNER (Rule: Never drop, never retry forever in silence) */}
      {failedItems.map((failedItem) => (
        <div
          key={failedItem.id}
          className="bg-rose-950 border-b border-rose-800 text-rose-200 px-3 py-2.5 text-xs space-y-2 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-100 block">
                  ⚠️ Offline Write Permanently Failed: {failedItem.lead_name}
                </span>
                <span className="text-[11px] text-rose-300 font-mono block mt-0.5">
                  Reason: {failedItem.error_message || "Server rejected write"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                onClick={async () => {
                  failedItem.status = "pending";
                  failedItem.retries = 0;
                  await syncOfflineQueue(supabase);
                  refreshQueue();
                }}
                className="bg-rose-800 hover:bg-rose-700 text-rose-100 text-[11px] h-7 px-2"
              >
                Retry
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await removeQueuedDisposition(failedItem.id);
                  refreshQueue();
                }}
                className="text-zinc-400 hover:text-rose-300 h-7 px-1.5"
                title="Discard failed item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
