/**
 * Helper to construct direct Google Business Profile / Google Maps URL
 * Supports:
 * 1. Direct gmb_url from CSV
 * 2. CID conversion (hex:hex -> decimal, 0xhex -> decimal, decimal)
 * 3. Place ID
 * 4. Business Name + Area fallback search query
 */
export function getGmbUrl(lead: {
  gmb_url?: string | null;
  cid?: string | null;
  place_id?: string | null;
  name?: string | null;
  area?: string | null;
  city?: string | null;
  address?: string | null;
}): string {
  if (!lead) return "https://www.google.com/maps";

  // 1. Direct GMB URL if available
  if (lead.gmb_url && lead.gmb_url.startsWith("http")) {
    return lead.gmb_url;
  }

  // 2. CID Hex to Decimal Google Maps CID conversion
  if (lead.cid && typeof lead.cid === "string") {
    const rawCid = lead.cid.trim();

    try {
      // Hex:Hex format (e.g. 0x3962fda466cf2a29:0x97e4cc7235e542e7)
      if (rawCid.includes(":")) {
        const parts = rawCid.split(":");
        const hexPart = parts[1] || parts[0];
        if (hexPart.startsWith("0x") || /^[0-9a-fA-F]+$/.test(hexPart)) {
          const hexFormatted = hexPart.startsWith("0x") ? hexPart : `0x${hexPart}`;
          const decimalCid = BigInt(hexFormatted).toString();
          return `https://www.google.com/maps?cid=${decimalCid}`;
        }
      }

      // Single Hex format (e.g. 0x97e4cc7235e542e7)
      if (rawCid.startsWith("0x")) {
        const decimalCid = BigInt(rawCid).toString();
        return `https://www.google.com/maps?cid=${decimalCid}`;
      }

      // Plain decimal digits format (e.g. 10945097785319703271)
      if (/^\d+$/.test(rawCid)) {
        return `https://www.google.com/maps?cid=${rawCid}`;
      }
    } catch {
      // Fallback to name search if BigInt conversion fails on unusual string
    }
  }

  // 3. Google Place ID
  if (lead.place_id && typeof lead.place_id === "string" && lead.place_id.trim()) {
    const queryName = encodeURIComponent(lead.name || "Business");
    return `https://www.google.com/maps/search/?api=1&query=${queryName}&query_place_id=${lead.place_id.trim()}`;
  }

  // 4. Fallback search query by Business Name and Location
  const searchTerms = [lead.name, lead.area, lead.city].filter(Boolean).join(" ").trim();
  if (searchTerms) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchTerms)}`;
  }

  return "https://www.google.com/maps";
}
