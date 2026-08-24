"use client";

import { X, MapPin, Globe, Phone, AlertTriangle, Calendar, Hash, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FullLeadDetails {
  id: string;
  cid: string;
  name: string;
  phone: string | null;
  phone_e164: string | null;
  address: string | null;
  area: string | null;
  area_source: string | null;
  query_area: string | null;
  city: string | null;
  category: string | null;
  website: string | null;
  gap_score: number | null;
  gap_reasons: string[] | null;
  demand_score: number | null;
  review_count: number | null;
  rating: number | null;
  tier: string | null;
  source_run_id: string | null;
  status: string;
  do_not_call: boolean;
  attempts: number;
  last_called_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadDetailModalProps {
  lead: FullLeadDetails | null;
  onClose: () => void;
}

export function LeadDetailModal({ lead, onClose }: LeadDetailModalProps) {
  if (!lead) return null;

  const isAreaFromQuery = lead.area_source?.toLowerCase() === "query";

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-xl max-h-[92vh] max-h-[92dvh] overflow-y-auto p-5 pb-28 space-y-5 text-zinc-200 shadow-2xl animate-in slide-in-from-bottom-5 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title and Close Button */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-zinc-50 leading-snug break-words">
              {lead.name}
            </h2>
            <div className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
              <span className="font-mono text-zinc-500">CID: {lead.cid}</span>
              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 uppercase">
                {lead.tier || "Tier U"}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 shrink-0 -mr-2 -mt-1"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Warning Badge for Area Source = Query */}
        {isAreaFromQuery && (
          <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg text-amber-300 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="block text-amber-200 font-semibold">
                Area Label Warning (area_source: query)
              </strong>
              The area label &quot;{lead.area}&quot; came from search query parameters rather than
              the confirmed business address and may be inaccurate for geographic batching.
            </div>
          </div>
        )}

        {/* SECTION 1: CONTACT & LOCATION */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Contact & Location
          </h3>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-2.5 text-xs">
            <div className="flex items-center space-x-2">
              <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex-1 font-mono text-zinc-200">
                {lead.phone || "No phone"}
                {lead.phone_e164 && (
                  <span className="text-zinc-500 text-[11px] block">
                    E.164: {lead.phone_e164}
                  </span>
                )}
              </div>
            </div>

            {lead.address && (
              <div className="flex items-start space-x-2 pt-1 border-t border-zinc-800/50">
                <MapPin className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span className="text-zinc-300 leading-snug">{lead.address}</span>
              </div>
            )}

            {lead.website && (
              <div className="flex items-center space-x-2 pt-1 border-t border-zinc-800/50">
                <Globe className="w-4 h-4 text-purple-400 shrink-0" />
                <a
                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-300 hover:underline truncate"
                >
                  {lead.website}
                </a>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/50 text-[11px]">
              <div>
                <span className="text-zinc-500 block">Area</span>
                <span className="text-zinc-200 font-medium">{lead.area || "-"}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Area Source</span>
                <span className={`font-mono ${isAreaFromQuery ? "text-amber-400 font-bold" : "text-zinc-300"}`}>
                  {lead.area_source || "-"}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Query Area</span>
                <span className="text-zinc-300">{lead.query_area || "-"}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">City</span>
                <span className="text-zinc-300">{lead.city || "-"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: SCORES & GAP REASONS */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Scoring & Opportunities
          </h3>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                <span className="text-[10px] text-zinc-500 block uppercase">Demand Score</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {lead.demand_score !== null ? lead.demand_score : "-"}
                </span>
              </div>
              <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                <span className="text-[10px] text-zinc-500 block uppercase">Gap Score</span>
                <span className="text-sm font-bold text-amber-400 font-mono">
                  {lead.gap_score !== null ? lead.gap_score : "-"}
                </span>
              </div>
              <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                <span className="text-[10px] text-zinc-500 block uppercase">Rating</span>
                <span className="text-sm font-bold text-sky-400 font-mono">
                  {lead.rating !== null ? `${lead.rating} (${lead.review_count})` : "-"}
                </span>
              </div>
            </div>

            {lead.gap_reasons && lead.gap_reasons.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-zinc-400 text-[11px] font-medium block">Gap Reasons:</span>
                <div className="flex flex-wrap gap-1.5">
                  {lead.gap_reasons.map((r, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-zinc-950 text-emerald-400 border border-zinc-800 rounded text-xs"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: SYSTEM METADATA & STATUS */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Status & Metadata
          </h3>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-zinc-500 block">Status</span>
              <span className="text-zinc-200 uppercase font-mono">{lead.status}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Do Not Call</span>
              <span className={lead.do_not_call ? "text-rose-400 font-bold" : "text-zinc-400"}>
                {lead.do_not_call ? "TRUE" : "false"}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Attempts</span>
              <span className="text-zinc-200 font-mono">{lead.attempts}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Last Called At</span>
              <span className="text-zinc-400">
                {lead.last_called_at ? new Date(lead.last_called_at).toLocaleString() : "Never"}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Source Run ID</span>
              <span className="text-zinc-300 font-mono truncate block">{lead.source_run_id || "-"}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Imported At</span>
              <span className="text-zinc-400">
                {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "-"}
              </span>
            </div>
          </div>
        </div>

        <Button
          onClick={onClose}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold"
        >
          Close Lead Details
        </Button>
      </div>
    </div>
  );
}
