"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { LeadCard, LeadCardData } from "@/components/lead-card";
import { LeadFilters, FilterState } from "@/components/lead-filters";
import { LeadDetailModal, FullLeadDetails } from "@/components/lead-detail-modal";
import { LeadCallView, ActiveLeadCallData } from "@/components/lead-call-view";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Users, Upload, FilterX, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";

const DEFAULT_FILTERS: FilterState = {
  campaign: "",
  tier: "",
  status: "",
  area: "",
  category: "",
  reviewRange: "",
  showHidden: false,
  sortBy: "best_first",
  searchQuery: "",
};

const PAGE_SIZE = 50;

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadCardData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [selectedLead, setSelectedLead] = useState<FullLeadDetails | null>(null);
  const [activeCallLeadIndex, setActiveCallLeadIndex] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const [availableCampaigns, setAvailableCampaigns] = useState<string[]>([]);
  const [availableAreas, setAvailableAreas] = useState<{ value: string; count: number }[]>([]);
  const [availableCategories, setAvailableCategories] = useState<{ value: string; count: number }[]>([]);
  const [hiddenCount, setHiddenCount] = useState<number>(0);

  const supabase = createClient();

  // 1. Fetch Distinct Filter Options and Hidden Count from Database
  const fetchFilterMetadata = useCallback(async () => {
    try {
      const { data: areaCatData } = await supabase
        .from("leads")
        .select("area, category, do_not_call, status, campaign");

      if (areaCatData) {
        const aCounts: Record<string, number> = {};
        const cCounts: Record<string, number> = {};
        const campSet = new Set<string>();
        let hiddenC = 0;

        areaCatData.forEach((row: any) => {
          if (row.campaign) campSet.add(row.campaign);
          if (row.area) aCounts[row.area] = (aCounts[row.area] || 0) + 1;
          if (row.category) cCounts[row.category] = (cCounts[row.category] || 0) + 1;
          if (row.do_not_call || row.status === "lost" || row.status === "invalid") {
            hiddenC++;
          }
        });

        setAvailableCampaigns(Array.from(campSet));

        setAvailableAreas(
          Object.entries(aCounts)
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count)
        );

        setAvailableCategories(
          Object.entries(cCounts)
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count)
        );

        setHiddenCount(hiddenC);
      }
    } catch {
      // Ignored for metadata
    }
  }, [supabase]);

  // 2. Main Server-Side Lead Query Engine
  const fetchLeadsServerSide = useCallback(
    async (targetPage: number, append: boolean = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setFetchError(null);

      try {
        let query = supabase
          .from("leads")
          .select(
            "id, cid, name, phone, phone_e164, area, category, tier, rating, review_count, demand_score, status, do_not_call, area_source, attempts, campaign",
            { count: "exact" }
          );

        // Campaign Filter
        if (filters.campaign) {
          query = query.eq("campaign", filters.campaign);
        }

        // a) Default Hidden Filter
        if (!filters.showHidden) {
          query = query.eq("do_not_call", false).not("status", "in", '("lost","invalid","parked")');
        }

        // b) Specific Tier Filter
        if (filters.tier) {
          query = query.eq("tier", filters.tier);
        }

        // c) Status Filter
        if (filters.status) {
          query = query.eq("status", filters.status);
        }

        // d) Area Filter
        if (filters.area) {
          query = query.eq("area", filters.area);
        }

        // e) Category Filter
        if (filters.category) {
          query = query.eq("category", filters.category);
        }

        // f) Review Count Range Filter
        if (filters.reviewRange === "under_50") {
          query = query.lt("review_count", 50);
        } else if (filters.reviewRange === "50_150") {
          query = query.gte("review_count", 50).lte("review_count", 150);
        } else if (filters.reviewRange === "151_300") {
          query = query.gte("review_count", 151).lte("review_count", 300);
        } else if (filters.reviewRange === "300_1000") {
          query = query.gte("review_count", 301).lte("review_count", 1000);
        } else if (filters.reviewRange === "gt_1000") {
          query = query.gt("review_count", 1000);
        } else if (filters.reviewRange === "unreviewed") {
          query = query.is("review_count", null);
        }

        // f) Server-Side Search (Name or Phone)
        const cleanQuery = filters.searchQuery.trim();
        const cleanPhoneDigits = cleanQuery.replace(/[^\d]/g, "");

        if (cleanQuery) {
          if (cleanPhoneDigits && cleanPhoneDigits.length >= 3) {
            query = query.or(
              `name.ilike.%${cleanQuery}%,phone_e164.ilike.%${cleanPhoneDigits}%,phone.ilike.%${cleanQuery}%`
            );
          } else {
            query = query.ilike("name", `%${cleanQuery}%`);
          }
        }

        // g) Server-Side Sorting
        if (filters.sortBy === "demand_desc") {
          query = query
            .order("demand_score", { ascending: false, nullsFirst: false })
            .order("review_count", { ascending: false, nullsFirst: false });
        } else if (filters.sortBy === "rating_desc") {
          query = query.order("rating", { ascending: false, nullsFirst: false });
        } else if (filters.sortBy === "reviews_desc") {
          query = query.order("review_count", { ascending: false, nullsFirst: false });
        } else if (filters.sortBy === "name_asc") {
          query = query.order("name", { ascending: true });
        } else {
          // Default Best First: tier ASC, demand_score DESC, review_count DESC
          query = query
            .order("tier", { ascending: true, nullsFirst: false })
            .order("demand_score", { ascending: false, nullsFirst: false })
            .order("review_count", { ascending: false, nullsFirst: false });
        }

        // h) Server-Side Range Pagination
        const fromIndex = targetPage * PAGE_SIZE;
        const toIndex = (targetPage + 1) * PAGE_SIZE - 1;
        query = query.range(fromIndex, toIndex);

        const { data, error, count } = await query;

        if (error) {
          setFetchError(`Database Query Error: ${error.message}`);
          return;
        }

        const newLeads = (data || []) as unknown as LeadCardData[];
        const total = count ?? 0;

        setTotalCount(total);

        if (append) {
          setLeads((prev) => [...prev, ...newLeads]);
        } else {
          setLeads(newLeads);
        }

        setPage(targetPage);
        setHasMore((targetPage + 1) * PAGE_SIZE < total);
      } catch (err: any) {
        setFetchError(`Network error fetching leads: ${err.message}`);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, supabase]
  );

  useEffect(() => {
    fetchFilterMetadata();
  }, [fetchFilterMetadata]);

  useEffect(() => {
    fetchLeadsServerSide(0, false);
  }, [fetchLeadsServerSide]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchLeadsServerSide(page + 1, true);
    }
  };

  const handleCardClick = useCallback((idx: number) => {
    setActiveCallLeadIndex(idx);
  }, []);

  const activeCallLead = useMemo(() => {
    if (activeCallLeadIndex !== null && leads[activeCallLeadIndex]) {
      return leads[activeCallLeadIndex] as unknown as ActiveLeadCallData;
    }
    return null;
  }, [activeCallLeadIndex, leads]);

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 pb-20">
      {/* Sticky Filter & Search Bar */}
      <LeadFilters
        filters={filters}
        onFilterChange={setFilters}
        onClearFilters={() => setFilters(DEFAULT_FILTERS)}
        availableCampaigns={availableCampaigns}
        availableAreas={availableAreas}
        availableCategories={availableCategories}
        hiddenCount={hiddenCount}
        totalFilteredCount={totalCount}
        currentLoadedCount={leads.length}
      />

      {/* Main Content Area */}
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-3">
        {fetchError ? (
          <div className="py-12 px-4 rounded-xl border border-rose-800/80 bg-rose-950/40 text-center space-y-4">
            <div className="p-3 bg-rose-900/50 text-rose-300 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-rose-200">Failed to load leads</h3>
              <p className="text-xs text-rose-400 font-mono max-w-xs mx-auto leading-relaxed">
                {fetchError}
              </p>
            </div>
            <Button
              onClick={() => fetchLeadsServerSide(0, false)}
              className="bg-rose-800 hover:bg-rose-700 text-zinc-100 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Request
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-3/4 bg-zinc-800" />
                  <Skeleton className="h-4 w-12 bg-zinc-800" />
                </div>
                <Skeleton className="h-3 w-1/2 bg-zinc-800" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-16 bg-zinc-800" />
                  <Skeleton className="h-4 w-20 bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : leads.length === 0 && totalCount === 0 ? (
          <div className="py-16 text-center space-y-4">
            {filters.tier || filters.status || filters.area || filters.category || filters.searchQuery ? (
              <>
                <div className="p-4 bg-zinc-900 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-amber-400">
                  <FilterX className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-zinc-200">No matching leads found</h2>
                  <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                    No leads match your active server-side search or filter criteria.
                  </p>
                </div>
                <Button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  variant="outline"
                  className="border-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs"
                >
                  Clear All Filters
                </Button>
              </>
            ) : (
              <>
                <div className="p-4 bg-zinc-900 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-zinc-500">
                  <Users className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-zinc-200">No leads in CRM yet</h2>
                  <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                    Upload a scraper export (.csv or .xlsx) to populate your lead list.
                  </p>
                </div>
                <Link href="/import">
                  <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold text-xs">
                    <Upload className="w-4 h-4 mr-1.5" /> Go to Import Tab
                  </Button>
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((lead, idx) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onClick={() => handleCardClick(idx)}
              />
            ))}

            {hasMore && (
              <div className="pt-4 pb-2 text-center">
                <Button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  variant="outline"
                  className="w-full border-zinc-800 text-zinc-300 hover:bg-zinc-900 text-xs font-semibold"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching Next 50 Leads...
                    </span>
                  ) : (
                    `Load Next 50 Leads (${leads.length} of ${totalCount} shown)`
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACTIVE CALL VIEW SCREEN */}
      {activeCallLead && activeCallLeadIndex !== null && (
        <LeadCallView
          lead={activeCallLead}
          onClose={() => setActiveCallLeadIndex(null)}
          currentIndex={activeCallLeadIndex + 1}
          totalInQueue={leads.length}
          onNextLead={() => {
            if (activeCallLeadIndex + 1 < leads.length) {
              setActiveCallLeadIndex(activeCallLeadIndex + 1);
            }
          }}
          onPrevLead={() => {
            if (activeCallLeadIndex - 1 >= 0) {
              setActiveCallLeadIndex(activeCallLeadIndex - 1);
            }
          }}
        />
      )}

      {/* Lead Detail Modal */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {loadingDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      )}
    </main>
  );
}
