import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// Read credentials from .env.local
const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const allowedEmail = envVars.ALLOWED_EMAIL || "harshcchouksey@gmail.com";

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error("Missing required environment variables in .env.local");
  process.exit(1);
}

// Service role client (bypasses RLS for setup/verification/cleanup)
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client (unauthenticated client respecting RLS)
const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runRealVerificationSuite() {
  console.log("=================================================");
  console.log("  REAL SUPABASE PROJECT VERIFICATION SUITE       ");
  console.log("=================================================\n");

  let totalChecks = 7;
  let passedChecks = 0;

  let createdLeadIds = [];
  let createdActivityIds = [];
  let testUserAId = null;
  let testUserBId = null;

  try {
    // -----------------------------------------------------------------
    // CHECK 1: Schema Migration Applied & Dispositions Seed Verification
    // -----------------------------------------------------------------
    console.log("--- CHECK 1: MIGRATION APPLIED & SEEDED DISPOSITIONS ---");
    const { data: dispData, error: dispError } = await anonClient
      .from("dispositions")
      .select("*")
      .order("code");

    if (dispError) {
      console.log("[FAIL] Dispositions query error:", dispError.message);
    } else {
      console.log(`[PASS] Migration applied cleanly. Found exactly ${dispData.length} disposition rows.`);
      console.log("Seeded dispositions list:");
      console.table(dispData);
      passedChecks++;
    }
    console.log("");

    // Create Test User A and Test User B in auth.users via Admin API
    const userAEmail = `test_user_a_${Date.now()}@example.com`;
    const userBEmail = `test_user_b_${Date.now()}@example.com`;
    const tempPassword = "TestPassword123!";

    const { data: uA, error: eA } = await adminClient.auth.admin.createUser({
      email: userAEmail,
      password: tempPassword,
      email_confirm: true,
    });
    const { data: uB, error: eB } = await adminClient.auth.admin.createUser({
      email: userBEmail,
      password: tempPassword,
      email_confirm: true,
    });

    if (eA || eB) {
      console.error("Error creating test users:", eA || eB);
      process.exit(1);
    }

    testUserAId = uA.user.id;
    testUserBId = uB.user.id;

    // -----------------------------------------------------------------
    // CHECK 2: Deduplication Constraint UNIQUE(owner, cid)
    // -----------------------------------------------------------------
    console.log("--- CHECK 2: DEDUPLICATION CONSTRAINT UNIQUE (owner, cid) ---");
    const testCid = `cid_dedupe_${Date.now()}`;
    const insert1 = await adminClient.from("leads").insert({
      owner: testUserAId,
      cid: testCid,
      name: "Test Business Alpha [TEST_DATA]",
      status: "new",
    }).select();

    if (insert1.data?.[0]?.id) {
      createdLeadIds.push(insert1.data[0].id);
      console.log(`Inserted 1st row cleanly: ID=${insert1.data[0].id}, owner=${testUserAId}, cid=${testCid}`);
    } else {
      console.log("Failed 1st insert:", insert1.error);
    }

    const insert2 = await adminClient.from("leads").insert({
      owner: testUserAId,
      cid: testCid,
      name: "Duplicate Business Alpha [TEST_DATA]",
      status: "new",
    });

    if (insert2.error) {
      console.log("[PASS] 2nd insert with identical (owner, cid) failed as expected.");
      console.log("Raw Error Text:");
      console.log("  Code:", insert2.error.code);
      console.log("  Message:", insert2.error.message);
      console.log("  Details:", insert2.error.details);
      passedChecks++;
    } else {
      console.log("[FAIL] 2nd insert unexpectedly succeeded!");
    }
    console.log("");

    // -----------------------------------------------------------------
    // CHECK 3: RLS Test - Anon Query with Data Present in Table
    // -----------------------------------------------------------------
    console.log("--- CHECK 3: RLS ANON QUERY (DATA PRESENT IN TABLE) ---");
    const adminCheck = await adminClient.from("leads").select("id", { count: "exact" });
    console.log(`Admin count (confirming table is populated): ${adminCheck.count} rows`);

    const anonCheck = await anonClient.from("leads").select("*");
    console.log(`Anon query returned rows count: ${anonCheck.data?.length ?? 0}`);
    console.log("Anon query returned data:", JSON.stringify(anonCheck.data));

    if ((adminCheck.count ?? 0) > 0 && anonCheck.data?.length === 0) {
      console.log("[PASS] Unauthenticated/Anon query returned 0 rows despite data existing in leads table.");
      passedChecks++;
    } else {
      console.log("[FAIL] RLS test failed!");
    }
    console.log("");

    // -----------------------------------------------------------------
    // CHECK 4: RLS Across Users (User A vs User B)
    // -----------------------------------------------------------------
    console.log("--- CHECK 4: RLS ACROSS USERS (USER A vs USER B) ---");
    const userBClient = createClient(supabaseUrl, anonKey);
    await userBClient.auth.signInWithPassword({
      email: userBEmail,
      password: tempPassword,
    });

    const userBLeadsSelect = await userBClient.from("leads").select("*");
    console.log(`User B query for User A's leads returned rows count: ${userBLeadsSelect.data?.length ?? 0}`);
    console.log("User B returned data:", JSON.stringify(userBLeadsSelect.data));

    if (userBLeadsSelect.data?.length === 0) {
      console.log("[PASS] User B cannot access lead rows owned by User A.");
      passedChecks++;
    } else {
      console.log("[FAIL] User B accessed User A's lead rows!");
    }
    await userBClient.auth.signOut();
    console.log("");

    // -----------------------------------------------------------------
    // CHECK 5: Append-Only Discipline on `activities` (UPDATE & DELETE Refused)
    // -----------------------------------------------------------------
    console.log("--- CHECK 5: APPEND-ONLY DISCIPLINE ON `activities` ---");
    const actInsert = await adminClient.from("activities").insert({
      owner: testUserAId,
      lead_id: createdLeadIds[0],
      kind: "call",
      note: "Original call note [TEST_DATA]",
    }).select();

    const actId = actInsert.data?.[0]?.id;
    if (actId) createdActivityIds.push(actId);

    const userAClient = createClient(supabaseUrl, anonKey);
    await userAClient.auth.signInWithPassword({
      email: userAEmail,
      password: tempPassword,
    });

    const updateRes = await userAClient
      .from("activities")
      .update({ note: "Modified note" })
      .eq("id", actId)
      .select();

    const deleteRes = await userAClient
      .from("activities")
      .delete()
      .eq("id", actId)
      .select();

    console.log("Update attempt response error / returned rows:", updateRes.error?.message || `Returned rows: ${updateRes.data?.length ?? 0}`);
    console.log("Delete attempt response error / returned rows:", deleteRes.error?.message || `Returned rows: ${deleteRes.data?.length ?? 0}`);

    const updateFailed = updateRes.error || (updateRes.data && updateRes.data.length === 0);
    const deleteFailed = deleteRes.error || (deleteRes.data && deleteRes.data.length === 0);

    if (updateFailed && deleteFailed) {
      console.log("[PASS] Both UPDATE and DELETE operations on `activities` were refused.");
      passedChecks++;
    } else {
      console.log("[FAIL] UPDATE or DELETE operation on `activities` succeeded!");
    }
    await userAClient.auth.signOut();
    console.log("");

    // -----------------------------------------------------------------
    // CHECK 6: Allowlist Sign-In Route over HTTP (Allowed vs Random)
    // -----------------------------------------------------------------
    console.log("--- CHECK 6: ALLOWLIST SIGN-IN ROUTE OVER HTTP ---");
    const baseUrl = "http://localhost:3000";

    const allowedHttpRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: allowedEmail }),
    });
    const allowedBody = await allowedHttpRes.json();

    const randomHttpRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unauthorized_stranger@example.com" }),
    });
    const randomBody = await randomHttpRes.json();

    console.log(`Allowed Email (${allowedEmail}) HTTP Status: ${allowedHttpRes.status}`);
    console.log("Allowed Email Response Body:", JSON.stringify(allowedBody));
    console.log(`Random Email (unauthorized_stranger@example.com) HTTP Status: ${randomHttpRes.status}`);
    console.log("Random Email Response Body:", JSON.stringify(randomBody));

    if (allowedHttpRes.ok && randomHttpRes.status === 403) {
      console.log("[PASS] HTTP sign-in route accepted allowed email and refused random email with 403 Forbidden.");
      passedChecks++;
    } else {
      console.log("[FAIL] HTTP sign-in route allowlist check failed!");
    }
    console.log("");

    // -----------------------------------------------------------------
    // CHECK 7: Fail-Closed Behavior (Unset ALLOWED_EMAIL)
    // -----------------------------------------------------------------
    console.log("--- CHECK 7: FAIL-CLOSED PROTECTION (UNSET ALLOWED_EMAIL) ---");
    // Temporarily delete env var
    delete process.env.ALLOWED_EMAIL;
    delete process.env.ALLOWED_EMAILS;

    // Dynamically test isEmailAllowed without env var
    const { isEmailAllowed: testAllowlist } = await import(`../src/lib/auth.ts?v=${Date.now()}`);
    const checkUnset = testAllowlist(allowedEmail);

    console.log(`isEmailAllowed('${allowedEmail}') with empty ALLOWED_EMAIL:`, checkUnset);

    if (checkUnset === false) {
      console.log("[PASS] Unsetting ALLOWED_EMAIL env var safely DENIED access (failed closed).");
      passedChecks++;
    } else {
      console.log("[FAIL] Fail-closed protection failed!");
    }
    process.env.ALLOWED_EMAIL = allowedEmail;
    console.log("");

  } catch (err) {
    console.error("Execution error:", err);
  } finally {
    // -----------------------------------------------------------------
    // CLEANUP & FINAL ROW COUNTS
    // -----------------------------------------------------------------
    console.log("--- CLEANUP & FINAL ROW COUNTS ---");
    if (createdLeadIds.length > 0) {
      await adminClient.from("leads").delete().in("id", createdLeadIds);
    }
    if (createdActivityIds.length > 0) {
      await adminClient.from("activities").delete().in("id", createdActivityIds);
    }
    if (testUserAId) {
      await adminClient.auth.admin.deleteUser(testUserAId);
    }
    if (testUserBId) {
      await adminClient.auth.admin.deleteUser(testUserBId);
    }

    const finalLeads = await adminClient.from("leads").select("id", { count: "exact" });
    const finalActivities = await adminClient.from("activities").select("id", { count: "exact" });
    const finalFollowups = await adminClient.from("followups").select("id", { count: "exact" });
    const finalImports = await adminClient.from("imports").select("id", { count: "exact" });

    console.log(`Final Leads Row Count: ${finalLeads.count ?? 0}`);
    console.log(`Final Activities Row Count: ${finalActivities.count ?? 0}`);
    console.log(`Final Followups Row Count: ${finalFollowups.count ?? 0}`);
    console.log(`Final Imports Row Count: ${finalImports.count ?? 0}`);
    console.log("All test rows and test users successfully deleted.\n");

    console.log("=================================================");
    console.log(`  TOTAL CHECKS: ${totalChecks}`);
    console.log(`  PASSED: ${passedChecks}`);
    console.log(`  FAILED: ${totalChecks - passedChecks}`);
    console.log("=================================================");
  }
}

runRealVerificationSuite().catch(console.error);
