import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { parseGapReasons } from "../src/lib/import-utils.ts";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing required environment variables in .env.local");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function runPhase73VerificationSuite() {
  console.log("=================================================");
  console.log("  PHASE 7.3 REAL DATA AUDIT & VERIFICATION       ");
  console.log("=================================================\n");

  let totalChecks = 4;
  let passedChecks = 0;

  try {
    // -----------------------------------------------------------------
    // CHECK 1: FINAL GAP-REASON CATEGORY LIST & COUNTS PER CATEGORY
    // -----------------------------------------------------------------
    console.log("--- CHECK 1: FINAL STABLE GAP-REASON CATEGORIES & LEADS COUNT ---");
    const { data: leads } = await adminClient.from("leads").select("gap_reasons");

    const categoryCounts = new Map();
    leads.forEach((l) => {
      if (l.gap_reasons && Array.isArray(l.gap_reasons)) {
        l.gap_reasons.forEach((cat) => {
          categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
        });
      }
    });

    console.log("Final Stable Gap Categories Breakdown:");
    console.table(
      Array.from(categoryCounts.entries()).map(([Category, LeadCount]) => ({
        Category,
        LeadCount,
      }))
    );

    const hasLowRating = categoryCounts.has("low rating");
    const hasNoValueCategories = !Array.from(categoryCounts.keys()).some((k) =>
      /rating\s+\d/i.test(k)
    );

    if (hasLowRating && hasNoValueCategories) {
      console.log("[PASS] Rating values collapsed into stable 'low rating' category without category fragmentation.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 2: SPLITTER BEHAVIOR WITH UNRECOGNIZED REASONS
    // -----------------------------------------------------------------
    console.log("--- CHECK 2: SPLITTER BEHAVIOR WITH UNRECOGNIZED REASON ---");
    const rawInput = "no website; rating 3.4; unknown_alien_reason_abc";
    const parsedResult = parseGapReasons(rawInput);

    console.log(`Raw Input  : "${rawInput}"`);
    console.log(`Parsed Output: ${JSON.stringify(parsedResult)}`);

    if (
      parsedResult &&
      parsedResult.includes("no website") &&
      parsedResult.includes("low rating") &&
      !parsedResult.includes("unknown_alien_reason_abc")
    ) {
      console.log("[PASS] Splitter collapses rating values and ignores unrecognized category strings safely.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 3: LIST OF LEADS OVER 1000 REVIEWS
    // -----------------------------------------------------------------
    console.log("--- CHECK 3: LEADS WITH >1000 REVIEWS REPORT ---");
    const { data: highReviewLeads } = await adminClient
      .from("leads")
      .select("name, category, area, review_count, gap_reasons")
      .gt("review_count", 1000)
      .order("review_count", { ascending: false });

    console.log(`Leads with >1000 reviews count: ${highReviewLeads.length}`);
    console.table(highReviewLeads);

    if (highReviewLeads.length === 4) {
      console.log("[PASS] Exactly 4 leads over 1000 reviews identified and inspected.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 4: LEADS TAB REVIEW-COUNT RANGE FILTER SERVER-SIDE QUERY
    // -----------------------------------------------------------------
    console.log("--- CHECK 4: REVIEW-COUNT RANGE FILTER QUERY PROOF ---");
    const { count: countGt1000 } = await adminClient
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gt("review_count", 1000);

    const { count: countUnder50 } = await adminClient
      .from("leads")
      .select("id", { count: "exact", head: true })
      .lt("review_count", 50);

    const { count: countUnreviewed } = await adminClient
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("review_count", null);

    console.log(`Direct SQL >1000 reviews count : ${countGt1000}`);
    console.log(`Direct SQL <50 reviews count   : ${countUnder50}`);
    console.log(`Direct SQL Unreviewed count    : ${countUnreviewed}`);

    if (countGt1000 === 4 && countUnder50 > 0 && countUnreviewed === 8) {
      console.log("[PASS] Review-count range filter SQL queries execute cleanly.\n");
      passedChecks++;
    }

  } catch (err) {
    console.error("Verification execution error:", err);
  } finally {
    console.log("=================================================");
    console.log(`  TOTAL CHECKS: ${totalChecks}`);
    console.log(`  PASSED: ${passedChecks}`);
    console.log(`  FAILED: ${totalChecks - passedChecks}`);
    console.log("=================================================");
  }
}

runPhase73VerificationSuite().catch(console.error);
