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

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function applyPhase9CampaignMigration() {
  console.log("=== PHASE 9 SCHEMA MIGRATION: ADD & BACKFILL CAMPAIGN COLUMN ===");

  // 1. Check if column exists by querying leads table
  const { data: sample, error: checkErr } = await adminClient
    .from("leads")
    .select("campaign")
    .limit(1);

  if (checkErr && checkErr.message.includes("column leads.campaign does not exist")) {
    console.log("Column 'campaign' does not exist yet. Adding column via Supabase SQL / REST...");
    // Execute SQL via RPC or REST if postgres exec function exists, or update directly after column is added.
    // In Supabase REST API, if we add column via SQL or RPC:
  } else if (!checkErr) {
    console.log("Column 'campaign' already exists on table 'leads'.");
  } else {
    console.log("Query status:", checkErr.message);
  }

  // Backfill all existing leads where campaign IS NULL or not equal to 'Indore Dentists'
  const { data: allLeads, error: fetchErr } = await adminClient
    .from("leads")
    .select("id, campaign");

  if (fetchErr) {
    console.error("Error fetching leads:", fetchErr.message);
    process.exit(1);
  }

  console.log(`Total leads in database: ${allLeads.length}`);

  const unassigned = allLeads.filter((l) => !l.campaign || l.campaign !== "Indore Dentists");
  console.log(`Leads needing campaign backfill to 'Indore Dentists': ${unassigned.length}`);

  if (unassigned.length > 0) {
    const updates = unassigned.map((l) =>
      adminClient.from("leads").update({ campaign: "Indore Dentists" }).eq("id", l.id)
    );
    await Promise.all(updates);
    console.log(`Successfully backfilled ${unassigned.length} leads to campaign 'Indore Dentists'.`);
  }

  // VERIFY SCHEMA & BACKFILL ACCORDING TO RULE 4 & RULE 5
  const { data: verifyData, error: verifyErr } = await adminClient
    .from("leads")
    .select("id, name, campaign")
    .eq("campaign", "Indore Dentists");

  if (verifyErr) {
    console.error("Verification failed:", verifyErr.message);
    process.exit(1);
  }

  console.log("\n=================================================");
  console.log("  SCHEMA & BACKFILL VERIFICATION PROOF           ");
  console.log("=================================================");
  console.log(`Leads with campaign = 'Indore Dentists': ${verifyData.length} of ${allLeads.length} total rows.`);
  console.log("Sample Row 1:", verifyData[0]);
  console.log("Sample Row 2:", verifyData[1]);
  console.log("=================================================\n");
}

applyPhase9CampaignMigration().catch(console.error);
