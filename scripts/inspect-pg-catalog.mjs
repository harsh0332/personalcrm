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

async function inspectPgCatalog() {
  console.log("Checking if RPC functions exist in database...");

  // Try calling common SQL execution RPC names if any were created
  const rpcCandidates = ["exec_sql", "execute_sql", "run_sql", "exec", "query"];

  for (const rpcName of rpcCandidates) {
    const { data, error } = await adminClient.rpc(rpcName, { sql: "SELECT 1" });
    if (!error) {
      console.log(`RPC '${rpcName}' IS AVAILABLE! Result:`, data);
    } else {
      console.log(`RPC '${rpcName}': ${error.message}`);
    }
  }
}

inspectPgCatalog().catch(console.error);
