"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatRateWithThreshold,
  getConnectRateWarning,
} from "@/lib/rate-utils";
import { LeadCallView, ActiveLeadCallData } from "@/components/lead-call-view";
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
} from "lucide-react";
import Link from "next/link";

/**
 * FIXED DEFINITIONS IN CODE:
 *  - dialled      = an activities row of kind 'call'
 *  - connected    = a call whose disposition is NOT no_answer and NOT wrong_number (human answered)
 *  - conversation = connected call with duration_sec >= 30
 */

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

export default function StatsPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("today");
  const [selectedCallerId, setSelectedCallerId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [statsData, setStatsData] = useState<any>(null);

  // Action Lists
  const [overdueList, setOverdueList] = useState<ActionListItem[]>([]);
  const [dueTomorrowList, setDueTomorrowList] = useState<ActionListItem[]>([]);
  const [goingColdList, setGoingColdList] = useState<ActionListItem[]>([]);
  const [pendingQuotesList, setPendingQuotesList] = useState<ActionListItem[]>([]);
  const [wonThisMonthList, setWonThisMonthList] = useState<ActionListItem[]>([]);

  // Active Calling sequence
  const [activeCallLead, setActiveCallLead] = useState<ActiveLeadCallData | null>(null);

  const supabase = createClient();

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

  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const bounds = getTimeRangeBounds(timeRange);

      // 1. Fetch Aggregated Stats via PostgreSQL RPC (Server-Side)
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

      // 2. Fetch Action Lists (Read-only SELECT queries)
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
      const startOf7dAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // a) Overdue Follow-ups (due_at < startOfToday, done_at IS NULL)
      const { data: overdueData } = await supabase
        .from("followups")
        .select("id, due_at, reason, lead:leads(*)")
        .is("done_at", null)
        .lt("due_at", startOfToday)
        .order("due_at", { ascending: true })
        .limit(5);

      // b) Due Tomorrow (due_at >= startOfTomorrow AND < endOfTomorrow, done_at IS NULL)
      const { data: tomorrowData } = await supabase
        .from("followups")
        .select("id, due_at, reason, lead:leads(*)")
        .is("done_at", null)
        .gte("due_at", startOfTomorrow)
        .lt("due_at", endOfTomorrow)
        .order("due_at", { ascending: true })
        .limit(5);

      // c) Going Cold (status = 'interested', last_called_at < 7 days ago)
      const { data: coldData } = await supabase
        .from("leads")
        .select("*")
        .eq("status", "interested")
        .lt("last_called_at", startOf7dAgo)
        .order("last_called_at", { ascending: true })
        .limit(5);

      // d) Pending Quotes (status = 'quote_sent')
      const { data: quotesData } = await supabase
        .from("leads")
        .select("*")
        .eq("status", "quote_sent")
        .order("updated_at", { ascending: false })
        .limit(5);

      // e) Won This Month (status = 'won', updated_at >= startOfMonth)
      const { data: wonData } = await supabase
        .from("leads")
        .select("*")
        .eq("status", "won")
        .gte("updated_at", startOfMonth)
        .order("updated_at", { ascending: false })
        .limit(5);

      setOverdueList(
        (overdueData || [])
          .filter((f: any) => f.lead)
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
          .filter((f: any) => f.lead)
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
  }, [timeRange, selectedCallerId, getTimeRangeBounds, supabase]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const dialled = statsData?.dialled || 0;
  const connected = statsData?.connected || 0;

  const connectRateResult = formatRateWithThreshold(connected, dialled);
  const connectRateWarning = getConnectRateWarning(connected, dialled);

  const isNoCallsRecorded = !loading && dialled === 0;

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 pb-20 text-zinc-100">
      {/* HEADER & TIME RANGE CONTROLS */}
      <div className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <h1 className="text-sm font-bold text-zinc-50 tracking-tight">Performance & Insights</h1>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDashboardStats}
              className="p-1 h-7 text-zinc-400 hover:text-zinc-100"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Time Range Pills */}
          <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-xs font-medium">
            <button
              onClick={() => setTimeRange("today")}
              className={`flex-1 py-1 rounded-lg transition-all ${
                timeRange === "today"
                  ? "bg-emerald-600 text-zinc-950 font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeRange("7d")}
              className={`flex-1 py-1 rounded-lg transition-all ${
                timeRange === "7d"
                  ? "bg-emerald-600 text-zinc-950 font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange("30d")}
              className={`flex-1 py-1 rounded-lg transition-all ${
                timeRange === "30d"
                  ? "bg-emerald-600 text-zinc-950 font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange("all")}
              className={`flex-1 py-1 rounded-lg transition-all ${
                timeRange === "all"
                  ? "bg-emerald-600 text-zinc-950 font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* MAIN DASHBOARD CONTENT */}
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">
        {fetchError ? (
          <div className="py-12 px-4 rounded-xl border border-rose-800/80 bg-rose-950/40 text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-xs text-rose-300 font-mono">{fetchError}</p>
            <Button onClick={fetchDashboardStats} className="bg-rose-800 hover:bg-rose-700 text-xs">
              Retry Loading Stats
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-4 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <Skeleton className="h-4 w-1/3 bg-zinc-800" />
                <Skeleton className="h-8 w-full bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : isNoCallsRecorded ? (
          /* 8. HONEST EMPTY STATE */
          <div className="py-16 text-center space-y-4">
            <div className="p-4 bg-zinc-900 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-zinc-500">
              <PhoneCall className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-zinc-200">No calls recorded for this time range yet</h2>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                Start making calls from your Today queue or Lead list to build real conversion insights.
              </p>
            </div>
            <Link href="/">
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs">
                Go to Today Queue
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 6. ACTION LISTS SECTION (TOP PRIORITY ABOVE CHARTS) */}
            <div className="space-y-4">
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

            {/* 2. THE FUNNEL & 3. CONNECT RATE DIAGNOSTIC */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Sales Calling Funnel
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

            {/* 4. CONNECT RATE BY HOUR (LOCAL TIMEZONE) */}
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

            {/* 5A. WHICH GAP REASON CONVERTS */}
            <BreakdownTableBlock
              title="Conversion By Gap Reason"
              rows={statsData?.gap_stats || []}
              keyName="reason"
              totalFunnelDialled={statsData?.dialled || 0}
            />

            {/* 5B. WHICH REVIEW BAND CONVERTS */}
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
            fetchDashboardStats();
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

// Breakdown Table Sub-Component (Rule 0 Applied + Reconciliation Assertion)
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

  // Reconciliation Check: Ensure no calls are dropped or lost
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
          const keyVal = r[keyName] || "Unspecified";
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
