import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { parseGapReasonsDetailed } from "../src/lib/import-utils.ts";
import { generateCallScript } from "../src/lib/call-script-templates.ts";

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

async function runPhase74VerificationSuite() {
  console.log("=================================================");
  console.log("  PHASE 7.4 UNRECOGNIZED GAP SURFACING VERIFY    ");
  console.log("=================================================\n");

  let totalChecks = 4;
  let passedChecks = 0;

  const testCid = `test_phase7_4_${Date.now()}`;
  let testLeadId = null;

  try {
    // -----------------------------------------------------------------
    // CHECK 1: IMPORT & PRESERVE UNRECOGNIZED GAP REASON ON LEAD ROW
    // -----------------------------------------------------------------
    console.log("--- CHECK 1: UNRECOGNIZED GAP PRESERVATION & SUMMARY LINE ---");
    const rawGapString = "no website; rating 3.4; unknown_future_scraper_signal_999";
    const parsed = parseGapReasonsDetailed(rawGapString);

    console.log(`Raw Import Input : "${rawGapString}"`);
    console.log(`Parsed Output    : ${JSON.stringify(parsed.gap_reasons)}`);
    console.log(`Unrecognized Log : ${JSON.stringify(parsed.unrecognized)}`);

    const summaryLine = `${parsed.unrecognized.length} unrecognized gap reason(s) detected: ${parsed.unrecognized.join(", ")}`;
    console.log(`Rendered Import Summary Line: "${summaryLine}"`);

    // Insert test lead into DB
    const { data: ownerUser } = await adminClient.from("leads").select("owner").limit(1).single();
    const ownerId = ownerUser?.owner;

    const { data: insertedLead, error: insertError } = await adminClient
      .from("leads")
      .insert({
        owner: ownerId,
        cid: testCid,
        name: "[TEST_DATA] Phase 7.4 Test Lead",
        phone: "9999999999",
        phone_e164: "+919999999999",
        gap_reasons: parsed.gap_reasons,
        status: "new",
      })
      .select("id, gap_reasons")
      .single();

    if (insertError) {
      console.error("Failed to insert test lead:", insertError);
    } else {
      testLeadId = insertedLead.id;
      console.log(`Inserted Test Lead ID: ${testLeadId}`);
      console.log(`DB Stored gap_reasons: ${JSON.stringify(insertedLead.gap_reasons)}`);
    }

    const reasonSurvives = insertedLead?.gap_reasons?.includes("unknown_future_scraper_signal_999");

    if (reasonSurvives && parsed.unrecognized.includes("unknown_future_scraper_signal_999")) {
      console.log("[PASS] Unrecognized gap reason survives on DB row and is surfaced in import summary.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 2: CONFIRM KNOWN CATEGORIES STILL DO NOT FRAGMENT
    // -----------------------------------------------------------------
    console.log("--- CHECK 2: CATEGORY NON-FRAGMENTATION ASSERTION ---");
    const { data: dbLeads } = await adminClient.from("leads").select("gap_reasons");
    const categoriesSet = new Set();
    dbLeads.forEach((l) => {
      if (l.gap_reasons && Array.isArray(l.gap_reasons)) {
        l.gap_reasons.forEach((r) => categoriesSet.add(r));
      }
    });

    console.log(`Total active distinct categories/reasons in DB: ${categoriesSet.size}`);
    const ratingValuesFragmented = Array.from(categoriesSet).some((c) => /^rating\s+\d/i.test(c));
    console.log(`Rating values fragmented? : ${ratingValuesFragmented}`);

    if (!ratingValuesFragmented) {
      console.log("[PASS] Known categories do not fragment.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 3: NULL-GAP LEADS AUDIT & ONE FULL SCRIPT
    // -----------------------------------------------------------------
    console.log("--- CHECK 3: NULL-GAP LEADS COUNT & FULL SCRIPT REPORT ---");
    const { data: allLeads } = await adminClient.from("leads").select("*");
    const nullGapLeads = allLeads.filter(
      (l) => !l.gap_reasons || !Array.isArray(l.gap_reasons) || l.gap_reasons.length === 0
    );

    console.log(`Null-gap leads count: ${nullGapLeads.length} of ${allLeads.length} total leads`);
    const targetLead = nullGapLeads[0];
    console.log(`Target Null-Gap Lead: "${targetLead.name}"`);

    const fullScript = generateCallScript(targetLead);
    console.log("Full Script 5-Block Output:");
    console.log(JSON.stringify(fullScript, null, 2));

    if (nullGapLeads.length > 0 && fullScript.opener && fullScript.costOfProblem) {
      console.log("[PASS] Null-gap leads reported and full 5-block script generated cleanly.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 4: CLEAN UP TEST ROWS
    // -----------------------------------------------------------------
    console.log("--- CHECK 4: CLEAN UP TEST ROWS ---");
    if (testLeadId) {
      const { error: delErr } = await adminClient.from("leads").delete().eq("id", testLeadId);
      if (delErr) {
        console.error("Failed to delete test lead:", delErr);
      } else {
        console.log(`Successfully deleted test lead ${testLeadId} from live DB.`);
      }
    }

    const { data: checkDeleted } = await adminClient
      .from("leads")
      .select("id")
      .eq("cid", testCid);

    if (checkDeleted && checkDeleted.length === 0) {
      console.log("[PASS] Test row successfully cleaned up from database.\n");
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

runPhase74VerificationSuite().catch(console.error);
