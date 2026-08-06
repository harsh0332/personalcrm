export interface LeadInsertRecord {
  owner?: string;
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
}

export interface SkippedRowInfo {
  rowIndex: number;
  dataSnippet: string;
  reason: string;
}

export function normalizePhone(raw: string | null | undefined): {
  phone: string | null;
  phone_e164: string | null;
} {
  if (!raw || !String(raw).trim()) return { phone: null, phone_e164: null };

  const phoneStr = String(raw).trim();
  const digitsOnly = phoneStr.replace(/[^\d+]/g, "");

  // 10-digit Indian mobile/landline number (e.g. 9876543210)
  if (/^\d{10}$/.test(digitsOnly)) {
    return { phone: phoneStr, phone_e164: `+91${digitsOnly}` };
  }

  // 12-digit starting with 91 (e.g. 919876543210)
  if (/^91\d{10}$/.test(digitsOnly)) {
    return { phone: phoneStr, phone_e164: `+${digitsOnly}` };
  }

  // Standard +91 format (e.g. +919876543210)
  if (/^\+91\d{10}$/.test(digitsOnly)) {
    return { phone: phoneStr, phone_e164: digitsOnly };
  }

  // Standard E.164 international format (+ followed by 10-15 digits)
  if (/^\+\d{10,15}$/.test(digitsOnly)) {
    return { phone: phoneStr, phone_e164: digitsOnly };
  }

  // Non-standard or junk phone value: keep raw phone, phone_e164 is null
  return { phone: phoneStr, phone_e164: null };
}

export function detectGapReasonsSeparator(
  sample: string | null | undefined
): "," | ";" | "|" {
  if (!sample) return ",";
  if (sample.includes("|")) return "|";
  if (sample.includes(";")) return ";";
  return ",";
}

export function parseGapReasons(
  raw: string | null | undefined,
  separator: "," | ";" | "|"
): string[] | null {
  if (!raw || !String(raw).trim()) return null;
  const items = String(raw)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

export const DB_COLUMNS = [
  { key: "cid", label: "CID (Natural Key)", required: true },
  { key: "name", label: "Business Name", required: true },
  { key: "phone", label: "Phone Number", required: true },
  { key: "address", label: "Address", required: false },
  { key: "area", label: "Area", required: false },
  { key: "area_source", label: "Area Source", required: false },
  { key: "query_area", label: "Query Area", required: false },
  { key: "city", label: "City", required: false },
  { key: "category", label: "Category", required: false },
  { key: "website", label: "Website", required: false },
  { key: "gap_score", label: "Gap Score", required: false },
  { key: "gap_reasons", label: "Gap Reasons", required: false },
  { key: "demand_score", label: "Demand Score", required: false },
  { key: "review_count", label: "Review Count", required: false },
  { key: "rating", label: "Rating", required: false },
  { key: "tier", label: "Tier", required: false },
  { key: "source_run_id", label: "Source Run ID", required: false },
] as const;

export function autoMapHeader(header: string): string | null {
  if (!header) return null;
  const normalized = header.toLowerCase().replace(/[\s_]+/g, "");

  const mappingRules: Record<string, string> = {
    cid: "cid",
    name: "name",
    phone: "phone",
    address: "address",
    area: "area",
    areasource: "area_source",
    queryarea: "query_area",
    city: "city",
    category: "category",
    website: "website",
    gapscore: "gap_score",
    gapreasons: "gap_reasons",
    demandscore: "demand_score",
    reviewcount: "review_count",
    rating: "rating",
    tier: "tier",
    sourcerunid: "source_run_id",
    runid: "source_run_id",
  };

  return mappingRules[normalized] || null;
}

export function parseNullableInt(val: any): number | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === "") return null;
  const num = parseInt(s, 10);
  return isNaN(num) ? null : num;
}

export function parseNullableFloat(val: any): number | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === "") return null;
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}
