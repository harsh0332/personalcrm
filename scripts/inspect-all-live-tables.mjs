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
  console.log("=== AUDITING ALL LIVE SUPABASE TABLES & COLUMNS ===");

  const tables = ["leads", "activities", "followups", "imports", "dispositions"];

  for (const t of tables) {
    const { data, error } = await adminClient.from(t).select("*").limit(1);
    if (error) {
      console.error(`Error querying ${t}:`, error);
    } else {
      const sampleRow = data && data.length > 0 ? data[0] : {};
      console.log(`\nTable [${t}] Columns:`);
      console.log(Object.keys(sampleRow));
    }
  }
}

main().catch(console.error);
