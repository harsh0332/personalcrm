"use client";

import { X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FilterState {
  tier: string;
  status: string;
  area: string;
  category: string;
  showHidden: boolean;
  sortBy: string;
  searchQuery: string;
}

interface LeadFiltersProps {
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  onClearFilters: () => void;
  availableAreas: { value: string; count: number }[];
  availableCategories: { value: string; count: number }[];
  hiddenCount: number;
  totalFilteredCount: number;
  currentLoadedCount: number;
}

export function LeadFilters({
  filters,
  onFilterChange,
  onClearFilters,
  availableAreas,
  availableCategories,
  hiddenCount,
  totalFilteredCount,
  currentLoadedCount,
}: LeadFiltersProps) {
  const isFiltered =
    filters.tier !== "" ||
    filters.status !== "" ||
    filters.area !== "" ||
    filters.category !== "" ||
    filters.showHidden ||
    filters.searchQuery !== "";

  const handleChange = (key: keyof FilterState, value: any) => {
    onFilterChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 p-3 space-y-3 shadow-md">
      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
        <input
          type="text"
          value={filters.searchQuery}
          onChange={(e) => handleChange("searchQuery", e.target.value)}
          placeholder="Search name or phone..."
          className="w-full pl-9 pr-8 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        {filters.searchQuery && (
          <button
            onClick={() => handleChange("searchQuery", "")}
            className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Options Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
        {/* Sort By Select */}
        <select
          value={filters.sortBy}
          onChange={(e) => handleChange("sortBy", e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none shrink-0 font-medium"
        >
          <option value="best_first">Sort: Best First (Default)</option>
          <option value="demand_desc">Sort: Demand (High-Low)</option>
          <option value="rating_desc">Sort: Rating (High-Low)</option>
          <option value="reviews_desc">Sort: Reviews (High-Low)</option>
          <option value="name_asc">Sort: Name (A-Z)</option>
        </select>

        {/* Tier Select */}
        <select
          value={filters.tier}
          onChange={(e) => handleChange("tier", e.target.value)}
          className={`bg-zinc-900 border text-xs rounded-lg px-2.5 py-1.5 focus:outline-none shrink-0 ${
            filters.tier ? "border-emerald-500 text-emerald-300 font-semibold" : "border-zinc-800 text-zinc-300"
          }`}
        >
          <option value="">All Tiers</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
          <option value="U">Tier U (Unassigned)</option>
        </select>

        {/* Status Select */}
        <select
          value={filters.status}
          onChange={(e) => handleChange("status", e.target.value)}
          className={`bg-zinc-900 border text-xs rounded-lg px-2.5 py-1.5 focus:outline-none shrink-0 ${
            filters.status ? "border-emerald-500 text-emerald-300 font-semibold" : "border-zinc-800 text-zinc-300"
          }`}
        >
          <option value="">All Statuses</option>
          <option value="new">new</option>
          <option value="interested">interested</option>
          <option value="callback">callback</option>
          <option value="lost">lost</option>
          <option value="invalid">invalid</option>
        </select>

        {/* Area Select */}
        <select
          value={filters.area}
          onChange={(e) => handleChange("area", e.target.value)}
          className={`bg-zinc-900 border text-xs rounded-lg px-2.5 py-1.5 focus:outline-none shrink-0 max-w-[140px] truncate ${
            filters.area ? "border-emerald-500 text-emerald-300 font-semibold" : "border-zinc-800 text-zinc-300"
          }`}
        >
          <option value="">All Areas ({availableAreas.length})</option>
          {availableAreas.map((a) => (
            <option key={a.value} value={a.value}>
              {a.value} ({a.count})
            </option>
          ))}
        </select>

        {/* Category Select */}
        <select
          value={filters.category}
          onChange={(e) => handleChange("category", e.target.value)}
          className={`bg-zinc-900 border text-xs rounded-lg px-2.5 py-1.5 focus:outline-none shrink-0 max-w-[140px] truncate ${
            filters.category ? "border-emerald-500 text-emerald-300 font-semibold" : "border-zinc-800 text-zinc-300"
          }`}
        >
          <option value="">All Categories ({availableCategories.length})</option>
          {availableCategories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </select>

        {/* Show Hidden Toggle */}
        <button
          onClick={() => handleChange("showHidden", !filters.showHidden)}
          className={`px-2.5 py-1.5 rounded-lg border text-xs shrink-0 transition-colors flex items-center gap-1 ${
            filters.showHidden
              ? "bg-amber-950/60 border-amber-700 text-amber-300 font-medium"
              : "bg-zinc-900 border-zinc-800 text-zinc-400"
          }`}
        >
          Show Hidden
        </button>

        {/* Clear Filters Button */}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 text-xs shrink-0 h-8 px-2"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Filter Info Sub-bar */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono px-0.5">
        <span>
          Showing {currentLoadedCount} of {totalFilteredCount} leads
        </span>
        {!filters.showHidden && hiddenCount > 0 && (
          <span className="text-amber-400">
            {hiddenCount} hidden (lost, invalid, do-not-call)
          </span>
        )}
      </div>
    </div>
  );
}
