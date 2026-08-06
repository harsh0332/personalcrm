"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatRateWithThreshold,
  getConnectRateWarning,
} from "@/lib/rate-utils";
import { KNOWN_GAP_CATEGORIES } from "@/lib/import-utils";
import { LeadCallView, ActiveLeadCallData } from "@/components/lead-call-view";
import { DatabaseConnectionAlert } from "@/components/database-connection-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Phone,
  PhoneCall,
  Clock,
  Calendar,
  AlertTriangle,
  Flame,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Users,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Filter,
  Layers,
} from "lucide-react";
import Link from "next/link";

type TimeRangeOption = "today" | "7d" | "30d" | "all";

interface ActionListItem {
  id: string;
  name: string;
  phone: string | null;
  phone_e164: string | null;
  reasonOrLabel: string;
  status: string;
  tier: string | null;
  area: string | null;
  category: string | null;
  leadObj: ActiveLeadCallData;
}

interface CampaignCardData {
  name: string;
  totalLeads: number;
  calledLeads: number;
  uncalledLeads: number;
  connected: number;
  interested: number;
  won: number;
}

export default function DashboardLandingPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("all");
  const [selectedCallerId, setSelectedCallerId] = useState<string | null>(null);

  // Campaign Filter State
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");

  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Yesterday Summary Stats
  const [yesterdayStats, setYesterdayStats] = useState({
    dialled: 0,
    connected: 0,
    interested: 0,
    won: 0,
  });

  // Today Queue Summary Stats
  const [todaySummaryStats, setTodaySummaryStats] = useState({
    overdueCount: 0,
    dueTodayCount: 0,
    uncalledLeadsCount: 0,
  });

  // Campaign Cards Data
  const [campaignCards, setCampaignCards] = useState<CampaignCardData[]>([]);

  // Detailed Funnel Stats Data
  const [statsData, setStatsData] = useState<any>(null);

  // Backup Tracker State
  const [lastBackupDaysAgo, setLastBackupDaysAgo] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const lastBackupStr = window.localStorage.getItem("calldesk_last_full_backup_at");
      if (!lastBackupStr) {
        setLastBackupDaysAgo(999);
      } else {
        const lastBackupDate = new Date(lastBackupStr);
        const diffMs = Date.now() - lastBackupDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 3600 * 24));
        setLastBackupDaysAgo(diffDays);
      }
    }
  }, []);

  // Action Lists
  const [overdueList, setOverdueList] = useState<ActionListItem[]>([]);
  const [dueTomorrowList, setDueTomorrowList] = useState<ActionListItem[]>([]);
  const [goingColdList, setGoingColdList] = useState<ActionListItem[]>([]);
  const [pendingQuotesList, setPendingQuotesList] = useState<ActionListItem[]>([]);
  const [wonThisMonthList, setWonThisMonthList] = useState<ActionListItem[]>([]);

  // Active Calling sequence
  const [activeCallLead, setActiveCallLead] = useState<ActiveLeadCallData | null>(null);

  const supabase = createClient();

  // 1. Fetch Distinct Campaigns
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

  const getTimeRangeBounds = useCallback((range: TimeRangeOption) => {
    const now = new Date();
    if (range === "today") {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { startTime: startOfToday, endTime: null };
    } else if (range === "7d") {
      const start7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      return { startTime: start7d, endTime: null };
    } else if (range === "30d") {
      const start30d = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
      return { startTime: start30d, endTime: null };
    }
    return { startTime: null, endTime: null };
  }, []);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const endOfYesterday = startOfToday;
      const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).toISOString();

      // -------------------------------------------------------------
      // 1. YESTERDAY'S PERFORMANCE STATS
      // -------------------------------------------------------------
      const { data: yestActs } = await supabase
        .from("activities")
        .select("disposition")
        .eq("kind", "call")
        .gte("occurred_at", startOfYesterday)
        .lt("occurred_at", endOfYesterday);

      if (yestActs) {
        const dialled = yestActs.length;
        const connected = yestActs.filter((a) => !["no_answer", "wrong_number"].includes(a.disposition)).length;
        const interested = yestActs.filter((a) => a.disposition === "interested").length;
        const won = yestActs.filter((a) => a.disposition === "converted").length;
        setYesterdayStats({ dialled, connected, interested, won });
      }

      // -------------------------------------------------------------
      // 2. TODAY'S QUEUE SUMMARY STATS
      // -------------------------------------------------------------
      const { data: rawFollowups } = await supabase
        .from("followups")
        .select("id, due_at, lead:leads(campaign, status, do_not_call)")
        .is("done_at", null);

      let ovCount = 0;
      let tdCount = 0;
      (rawFollowups || []).forEach((f: any) => {
        const lead = f.lead;
        if (!lead || lead.do_not_call || ["lost", "invalid", "won", "parked"].includes(lead.status)) return;
        if (selectedCampaign !== "all" && lead.campaign !== selectedCampaign) return;

        if (f.due_at < startOfToday) ovCount++;
        else if (f.due_at >= startOfToday && f.due_at < endOfToday) tdCount++;
      });

      let uncalledQuery = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("do_not_call", false)
        .eq("status", "new")
        .eq("attempts", 0);

      if (selectedCampaign !== "all") {
        uncalledQuery = uncalledQuery.eq("campaign", selectedCampaign);
      }
      const { count: uncalledCount } = await uncalledQuery;

      setTodaySummaryStats({
        overdueCount: ovCount,
        dueTodayCount: tdCount,
        uncalledLeadsCount: uncalledCount || 0,
      });

      // -------------------------------------------------------------
      // 3. CAMPAIGN CARDS SUMMARY
      // -------------------------------------------------------------
      const { data: allLeads } = await supabase
        .from("leads")
        .select("id, campaign, attempts, status");

      const { data: allCalls } = await supabase
        .from("activities")
        .select("lead_id, disposition")
        .eq("kind", "call");

      if (allLeads) {
        const campaignMap: Record<string, CampaignCardData> = {};

        allLeads.forEach((lead) => {
          const cName = lead.campaign || "Indore Dentists";
          if (!campaignMap[cName]) {
            campaignMap[cName] = {
              name: cName,
              totalLeads: 0,
              calledLeads: 0,
              uncalledLeads: 0,
              connected: 0,
              interested: 0,
              won: 0,
            };
          }
          campaignMap[cName].totalLeads += 1;
          if (lead.attempts > 0 || lead.status !== "new") {
            campaignMap[cName].calledLeads += 1;
          } else {
            campaignMap[cName].uncalledLeads += 1;
          }
        });

        // Add call outcome counts per campaign
        if (allCalls) {
          allCalls.forEach((act) => {
            const matchLead = allLeads.find((l) => l.id === act.lead_id);
            if (matchLead) {
              const cName = matchLead.campaign || "Indore Dentists";
              if (campaignMap[cName]) {
                if (!["no_answer", "wrong_number"].includes(act.disposition)) {
                  campaignMap[cName].connected += 1;
                }
                if (act.disposition === "interested") campaignMap[cName].interested += 1;
                if (act.disposition === "converted") campaignMap[cName].won += 1;
              }
            }
          });
        }

        setCampaignCards(Object.values(campaignMap));
      }

      // -------------------------------------------------------------
      // 4. MAIN DASHBOARD ANALYTICS (RPC)
      // -------------------------------------------------------------
      const bounds = getTimeRangeBounds(timeRange);
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_dashboard_stats", {
        p_start_time: bounds.startTime,
        p_end_time: bounds.endTime,
        p_caller_id: selectedCallerId,
      });

      if (rpcErr) {
        setFetchError(`Error fetching dashboard stats: ${rpcErr.message}`);
        setLoading(false);
        return;
      }

      setStatsData(rpcData);

      // -------------------------------------------------------------
      // 5. ACTION LISTS
      // -------------------------------------------------------------
      const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
      const startOf7dAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: overdueData } = await supabase
        .from("followups")
        .select("id, due_at, reason, lead:leads(*)")
        .is("done_at", null)
        .lt("due_at", startOfToday)
        .order("due_at", { ascending: true })
        .limit(5);

      const { data: tomorrowData } = await supabase
        .from("followups")
        .select("id, due_at, reason, lead:leads(*)")
        .is("done_at", null)
        .gte("due_at", startOfTomorrow)
        .lt("due_at", endOfTomorrow)
        .order("due_at", { ascending: true })
        .limit(5);

      let coldQuery = supabase
        .from("leads")
        .select("*")
        .eq("status", "interested")
        .lt("last_called_at", startOf7dAgo);

      let quotesQuery = supabase
        .from("leads")
        .select("*")
        .eq("status", "quote_sent");

      if (selectedCampaign !== "all") {
        coldQuery = coldQuery.eq("campaign", selectedCampaign);
        quotesQuery = quotesQuery.eq("campaign", selectedCampaign);
      }

      const { data: coldData } = await coldQuery.order("last_called_at", { ascending: true }).limit(5);
      const { data: quotesData } = await quotesQuery.order("last_called_at", { ascending: false }).limit(5);

      const { data: wonActivities } = await supabase
        .from("activities")
        .select("lead_id, occurred_at")
        .eq("kind", "call")
        .eq("disposition", "converted")
        .gte("occurred_at", startOfMonth)
        .order("occurred_at", { ascending: false });

      let wonData: any[] = [];
      if (wonActivities && wonActivities.length > 0) {
        const wonLeadIds = Array.from(new Set(wonActivities.map((a: any) => a.lead_id)));
        let wonLeadsQuery = supabase.from("leads").select("*").in("id", wonLeadIds);
        if (selectedCampaign !== "all") {
          wonLeadsQuery = wonLeadsQuery.eq("campaign", selectedCampaign);
        }
        const { data: fetchedWonLeads } = await wonLeadsQuery;
        wonData = fetchedWonLeads || [];
      }

      setOverdueList(
        (overdueData || [])
          .filter((f: any) => f.lead && (selectedCampaign === "all" || f.lead.campaign === selectedCampaign))
          .map((f: any) => ({
            id: f.id,
            name: f.lead.name,
            phone: f.lead.phone,
            phone_e164: f.lead.phone_e164,
            reasonOrLabel: f.reason || "Overdue follow-up",
            status: f.lead.status,
            tier: f.lead.tier,
            area: f.lead.area,
            category: f.lead.category,
            leadObj: f.lead as unknown as ActiveLeadCallData,
          }))
      );

      setDueTomorrowList(
        (tomorrowData || [])
          .filter((f: any) => f.lead && (selectedCampaign === "all" || f.lead.campaign === selectedCampaign))
          .map((f: any) => ({
            id: f.id,
            name: f.lead.name,
            phone: f.lead.phone,
            phone_e164: f.lead.phone_e164,
            reasonOrLabel: f.reason || "Due tomorrow",
            status: f.lead.status,
            tier: f.lead.tier,
            area: f.lead.area,
            category: f.lead.category,
            leadObj: f.lead as unknown as ActiveLeadCallData,
          }))
      );

      setGoingColdList(
        (coldData || []).map((l: any) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          phone_e164: l.phone_e164,
          reasonOrLabel: "Interested but no contact in 7+ days",
          status: l.status,
          tier: l.tier,
          area: l.area,
          category: l.category,
          leadObj: l as unknown as ActiveLeadCallData,
        }))
      );

      setPendingQuotesList(
        (quotesData || []).map((l: any) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          phone_e164: l.phone_e164,
          reasonOrLabel: "Quote sent — awaiting response",
          status: l.status,
          tier: l.tier,
          area: l.area,
          category: l.category,
          leadObj: l as unknown as ActiveLeadCallData,
        }))
      );

      setWonThisMonthList(
        (wonData || []).map((l: any) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          phone_e164: l.phone_e164,
          reasonOrLabel: "Closed & Won this month",
          status: l.status,
          tier: l.tier,
          area: l.area,
          category: l.category,
          leadObj: l as unknown as ActiveLeadCallData,
        }))
      );
    } catch (err: any) {
      setFetchError(`Network error loading dashboard: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [timeRange, selectedCallerId, selectedCampaign, getTimeRangeBounds, supabase]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const dialled = statsData?.dialled || 0;
  const connected = statsData?.connected || 0;

  const connectRateResult = formatRateWithThreshold(connected, dialled);
  const connectRateWarning = getConnectRateWarning(connected, dialled);

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 pb-20 text-zinc-100 font-sans">
      {/* HEADER & CAMPAIGN SELECTOR */}
      <div className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-4 py-3 shadow-md space-y-2">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <h1 className="text-sm font-bold text-zinc-50 tracking-tight">CallDesk Dashboard</h1>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchDashboardData}
            className="p-1 h-7 text-zinc-400 hover:text-zinc-100"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* CAMPAIGN SELECTOR (Hidden if <= 1 campaign) */}
        {campaigns.length > 1 && (
          <div className="max-w-md mx-auto flex items-center justify-between pt-1 border-t border-zinc-900">
            <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
              <Filter className="w-3 h-3 text-emerald-400" /> Campaign:
            </span>
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-emerald-400 text-xs font-semibold rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Campaigns ({campaigns.length})</option>
              {campaigns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* MAIN DASHBOARD CONTENT */}
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-5">
        {fetchError ? (
          <DatabaseConnectionAlert errorMsg={fetchError} onRetry={fetchDashboardData} retrying={loading} />
        ) : loading ? (
          <div className="space-y-4 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <Skeleton className="h-4 w-1/3 bg-zinc-800" />
                <Skeleton className="h-8 w-full bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {/* ------------------------------------------------------------- */}
            {/* SECTION 1: TOP 0-SCROLLING SUMMARY & CALL QUEUE BUTTON        */}
            {/* ------------------------------------------------------------- */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4 shadow-xl">
              {/* Yesterday Summary */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> What Happened Yesterday
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Yesterday&apos;s Calls</span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="bg-zinc-950/90 p-2 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-medium">Calls</span>
                    <span className="text-sm font-bold font-mono text-zinc-100">{yesterdayStats.dialled}</span>
                  </div>
                  <div className="bg-zinc-950/90 p-2 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-medium">Connects</span>
                    <span className="text-sm font-bold font-mono text-emerald-400">{yesterdayStats.connected}</span>
                  </div>
                  <div className="bg-zinc-950/90 p-2 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-medium">Interested</span>
                    <span className="text-sm font-bold font-mono text-emerald-400">{yesterdayStats.interested}</span>
                  </div>
                  <div className="bg-zinc-950/90 p-2 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-medium">Won</span>
                    <span className="text-sm font-bold font-mono text-emerald-300">{yesterdayStats.won}</span>
                  </div>
                </div>
              </div>

              {/* Today Queue Summary */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> What Today Looks Like
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Today&apos;s Queue</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-zinc-950/90 p-2 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-medium">Overdue</span>
                    <span className={`text-sm font-bold font-mono ${todaySummaryStats.overdueCount > 0 ? "text-rose-400" : "text-zinc-400"}`}>
                      {todaySummaryStats.overdueCount}
                    </span>
                  </div>
                  <div className="bg-zinc-950/90 p-2 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-medium">Due Today</span>
                    <span className="text-sm font-bold font-mono text-emerald-400">{todaySummaryStats.dueTodayCount}</span>
                  </div>
                  <div className="bg-zinc-950/90 p-2 rounded-xl border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-medium">Fresh Uncalled</span>
                    <span className="text-sm font-bold font-mono text-sky-400">{todaySummaryStats.uncalledLeadsCount}</span>
                  </div>
                </div>
              </div>

              {/* PRIMARY ACTION BUTTON TO TODAY QUEUE */}
              <Link href="/today" className="block pt-1">
                <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs tracking-wide rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-transform active:scale-[0.98]">
                  <span>START CALLING TODAY QUEUE</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </Button>
              </Link>

              {/* BACKUP STATUS / OVERDUE WARNING BANNER */}
              {lastBackupDaysAgo !== null && (
                <div className="pt-1">
                  {lastBackupDaysAgo > 7 ? (
                    <div className="p-2.5 bg-amber-950/80 border border-amber-800 rounded-xl text-amber-200 text-xs flex items-center justify-between shadow-md">
                      <span className="font-semibold flex items-center gap-1.5 text-amber-300">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        Backup Overdue ({lastBackupDaysAgo === 999 ? "Never backed up" : `${lastBackupDaysAgo}d ago`})
                      </span>
                      <Link
                        href="/account"
                        className="px-2 py-1 bg-amber-800 hover:bg-amber-700 text-amber-100 font-bold text-[11px] rounded transition-colors"
                      >
                        Tap to Export →
                      </Link>
                    </div>
                  ) : (
                    <div className="text-[10px] text-zinc-500 font-mono text-center">
                      Last full backup: {lastBackupDaysAgo === 0 ? "Today" : `${lastBackupDaysAgo} day(s) ago`}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* SECTION 2: CAMPAIGN BREAKDOWN CARDS                           */}
            {/* ------------------------------------------------------------- */}
            {campaignCards.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Campaign Performance Batches
                  </h2>
                  <span className="text-[10px] text-zinc-500 font-mono">{campaignCards.length} Campaign(s)</span>
                </div>

                <div className="space-y-2.5">
                  {campaignCards.map((c) => {
                    const rateRes = formatRateWithThreshold(c.connected, c.calledLeads);

                    return (
                      <div
                        key={c.name}
                        className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                          <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 truncate">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            {c.name}
                          </h3>
                          <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                            {c.uncalledLeads} Uncalled Remaining
                          </span>
                        </div>

                        <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-mono">
                          <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                            <span className="text-zinc-500 block text-[9px]">Total</span>
                            <span className="font-bold text-zinc-200">{c.totalLeads}</span>
                          </div>
                          <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                            <span className="text-zinc-500 block text-[9px]">Called</span>
                            <span className="font-bold text-zinc-200">{c.calledLeads}</span>
                          </div>
                          <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                            <span className="text-zinc-500 block text-[9px]">Connected</span>
                            <span className="font-bold text-emerald-400">{c.connected}</span>
                          </div>
                          <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                            <span className="text-zinc-500 block text-[9px]">Interested</span>
                            <span className="font-bold text-emerald-400">{c.interested}</span>
                          </div>
                          <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                            <span className="text-zinc-500 block text-[9px]">Won</span>
                            <span className="font-bold text-emerald-300">{c.won}</span>
                          </div>
                        </div>

                        {c.calledLeads > 0 && (
                          <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-zinc-400">
                            <span>Connect Rate:</span>
                            <span className="font-bold text-emerald-400">{rateRes.displayString}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* SECTION 3: HIGH PRIORITY ACTION LISTS                         */}
            {/* ------------------------------------------------------------- */}
            <div className="space-y-3 pt-2 border-t border-zinc-900">
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" /> High Priority Action Lists
              </h2>

              <ActionListBlock
                title="Overdue Follow-ups"
                items={overdueList}
                badgeStyle="bg-rose-950 text-rose-300 border-rose-800"
                onSelectLead={(l) => setActiveCallLead(l)}
              />

              <ActionListBlock
                title="Due Tomorrow"
                items={dueTomorrowList}
                badgeStyle="bg-emerald-950 text-emerald-300 border-emerald-800"
                onSelectLead={(l) => setActiveCallLead(l)}
              />

              <ActionListBlock
                title="Going Cold (Interested 7+ Days)"
                items={goingColdList}
                badgeStyle="bg-amber-950 text-amber-300 border-amber-800"
                onSelectLead={(l) => setActiveCallLead(l)}
              />

              <ActionListBlock
                title="Pending Quotes Sent"
                items={pendingQuotesList}
                badgeStyle="bg-sky-950 text-sky-300 border-sky-800"
                onSelectLead={(l) => setActiveCallLead(l)}
              />

              <ActionListBlock
                title="Won This Month"
                items={wonThisMonthList}
                badgeStyle="bg-emerald-950 text-emerald-300 border-emerald-800"
                onSelectLead={(l) => setActiveCallLead(l)}
              />
            </div>

            {/* ------------------------------------------------------------- */}
            {/* SECTION 4: THE SALES FUNNEL & DETAILED ANALYTICS               */}
            {/* ------------------------------------------------------------- */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Overall Sales Calling Funnel
                </h3>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {statsData?.total_leads || 0} Total Leads
                </span>
              </div>

              {/* Funnel Metrics Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <FunnelBox label="Dialled Calls" value={statsData?.dialled || 0} color="zinc" />
                <FunnelBox
                  label="Connected (Human)"
                  value={statsData?.connected || 0}
                  rateText={connectRateResult.displayString}
                  color="emerald"
                />
                <FunnelBox
                  label="Conversations (≥30s)"
                  value={statsData?.conversations || 0}
                  color="sky"
                />
                <FunnelBox label="Interested" value={statsData?.interested || 0} color="emerald" />
                <FunnelBox label="Meeting Fixed" value={statsData?.meeting_fixed || 0} color="purple" />
                <FunnelBox label="Quote Sent" value={statsData?.quote_sent || 0} color="amber" />
                <FunnelBox label="Won Clients" value={statsData?.won || 0} color="emerald" highlight />
              </div>

              {/* Low Connect Rate Diagnostic Warning */}
              {connectRateWarning && (
                <div className="p-3 bg-amber-950/70 border border-amber-800 rounded-xl text-amber-300 text-xs flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <span className="leading-relaxed text-[11px] font-medium">
                    {connectRateWarning}
                  </span>
                </div>
              )}

              {/* Rule 0 Suppression Note */}
              {connectRateResult.note && (
                <p className="text-[10px] text-zinc-500 font-mono italic text-center">
                  Notice: {connectRateResult.note}
                </p>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* SECTION 5: HOURLY CONNECT RATE & BREAKDOWNS                   */}
            {/* ------------------------------------------------------------- */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Connect Rate By Hour (Local Time)
              </h3>

              {statsData?.hourly_stats && statsData.hourly_stats.length > 0 ? (
                <div className="space-y-1.5 text-xs font-mono">
                  {statsData.hourly_stats.map((h: any) => {
                    const formattedHour = `${String(h.hour).padStart(2, "0")}:00`;
                    const rateRes = formatRateWithThreshold(h.connected, h.dialled);

                    return (
                      <div
                        key={h.hour}
                        className="flex items-center justify-between p-2 bg-zinc-950 rounded-lg border border-zinc-800/80"
                      >
                        <span className="text-zinc-300 font-bold">{formattedHour}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-400 text-[11px]">
                            {h.connected} connected / {h.dialled} dialled
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rateRes.suppressed
                                ? "bg-zinc-800 text-zinc-400"
                                : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            }`}
                          >
                            {rateRes.displayString}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic">No hourly activity recorded yet.</p>
              )}
            </div>

            {/* BREAKDOWN TABLES */}
            <BreakdownTableBlock
              title="Conversion By Gap Reason"
              rows={statsData?.gap_stats || []}
              keyName="reason"
              totalFunnelDialled={statsData?.dialled || 0}
            />

            <BreakdownTableBlock
              title="Conversion By Review Count Band"
              rows={statsData?.review_stats || []}
              keyName="band"
            />
          </div>
        )}
      </div>

      {/* Active Call Screen View */}
      {activeCallLead && (
        <LeadCallView
          lead={activeCallLead}
          onClose={() => {
            setActiveCallLead(null);
            fetchDashboardData();
          }}
        />
      )}
    </main>
  );
}

// Action List Sub-Component
function ActionListBlock({
  title,
  items,
  badgeStyle,
  onSelectLead,
}: {
  title: string;
  items: ActionListItem[];
  badgeStyle: string;
  onSelectLead: (lead: ActiveLeadCallData) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <h4 className="text-xs font-bold text-zinc-200">{title}</h4>
        <span className="text-[10px] text-zinc-500 font-mono">{items.length} leads</span>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectLead(item.leadObj)}
            className="p-2.5 bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800/80 rounded-lg flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-zinc-100 truncate">{item.name}</span>
                {item.tier && (
                  <span className="px-1 py-0.2 text-[9px] font-mono font-bold bg-zinc-800 text-emerald-400 rounded">
                    {item.tier}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate">{item.reasonOrLabel}</p>
            </div>

            <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-[11px] px-2.5 shrink-0">
              <Phone className="w-3 h-3 fill-zinc-950 mr-1" /> Call
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Funnel Box Sub-Component
function FunnelBox({
  label,
  value,
  rateText,
  color,
  highlight,
}: {
  label: string;
  value: number;
  rateText?: string;
  color: "zinc" | "emerald" | "sky" | "purple" | "amber";
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-xl border ${
        highlight
          ? "bg-emerald-950/80 border-emerald-700 text-emerald-200"
          : "bg-zinc-950 border-zinc-800/90 text-zinc-200"
      }`}
    >
      <span className="text-[10px] text-zinc-400 uppercase font-semibold block truncate">
        {label}
      </span>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-lg font-extrabold font-mono">{value}</span>
        {rateText && <span className="text-[10px] font-mono text-emerald-400">{rateText}</span>}
      </div>
    </div>
  );
}

// Breakdown Table Sub-Component
function BreakdownTableBlock({
  title,
  rows,
  keyName,
  totalFunnelDialled,
}: {
  title: string;
  rows: any[];
  keyName: string;
  totalFunnelDialled?: number;
}) {
  if (!rows || rows.length === 0) return null;

  const sumDialled = rows.reduce((acc, r) => acc + (r.dialled || 0), 0);
  const isReconciliationMismatch =
    totalFunnelDialled !== undefined &&
    totalFunnelDialled > 0 &&
    sumDialled < totalFunnelDialled;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-bold uppercase tracking-wider text-zinc-300">{title}</h3>
        {totalFunnelDialled !== undefined && (
          <span className="text-[10px] text-zinc-500 font-mono">
            {rows.length} categories
          </span>
        )}
      </div>

      {isReconciliationMismatch && (
        <div className="p-2.5 bg-rose-950/80 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center space-x-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>⚠️ Mismatch Warning: Breakdown dialled count ({sumDialled}) differs from total funnel dialled ({totalFunnelDialled}).</span>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => {
          let keyVal = r[keyName] || "Unspecified";
          if (keyName === "reason" && keyVal !== "no gap reason recorded" && !KNOWN_GAP_CATEGORIES.has(keyVal.toLowerCase())) {
            keyVal = `${keyVal} (unrecognized)`;
          }
          const dialled = r.dialled || 0;
          const connected = r.connected || 0;
          const interested = r.interested || 0;
          const won = r.won || 0;

          const rateRes = formatRateWithThreshold(connected, dialled);

          return (
            <div key={i} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-1.5">
              <div className="flex items-center justify-between font-semibold text-zinc-200">
                <span className="truncate max-w-[200px]">{keyVal}</span>
                <span className="text-[11px] font-mono text-emerald-400">{rateRes.displayString}</span>
              </div>

              <div className="grid grid-cols-4 gap-1 text-[10px] text-zinc-400 font-mono pt-1 border-t border-zinc-800/60">
                <div>Dialled: <span className="text-zinc-200 font-bold">{dialled}</span></div>
                <div>Conn: <span className="text-zinc-200 font-bold">{connected}</span></div>
                <div>Int: <span className="text-zinc-200 font-bold">{interested}</span></div>
                <div>Won: <span className="text-zinc-200 font-bold">{won}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
