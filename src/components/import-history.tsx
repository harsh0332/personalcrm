"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ImportHistoryRow {
  id: string;
  filename: string;
  run_id: string | null;
  campaign: string;
  imported_at: string;
  total_rows: number;
  inserted: number;
  duplicates: number;
  duplicates_in_file: number;
  skipped: number;
  isUnrecorded?: boolean;
  source_run_id?: string;
  // Computed runtime stats
  leadsInDbCount?: number;
  calledLeadsCount?: number;
  uncalledLeadsCount?: number;
}

interface DeleteTarget {
  row: ImportHistoryRow;
  deletableLeadIds: string[];
  keptLeadIds: string[];
}

export function ImportHistory() {
  const [importsList, setImportsList] = useState<ImportHistoryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const supabase = createClient();

  const fetchImportHistory = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch recorded imports
      const { data: recordedImports } = await supabase
        .from("imports")
        .select("*")
        .order("imported_at", { ascending: false });

      // 2. Fetch all leads summary (id, source_run_id, campaign, attempts)
      const { data: allLeads } = await supabase
        .from("leads")
        .select("id, source_run_id, campaign, attempts");

      // 3. Fetch lead IDs that have call activity
      const { data: callActivities } = await supabase
        .from("activities")
        .select("lead_id");

      const leadsWithActivitySet = new Set((callActivities || []).map((a) => a.lead_id));

      const recordedRunIds = new Set<string>();
      const recordedFilenames = new Set<string>();
      (recordedImports || []).forEach((imp) => {
        if (imp.id) recordedRunIds.add(String(imp.id));
        if (imp.filename) recordedFilenames.add(String(imp.filename));
        if (imp.run_id) recordedRunIds.add(String(imp.run_id));
      });

      // Group leads by source_run_id
      const leadsBySourceRunId: Record<string, typeof allLeads> = {};
      (allLeads || []).forEach((lead) => {
        const sId = lead.source_run_id || "unrecorded_run";
        if (!leadsBySourceRunId[sId]) leadsBySourceRunId[sId] = [];
        leadsBySourceRunId[sId].push(lead);
      });

      const processedRows: ImportHistoryRow[] = [];

      // Process recorded imports
      (recordedImports || []).forEach((imp) => {
        // Find matching leads
        const matchingLeads = (allLeads || []).filter((l) => {
          if (!l.source_run_id) return false;
          return (
            l.source_run_id === imp.filename ||
            l.source_run_id === imp.run_id ||
            l.source_run_id === imp.id ||
            (imp.run_id && imp.run_id.includes(l.source_run_id))
          );
        });

        let calledC = 0;
        let uncalledC = 0;
        matchingLeads.forEach((l) => {
          if (l.attempts > 0 || leadsWithActivitySet.has(l.id)) {
            calledC++;
          } else {
            uncalledC++;
          }
        });

        // Extract campaign name from run_id if stored as "Campaign (file)"
        let campaignName = "Indore Dentists";
        if (imp.run_id && imp.run_id.includes(" (")) {
          campaignName = imp.run_id.split(" (")[0];
        } else if (matchingLeads.length > 0 && matchingLeads[0].campaign) {
          campaignName = matchingLeads[0].campaign;
        }

        processedRows.push({
          id: imp.id,
          filename: imp.filename || "import.csv",
          run_id: imp.run_id,
          campaign: campaignName,
          imported_at: imp.imported_at || imp.created_at || new Date().toISOString(),
          total_rows: imp.total_rows || 0,
          inserted: imp.inserted || 0,
          duplicates: imp.duplicates || 0,
          duplicates_in_file: imp.duplicates_in_file || 0,
          skipped: imp.skipped || 0,
          isUnrecorded: false,
          source_run_id: imp.filename || imp.run_id || imp.id,
          leadsInDbCount: matchingLeads.length,
          calledLeadsCount: calledC,
          uncalledLeadsCount: uncalledC,
        });
      });

      // Process unrecorded imports (leads whose source_run_id has no imports table row)
      Object.entries(leadsBySourceRunId).forEach(([sId, leadsGroup]) => {
        const isAlreadyRecorded = (recordedImports || []).some(
          (imp) =>
            imp.filename === sId ||
            imp.run_id === sId ||
            imp.id === sId ||
            (imp.run_id && imp.run_id.includes(sId))
        );

        if (!isAlreadyRecorded) {
          let calledC = 0;
          let uncalledC = 0;
          leadsGroup.forEach((l) => {
            if (l.attempts > 0 || leadsWithActivitySet.has(l.id)) {
              calledC++;
            } else {
              uncalledC++;
            }
          });

          const campaignName = leadsGroup[0]?.campaign || "Indore Dentists";

          processedRows.push({
            id: `unrecorded_${sId}`,
            filename: sId,
            run_id: sId,
            campaign: campaignName,
            imported_at: new Date().toISOString(),
            total_rows: leadsGroup.length,
            inserted: leadsGroup.length,
            duplicates: 0,
            duplicates_in_file: 0,
            skipped: 0,
            isUnrecorded: true,
            source_run_id: sId,
            leadsInDbCount: leadsGroup.length,
            calledLeadsCount: calledC,
            uncalledLeadsCount: uncalledC,
          });
        }
      });

      setImportsList(processedRows);
    } catch (err: any) {
      console.error("Failed to fetch import history:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchImportHistory();
  }, [fetchImportHistory]);

  const toggleRowExpanded = (rowId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  // Prepare deletion target & classify leads into deletable vs kept
  const prepareDeleteModal = async (row: ImportHistoryRow) => {
    setResultMessage(null);
    try {
      // Query leads matching this source_run_id or filename
      const { data: leadsData } = await supabase
        .from("leads")
        .select("id, attempts, source_run_id")
        .or(`source_run_id.eq.${row.source_run_id},source_run_id.eq.${row.filename}`);

      const targetLeadIds = (leadsData || []).map((l) => l.id);

      // Query activity logs
      let activityLeadIdsSet = new Set<string>();
      if (targetLeadIds.length > 0) {
        const { data: activitiesData } = await supabase
          .from("activities")
          .select("lead_id")
          .in("lead_id", targetLeadIds);

        activityLeadIdsSet = new Set((activitiesData || []).map((a) => a.lead_id));
      }

      const deletableLeadIds: string[] = [];
      const keptLeadIds: string[] = [];

      (leadsData || []).forEach((lead) => {
        if (lead.attempts > 0 || activityLeadIdsSet.has(lead.id)) {
          keptLeadIds.push(lead.id);
        } else {
          deletableLeadIds.push(lead.id);
        }
      });

      setDeleteTarget({
        row,
        deletableLeadIds,
        keptLeadIds,
      });
    } catch (err: any) {
      setResultMessage(`Failed to prepare delete modal: ${err.message}`);
    }
  };

  // Execute Import Deletion
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setResultMessage(null);

    const { row, deletableLeadIds, keptLeadIds } = deleteTarget;

    try {
      // 1. Get CRM Total Leads Before Delete
      const { count: totalBefore } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true });

      // 2. Delete deletable leads in batches
      const BATCH_SIZE = 50;
      const totalBatches = Math.ceil(deletableLeadIds.length / BATCH_SIZE);
      let deletedCount = 0;

      for (let b = 0; b < totalBatches; b++) {
        setDeleteProgress({ current: b + 1, total: totalBatches || 1 });
        const batchIds = deletableLeadIds.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

        const { error: delErr } = await supabase
          .from("leads")
          .delete()
          .in("id", batchIds);

        if (delErr) {
          throw new Error(`Batch delete failed: ${delErr.message}`);
        }
        deletedCount += batchIds.length;
      }

      // 3. Imports Table Row Handling
      let importRowRemoved = false;
      if (!row.isUnrecorded) {
        if (keptLeadIds.length === 0) {
          // All leads deleted -> delete imports table row
          await supabase.from("imports").delete().eq("id", row.id);
          importRowRemoved = true;
        } else {
          // Some leads kept -> update imports table row
          await supabase
            .from("imports")
            .update({ inserted: keptLeadIds.length })
            .eq("id", row.id);
        }
      }

      // 4. Get CRM Total Leads After Delete
      const { count: totalAfter } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true });

      // Construct Result Summary
      let msg = "";
      if (keptLeadIds.length > 0) {
        msg = `Deleted ${deletedCount} leads. Kept ${keptLeadIds.length} that have call history. (Imports record retained for remaining leads).`;
      } else {
        msg = `Deleted ${deletedCount} leads. ${importRowRemoved ? "Import record removed." : ""}`;
      }

      msg += ` CRM Total Leads: ${totalBefore || 0} → ${totalAfter || 0} (Decreased by ${deletedCount}).`;

      setResultMessage(msg);
      setDeleteTarget(null);
      fetchImportHistory();
    } catch (err: any) {
      setResultMessage(`Deletion partial failure: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t border-zinc-800">
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Import History & Batch Cleanup
          </h2>
          <span className="text-[10px] text-zinc-500 font-mono">
            Delete import batches safely without touching called leads
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={fetchImportHistory}
          className="text-zinc-400 hover:text-zinc-100 h-8 px-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* RESULT NOTIFICATION BANNER */}
      {resultMessage && (
        <div className="p-3 bg-zinc-900 border border-emerald-800 rounded-xl text-xs flex items-start space-x-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed text-zinc-100 font-mono text-[11px]">
            {resultMessage}
          </span>
        </div>
      )}

      {/* IMPORTS LIST */}
      {loading ? (
        <div className="space-y-2 py-4">
          <div className="h-14 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
          <div className="h-14 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
        </div>
      ) : importsList.length === 0 ? (
        <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl text-center text-xs text-zinc-500">
          No import history found in database.
        </div>
      ) : (
        <div className="space-y-2.5">
          {importsList.map((row) => {
            const isExpanded = expandedRows[row.id] || false;

            return (
              <div
                key={row.id}
                className={`bg-zinc-900 border rounded-xl overflow-hidden transition-all ${
                  row.isUnrecorded
                    ? "border-amber-800/80 bg-amber-950/20"
                    : "border-zinc-800"
                }`}
              >
                {/* ROW CARD HEADER */}
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center space-x-2">
                      {row.isUnrecorded ? (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-amber-950 text-amber-300 border border-amber-800 shrink-0">
                          ⚠️ Unrecorded Import
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                          Recorded
                        </span>
                      )}
                      <span className="text-xs font-bold text-zinc-100 truncate block">
                        {row.filename}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2">
                      <span className="text-emerald-400 font-semibold">{row.campaign}</span>
                      <span>•</span>
                      <span>{new Date(row.imported_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {/* Expand Toggle */}
                    <button
                      onClick={() => toggleRowExpanded(row.id)}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs flex items-center gap-1"
                    >
                      <span className="font-mono text-[10px] hidden sm:inline">Details</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {/* Delete Trigger Button */}
                    <Button
                      onClick={() => prepareDeleteModal(row)}
                      variant="destructive"
                      size="sm"
                      className="h-8 px-2.5 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>

                {/* 5 COUNTS SUMMARY SUB-BAR */}
                <div className="px-3 py-1.5 bg-zinc-950 border-t border-zinc-800/80 grid grid-cols-5 gap-1 text-center font-mono text-[10px]">
                  <div>
                    <span className="text-zinc-500 block">Total</span>
                    <span className="text-zinc-200 font-bold">{row.total_rows}</span>
                  </div>
                  <div>
                    <span className="text-emerald-500 block">Inserted</span>
                    <span className="text-emerald-300 font-bold">{row.inserted}</span>
                  </div>
                  <div>
                    <span className="text-amber-500 block">DB Dupes</span>
                    <span className="text-amber-300 font-bold">{row.duplicates}</span>
                  </div>
                  <div>
                    <span className="text-purple-500 block">File Dupes</span>
                    <span className="text-purple-300 font-bold">{row.duplicates_in_file}</span>
                  </div>
                  <div>
                    <span className="text-rose-500 block">Skipped</span>
                    <span className="text-rose-300 font-bold">{row.skipped}</span>
                  </div>
                </div>

                {/* EXPANDABLE RUNTIME LEADS STATUS */}
                {isExpanded && (
                  <div className="p-3 bg-zinc-950/80 border-t border-zinc-800/80 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Leads Currently in Database:</span>
                      <span className="font-bold text-zinc-100">{row.leadsInDbCount || 0} leads</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-zinc-900">
                      <div className="p-2 bg-emerald-950/40 rounded border border-emerald-900 text-emerald-300">
                        <span className="block text-[10px] text-emerald-400 font-sans">
                          🛡️ Kept (Has Call History)
                        </span>
                        <span className="text-sm font-bold">{row.calledLeadsCount || 0} leads</span>
                      </div>
                      <div className="p-2 bg-rose-950/40 rounded border border-rose-900 text-rose-300">
                        <span className="block text-[10px] text-rose-400 font-sans">
                          🔴 Deletable (Uncalled)
                        </span>
                        <span className="text-sm font-bold">{row.uncalledLeadsCount || 0} leads</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION DELETE MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border-2 border-rose-800/90 rounded-2xl p-5 max-w-md w-full space-y-4 text-zinc-100 shadow-2xl animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-rose-950 border border-rose-800 rounded-full text-rose-400 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-rose-200 uppercase tracking-wide">
                  Confirm Import Batch Deletion
                </h3>
                <span className="text-[11px] font-mono text-zinc-400 block truncate">
                  File: {deleteTarget.row.filename}
                </span>
              </div>
            </div>

            <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-xs space-y-2 leading-relaxed">
              <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                <span className="text-zinc-400">Target Campaign:</span>
                <span className="font-bold text-emerald-400 font-mono">{deleteTarget.row.campaign}</span>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-rose-300 font-semibold font-mono">
                  <span>🔴 Uncalled Leads to Delete:</span>
                  <span className="text-sm font-bold">{deleteTarget.deletableLeadIds.length}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-400 font-semibold font-mono">
                  <span>🛡️ Called Leads to Keep:</span>
                  <span className="text-sm font-bold">{deleteTarget.keptLeadIds.length}</span>
                </div>
              </div>

              {deleteTarget.keptLeadIds.length > 0 && (
                <div className="p-2 bg-amber-950/60 border border-amber-800 rounded text-[11px] text-amber-200 space-y-0.5">
                  <span className="font-bold block">Notice:</span>
                  <span>
                    {deleteTarget.keptLeadIds.length} lead(s) have call history and WILL NOT be deleted. The import record will remain stored for them.
                  </span>
                </div>
              )}

              <p className="text-[11px] text-zinc-400 italic pt-1 border-t border-zinc-800">
                ⚠️ Activities and follow-ups are never modified or deleted. This action cannot be undone.
              </p>
            </div>

            {/* MODAL ACTION BUTTONS */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="border-zinc-800 text-zinc-300 hover:text-zinc-100 h-11 text-xs"
              >
                Cancel
              </Button>

              <Button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="bg-rose-700 hover:bg-rose-600 text-white font-extrabold h-11 text-xs rounded-xl flex items-center justify-center space-x-1 shadow-lg shadow-rose-950/50"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>
                  {deleting
                    ? `Deleting (${deleteProgress.current}/${deleteProgress.total})...`
                    : `Delete ${deleteTarget.deletableLeadIds.length} Leads`}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
