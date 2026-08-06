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

export const KNOWN_GAP_CATEGORIES = new Set([
  "no website",
  "social/directory page only",
  "wrong primary GMB category",
  "listing name violates Google naming policy",
  "listing unclaimed",
  "under 10 reviews",
  "no hours",
  "no photos",
  "low rating",
]);

export function normalizeAndCategorizeGapReasons(rawReasons) {
  if (!rawReasons || !Array.isArray(rawReasons)) return null;

  const resultSet = new Set();
  const unrecognizedList = [];

  rawReasons.forEach((item) => {
    if (typeof item !== "string") return;

    let cat = item.trim();

    // 1. Collapse any "rating X.X" or "rating <number>" into "low rating"
    if (/^rating\s+\d+(\.\d+)?$/i.test(cat) || /^rating\s+/i.test(cat)) {
      cat = "low rating";
    }

    // 2. Check against known categories
    if (KNOWN_GAP_CATEGORIES.has(cat.toLowerCase())) {
      resultSet.add(cat.toLowerCase());
    } else {
      // Report unrecognized category
      unrecognizedList.push(cat);
      // Still attempt fallback matching
      if (cat.toLowerCase().includes("website")) resultSet.add("no website");
      else if (cat.toLowerCase().includes("social")) resultSet.add("social/directory page only");
      else if (cat.toLowerCase().includes("category")) resultSet.add("wrong primary GMB category");
      else if (cat.toLowerCase().includes("policy") || cat.toLowerCase().includes("name")) resultSet.add("listing name violates Google naming policy");
      else if (cat.toLowerCase().includes("unclaimed")) resultSet.add("listing unclaimed");
      else if (cat.toLowerCase().includes("hours")) resultSet.add("no hours");
      else if (cat.toLowerCase().includes("photo")) resultSet.add("no photos");
      else if (cat.toLowerCase().includes("review")) resultSet.add("under 10 reviews");
      else if (cat.toLowerCase().includes("rating")) resultSet.add("low rating");
    }
  });

  const arr = Array.from(resultSet);
  return {
    categories: arr.length > 0 ? arr : null,
    unrecognized: unrecognizedList,
  };
}

async function collapseGapCategoriesInDB() {
  console.log("=== COLLAPSING RATING VALUES INTO 'low rating' IN LIVE SUPABASE DB ===");

  const { data: leads, error } = await adminClient.from("leads").select("id, gap_reasons");
  if (error) {
    console.error("Failed to fetch leads:", error);
    process.exit(1);
  }

  const updates = [];
  const categoryCounts = new Map();

  for (const lead of leads) {
    if (!lead.gap_reasons) continue;

    const res = normalizeAndCategorizeGapReasons(lead.gap_reasons);
    if (res.categories) {
      res.categories.forEach((cat) => {
        categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
      });

      updates.push(
        adminClient.from("leads").update({ gap_reasons: res.categories }).eq("id", lead.id)
      );
    }
  }

  await Promise.all(updates);

  console.log(`Successfully collapsed gap categories for ${updates.length} leads in live database.\n`);
  console.log("FINAL STABLE GAP REASONS CATEGORY LIST & LEAD COUNTS:");
  console.log("======================================================");
  for (const [cat, count] of categoryCounts.entries()) {
    console.log(` - "${cat}": ${count} leads`);
  }

  // Demonstrate what the splitter does with an unrecognized reason
  console.log("\n--- DEMONSTRATION OF UNRECOGNIZED REASON SPLITTER HANDLING ---");
  const testUnrecognized = normalizeAndCategorizeGapReasons(["exotic_alien_reason_123", "rating 2.8"]);
  console.log("Input: ['exotic_alien_reason_123', 'rating 2.8']");
  console.log("Parsed Categories:", testUnrecognized.categories);
  console.log("Reported Unrecognized Log:", testUnrecognized.unrecognized);
}

collapseGapCategoriesInDB().catch(console.error);
