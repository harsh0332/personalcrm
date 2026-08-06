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
  // Test if duplicates_in_file exists by querying imports table
  const { error } = await adminClient.from("imports").select("duplicates_in_file").limit(1);
  if (error && error.message.includes("duplicates_in_file")) {
    console.log("Column duplicates_in_file needs to be added via SQL.");
  } else {
    console.log("Column duplicates_in_file is ready.");
  }
}

main();
