import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== INSPECTING LIVE SUPABASE REAL LEADS ===");
  const { data: leads, error, count } = await adminClient
    .from("leads")
    .select("*", { count: "exact" });

  if (error) {
    console.error("Error fetching leads:", error);
    return;
  }

  console.log(`Total Leads Count in DB: ${count}`);

  if (!leads || leads.length === 0) {
    console.log("No leads found!");
    return;
  }

  // Find longest business name
  let longestNameLead = leads[0];
  leads.forEach((l) => {
    if ((l.name?.length || 0) > (longestNameLead.name?.length || 0)) {
      longestNameLead = l;
    }
  });

  console.log(`Longest Name (${longestNameLead.name.length} chars): "${longestNameLead.name}"`);

  // Count by tier
  const tierCounts = {};
  leads.forEach((l) => {
    const t = l.tier || "U (Unassigned)";
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  });

  // Count by status
  const statusCounts = {};
  leads.forEach((l) => {
    const s = l.status || "new";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  // Distinct areas & categories
  const areas = Array.from(new Set(leads.map((l) => l.area).filter(Boolean)));
  const categories = Array.from(new Set(leads.map((l) => l.category).filter(Boolean)));

  console.log("\nTier Breakdown:", tierCounts);
  console.log("\nStatus Breakdown:", statusCounts);
  console.log(`\nDistinct Areas (${areas.length}):`, areas.slice(0, 10));
  console.log(`Distinct Categories (${categories.length}):`, categories.slice(0, 10));

  // Default Sort Order: tier ASC (A < B < C < U), demand_score DESC, review_count DESC
  const tierOrder = { Tier_1: 1, "Tier 1": 1, A: 1, "Tier_2": 2, "Tier 2": 2, B: 2, "Tier_3": 3, "Tier 3": 3, C: 3 };
  const getTierRank = (t) => {
    if (!t) return 99;
    const str = String(t).trim();
    if (tierOrder[str]) return tierOrder[str];
    if (str.toUpperCase().includes("1") || str.toUpperCase().startsWith("A")) return 1;
    if (str.toUpperCase().includes("2") || str.toUpperCase().startsWith("B")) return 2;
    if (str.toUpperCase().includes("3") || str.toUpperCase().startsWith("C")) return 3;
    return 99; // U or unknown
  };

  const sorted = [...leads].sort((a, b) => {
    const rankA = getTierRank(a.tier);
    const rankB = getTierRank(b.tier);
    if (rankA !== rankB) return rankA - rankB;

    const demandA = a.demand_score ?? -Infinity;
    const demandB = b.demand_score ?? -Infinity;
    if (demandA !== demandB) return demandB - demandA;

    const reviewA = a.review_count ?? -Infinity;
    const reviewB = b.review_count ?? -Infinity;
    return reviewB - reviewA;
  });

  console.log("\nFirst 5 Leads in Default Sort Order:");
  sorted.slice(0, 5).forEach((l, idx) => {
    console.log(
      `${idx + 1}. [${l.tier || "U"}] ${l.name} | Demand: ${l.demand_score ?? "null"} | Reviews: ${l.review_count ?? "null"} | Phone: ${l.phone}`
    );
  });
}

main().catch(console.error);
