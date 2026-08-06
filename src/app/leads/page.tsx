"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { LeadCard, LeadCardData } from "@/components/lead-card";
import { LeadFilters, FilterState } from "@/components/lead-filters";
import { LeadDetailModal, FullLeadDetails } from "@/components/lead-detail-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Users, Upload, FilterX, Loader2 } from "lucide-react";
import Link from "next/link";

const DEFAULT_FILTERS: FilterState = {
  tier: "",
  status: "",
  area: "",
  category: "",
  showHidden: false,
  sortBy: "best_first",
  searchQuery: "",
};

export default function LeadsPage() {
  const [allLeads, setAllLeads] = useState<LeadCardData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLead, setSelectedLead] = useState<FullLeadDetails | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [displayLimit, setDisplayLimit] = useState<number>(50);

  const supabase = createClient();

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      // Select only card columns for list performance
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, cid, name, phone, phone_e164, area, category, tier, rating, review_count, gap_reasons, demand_score, status, do_not_call, area_source"
        );

      if (!error && data) {
        setAllLeads(data as unknown as LeadCardData[]);
      }
    } catch {
      // Ignored if offline
    } finally {
      setLoading(false);
    }
  };

  // Helper to rank Tiers for sorting
  const getTierRank = (t: string | null): number => {
    if (!t) return 99;
    const str = t.trim().toUpperCase();
    if (str === "A" || str.includes("1")) return 1;
    if (str === "B" || str.includes("2")) return 2;
    if (str === "C" || str.includes("3")) return 3;
    return 99;
  };

  // Available Filter Options with counts
  const availableAreas = useMemo(() => {
    const areaCounts: Record<string, number> = {};
    allLeads.forEach((l) => {
      if (l.area) {
        areaCounts[l.area] = (areaCounts[l.area] || 0) + 1;
      }
    });
    return Object.entries(areaCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }, [allLeads]);

  const availableCategories = useMemo(() => {
    const catCounts: Record<string, number> = {};
    allLeads.forEach((l) => {
      if (l.category) {
        catCounts[l.category] = (catCounts[l.category] || 0) + 1;
      }
    });
    return Object.entries(catCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }, [allLeads]);

  // Hidden Leads Count (DNC / Lost / Invalid)
  const hiddenCount = useMemo(() => {
    return allLeads.filter(
      (l) => l.do_not_call || l.status === "lost" || l.status === "invalid"
    ).length;
  }, [allLeads]);

  // Normalization for search query
  const cleanSearchQuery = filters.searchQuery.trim().toLowerCase();
  const cleanPhoneQuery = cleanSearchQuery.replace(/[^\d]/g, "");

  // Filter & Sort Pipeline
  const filteredAndSortedLeads = useMemo(() => {
    let result = [...allLeads];

    // 1. Default Hidden Filter
    if (!filters.showHidden) {
      result = result.filter(
        (l) => !l.do_not_call && l.status !== "lost" && l.status !== "invalid"
      );
    }

    // 2. Specific Tier Filter
    if (filters.tier) {
      result = result.filter((l) => {
        const rawT = (l.tier || "U").trim().toUpperCase();
        if (filters.tier === "A") return rawT === "A" || rawT.includes("1");
        if (filters.tier === "B") return rawT === "B" || rawT.includes("2");
        if (filters.tier === "C") return rawT === "C" || rawT.includes("3");
        if (filters.tier === "U") return rawT === "U" || getTierRank(l.tier) === 99;
        return true;
      });
    }

    // 3. Status Filter
    if (filters.status) {
      result = result.filter((l) => l.status === filters.status);
    }

    // 4. Area Filter
    if (filters.area) {
      result = result.filter((l) => l.area === filters.area);
    }

    // 5. Category Filter
    if (filters.category) {
      result = result.filter((l) => l.category === filters.category);
    }

    // 6. Search Query (Name or Phone with space/dash/+91 stripping)
    if (cleanSearchQuery) {
      result = result.filter((l) => {
        const matchName = l.name?.toLowerCase().includes(cleanSearchQuery);
        let matchPhone = false;

        if (cleanPhoneQuery && (l.phone || l.phone_e164)) {
          const rawP = (l.phone || "").replace(/[^\d]/g, "");
          const e164P = (l.phone_e164 || "").replace(/[^\d]/g, "");
          matchPhone = rawP.includes(cleanPhoneQuery) || e164P.includes(cleanPhoneQuery);
        }

        return matchName || matchPhone;
      });
    }

    // 7. Sort Order
    result.sort((a, b) => {
      if (filters.sortBy === "demand_desc") {
        const dA = (a as any).demand_score ?? -Infinity;
        const dB = (b as any).demand_score ?? -Infinity;
        return dB - dA;
      }
      if (filters.sortBy === "rating_desc") {
        const rA = a.rating ?? -Infinity;
        const rB = b.rating ?? -Infinity;
        return rB - rA;
      }
      if (filters.sortBy === "reviews_desc") {
        const rcA = a.review_count ?? -Infinity;
        const rcB = b.review_count ?? -Infinity;
        return rcB - rcA;
      }
      if (filters.sortBy === "name_asc") {
        return a.name.localeCompare(b.name);
      }

      // Default: Best First (tier ASC, demand_score DESC, review_count DESC)
      const rankA = getTierRank(a.tier);
      const rankB = getTierRank(b.tier);
      if (rankA !== rankB) return rankA - rankB;

      const demandA = (a as any).demand_score ?? -Infinity;
      const demandB = (b as any).demand_score ?? -Infinity;
      if (demandA !== demandB) return demandB - demandA;

      const reviewA = a.review_count ?? -Infinity;
      const reviewB = b.review_count ?? -Infinity;
      return reviewB - reviewA;
    });

    return result;
  }, [allLeads, filters, cleanSearchQuery, cleanPhoneQuery]);

  const handleCardClick = useCallback(async (leadId: string) => {
    setLoadingDetail(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (!error && data) {
        setSelectedLead(data as FullLeadDetails);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingDetail(false);
    }
  }, [supabase]);

  const displayedLeads = useMemo(() => {
    return filteredAndSortedLeads.slice(0, displayLimit);
  }, [filteredAndSortedLeads, displayLimit]);

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 pb-20">
      {/* Sticky Filter & Search Bar */}
      <LeadFilters
        filters={filters}
        onFilterChange={setFilters}
        onClearFilters={() => setFilters(DEFAULT_FILTERS)}
        availableAreas={availableAreas}
        availableCategories={availableCategories}
        hiddenCount={hiddenCount}
        totalFilteredCount={filteredAndSortedLeads.length}
      />

      {/* Main Content Area */}
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-3">
        {loading ? (
          // Skeleton Loading State
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
        ) : allLeads.length === 0 ? (
          // Empty State: 0 leads in Database
          <div className="py-16 text-center space-y-4">
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
          </div>
        ) : filteredAndSortedLeads.length === 0 ? (
          // Empty State: Filters match 0 leads
          <div className="py-16 text-center space-y-4">
            <div className="p-4 bg-zinc-900 rounded-full w-14 h-14 mx-auto flex items-center justify-center text-amber-400">
              <FilterX className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-zinc-200">No matching leads found</h2>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                Try adjusting your search query or clear active filters.
              </p>
            </div>
            <Button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              variant="outline"
              className="border-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs"
            >
              Clear All Filters
            </Button>
          </div>
        ) : (
          // Render Filtered Lead Cards List
          <div className="space-y-3">
            {displayedLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onClick={() => handleCardClick(lead.id)}
              />
            ))}

            {/* Pagination / Load More */}
            {displayLimit < filteredAndSortedLeads.length && (
              <div className="pt-4 pb-2 text-center">
                <Button
                  onClick={() => setDisplayLimit((prev) => prev + 50)}
                  variant="outline"
                  className="w-full border-zinc-800 text-zinc-300 hover:bg-zinc-900 text-xs font-semibold"
                >
                  Load More Leads ({filteredAndSortedLeads.length - displayLimit} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lead Detail Read-Only Drawer/Modal */}
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
