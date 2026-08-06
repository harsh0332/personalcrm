"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { LeadCallView, ActiveLeadCallData } from "@/components/lead-call-view";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Upload,
  RefreshCw,
  Sparkles,
  ArrowRight,
  UserCheck,
} from "lucide-react";
import Link from "next/link";

interface FollowupQueueItem {
  followupId: string;
  dueAt: string;
  reason: string;
  lead: ActiveLeadCallData;
}

interface NewLeadQueueItem {
  lead: ActiveLeadCallData;
}

export default function TodayPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Header 3 Numbers
  const [dueTodayCount, setDueTodayCount] = useState<number>(0);
  const [overdueCount, setOverdueCount] = useState<number>(0);
  const [calledTodayCount, setCalledTodayCount] = useState<number>(0);

  // Queue Sections
  const [overdueItems, setOverdueItems] = useState<FollowupQueueItem[]>([]);
  const [dueTodayItems, setDueTodayItems] = useState<FollowupQueueItem[]>([]);
  const [newLeadItems, setNewLeadItems] = useState<NewLeadQueueItem[]>([]);
  const [comingUpItems, setComingUpItems] = useState<FollowupQueueItem[]>([]);

  const [comingUpExpanded, setComingUpExpanded] = useState<boolean>(false);
  const [excludedCount, setExcludedCount] = useState<number>(0);

  // Active Calling
  const [activeLead, setActiveLead] = useState<ActiveLeadCallData | null>(null);
  const [activeQueueList, setActiveQueueList] = useState<ActiveLeadCallData[]>([]);
  const [activeLeadIndex, setActiveLeadIndex] = useState<number>(0);

  // Snooze UI state
  const [snoozingId, setSnoozingId] = useState<string | null>(null);

  const supabase = createClient();

  const fetchTodayData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).toISOString();

      // 1. Header Count: Called Today (kind = 'call', occurred_at >= startOfToday)
      const { count: calledCount, error: actErr } = await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("kind", "call")
        .gte("occurred_at", startOfToday);

      if (!actErr) {
        setCalledTodayCount(calledCount || 0);
      }

      // 2. Fetch Pending Follow-ups (done_at IS NULL)
      const { data: rawFollowups, error: fllwErr } = await supabase
        .from("followups")
        .select(`
          id,
          due_at,
          reason,
          lead:leads (
            id, cid, name, phone, phone_e164, area, category, tier,
            rating, review_count, demand_score, status, do_not_call,
            attempts, area_source
          )
        `)
        .is("done_at", null);

      if (fllwErr) {
        setFetchError(`Error fetching followups: ${fllwErr.message}`);
        setLoading(false);
        return;
      }

      const overdueList: FollowupQueueItem[] = [];
      const todayList: FollowupQueueItem[] = [];
      const comingUpList: FollowupQueueItem[] = [];

      (rawFollowups || []).forEach((item: any) => {
        const lead = item.lead as unknown as ActiveLeadCallData;
        if (!lead) return;

        // Skip excluded leads (DNC, lost, invalid, won, parked)
        if (
          lead.do_not_call ||
          ["lost", "invalid", "won", "parked"].includes(lead.status)
        ) {
          return;
        }

        const qItem: FollowupQueueItem = {
          followupId: item.id,
          dueAt: item.due_at,
          reason: item.reason || `Followup scheduled`,
          lead,
        };

        if (item.due_at < startOfToday) {
          overdueList.push(qItem);
        } else if (item.due_at >= startOfToday && item.due_at < endOfToday) {
          todayList.push(qItem);
        } else if (item.due_at >= endOfToday && item.due_at < in7Days) {
          comingUpList.push(qItem);
        }
      });

      // Sort Overdue (oldest due_at first)
      overdueList.sort((a, b) => (a.dueAt > b.dueAt ? 1 : -1));

      // Sort Due Today (earliest due_at first)
      todayList.sort((a, b) => (a.dueAt > b.dueAt ? 1 : -1));

      // Sort Coming Up (earliest due_at first)
      comingUpList.sort((a, b) => (a.dueAt > b.dueAt ? 1 : -1));

      setOverdueItems(overdueList);
      setDueTodayItems(todayList);
      setComingUpItems(comingUpList);

      setOverdueCount(overdueList.length);
      setDueTodayCount(todayList.length);

      // 3. Fetch New Leads (attempts = 0 or status = 'new')
      const { data: rawNewLeads, error: newErr } = await supabase
        .from("leads")
        .select(`
          id, cid, name, phone, phone_e164, area, category, tier,
          rating, review_count, demand_score, status, do_not_call,
          attempts, area_source
        `)
        .eq("do_not_call", false)
        .eq("status", "new")
        .eq("attempts", 0)
        .order("tier", { ascending: true, nullsFirst: false })
        .order("demand_score", { ascending: false, nullsFirst: false })
        .order("review_count", { ascending: false, nullsFirst: false })
        .limit(25);

      if (!newErr && rawNewLeads) {
        setNewLeadItems(
          rawNewLeads.map((l: any) => ({ lead: l as unknown as ActiveLeadCallData }))
        );
      }

      // 4. Fetch Excluded Leads Count
      const { count: exCount } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .or("do_not_call.eq.true,status.in.(lost,invalid,won,parked)");

      setExcludedCount(exCount || 0);
    } catch (err: any) {
      setFetchError(`Network error loading Today queue: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTodayData();
  }, [fetchTodayData]);

  // Combine queue leads for active calling sequence
  const combinedCallSequence = useMemo(() => {
    const sequence: ActiveLeadCallData[] = [];
    overdueItems.forEach((i) => sequence.push(i.lead));
    dueTodayItems.forEach((i) => sequence.push(i.lead));
    newLeadItems.forEach((i) => sequence.push(i.lead));
    return sequence;
  }, [overdueItems, dueTodayItems, newLeadItems]);

  const handleStartCall = (targetLead: ActiveLeadCallData) => {
    const idx = combinedCallSequence.findIndex((l) => l.id === targetLead.id);
    setActiveQueueList(combinedCallSequence);
    setActiveLeadIndex(idx >= 0 ? idx : 0);
    setActiveLead(targetLead);
  };

  // Snooze Action
  const handleSnooze = async (followupId: string, leadId: string, daysToSnooze: number) => {
    setSnoozingId(followupId);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + daysToSnooze);
      const newDueIso = newDueDate.toISOString();

      // 1. Update followups table
      const { error: fllwErr } = await supabase
        .from("followups")
        .update({ due_at: newDueIso })
        .eq("id", followupId);

      if (fllwErr) throw fllwErr;

      // 2. Update leads table
      await supabase
        .from("leads")
        .update({ next_action_at: newDueIso })
        .eq("id", leadId);

      // 3. Write note activity
      await supabase.from("activities").insert({
        owner: user?.id,
        lead_id: leadId,
        kind: "note",
        disposition: "snoozed",
        note: `Snoozed follow-up by ${daysToSnooze} day(s) to ${newDueIso.slice(0, 10)}`,
        occurred_at: new Date().toISOString(),
        performed_by: user?.id,
      });

      // Refresh Today Queue
      fetchTodayData();
    } catch (err: any) {
      alert(`Failed to snooze: ${err.message}`);
    } finally {
      setSnoozingId(null);
    }
  };

  const getDueRelativeText = (dueAtStr: string) => {
    const due = new Date(dueAtStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

    const diffTime = dueDay.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    if (diffDays < 0) {
      const positiveDays = Math.abs(diffDays);
      return positiveDays === 1 ? "1 day late" : `${positiveDays} days late`;
    } else if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Tomorrow";
    } else {
      return `In ${diffDays} days`;
    }
  };

  const isAllCaughtUp =
    !loading &&
    overdueItems.length === 0 &&
    dueTodayItems.length === 0 &&
    newLeadItems.length === 0;

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 pb-20 text-zinc-100">
      {/* 5. THE HEADER: THREE NUMBERS ONLY */}
      <div className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h1 className="text-sm font-bold text-zinc-50 tracking-tight">Today Queue</h1>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1">
              <span className="text-zinc-500">Due Today:</span>
              <span className="font-bold text-emerald-400">{dueTodayCount}</span>
            </div>
            <span className="text-zinc-700">•</span>
            <div className="flex items-center gap-1">
              <span className="text-zinc-500">Overdue:</span>
              <span className={`font-bold ${overdueCount > 0 ? "text-rose-400" : "text-zinc-400"}`}>
                {overdueCount}
              </span>
            </div>
            <span className="text-zinc-700">•</span>
            <div className="flex items-center gap-1">
              <span className="text-zinc-500">Called Today:</span>
              <span className="font-bold text-sky-400">{calledTodayCount}</span>
            </div>
          </div>
        </div>

        {/* DASHBOARD ACCESS LINK BANNER */}
        <div className="max-w-md mx-auto mt-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
          <span className="text-[11px] text-zinc-400 font-medium">Session & Funnel Stats</span>
          <Link
            href="/stats"
            className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
          >
            📊 View Full Dashboard & Analytics →
          </Link>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-5">
        {fetchError ? (
          <div className="py-12 px-4 rounded-xl border border-rose-800/80 bg-rose-950/40 text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-rose-200">Failed to load Today queue</h3>
              <p className="text-xs text-rose-400 font-mono leading-relaxed">{fetchError}</p>
            </div>
            <Button
              onClick={fetchTodayData}
              className="bg-rose-800 hover:bg-rose-700 text-zinc-100 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Loading
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <Skeleton className="h-4 w-2/3 bg-zinc-800" />
                <Skeleton className="h-3 w-1/2 bg-zinc-800" />
                <Skeleton className="h-8 w-full bg-zinc-800 rounded-lg" />
              </div>
            ))}
          </div>
        ) : isAllCaughtUp ? (
          /* 6. EMPTY STATE */
          <div className="py-16 text-center space-y-4">
            <div className="p-4 bg-emerald-950/60 border border-emerald-800/80 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-zinc-100">All caught up for today!</h2>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                No pending follow-ups or fresh leads remaining in your call queue.
              </p>
            </div>
            <Link href="/import">
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs">
                <Upload className="w-4 h-4 mr-1.5" /> Import New Scraper CSV
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* SECTION 2A: OVERDUE */}
            {overdueItems.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Overdue ({overdueItems.length})
                  </h2>
                  <span className="text-[10px] text-zinc-500">Oldest first</span>
                </div>

                <div className="space-y-2">
                  {overdueItems.map((item) => (
                    <QueueRowCard
                      key={item.followupId}
                      lead={item.lead}
                      reason={item.reason}
                      relativeTimeText={getDueRelativeText(item.dueAt)}
                      isOverdue={true}
                      onCall={() => handleStartCall(item.lead)}
                      onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                      snoozing={snoozingId === item.followupId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 2B: DUE TODAY */}
            {dueTodayItems.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Due Today ({dueTodayItems.length})
                  </h2>
                  <span className="text-[10px] text-zinc-500">Earliest first</span>
                </div>

                <div className="space-y-2">
                  {dueTodayItems.map((item) => (
                    <QueueRowCard
                      key={item.followupId}
                      lead={item.lead}
                      reason={item.reason}
                      relativeTimeText={getDueRelativeText(item.dueAt)}
                      isOverdue={false}
                      onCall={() => handleStartCall(item.lead)}
                      onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                      snoozing={snoozingId === item.followupId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 2C: NEW LEADS */}
            {newLeadItems.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Fresh Uncalled Leads ({newLeadItems.length})
                  </h2>
                  <span className="text-[10px] text-zinc-500">Best-first order</span>
                </div>

                <div className="space-y-2">
                  {newLeadItems.map((item) => (
                    <QueueRowCard
                      key={item.lead.id}
                      lead={item.lead}
                      reason={`Tier ${item.lead.tier || "U"} • ${item.lead.category || "Uncategorized"}`}
                      relativeTimeText="Never called"
                      isOverdue={false}
                      onCall={() => handleStartCall(item.lead)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 2D: COMING UP (COLLAPSED BY DEFAULT) */}
            {comingUpItems.length > 0 && (
              <div className="pt-2 border-t border-zinc-900 space-y-2">
                <button
                  onClick={() => setComingUpExpanded(!comingUpExpanded)}
                  className="w-full py-2 px-3 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between text-xs text-zinc-400"
                >
                  <span className="font-semibold text-zinc-300">
                    Coming Up Next 7 Days ({comingUpItems.length})
                  </span>
                  {comingUpExpanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </button>

                {comingUpExpanded && (
                  <div className="space-y-2 pt-1">
                    {comingUpItems.map((item) => (
                      <QueueRowCard
                        key={item.followupId}
                        lead={item.lead}
                        reason={item.reason}
                        relativeTimeText={getDueRelativeText(item.dueAt)}
                        isOverdue={false}
                        onCall={() => handleStartCall(item.lead)}
                        onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                        snoozing={snoozingId === item.followupId}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. EXCLUDED COUNT INFO LINE */}
            {excludedCount > 0 && (
              <div className="pt-4 text-center">
                <p className="text-[11px] text-zinc-500 font-mono">
                  {excludedCount} leads excluded (lost, won, parked, do-not-call)
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACTIVE CALL SCREEN VIEW */}
      {activeLead && (
        <LeadCallView
          lead={activeLead}
          onClose={() => {
            setActiveLead(null);
            fetchTodayData();
          }}
          currentIndex={activeLeadIndex + 1}
          totalInQueue={activeQueueList.length}
          onNextLead={() => {
            if (activeLeadIndex + 1 < activeQueueList.length) {
              const nextIdx = activeLeadIndex + 1;
              setActiveLeadIndex(nextIdx);
              setActiveLead(activeQueueList[nextIdx]);
            }
          }}
          onPrevLead={() => {
            if (activeLeadIndex - 1 >= 0) {
              const prevIdx = activeLeadIndex - 1;
              setActiveLeadIndex(prevIdx);
              setActiveLead(activeQueueList[prevIdx]);
            }
          }}
        />
      )}
    </main>
  );
}

// Queue Row Component
interface QueueRowCardProps {
  lead: ActiveLeadCallData;
  reason: string;
  relativeTimeText: string;
  isOverdue: boolean;
  onCall: () => void;
  onSnooze?: (days: number) => void;
  snoozing?: boolean;
}

function QueueRowCard({
  lead,
  reason,
  relativeTimeText,
  isOverdue,
  onCall,
  onSnooze,
  snoozing,
}: QueueRowCardProps) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState<boolean>(false);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 transition-all hover:border-zinc-700 shadow-sm">
      {/* Top Row: Name & Due Pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold font-mono rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
              {lead.tier || "U"}
            </span>
            <h3 className="text-sm font-bold text-zinc-100 truncate">{lead.name}</h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1 truncate leading-tight">{reason}</p>
        </div>

        <span
          className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded-full border shrink-0 ${
            isOverdue
              ? "bg-rose-950/80 text-rose-300 border-rose-800/80"
              : relativeTimeText === "Today"
              ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/80"
              : "bg-zinc-800 text-zinc-400 border-zinc-700"
          }`}
        >
          {relativeTimeText}
        </span>
      </div>

      {/* Action Buttons: Call & Snooze */}
      <div className="flex gap-2 pt-1 border-t border-zinc-800/80">
        <Button
          onClick={onCall}
          className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-zinc-950 font-bold text-xs rounded-lg flex items-center justify-center space-x-1.5"
        >
          <Phone className="w-3.5 h-3.5 fill-zinc-950" />
          <span>CALL</span>
        </Button>

        {onSnooze && (
          <div className="relative">
            <Button
              variant="outline"
              disabled={snoozing}
              onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
              className="h-9 px-3 border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 text-xs rounded-lg font-medium"
            >
              {snoozing ? "Snoozing..." : "Snooze"}
            </Button>

            {showSnoozeMenu && (
              <div className="absolute right-0 bottom-10 z-50 bg-zinc-950 border border-zinc-800 rounded-xl p-1.5 shadow-xl space-y-1 w-32 animate-in fade-in duration-100">
                <button
                  onClick={() => {
                    setShowSnoozeMenu(false);
                    onSnooze(1);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg font-medium"
                >
                  +1 Day
                </button>
                <button
                  onClick={() => {
                    setShowSnoozeMenu(false);
                    onSnooze(7);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg font-medium"
                >
                  +1 Week
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
