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
  console.log("Testing get_dashboard_stats RPC endpoint...");

  const { data, error } = await adminClient.rpc("get_dashboard_stats");

  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("RPC Data returned successfully:");
    console.log(JSON.stringify(data, null, 2));
  }
}

main();
