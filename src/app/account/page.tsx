"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LogOut,
  User,
  ShieldCheck,
  PhoneCall,
  Mail,
  Download,
  Database,
  Filter,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function downloadCsv(filename: string, csvContent: string) {
  // Prepend UTF-8 BOM (\uFEFF) so Excel on Mac and Windows opens Devanagari/Hindi names cleanly
  const bomCsv = "\uFEFF" + csvContent;
  const blob = new Blob([bomCsv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(cell: any): string {
  if (cell === null || cell === undefined) return '""';
  const str = String(cell).replace(/"/g, '""');
  return `"${str}"`;
}

export default function AccountPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  // Danger Zone Reset State
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // Export State
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [exportCampaign, setExportCampaign] = useState<string>("all");
  const [exportDateRange, setExportDateRange] = useState<string>("all");

  const [outcomesCount, setOutcomesCount] = useState<number | null>(null);
  const [preparingOutcomes, setPreparingOutcomes] = useState<boolean>(false);
  const [preparingBackup, setPreparingBackup] = useState<boolean>(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          router.replace("/login?message=expired");
          return;
        }
        setUserEmail(user.email || "Unknown User");
      } catch {
        router.replace("/login?message=expired");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router, supabase]);

  // Load distinct campaigns
  useEffect(() => {
    async function loadCampaigns() {
      const { data } = await supabase
        .from("leads")
        .select("campaign")
        .not("campaign", "is", null);

      if (data) {
        const unique = Array.from(new Set(data.map((r: any) => r.campaign).filter(Boolean))) as string[];
        setCampaigns(unique);
      }
    }
    loadCampaigns();
  }, [supabase]);

  // Calculate outcomes count when filters change
  const calculateOutcomesCount = useCallback(async () => {
    try {
      let query = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .or("attempts.gt.0,status.neq.new");

      if (exportCampaign !== "all") {
        query = query.eq("campaign", exportCampaign);
      }

      if (exportDateRange !== "all") {
        const now = new Date();
        let days = 0;
        if (exportDateRange === "today") days = 1;
        if (exportDateRange === "7d") days = 7;
        if (exportDateRange === "30d") days = 30;

        const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
        query = query.gte("last_called_at", cutoff);
      }

      const { count } = await query;
      setOutcomesCount(count || 0);
    } catch {
      setOutcomesCount(0);
    }
  }, [supabase, exportCampaign, exportDateRange]);

  useEffect(() => {
    calculateOutcomesCount();
  }, [calculateOutcomesCount]);

  // 1. EXPORT OUTCOMES BACK TO SCRAPER (LEADS-MAGNET)
  const handleExportOutcomes = async () => {
    setPreparingOutcomes(true);
    setExportMsg(null);

    try {
      let query = supabase
        .from("leads")
        .select("id, cid, name, phone, campaign, status, attempts, last_called_at")
        .or("attempts.gt.0,status.neq.new");

      if (exportCampaign !== "all") {
        query = query.eq("campaign", exportCampaign);
      }

      if (exportDateRange !== "all") {
        const now = new Date();
        let days = 0;
        if (exportDateRange === "today") days = 1;
        if (exportDateRange === "7d") days = 7;
        if (exportDateRange === "30d") days = 30;

        const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
        query = query.gte("last_called_at", cutoff);
      }

      const { data: leadsData, error: leadErr } = await query.order("last_called_at", { ascending: false });

      if (leadErr) throw leadErr;

      if (!leadsData || leadsData.length === 0) {
        setExportMsg("No leads match outcome export criteria (0 rows to export).");
        setPreparingOutcomes(false);
        return;
      }

      // Fetch most recent call activity per lead
      const leadIds = leadsData.map((l) => l.id);
      const { data: activitiesData } = await supabase
        .from("activities")
        .select("lead_id, disposition, note, occurred_at")
        .in("lead_id", leadIds)
        .eq("kind", "call")
        .order("occurred_at", { ascending: false });

      const recentDispMap: Record<string, string> = {};
      const recentNoteMap: Record<string, string> = {};
      (activitiesData || []).forEach((act) => {
        if (!recentDispMap[act.lead_id]) {
          recentDispMap[act.lead_id] = act.disposition;
        }
        if (!recentNoteMap[act.lead_id] && act.note) {
          recentNoteMap[act.lead_id] = act.note;
        }
      });

      // Build CSV Content
      const headers = [
        "cid",
        "name",
        "phone",
        "campaign",
        "status",
        "attempts",
        "last_called_at",
        "outcome",
        "notes",
      ];

      const csvRows = [headers.map((h) => `"${h}"`).join(",")];

      leadsData.forEach((lead) => {
        const row = [
          escapeCsvCell(lead.cid),
          escapeCsvCell(lead.name),
          escapeCsvCell(lead.phone),
          escapeCsvCell(lead.campaign || "Indore Dentists"),
          escapeCsvCell(lead.status),
          escapeCsvCell(lead.attempts),
          escapeCsvCell(lead.last_called_at || ""),
          escapeCsvCell(recentDispMap[lead.id] || lead.status),
          escapeCsvCell(recentNoteMap[lead.id] || ""),
        ];
        csvRows.push(row.join(","));
      });

      const filename = `calldesk_outcomes_${exportCampaign}_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCsv(filename, csvRows.join("\n"));
      setExportMsg(`Successfully exported ${leadsData.length} outcome row(s)!`);
    } catch (err: any) {
      setExportMsg(`Export failed: ${err.message}`);
    } finally {
      setPreparingOutcomes(false);
    }
  };

  // 2. EXPORT EVERYTHING (FULL BACKUP WITH LEADS, ACTIVITIES, AND FOLLOWUPS + UTF-8 BOM)
  const handleExportBackup = async () => {
    setPreparingBackup(true);
    setExportMsg(null);

    try {
      const { data: allLeads, error: lErr } = await supabase.from("leads").select("*");
      if (lErr) throw lErr;

      const { data: allActivities, error: aErr } = await supabase.from("activities").select("*");
      if (aErr) throw aErr;

      const { data: allFollowups, error: fErr } = await supabase.from("followups").select("*");
      if (fErr) throw fErr;

      const dateStr = new Date().toISOString().slice(0, 10);

      // 1. Leads Backup CSV
      const leadHeaders = [
        "id",
        "cid",
        "name",
        "phone",
        "campaign",
        "status",
        "attempts",
        "tier",
        "area",
        "rating",
        "review_count",
        "gap_reasons",
        "created_at",
        "last_called_at",
      ];
      const leadCsvRows = [leadHeaders.join(",")];
      (allLeads || []).forEach((l) => {
        leadCsvRows.push(
          [
            escapeCsvCell(l.id),
            escapeCsvCell(l.cid),
            escapeCsvCell(l.name),
            escapeCsvCell(l.phone),
            escapeCsvCell(l.campaign || "Indore Dentists"),
            escapeCsvCell(l.status),
            escapeCsvCell(l.attempts),
            escapeCsvCell(l.tier),
            escapeCsvCell(l.area),
            escapeCsvCell(l.rating),
            escapeCsvCell(l.review_count),
            escapeCsvCell(Array.isArray(l.gap_reasons) ? l.gap_reasons.join(";") : l.gap_reasons),
            escapeCsvCell(l.created_at),
            escapeCsvCell(l.last_called_at),
          ].join(",")
        );
      });

      downloadCsv(`calldesk_backup_leads_${dateStr}.csv`, leadCsvRows.join("\n"));

      // 2. Activities Backup CSV
      const actHeaders = [
        "id",
        "lead_id",
        "kind",
        "disposition",
        "duration_sec",
        "note",
        "occurred_at",
        "performed_by",
      ];
      const actCsvRows = [actHeaders.join(",")];
      (allActivities || []).forEach((a) => {
        actCsvRows.push(
          [
            escapeCsvCell(a.id),
            escapeCsvCell(a.lead_id),
            escapeCsvCell(a.kind),
            escapeCsvCell(a.disposition),
            escapeCsvCell(a.duration_sec),
            escapeCsvCell(a.note),
            escapeCsvCell(a.occurred_at),
            escapeCsvCell(a.performed_by),
          ].join(",")
        );
      });

      setTimeout(() => {
        downloadCsv(`calldesk_backup_activities_${dateStr}.csv`, actCsvRows.join("\n"));
      }, 400);

      // 3. Followups Backup CSV
      const fllwHeaders = ["id", "lead_id", "owner", "due_at", "reason", "done_at", "created_at"];
      const fllwCsvRows = [fllwHeaders.join(",")];
      (allFollowups || []).forEach((f) => {
        fllwCsvRows.push(
          [
            escapeCsvCell(f.id),
            escapeCsvCell(f.lead_id),
            escapeCsvCell(f.owner),
            escapeCsvCell(f.due_at),
            escapeCsvCell(f.reason),
            escapeCsvCell(f.done_at),
            escapeCsvCell(f.created_at),
          ].join(",")
        );
      });

      setTimeout(() => {
        downloadCsv(`calldesk_backup_followups_${dateStr}.csv`, fllwCsvRows.join("\n"));
      }, 800);

      // Save last backup timestamp in localStorage
      if (typeof window !== "undefined") {
        window.localStorage.setItem("calldesk_last_full_backup_at", new Date().toISOString());
      }

      setExportMsg(
        `Full Backup Triggered! Downloaded ${allLeads?.length || 0} leads, ${allActivities?.length || 0} activity logs, and ${allFollowups?.length || 0} follow-up commitments.`
      );
    } catch (err: any) {
      setExportMsg(`Backup failed: ${err.message}`);
    } finally {
      setPreparingBackup(false);
    }
  };

  // 3. RESET / WIPE ALL CRM DATA (DANGER ZONE)
  const handleResetCrmData = async () => {
    setResetting(true);
    setResetMsg(null);

    try {
      // 1. Delete followups
      await supabase.from("followups").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      // 2. Delete activities
      await supabase.from("activities").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      // 3. Delete imports
      await supabase.from("imports").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      // 4. Delete leads
      await supabase.from("leads").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      setResetMsg("✓ All leads, call logs, callbacks, and import records deleted. Database is now 100% clean and ready for a fresh upload!");
      setShowResetConfirm(false);
      calculateOutcomesCount();
    } catch (err: any) {
      setResetMsg(`Reset error: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
      router.replace("/login");
      setTimeout(() => {
        window.location.href = "/login";
      }, 100);
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 p-4 pb-24 text-zinc-100 max-w-md mx-auto w-full font-sans space-y-6">
      {/* HEADER */}
      <div className="border-b border-zinc-800 pb-3">
        <div className="flex items-center space-x-2">
          <User className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-bold text-zinc-50">Account & Export</h1>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 py-8">
          <div className="h-12 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
          <div className="h-12 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* USER INFO CARD */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-emerald-950 border border-emerald-800 rounded-full text-emerald-400">
                <User className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block">
                  Signed In Caller
                </span>
                <p className="text-sm font-bold text-zinc-100 truncate flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  {userEmail}
                </p>
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 space-y-1 font-mono">
              <div className="flex items-center justify-between">
                <span>Auth Provider:</span>
                <span className="text-emerald-400 font-bold">Supabase Auth</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Access Status:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Authenticated
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* EXPORT DATA SECTION (LEADS-MAGNET FEEDBACK LOOP)              */}
          {/* ------------------------------------------------------------- */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> Export Back to Scraper
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono">CSV Export</span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Export call outcomes so your scraper (<code className="text-emerald-400">leads-magnet</code>) skips contacted businesses next month.
            </p>

            {exportMsg && (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed text-zinc-200">{exportMsg}</span>
              </div>
            )}

            {/* EXPORT OUTCOMES FILTERS & ROW COUNT */}
            <div className="space-y-3 p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 font-medium uppercase block mb-1">
                    Campaign Filter
                  </label>
                  <select
                    value={exportCampaign}
                    onChange={(e) => setExportCampaign(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 focus:outline-none"
                  >
                    <option value="all">All Campaigns</option>
                    {campaigns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500 font-medium uppercase block mb-1">
                    Date Range Filter
                  </label>
                  <select
                    value={exportDateRange}
                    onChange={(e) => setExportDateRange(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 focus:outline-none"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Called Today</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                  </select>
                </div>
              </div>

              {/* Row Count Badge */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-900 font-mono text-[11px]">
                <span className="text-zinc-400">Export Row Count:</span>
                <span className="font-bold text-emerald-400">
                  {outcomesCount === null ? "..." : `${outcomesCount} lead(s) with outcomes`}
                </span>
              </div>

              <Button
                onClick={handleExportOutcomes}
                disabled={preparingOutcomes || outcomesCount === 0}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5"
              >
                {preparingOutcomes ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>EXPORT OUTCOMES CSV ({outcomesCount || 0} Rows)</span>
              </Button>
            </div>

            {/* FULL BACKUP BUTTON */}
            <div className="pt-2 border-t border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-300 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-sky-400" /> Full CRM Data Backup
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">Leads + Activities</span>
              </div>

              <Button
                onClick={handleExportBackup}
                disabled={preparingBackup}
                variant="outline"
                className="w-full h-10 border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5"
              >
                {preparingBackup ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 text-sky-400" />
                )}
                <span>EXPORT EVERYTHING (Full CSV Backup)</span>
              </Button>
            </div>
          </div>

          {/* DANGER ZONE: CLEAR ALL CRM DATA */}
          <div className="bg-zinc-900 border border-rose-900/60 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b border-rose-950 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Danger Zone: Clear CRM Data
              </h2>
              <span className="text-[10px] text-rose-400/80 font-mono">Permanent Reset</span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Use this when you want to wipe all old leads, call logs, and callbacks before uploading a brand new fresh CSV file.
            </p>

            {resetMsg && (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs flex items-start space-x-2 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{resetMsg}</span>
              </div>
            )}

            {showResetConfirm ? (
              <div className="p-3 bg-rose-950/80 border-2 border-rose-700 rounded-xl space-y-2.5 animate-in fade-in">
                <div className="flex items-start gap-2 text-xs text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="font-semibold">
                    Are you 100% sure? This will delete all leads, activities, callbacks, and import history!
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleResetCrmData}
                    disabled={resetting}
                    className="flex-1 h-9 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg"
                  >
                    {resetting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                    )}
                    Yes, Delete Everything
                  </Button>
                  <Button
                    onClick={() => setShowResetConfirm(false)}
                    variant="outline"
                    className="h-9 px-3 border-zinc-700 bg-zinc-900 text-zinc-300 text-xs rounded-lg font-medium"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setShowResetConfirm(true)}
                variant="outline"
                className="w-full h-10 border-rose-900/80 bg-rose-950/30 hover:bg-rose-950/80 text-rose-300 hover:text-rose-100 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>WIPE ALL CRM DATA & RESET DATABASE</span>
              </Button>
            )}
          </div>

          {/* APPLICATION INFO */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-zinc-300">
              <PhoneCall className="w-4 h-4 text-emerald-400" />
              <span>CallDesk CRM v0.1.0</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Mobile-first cold calling CRM for high-velocity phone sales operations.
            </p>
          </div>

          {/* SIGN OUT BUTTON */}
          <div className="pt-2">
            <Button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full h-14 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-extrabold text-base rounded-2xl flex items-center justify-center space-x-2 shadow-lg shadow-rose-950/40 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span>{signingOut ? "Signing Out..." : "Sign Out"}</span>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
