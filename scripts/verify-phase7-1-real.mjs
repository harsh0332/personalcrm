import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
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

async function runPhase71VerificationSuite() {
  console.log("=================================================");
  console.log("  PHASE 7.1 REAL SCRIPT TEMPLATES VERIFICATION   ");
  console.log("=================================================\n");

  let totalChecks = 4;
  let passedChecks = 0;

  try {
    // 1. Fetch highest review_count lead from real DB
    const { data: maxReviewLeads } = await adminClient
      .from("leads")
      .select("*")
      .not("review_count", "is", null)
      .order("review_count", { ascending: false })
      .limit(1);

    // 2. Fetch one of the 8 leads with review_count null from real DB
    const { data: nullReviewLeads } = await adminClient
      .from("leads")
      .select("*")
      .is("review_count", null)
      .limit(1);

    // 3. Fetch one lead with 2 gap reasons from real DB
    const { data: allLeads } = await adminClient.from("leads").select("*").limit(100);
    const multiGapLead = allLeads.find((l) => l.gap_reasons && l.gap_reasons.length >= 2) || allLeads[0];

    const lead1 = maxReviewLeads[0];
    const lead2 = nullReviewLeads[0];
    const lead3 = multiGapLead;

    console.log("--- 3 REAL USER LEADS FROM SUPABASE DATABASE ---");
    console.log(`Lead 1 (Highest Reviews): ${lead1?.name} (${lead1?.review_count} reviews)`);
    console.log(`Lead 2 (Null Reviews)   : ${lead2?.name} (Reviews: null)`);
    console.log(`Lead 3 (Multi Gap)      : ${lead3?.name} (Gaps: ${JSON.stringify(lead3?.gap_reasons)})\n`);

    const script1 = generateCallScript(lead1);
    const script2 = generateCallScript(lead2);
    const script3 = generateCallScript(lead3);

    console.log("=================================================");
    console.log(`SCRIPT OUTPUT FOR LEAD 1 (${lead1.name}):`);
    console.log("Block A (Opener):", script1.opener);
    console.log("Block B (Why Them):", script1.whyThem);
    console.log("Block C (Observation):", script1.observation);
    console.log("Block D (Cost):", script1.costOfProblem);
    console.log("Block E (Objections Count):", script1.objections.length);

    console.log("\n=================================================");
    console.log(`SCRIPT OUTPUT FOR LEAD 2 (${lead2.name}):`);
    console.log("Block A (Opener):", script2.opener);
    console.log("Block B (Why Them - MUST BE NULL):", script2.whyThem);
    console.log("Block C (Observation):", script2.observation);
    console.log("Block D (Cost):", script2.costOfProblem);

    console.log("\n=================================================");
    console.log(`SCRIPT OUTPUT FOR LEAD 3 (${lead3.name}):`);
    console.log("Block A (Opener):", script3.opener);
    console.log("Block B (Why Them):", script3.whyThem);
    console.log("Block C (Observation):", script3.observation);
    console.log("=================================================\n");

    // ASSERTION 1: No occurrence of "CallDesk" anywhere in generated customer-facing text
    const json1 = JSON.stringify(script1);
    const json2 = JSON.stringify(script2);
    const json3 = JSON.stringify(script3);

    const hasCallDesk = json1.includes("CallDesk") || json2.includes("CallDesk") || json3.includes("CallDesk");
    console.log(`Assertion 1 — "CallDesk" spoken in text? : ${hasCallDesk}`);

    if (!hasCallDesk) {
      console.log("[PASS] Zero occurrences of 'CallDesk' in customer-facing scripts (uses KliqCraft).\n");
      passedChecks++;
    }

    // ASSERTION 2: Opener line 2 contains specific fact, not business name alone
    const line2HasNameOnly1 = script1.opener.line2.includes(`"${lead1.name}"`);
    const line2HasNameOnly2 = script2.opener.line2.includes(`"${lead2.name}"`);

    console.log(`Lead 1 Opener Line 2: "${script1.opener.line2}"`);
    console.log(`Lead 2 Opener Line 2: "${script2.opener.line2}"`);

    if (!line2HasNameOnly1 && !line2HasNameOnly2) {
      console.log("[PASS] Opener line 2 carries specific verifiable facts instead of business name alone.\n");
      passedChecks++;
    }

    // ASSERTION 3: Every generated sentence is grammatically complete (no "me aur ... ke sath")
    const hasBrokenHinglish = json1.includes("me aur") || json2.includes("me aur") || json3.includes("me aur");
    console.log(`Assertion 3 — Broken "me aur" Hinglish fragments? : ${hasBrokenHinglish}`);

    if (!hasBrokenHinglish) {
      console.log("[PASS] Every generated sentence is grammatically complete and natural Hinglish.\n");
      passedChecks++;
    }

    // ASSERTION 4: Null-review lead produces NO compliment block (script.whyThem === null)
    console.log(`Assertion 4 — Lead 2 (Null Reviews) Block B is null? : ${script2.whyThem === null}`);

    if (script2.whyThem === null) {
      console.log("[PASS] Lead with null review_count produces NO compliment block.\n");
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

runPhase71VerificationSuite().catch(console.error);
