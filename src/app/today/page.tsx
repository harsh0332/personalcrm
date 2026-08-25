"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  BarChart3,
  Filter,
  MapPin,
  ExternalLink,
  PhoneCall,
  History,
  ListTodo,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { getGmbUrl } from "@/lib/gmb-utils";

interface FollowupQueueItem {
  followupId: string;
  dueAt: string;
  reason: string;
  lead: ActiveLeadCallData;
}

interface NewLeadQueueItem {
  lead: ActiveLeadCallData;
}

interface ActivityLogItem {
  id: string;
  lead_id: string;
  disposition: string;
  duration_sec: number;
  note: string | null;
  occurred_at: string;
  lead: ActiveLeadCallData | null;
}

type TodayTab = "queue" | "callbacks" | "activity";

function TodayQueuePageContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TodayTab) || "queue";
  const [activeTab, setActiveTab] = useState<TodayTab>(initialTab);

  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Campaign Filter State
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");

  // Header 3 Numbers
  const [dueTodayCount, setDueTodayCount] = useState<number>(0);
  const [overdueCount, setOverdueCount] = useState<number>(0);
  const [calledTodayCount, setCalledTodayCount] = useState<number>(0);

  // Queue Sections
  const [overdueItems, setOverdueItems] = useState<FollowupQueueItem[]>([]);
  const [dueTodayItems, setDueTodayItems] = useState<FollowupQueueItem[]>([]);
  const [newLeadItems, setNewLeadItems] = useState<NewLeadQueueItem[]>([]);
  const [comingUpItems, setComingUpItems] = useState<FollowupQueueItem[]>([]);
  const [tomorrowItems, setTomorrowItems] = useState<FollowupQueueItem[]>([]);
  const [allCallbacks, setAllCallbacks] = useState<FollowupQueueItem[]>([]);

  // Activity Log
  const [todayActivities, setTodayActivities] = useState<ActivityLogItem[]>([]);

  const [comingUpExpanded, setComingUpExpanded] = useState<boolean>(false);
  const [excludedCount, setExcludedCount] = useState<number>(0);

  // Active Calling
  const [activeLead, setActiveLead] = useState<ActiveLeadCallData | null>(null);
  const [activeQueueList, setActiveQueueList] = useState<ActiveLeadCallData[]>([]);
  const [activeLeadIndex, setActiveLeadIndex] = useState<number>(0);

  // Snooze UI state
  const [snoozingId, setSnoozingId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab") as TodayTab;
    if (tabFromUrl && ["queue", "callbacks", "activity"].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  // Load distinct campaigns list
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

  const fetchTodayData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
      const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).toISOString();

      // 1. Fetch Today's Activities
      const { data: rawActivities, error: actErr } = await supabase
        .from("activities")
        .select(`
          id,
          lead_id,
          disposition,
          duration_sec,
          note,
          occurred_at,
          lead:leads (
            id, cid, name, phone, phone_e164, area, category, tier,
            rating, review_count, demand_score, status, do_not_call,
            attempts, area_source, campaign, next_action_at
          )
        `)
        .eq("kind", "call")
        .gte("occurred_at", startOfToday)
        .order("occurred_at", { ascending: false });

      if (!actErr && rawActivities) {
        const filteredActivities = (rawActivities || [])
          .filter((a: any) => {
            if (selectedCampaign === "all") return true;
            return a.lead?.campaign === selectedCampaign;
          })
          .map((a: any) => ({
            id: a.id,
            lead_id: a.lead_id,
            disposition: a.disposition,
            duration_sec: a.duration_sec || 0,
            note: a.note,
            occurred_at: a.occurred_at,
            lead: a.lead as unknown as ActiveLeadCallData,
          }));

        setTodayActivities(filteredActivities);
        setCalledTodayCount(filteredActivities.length);
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
            attempts, area_source, campaign, next_action_at
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
      const tomorrowList: FollowupQueueItem[] = [];
      const comingUpList: FollowupQueueItem[] = [];
      const allCallbacksList: FollowupQueueItem[] = [];

      (rawFollowups || []).forEach((item: any) => {
        const lead = item.lead as unknown as (ActiveLeadCallData & { campaign?: string });
        if (!lead) return;

        // Campaign Scope Filter
        if (selectedCampaign !== "all" && lead.campaign !== selectedCampaign) {
          return;
        }

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

        allCallbacksList.push(qItem);

        if (item.due_at < startOfToday) {
          overdueList.push(qItem);
        } else if (item.due_at >= startOfToday && item.due_at < endOfToday) {
          todayList.push(qItem);
        } else if (item.due_at >= startOfTomorrow && item.due_at < endOfTomorrow) {
          tomorrowList.push(qItem);
        } else if (item.due_at >= endOfTomorrow) {
          comingUpList.push(qItem);
        }
      });

      overdueList.sort((a, b) => (a.dueAt > b.dueAt ? 1 : -1));
      todayList.sort((a, b) => (a.dueAt > b.dueAt ? 1 : -1));
      tomorrowList.sort((a, b) => (a.dueAt > b.dueAt ? 1 : -1));
      comingUpList.sort((a, b) => (a.dueAt > b.dueAt ? 1 : -1));
      allCallbacksList.sort((a, b) => (a.dueAt > b.dueAt ? 1 : -1));

      setOverdueItems(overdueList);
      setDueTodayItems(todayList);
      setTomorrowItems(tomorrowList);
      setComingUpItems(comingUpList);
      setAllCallbacks(allCallbacksList);

      setOverdueCount(overdueList.length);
      setDueTodayCount(todayList.length);

      // 3. Fetch New Leads (attempts = 0 or status = 'new')
      let newLeadsQuery = supabase
        .from("leads")
        .select(`
          id, cid, name, phone, phone_e164, area, category, tier,
          rating, review_count, demand_score, status, do_not_call,
          attempts, area_source, campaign, next_action_at
        `)
        .eq("do_not_call", false)
        .eq("status", "new")
        .eq("attempts", 0);

      if (selectedCampaign !== "all") {
        newLeadsQuery = newLeadsQuery.eq("campaign", selectedCampaign);
      }

      const { data: rawNewLeads, error: newErr } = await newLeadsQuery
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
      let exQuery = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .or("do_not_call.eq.true,status.in.(lost,invalid,won,parked)");

      if (selectedCampaign !== "all") {
        exQuery = exQuery.eq("campaign", selectedCampaign);
      }

      const { count: exCount } = await exQuery;
      setExcludedCount(exCount || 0);
    } catch (err: any) {
      setFetchError(`Network error loading Today queue: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedCampaign]);

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

  const handleStartCall = (targetLead: ActiveLeadCallData, listToUse?: ActiveLeadCallData[]) => {
    const queue = listToUse || combinedCallSequence;
    const idx = queue.findIndex((l) => l.id === targetLead.id);
    setActiveQueueList(queue.length > 0 ? queue : [targetLead]);
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
      newDueDate.setHours(11, 0, 0, 0);
      const newDueIso = newDueDate.toISOString();

      await supabase
        .from("followups")
        .update({ due_at: newDueIso })
        .eq("id", followupId);

      await supabase
        .from("leads")
        .update({ next_action_at: newDueIso })
        .eq("id", leadId);

      await supabase.from("activities").insert({
        owner: user?.id,
        lead_id: leadId,
        kind: "note",
        disposition: "snoozed",
        note: `Snoozed follow-up by ${daysToSnooze} day(s) to ${newDueIso.slice(0, 10)}`,
        occurred_at: new Date().toISOString(),
        performed_by: user?.id,
      });

      fetchTodayData();
    } catch (err: any) {
      alert(`Failed to snooze: ${err.message}`);
    } finally {
      setSnoozingId(null);
    }
  };

  const formatScheduledTime = (isoString: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diffDays = Math.round((targetDay.getTime() - today.getTime()) / (1000 * 3600 * 24));

      if (diffDays < 0) {
        return `${Math.abs(diffDays)}d overdue (${timeStr})`;
      } else if (diffDays === 0) {
        return `Today at ${timeStr}`;
      } else if (diffDays === 1) {
        return `Tomorrow at ${timeStr}`;
      } else if (diffDays === 2) {
        return `Day After at ${timeStr}`;
      } else {
        return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${timeStr}`;
      }
    } catch {
      return isoString.slice(0, 16);
    }
  };

  const getDispositionBadgeStyle = (code: string) => {
    switch (code) {
      case "interested":
      case "meeting_fixed":
      case "converted":
        return "bg-emerald-950/90 text-emerald-300 border-emerald-700/90 font-bold";
      case "busy_callback":
      case "quote_sent":
        return "bg-sky-950/90 text-sky-300 border-sky-700/90 font-semibold";
      case "not_interested":
      case "already_has":
      case "wrong_number":
      case "do_not_call":
        return "bg-rose-950/80 text-rose-300 border-rose-800/80 font-medium";
      case "no_answer":
      default:
        return "bg-zinc-800 text-zinc-300 border-zinc-700";
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 pb-20 text-zinc-100 font-sans">
      {/* 1. STICKY TOP HEADER & 3-SEGMENT TABS */}
      <div className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-4 py-2.5 shadow-md space-y-2.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h1 className="text-sm font-bold text-zinc-50 tracking-tight">Today Center</h1>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1">
              <span className="text-zinc-500">Due:</span>
              <span className="font-bold text-emerald-400">{dueTodayCount}</span>
            </div>
            <span className="text-zinc-700">•</span>
            <div className="flex items-center gap-1">
              <span className="text-zinc-500">Late:</span>
              <span className={`font-bold ${overdueCount > 0 ? "text-rose-400" : "text-zinc-400"}`}>
                {overdueCount}
              </span>
            </div>
            <span className="text-zinc-700">•</span>
            <div className="flex items-center gap-1">
              <span className="text-zinc-500">Calls:</span>
              <span className="font-bold text-sky-400">{calledTodayCount}</span>
            </div>
          </div>
        </div>

        {/* 3-SEGMENT NAVIGATION SWITCH (Queue, Callbacks, Activity Log) */}
        <div className="max-w-md mx-auto grid grid-cols-3 gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("queue")}
            className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "queue"
                ? "bg-emerald-600 text-zinc-950 shadow-md font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Queue ({combinedCallSequence.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("callbacks")}
            className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "callbacks"
                ? "bg-sky-500 text-zinc-950 shadow-md font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Callbacks ({allCallbacks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("activity")}
            className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "activity"
                ? "bg-purple-600 text-white shadow-md font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Called Today ({todayActivities.length})</span>
          </button>
        </div>

        {/* CAMPAIGN SELECTOR */}
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

      {/* MAIN TAB CONTENT */}
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-5">
        {fetchError ? (
          <div className="py-12 px-4 rounded-xl border border-rose-800/80 bg-rose-950/40 text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-rose-200">Failed to load data</h3>
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
        ) : activeTab === "queue" ? (
          /* ====================================================================== */
          /* TAB 1: CALLING QUEUE                                                   */
          /* ====================================================================== */
          combinedCallSequence.length === 0 ? (
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
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={() => setActiveTab("callbacks")}
                  variant="outline"
                  className="border-zinc-800 text-zinc-200 text-xs font-semibold"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1 text-sky-400" /> View Scheduled Callbacks
                </Button>
                <Link href="/import">
                  <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs">
                    <Upload className="w-4 h-4 mr-1.5" /> Import New CSV
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* OVERDUE */}
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
                        scheduledTimeText={formatScheduledTime(item.dueAt)}
                        isOverdue={true}
                        onCall={() => handleStartCall(item.lead)}
                        onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                        snoozing={snoozingId === item.followupId}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* DUE TODAY */}
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
                        scheduledTimeText={formatScheduledTime(item.dueAt)}
                        isOverdue={false}
                        onCall={() => handleStartCall(item.lead)}
                        onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                        snoozing={snoozingId === item.followupId}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* NEW LEADS */}
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
                        scheduledTimeText="Never called"
                        isOverdue={false}
                        onCall={() => handleStartCall(item.lead)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* EXCLUDED COUNT */}
              {excludedCount > 0 && (
                <div className="pt-2 text-center">
                  <p className="text-[11px] text-zinc-500 font-mono">
                    {excludedCount} leads excluded (lost, won, parked, do-not-call)
                  </p>
                </div>
              )}
            </div>
          )
        ) : activeTab === "callbacks" ? (
          /* ====================================================================== */
          /* TAB 2: DEDICATED CALLBACKS HUB                                         */
          /* ====================================================================== */
          allCallbacks.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="p-4 bg-sky-950/60 border border-sky-800/80 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-sky-400">
                <Calendar className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-zinc-100">No scheduled callbacks</h2>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                  When you schedule callbacks or follow-ups after calls, they will all appear here in one central hub.
                </p>
              </div>
              <Button
                onClick={() => setActiveTab("queue")}
                className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs"
              >
                Go to Call Queue →
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* OVERDUE CALLBACKS */}
              {overdueItems.length > 0 && (
                <div className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Overdue Callbacks ({overdueItems.length})
                  </h2>
                  <div className="space-y-2">
                    {overdueItems.map((item) => (
                      <CallbackCard
                        key={item.followupId}
                        item={item}
                        scheduledTimeText={formatScheduledTime(item.dueAt)}
                        isOverdue={true}
                        onCall={() => handleStartCall(item.lead, allCallbacks.map((c) => c.lead))}
                        onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                        snoozing={snoozingId === item.followupId}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* DUE TODAY CALLBACKS */}
              {dueTodayItems.length > 0 && (
                <div className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Today's Scheduled Callbacks ({dueTodayItems.length})
                  </h2>
                  <div className="space-y-2">
                    {dueTodayItems.map((item) => (
                      <CallbackCard
                        key={item.followupId}
                        item={item}
                        scheduledTimeText={formatScheduledTime(item.dueAt)}
                        isOverdue={false}
                        onCall={() => handleStartCall(item.lead, allCallbacks.map((c) => c.lead))}
                        onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                        snoozing={snoozingId === item.followupId}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* TOMORROW CALLBACKS */}
              {tomorrowItems.length > 0 && (
                <div className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Tomorrow ({tomorrowItems.length})
                  </h2>
                  <div className="space-y-2">
                    {tomorrowItems.map((item) => (
                      <CallbackCard
                        key={item.followupId}
                        item={item}
                        scheduledTimeText={formatScheduledTime(item.dueAt)}
                        isOverdue={false}
                        onCall={() => handleStartCall(item.lead, allCallbacks.map((c) => c.lead))}
                        onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                        snoozing={snoozingId === item.followupId}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* UPCOMING CALLBACKS (Later this week / Next Week) */}
              {comingUpItems.length > 0 && (
                <div className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Later Upcoming ({comingUpItems.length})
                  </h2>
                  <div className="space-y-2">
                    {comingUpItems.map((item) => (
                      <CallbackCard
                        key={item.followupId}
                        item={item}
                        scheduledTimeText={formatScheduledTime(item.dueAt)}
                        isOverdue={false}
                        onCall={() => handleStartCall(item.lead, allCallbacks.map((c) => c.lead))}
                        onSnooze={(days) => handleSnooze(item.followupId, item.lead.id, days)}
                        snoozing={snoozingId === item.followupId}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          /* ====================================================================== */
          /* TAB 3: TODAY'S CALL ACTIVITY LOG                                       */
          /* ====================================================================== */
          todayActivities.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="p-4 bg-purple-950/60 border border-purple-800/80 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-purple-400">
                <PhoneCall className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-zinc-100">No calls logged yet today</h2>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                  Start calling from your queue — every call you log will appear here with duration, outcome, and notes.
                </p>
              </div>
              <Button
                onClick={() => setActiveTab("queue")}
                className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs"
              >
                Start Calling Now →
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* SUMMARY STATS BANNER */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Today's Calling Record
                  </h3>
                  <span className="text-xs font-mono font-bold text-white bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                    {todayActivities.length} Calls Made
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Yeh aapki aaj ki complete call history hai jisme har business ka feedback, duration aur note record hai.
                </p>
              </div>

              {/* ACTIVITY LOG TIMELINE CARDS */}
              <div className="space-y-2.5">
                {todayActivities.map((act) => {
                  const callTime = new Date(act.occurred_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={act.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 hover:border-zinc-700 transition-all shadow-sm"
                    >
                      {/* Top row: Business Name & Outcome Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 text-[9px] uppercase font-bold font-mono rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                              {act.lead?.tier || "Tier U"}
                            </span>
                            <h4 className="text-sm font-bold text-zinc-100 truncate">
                              {act.lead?.name || "Business"}
                            </h4>
                          </div>
                          <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                            <span>{act.lead?.area || "Unspecified Area"}</span>
                            <span>•</span>
                            <span className="font-mono">{act.lead?.phone || "No phone"}</span>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 text-[10px] rounded-full border uppercase font-mono shrink-0 ${getDispositionBadgeStyle(
                            act.disposition
                          )}`}
                        >
                          {act.disposition.replace("_", " ")}
                        </span>
                      </div>

                      {/* Middle row: Time, Duration, and Next Action */}
                      <div className="flex items-center justify-between text-xs font-mono bg-zinc-950/80 px-2.5 py-1.5 rounded-lg border border-zinc-800/80 text-zinc-400">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-300 font-semibold">{callTime}</span>
                          <span>•</span>
                          <span>Duration: {act.duration_sec}s</span>
                        </div>

                        {act.lead?.next_action_at && (
                          <span className="text-sky-300 font-sans text-[11px] truncate max-w-[150px]">
                            📅 {formatScheduledTime(act.lead.next_action_at)}
                          </span>
                        )}
                      </div>

                      {/* Note snippet if recorded */}
                      {act.note && (
                        <div className="text-xs bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/90 text-zinc-300 leading-relaxed">
                          <span className="text-zinc-500 font-mono text-[10px] block mb-0.5">
                            Call Note:
                          </span>
                          "{act.note}"
                        </div>
                      )}

                      {/* Quick Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
                        {act.lead ? (
                          <a
                            href={getGmbUrl(act.lead)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>Google Business Profile</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <div />
                        )}

                        {act.lead && (
                          <Button
                            size="sm"
                            onClick={() => act.lead && handleStartCall(act.lead)}
                            className="h-7 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold rounded-lg"
                          >
                            <Phone className="w-3 h-3 mr-1 text-emerald-400" /> Call Again
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
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
  scheduledTimeText: string;
  isOverdue: boolean;
  onCall: () => void;
  onSnooze?: (days: number) => void;
  snoozing?: boolean;
}

function QueueRowCard({
  lead,
  reason,
  scheduledTimeText,
  isOverdue,
  onCall,
  onSnooze,
  snoozing,
}: QueueRowCardProps) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState<boolean>(false);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 transition-all hover:border-zinc-700 shadow-sm">
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
              : scheduledTimeText.includes("Today")
              ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/80"
              : "bg-zinc-800 text-zinc-400 border-zinc-700"
          }`}
        >
          {scheduledTimeText}
        </span>
      </div>

      <div className="flex gap-2 pt-1 border-t border-zinc-800/80">
        <Button
          onClick={onCall}
          className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-zinc-950 font-bold text-xs rounded-lg flex items-center justify-center space-x-1.5"
        >
          <Phone className="w-3.5 h-3.5 fill-zinc-950" />
          <span>CALL</span>
        </Button>

        <a
          href={getGmbUrl(lead)}
          target="_blank"
          rel="noopener noreferrer"
          className="h-9 px-3 bg-blue-950/70 hover:bg-blue-900 border border-blue-800 text-blue-300 hover:text-white rounded-lg flex items-center justify-center space-x-1 text-xs font-semibold transition-colors"
          title="Open Google Maps / GMB Profile in new tab"
        >
          <MapPin className="w-3.5 h-3.5 text-blue-400" />
          <span>GMB</span>
          <ExternalLink className="w-3 h-3 text-blue-400" />
        </a>

        {onSnooze && (
          <div className="relative">
            <Button
              variant="outline"
              disabled={snoozing}
              onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
              className="h-9 px-3 border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 text-xs rounded-lg font-medium"
            >
              {snoozing ? "..." : "Snooze"}
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

// Dedicated Callback Card Component
function CallbackCard({
  item,
  scheduledTimeText,
  isOverdue,
  onCall,
  onSnooze,
  snoozing,
}: {
  item: FollowupQueueItem;
  scheduledTimeText: string;
  isOverdue: boolean;
  onCall: () => void;
  onSnooze: (days: number) => void;
  snoozing: boolean;
}) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState<boolean>(false);
  const lead = item.lead;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 hover:border-zinc-700 transition-all shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold font-mono rounded bg-zinc-800 text-sky-400 border border-zinc-700">
              {lead.tier || "U"}
            </span>
            <h3 className="text-sm font-bold text-zinc-100 truncate">{lead.name}</h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1 truncate leading-tight">
            {item.reason}
          </p>
        </div>

        <span
          className={`px-2.5 py-1 text-[11px] font-bold font-mono rounded-lg border shrink-0 ${
            isOverdue
              ? "bg-rose-950 text-rose-300 border-rose-800"
              : scheduledTimeText.includes("Today")
              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
              : "bg-sky-950 text-sky-300 border-sky-800"
          }`}
        >
          📅 {scheduledTimeText}
        </span>
      </div>

      <div className="flex gap-2 pt-1 border-t border-zinc-800/80">
        <Button
          onClick={onCall}
          className="flex-1 h-9 bg-sky-500 hover:bg-sky-400 active:scale-95 text-zinc-950 font-bold text-xs rounded-lg flex items-center justify-center space-x-1.5 shadow-md"
        >
          <Phone className="w-3.5 h-3.5 fill-zinc-950" />
          <span>CALL NOW</span>
        </Button>

        <a
          href={getGmbUrl(lead)}
          target="_blank"
          rel="noopener noreferrer"
          className="h-9 px-3 bg-blue-950/70 hover:bg-blue-900 border border-blue-800 text-blue-300 hover:text-white rounded-lg flex items-center justify-center space-x-1 text-xs font-semibold transition-colors"
          title="Open Google Maps / GMB Profile in new tab"
        >
          <MapPin className="w-3.5 h-3.5 text-blue-400" />
          <span>GMB</span>
          <ExternalLink className="w-3 h-3 text-blue-400" />
        </a>

        <div className="relative">
          <Button
            variant="outline"
            disabled={snoozing}
            onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
            className="h-9 px-2.5 border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 text-xs rounded-lg font-medium"
          >
            {snoozing ? "..." : "Reschedule"}
          </Button>

          {showSnoozeMenu && (
            <div className="absolute right-0 bottom-10 z-50 bg-zinc-950 border border-zinc-800 rounded-xl p-1.5 shadow-xl space-y-1 w-36 animate-in fade-in duration-100">
              <button
                onClick={() => {
                  setShowSnoozeMenu(false);
                  onSnooze(1);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg font-medium"
              >
                Tomorrow (+1d)
              </button>
              <button
                onClick={() => {
                  setShowSnoozeMenu(false);
                  onSnooze(2);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg font-medium"
              >
                Day After (+2d)
              </button>
              <button
                onClick={() => {
                  setShowSnoozeMenu(false);
                  onSnooze(7);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg font-medium"
              >
                Next Week (+7d)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TodayQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col min-h-screen bg-zinc-950 p-4 space-y-4 max-w-md mx-auto w-full">
          <Skeleton className="h-12 w-full bg-zinc-900 rounded-xl" />
          <Skeleton className="h-10 w-full bg-zinc-900 rounded-xl" />
          <Skeleton className="h-32 w-full bg-zinc-900 rounded-2xl" />
          <Skeleton className="h-32 w-full bg-zinc-900 rounded-2xl" />
        </div>
      }
    >
      <TodayQueuePageContent />
    </Suspense>
  );
}
