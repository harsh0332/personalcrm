import { Star, ShieldAlert, MapPin, ExternalLink } from "lucide-react";
import { getGmbUrl } from "@/lib/gmb-utils";

export interface LeadCardData {
  id: string;
  cid: string;
  name: string;
  phone: string | null;
  phone_e164: string | null;
  gmb_url?: string | null;
  place_id?: string | null;
  address?: string | null;
  city?: string | null;
  area: string | null;
  category: string | null;
  tier: string | null;
  rating: number | null;
  review_count: number | null;
  gap_reasons: string[] | null;
  status: string;
  do_not_call: boolean;
  area_source: string | null;
}

interface LeadCardProps {
  lead: LeadCardData;
  onClick: () => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  // Format Tier badge styling
  const rawTier = (lead.tier || "U").trim();
  let tierLabel = rawTier;
  let tierStyle = "bg-zinc-800 text-zinc-300 border-zinc-700";

  if (rawTier === "A" || rawTier === "Tier 1" || rawTier === "Tier_1") {
    tierLabel = "Tier A";
    tierStyle = "bg-emerald-950/80 text-emerald-300 border-emerald-800/80 font-bold";
  } else if (rawTier === "B" || rawTier === "Tier 2" || rawTier === "Tier_2") {
    tierLabel = "Tier B";
    tierStyle = "bg-sky-950/80 text-sky-300 border-sky-800/80 font-semibold";
  } else if (rawTier === "C" || rawTier === "Tier 3" || rawTier === "Tier_3") {
    tierLabel = "Tier C";
    tierStyle = "bg-amber-950/80 text-amber-300 border-amber-800/80";
  } else {
    tierLabel = "Tier U";
  }

  // Format Status badge styling
  const isStatusNew = lead.status === "new";

  return (
    <div
      onClick={onClick}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 cursor-pointer hover:border-zinc-700 active:scale-[0.99] transition-all shadow-sm"
    >
      {/* Top Row: Business Name & Tier Badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm text-zinc-100 leading-snug break-words flex-1">
          {lead.name}
        </h3>
        <span
          className={`shrink-0 px-2 py-0.5 text-[10px] uppercase rounded-full border ${tierStyle}`}
        >
          {tierLabel}
        </span>
      </div>

      {/* Sub-line: Area & Category */}
      <div className="text-xs text-zinc-400 flex items-center flex-wrap gap-x-2 gap-y-1">
        {lead.area && <span className="font-medium text-zinc-300">{lead.area}</span>}
        {lead.area && lead.category && <span className="text-zinc-600">•</span>}
        {lead.category && <span>{lead.category}</span>}
      </div>

      {/* Rating & Reviews + Status Marker */}
      <div className="flex items-center justify-between text-xs pt-0.5 text-zinc-400">
        <div className="flex items-center space-x-3">
          {lead.rating !== null && (
            <span className="flex items-center space-x-1 text-amber-400 font-medium">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{lead.rating.toFixed(1)}</span>
            </span>
          )}
          {lead.review_count !== null && (
            <span className="text-zinc-400">({lead.review_count} reviews)</span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Quick Google Business Profile Link */}
          <a
            href={getGmbUrl(lead)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 border border-blue-800 text-[10px] text-blue-300 hover:text-white transition-colors"
            title="Open Google Maps / GMB Profile in new tab"
          >
            <MapPin className="w-3 h-3 text-blue-400" />
            <span>GMB</span>
            <ExternalLink className="w-2.5 h-2.5 text-blue-400" />
          </a>

          {/* Quiet Status Marker if not 'new' */}
          {!isStatusNew && (
            <span className="px-2 py-0.5 text-[10px] rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 uppercase font-mono">
              {lead.status}
            </span>
          )}

          {lead.do_not_call && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 font-mono">
              <ShieldAlert className="w-3 h-3 text-rose-400" /> DNC
            </span>
          )}
        </div>
      </div>

      {/* Gap Reasons Chips (Always visible without tapping) */}
      {lead.gap_reasons && lead.gap_reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {lead.gap_reasons.map((reason, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 text-[10px] bg-zinc-950 text-emerald-400/90 border border-zinc-800/80 rounded-md font-medium"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
