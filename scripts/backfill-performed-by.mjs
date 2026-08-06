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
  console.log("Backfilling existing activities rows with performed_by = owner...");

  const { data: acts, error: fetchErr } = await adminClient
    .from("activities")
    .select("id, owner, performed_by")
    .is("performed_by", null);

  if (fetchErr) {
    console.error("Error fetching activities for backfill:", fetchErr);
    return;
  }

  console.log(`Found ${acts.length} activities with null performed_by.`);

  for (const act of acts) {
    if (act.owner) {
      const { error: upErr } = await adminClient
        .from("activities")
        .update({ performed_by: act.owner })
        .eq("id", act.id);

      if (upErr) console.error(`Error updating act ${act.id}:`, upErr);
    }
  }

  console.log("Backfill complete!");
}

main();
