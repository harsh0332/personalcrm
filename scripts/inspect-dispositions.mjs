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
  const { data: dispositions, error } = await adminClient
    .from("dispositions")
    .select("code, label, next_status, follow_up_days, sets_dnc");

  if (error) {
    console.error("Error fetching dispositions:", error);
    return;
  }

  console.log("=== DISPOSITIONS IN DATABASE ===");
  console.table(dispositions);
}

main();
