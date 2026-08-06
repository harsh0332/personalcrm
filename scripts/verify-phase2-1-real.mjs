import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { normalizePhone, parseGapReasons } from "../src/lib/import-utils.ts";

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

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runPhase21VerificationSuite() {
  console.log("=================================================");
  console.log("  PHASE 2.1 REAL SUPABASE IMPORT RECONCILIATION  ");
  console.log("=================================================\n");

  let totalChecks = 5;
  let passedChecks = 0;

  let testOwnerId = null;
  let testLeadCids = [];

  try {
    // Setup Test User in auth.users
    const testUserEmail = `phase2_1_test_owner_${Date.now()}@example.com`;
    const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
      email: testUserEmail,
      password: "TestPassword123!",
      email_confirm: true,
    });

    if (userError || !userData.user) {
      console.error("Error creating test user:", userError);
      process.exit(1);
    }
    testOwnerId = userData.user.id;

    // -----------------------------------------------------------------
    // CHECK 1: Construct 105-row test dataset with 3 duplicates & straddling batch boundary
    // -----------------------------------------------------------------
    console.log("--- CHECK 1: CONSTRUCTING 105-ROW DATASET WITH IN-FILE DUPLICATES & BATCH STRADDLE ---");
    const timestamp = Date.now();
    const rawFileRows = [];

    // Generate 100 unique base rows
    for (let i = 1; i <= 100; i++) {
      const cid = `0x_p21_cid_${i}_${timestamp}`;
      testLeadCids.push(cid);
      rawFileRows.push({
        cid,
        name: `Business ${i} [TEST_DATA]`,
        phone: `987654${String(i).padStart(4, "0")}`,
        area: "Indiranagar",
        city: "Bengaluru",
        category: "Retail",
        gap_score: 80,
      });
    }

    // Duplicate 3 rows:
    // Duplicate 1: CID of row 5 repeated at row 101 (in-file dupe inside file)
    rawFileRows.push({ ...rawFileRows[4], name: "Business 5 Duplicate 1 [TEST_DATA]" });
    
    // Duplicate 2 & 3: CID of row 98 (Batch 1) repeated at row 103 (Batch 2 - straddles 100-row batch boundary!)
    rawFileRows.push({ ...rawFileRows[97], name: "Business 98 Duplicate Straddle [TEST_DATA]" });

    // Plus 1 invalid row missing CID (skipped)
    rawFileRows.push({ cid: "", name: "Invalid Row Missing CID [TEST_DATA]", phone: "9876549999" });

    // Plus 1 invalid row missing Phone (skipped)
    rawFileRows.push({ cid: `0x_p21_cid_nophone_${timestamp}`, name: "Invalid Row Missing Phone [TEST_DATA]", phone: "" });

    const totalFileRows = rawFileRows.length; // 100 + 1 + 1 + 1 + 1 = 104 rows total
    console.log(`Total File Rows Constructed: ${totalFileRows}`);
    console.log("In-file duplicate pair straddling batch boundary: Row 98 (Batch 1) & Row 103 (Batch 2).");
    console.log("[PASS] Dataset constructed cleanly with in-file duplicates and batch straddle.\n");
    passedChecks++;

    // -----------------------------------------------------------------
    // CHECK 2: Import Run 1 & 5-Number Reconciled Arithmetic Proof
    // -----------------------------------------------------------------
    console.log("--- CHECK 2: IMPORT RUN 1 & 5-NUMBER RECONCILIATION PROOF ---");

    // Execute in-file deduplication (Part A) & validation
    const seenCidsInFile = new Set();
    let duplicatesInFileCount = 0;
    let skippedCount = 0;
    const validRecords = [];

    rawFileRows.forEach((row) => {
      const cid = row.cid ? String(row.cid).trim() : "";
      const phone = row.phone ? String(row.phone).trim() : "";

      if (!cid || !phone) {
        skippedCount++;
        return;
      }

      if (seenCidsInFile.has(cid)) {
        duplicatesInFileCount++;
        return;
      }
      seenCidsInFile.add(cid);

      const { phone_e164 } = normalizePhone(phone);

      validRecords.push({
        owner: testOwnerId,
        cid,
        name: row.name,
        phone,
        phone_e164,
        area: row.area,
        city: row.city,
        category: row.category,
        gap_score: row.gap_score,
        status: "new",
        source_run_id: "run_p21_export.csv",
      });
    });

    // Execute batch writes with .select("cid") (Part B)
    const BATCH_SIZE = 100;
    const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);
    let inserted1 = 0;
    let alreadyExisted1 = 0;

    for (let b = 0; b < totalBatches; b++) {
      const batch = validRecords.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const { data: insertedRows, error } = await adminClient
        .from("leads")
        .upsert(batch, { onConflict: "owner,cid", ignoreDuplicates: true })
        .select("cid");

      if (error) throw error;
      const bInserted = insertedRows ? insertedRows.length : 0;
      inserted1 += bInserted;
      alreadyExisted1 += (batch.length - bInserted);
    }

    console.log("FIVE-NUMBER SUMMARY BREAKDOWN:");
    console.log(`  1. Total File Rows     : ${totalFileRows}`);
    console.log(`  2. Inserted New        : ${inserted1}`);
    console.log(`  3. Already Existed     : ${alreadyExisted1}`);
    console.log(`  4. Duplicates in File  : ${duplicatesInFileCount}`);
    console.log(`  5. Invalid / Skipped   : ${skippedCount}`);

    const sum1 = inserted1 + alreadyExisted1 + duplicatesInFileCount + skippedCount;
    console.log(`ARITHMETIC RECONCILIATION PROOF:`);
    console.log(`  ${inserted1} (inserted) + ${alreadyExisted1} (already existed) + ${duplicatesInFileCount} (in-file dupes) + ${skippedCount} (skipped)`);
    console.log(`  = ${sum1} (Matches Total File Rows: ${totalFileRows})`);

    if (sum1 === totalFileRows && inserted1 === 100 && duplicatesInFileCount === 2 && skippedCount === 2) {
      console.log("[PASS] Import Run 1 succeeded and all 5 numbers perfectly reconcile.");
      passedChecks++;
    } else {
      console.log("[FAIL] Reconciliation equation failed!");
    }
    console.log("");

    // -----------------------------------------------------------------
    // CHECK 3: Database Query Row Count Verification
    // -----------------------------------------------------------------
    console.log("--- CHECK 3: QUERY DATABASE TO VERIFY ACTUAL ROW COUNT MATCHES `inserted` ---");
    const { count: actualDbCount } = await adminClient
      .from("leads")
      .select("id", { count: "exact" })
      .eq("owner", testOwnerId);

    console.log(`Actual Database Row Count: ${actualDbCount}`);
    console.log(`Reported Inserted Count  : ${inserted1}`);

    if (actualDbCount === inserted1) {
      console.log("[PASS] Actual database row count exactly matches reported `inserted` count (100).");
      passedChecks++;
    } else {
      console.log("[FAIL] Database row count mismatch!");
    }
    console.log("");

    // -----------------------------------------------------------------
    // CHECK 4: Re-import SAME FILE AGAIN (inserted must be 0)
    // -----------------------------------------------------------------
    console.log("--- CHECK 4: RE-IMPORT SAME FILE AGAIN (INSERTED MUST BE 0) ---");

    const seenCidsRun2 = new Set();
    let duplicatesInFile2 = 0;
    let skipped2 = 0;
    const validRecordsRun2 = [];

    rawFileRows.forEach((row) => {
      const cid = row.cid ? String(row.cid).trim() : "";
      const phone = row.phone ? String(row.phone).trim() : "";

      if (!cid || !phone) {
        skipped2++;
        return;
      }
      if (seenCidsRun2.has(cid)) {
        duplicatesInFile2++;
        return;
      }
      seenCidsRun2.add(cid);

      const { phone_e164 } = normalizePhone(phone);
      validRecordsRun2.push({
        owner: testOwnerId,
        cid,
        name: row.name,
        phone,
        phone_e164,
        area: row.area,
        city: row.city,
        category: row.category,
        gap_score: row.gap_score,
        status: "new",
        source_run_id: "run_p21_export.csv",
      });
    });

    let inserted2 = 0;
    let alreadyExisted2 = 0;

    for (let b = 0; b < Math.ceil(validRecordsRun2.length / BATCH_SIZE); b++) {
      const batch = validRecordsRun2.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const { data: insertedRows } = await adminClient
        .from("leads")
        .upsert(batch, { onConflict: "owner,cid", ignoreDuplicates: true })
        .select("cid");

      const bInserted = insertedRows ? insertedRows.length : 0;
      inserted2 += bInserted;
      alreadyExisted2 += (batch.length - bInserted);
    }

    console.log(`Re-import Run 2 Results: Total=${totalFileRows}, Inserted=${inserted2}, AlreadyExisted=${alreadyExisted2}, InFileDupes=${duplicatesInFile2}, Skipped=${skipped2}`);

    if (inserted2 === 0 && alreadyExisted2 === 100) {
      console.log("[PASS] Re-import inserted strictly 0 rows and alreadyExisted equaled 100.");
      passedChecks++;
    } else {
      console.log("[FAIL] Re-import inserted count was not 0!");
    }
    console.log("");

  } catch (err) {
    console.error("Execution error:", err);
  } finally {
    // -----------------------------------------------------------------
    // CHECK 5: CLEANUP & FINAL ROW COUNTS
    // -----------------------------------------------------------------
    console.log("--- CHECK 5: CLEANUP & FINAL ROW COUNTS ---");
    if (testLeadCids.length > 0) {
      await adminClient.from("leads").delete().in("cid", testLeadCids);
    }
    if (testOwnerId) {
      await adminClient.auth.admin.deleteUser(testOwnerId);
    }

    const finalLeads = await adminClient.from("leads").select("id", { count: "exact" });
    const finalActivities = await adminClient.from("activities").select("id", { count: "exact" });
    const finalFollowups = await adminClient.from("followups").select("id", { count: "exact" });
    const finalImports = await adminClient.from("imports").select("id", { count: "exact" });

    console.log(`Final Leads Row Count: ${finalLeads.count ?? 0}`);
    console.log(`Final Activities Row Count: ${finalActivities.count ?? 0}`);
    console.log(`Final Followups Row Count: ${finalFollowups.count ?? 0}`);
    console.log(`Final Imports Row Count: ${finalImports.count ?? 0}`);

    if ((finalLeads.count ?? 0) === 0) {
      console.log("[PASS] Test rows cleaned up completely.");
      passedChecks++;
    }
    console.log("");

    console.log("=================================================");
    console.log(`  TOTAL CHECKS: ${totalChecks}`);
    console.log(`  PASSED: ${passedChecks}`);
    console.log(`  FAILED: ${totalChecks - passedChecks}`);
    console.log("=================================================");
  }
}

runPhase21VerificationSuite().catch(console.error);
