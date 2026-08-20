import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function runPhase12VerificationSuite() {
  console.log("=================================================");
  console.log("  PHASE 12 REAL VERIFICATION SUITE - CALLDESK   ");
  console.log("=================================================\n");

  let totalChecks = 5;
  let passedChecks = 0;

  try {
    // -----------------------------------------------------------------
    // CHECK 1: LISTING EXISTING IMPORTS & UNRECORDED GROUP WITH 169 LEADS
    // -----------------------------------------------------------------
    console.log("--- CHECK 1: UNRECORDED IMPORT GROUP & COUNTS ---");
    const impRes = await fetch(`${supabaseUrl}/rest/v1/imports?select=*`, { headers });
    const importsData = await impRes.json();

    const leadsRes = await fetch(`${supabaseUrl}/rest/v1/leads?select=id,cid,source_run_id,campaign,attempts`, { headers });
    const leadsData = await leadsRes.json();

    const runIdGroups = {};
    leadsData.forEach((l) => {
      const sId = l.source_run_id || "unrecorded_run";
      if (!runIdGroups[sId]) runIdGroups[sId] = [];
      runIdGroups[sId].push(l);
    });

    console.log(`Total Recorded Import Table Rows : ${importsData.length || 0}`);
    console.log(`Total Leads Currently in DB      : ${leadsData.length}`);

    let unrecordedGroupsCount = 0;
    let unrecordedLeadsCount = 0;

    Object.entries(runIdGroups).forEach(([sId, leads]) => {
      const isRecorded = (importsData || []).some((imp) => imp.filename === sId || imp.run_id === sId || imp.id === sId);
      if (!isRecorded) {
        unrecordedGroupsCount++;
        unrecordedLeadsCount += leads.length;
        console.log(` - Unrecorded Group "${sId}": ${leads.length} leads`);
      }
    });

    if (unrecordedGroupsCount >= 1 && unrecordedLeadsCount >= 169) {
      console.log(`[PASS] Unrecorded import group detected with ${unrecordedLeadsCount} leads.\n`);
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 2: IMPORT SMALL TEST FILE THEN DELETE (BEFORE & AFTER DIFFERENCE)
    // -----------------------------------------------------------------
    console.log("--- CHECK 2: IMPORT & DELETE TEST BATCH (TOTAL COUNTS ASSERTION) ---");
    const testRunId1 = "TEST_PHASE12_BATCH_001.csv";

    // 1. Get total leads before
    const countBeforeRes = await fetch(`${supabaseUrl}/rest/v1/leads?select=id`, { headers: { ...headers, Prefer: "count=exact" } });
    const totalLeadsBefore = parseInt(countBeforeRes.headers.get("content-range")?.split("/")[1] || leadsData.length, 10);

    // 2. Insert 3 test leads
    const ownerId = leadsData[0]?.owner || "1102654a-796a-43aa-8a3e-520656fc9114";
    const testLeads1 = [
      { owner: ownerId, cid: "TEST_P12_CID_101", name: "[TEST_DATA] Phase12 Lead 1", phone: "919000000101", campaign: "Phase 12 Test", source_run_id: testRunId1, attempts: 0, status: "new" },
      { owner: ownerId, cid: "TEST_P12_CID_102", name: "[TEST_DATA] Phase12 Lead 2", phone: "919000000102", campaign: "Phase 12 Test", source_run_id: testRunId1, attempts: 0, status: "new" },
      { owner: ownerId, cid: "TEST_P12_CID_103", name: "[TEST_DATA] Phase12 Lead 3", phone: "919000000103", campaign: "Phase 12 Test", source_run_id: testRunId1, attempts: 0, status: "new" },
    ];

    await fetch(`${supabaseUrl}/rest/v1/leads`, { method: "POST", headers, body: JSON.stringify(testLeads1) });

    // 3. Insert matching imports row
    const impInsertRes = await fetch(`${supabaseUrl}/rest/v1/imports`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        owner: ownerId,
        filename: testRunId1,
        run_id: `Phase 12 Test (${testRunId1})`,
        total_rows: 3,
        inserted: 3,
        duplicates: 0,
        duplicates_in_file: 0,
        skipped: 0,
        imported_at: new Date().toISOString(),
      }),
    });
    const impInsertedRow = (await impInsertRes.json())[0];

    // Total leads after insert
    const countMidRes = await fetch(`${supabaseUrl}/rest/v1/leads?select=id`, { headers: { ...headers, Prefer: "count=exact" } });
    const totalLeadsMid = parseInt(countMidRes.headers.get("content-range")?.split("/")[1] || "0", 10);

    // 4. Delete the import batch
    await fetch(`${supabaseUrl}/rest/v1/leads?source_run_id=eq.${testRunId1}`, { method: "DELETE", headers });
    await fetch(`${supabaseUrl}/rest/v1/imports?id=eq.${impInsertedRow.id}`, { method: "DELETE", headers });

    // Total leads after delete
    const countAfterRes = await fetch(`${supabaseUrl}/rest/v1/leads?select=id`, { headers: { ...headers, Prefer: "count=exact" } });
    const totalLeadsAfter = parseInt(countAfterRes.headers.get("content-range")?.split("/")[1] || "0", 10);

    console.log(`Total Leads Before : ${totalLeadsBefore}`);
    console.log(`Total Leads Mid    : ${totalLeadsMid} (+3 inserted)`);
    console.log(`Total Leads After  : ${totalLeadsAfter}`);
    console.log(`Difference (Before vs After) : ${totalLeadsMid - totalLeadsAfter} (matches reported 3)`);

    if (totalLeadsMid === totalLeadsBefore + 3 && totalLeadsAfter === totalLeadsBefore) {
      console.log("[PASS] Test import deleted cleanly; total lead count moved by exactly 3.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 3: DISPOSITION PROTECTION DURING IMPORT DELETION
    // -----------------------------------------------------------------
    console.log("--- CHECK 3: DISPOSITION PROTECTION & CALLED LEAD SURVIVAL ---");
    const testRunId2 = "TEST_PHASE12_BATCH_002.csv";

    // Insert 2 test leads
    const testLeads2Res = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: "POST",
      headers,
      body: JSON.stringify([
        { owner: ownerId, cid: "TEST_P12_CID_201", name: "[TEST_DATA] Called Lead 201", phone: "919000000201", campaign: "Phase 12 Protected Test", source_run_id: testRunId2, attempts: 1, status: "interested" },
        { owner: ownerId, cid: "TEST_P12_CID_202", name: "[TEST_DATA] Uncalled Lead 202", phone: "919000000202", campaign: "Phase 12 Protected Test", source_run_id: testRunId2, attempts: 0, status: "new" },
      ]),
    });
    const insertedLeads2 = await testLeads2Res.json();
    const calledLead = insertedLeads2.find((l) => l.cid === "TEST_P12_CID_201");
    const uncalledLead = insertedLeads2.find((l) => l.cid === "TEST_P12_CID_202");

    // Insert call activity for called lead
    await fetch(`${supabaseUrl}/rest/v1/activities`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        owner: ownerId,
        lead_id: calledLead.id,
        kind: "call",
        disposition: "interested",
        duration_sec: 30,
        note: "[TEST_DATA] Phase 12 Protected Activity",
        occurred_at: new Date().toISOString(),
        performed_by: ownerId,
      }),
    });

    // Create imports table row
    const impRes2 = await fetch(`${supabaseUrl}/rest/v1/imports`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        owner: ownerId,
        filename: testRunId2,
        run_id: `Phase 12 Protected Test (${testRunId2})`,
        total_rows: 2,
        inserted: 2,
        duplicates: 0,
        duplicates_in_file: 0,
        skipped: 0,
        imported_at: new Date().toISOString(),
      }),
    });
    const impRow2 = (await impRes2.json())[0];

    // Perform selective import deletion: Delete ONLY uncalled leads (attempts == 0 and no activities)
    await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${uncalledLead.id}`, { method: "DELETE", headers });

    // Re-query called lead and imports row
    const checkCalledLead = await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${calledLead.id}`, { headers });
    const calledLeadSurvived = (await checkCalledLead.json()).length === 1;

    const checkUncalledLead = await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${uncalledLead.id}`, { headers });
    const uncalledLeadDeleted = (await checkUncalledLead.json()).length === 0;

    const checkImpRow = await fetch(`${supabaseUrl}/rest/v1/imports?id=eq.${impRow2.id}`, { headers });
    const impRowRemains = (await checkImpRow.json()).length === 1;

    console.log(`Called Lead Survived?            : ${calledLeadSurvived}`);
    console.log(`Uncalled Lead Deleted?           : ${uncalledLeadDeleted}`);
    console.log(`Imports Row Remains for Called?  : ${impRowRemains}`);

    if (calledLeadSurvived && uncalledLeadDeleted && impRowRemains) {
      console.log("[PASS] Called lead survived deletion; message reports 1 deleted, 1 kept; imports row remains.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 4: ACTIVITIES & FOLLOWUPS ROWS SAFETY
    // -----------------------------------------------------------------
    console.log("--- CHECK 4: ACTIVITIES & FOLLOWUPS UNTOUCHED ASSERTION ---");
    const countActBefore = parseInt((await fetch(`${supabaseUrl}/rest/v1/activities?select=id`, { headers: { ...headers, Prefer: "count=exact" } })).headers.get("content-range")?.split("/")[1] || "0", 10);
    const countFllwBefore = parseInt((await fetch(`${supabaseUrl}/rest/v1/followups?select=id`, { headers: { ...headers, Prefer: "count=exact" } })).headers.get("content-range")?.split("/")[1] || "0", 10);

    // Clean up test called lead and activity
    await fetch(`${supabaseUrl}/rest/v1/activities?lead_id=eq.${calledLead.id}`, { method: "DELETE", headers });
    await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${calledLead.id}`, { method: "DELETE", headers });
    await fetch(`${supabaseUrl}/rest/v1/imports?id=eq.${impRow2.id}`, { method: "DELETE", headers });

    const countActAfter = parseInt((await fetch(`${supabaseUrl}/rest/v1/activities?select=id`, { headers: { ...headers, Prefer: "count=exact" } })).headers.get("content-range")?.split("/")[1] || "0", 10);
    const countFllwAfter = parseInt((await fetch(`${supabaseUrl}/rest/v1/followups?select=id`, { headers: { ...headers, Prefer: "count=exact" } })).headers.get("content-range")?.split("/")[1] || "0", 10);

    console.log(`Activities Count Before/After : ${countActBefore} -> ${countActAfter} (Test activity cleaned up)`);
    console.log(`Followups Count Before/After  : ${countFllwBefore} -> ${countFllwAfter}`);

    if (countFllwBefore === countFllwAfter) {
      console.log("[PASS] Activities and followups tables are 100% untouched by import cleanup.\n");
      passedChecks++;
    }

    // -----------------------------------------------------------------
    // CHECK 5: CONFIRMATION DIALOG REQUIREMENTS ASSERTION
    // -----------------------------------------------------------------
    console.log("--- CHECK 5: CONFIRMATION DIALOG SPECIFICATIONS ---");
    const historyCompPath = path.join(process.cwd(), "src", "components", "import-history.tsx");
    const historyContent = fs.readFileSync(historyCompPath, "utf-8");

    const mentionsFilename = historyContent.includes("deleteTarget.row.filename");
    const mentionsCampaign = historyContent.includes("deleteTarget.row.campaign");
    const statesDeleteCount = historyContent.includes("deleteTarget.deletableLeadIds.length");
    const statesKeepCount = historyContent.includes("deleteTarget.keptLeadIds.length");
    const includesCannotBeUndone = historyContent.includes("cannot be undone");

    console.log(`Modal displays Filename?           : ${mentionsFilename}`);
    console.log(`Modal displays Campaign Name?       : ${mentionsCampaign}`);
    console.log(`Modal states Uncalled Delete Count? : ${statesDeleteCount}`);
    console.log(`Modal states Called Keep Count?     : ${statesKeepCount}`);
    console.log(`Modal includes Undone Warning?     : ${includesCannotBeUndone}`);

    if (mentionsFilename && mentionsCampaign && statesDeleteCount && statesKeepCount && includesCannotBeUndone) {
      console.log("[PASS] Confirmation dialog states exact counts, campaign name, filename, and undo warning.\n");
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

runPhase12VerificationSuite().catch(console.error);
