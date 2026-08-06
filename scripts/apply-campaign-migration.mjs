import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const dbPassword = process.env.DB_PASSWORD || process.argv[2];
const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!dbPassword) {
  console.error("Please provide DB_PASSWORD as an environment variable or command line argument.");
  process.exit(1);
}

const projectRef = "oglhztdqdwkbopcldyyl";

// Host connection options
const connectionUrls = [
  `postgres://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  `postgres://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`,
];

async function runMigration() {
  console.log("=== EXECUTING PHASE 9 MIGRATION ON SUPABASE DATABASE ===");
  let connected = false;
  let sqlClient = null;

  for (const url of connectionUrls) {
    try {
      sqlClient = postgres(url, { ssl: "require", connect_timeout: 5 });
      await sqlClient`SELECT 1`;
      console.log(`Successfully connected to Supabase PostgreSQL!`);
      connected = true;
      break;
    } catch (e) {
      if (sqlClient) await sqlClient.end();
      sqlClient = null;
    }
  }

  if (!connected || !sqlClient) {
    console.error("Failed to connect to PostgreSQL with provided password.");
    process.exit(1);
  }

  try {
    // 1. ADD COLUMN
    console.log("Running: ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists';");
    await sqlClient`ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists';`;
    console.log("Column 'campaign' added successfully!");

    // 2. BACKFILL EXISTING ROWS
    console.log("Backfilling existing rows to 'Indore Dentists'...");
    await sqlClient`UPDATE leads SET campaign = 'Indore Dentists' WHERE campaign IS NULL OR campaign = '';`;

    // 3. VERIFY SCHEMA & BACKFILL ACCORDING TO RULE 4 & RULE 5
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: leads, error } = await adminClient
      .from("leads")
      .select("id, name, campaign")
      .eq("campaign", "Indore Dentists");

    if (error) {
      console.error("Verification failed:", error.message);
      process.exit(1);
    }

    console.log("\n=================================================");
    console.log("  SCHEMA & BACKFILL VERIFICATION PROOF           ");
    console.log("=================================================");
    console.log(`Leads with campaign = 'Indore Dentists': ${leads.length} rows.`);
    console.log("Sample Row 1:", leads[0]);
    console.log("Sample Row 2:", leads[1]);
    console.log("=================================================\n");
  } finally {
    await sqlClient.end();
  }
}

runMigration().catch(console.error);
