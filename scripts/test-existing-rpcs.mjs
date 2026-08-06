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

async function testRPCs() {
  console.log("Testing get_dashboard_stats RPC...");
  const { data, error } = await adminClient.rpc("get_dashboard_stats", {
    start_date: "2026-08-01T00:00:00Z",
    end_date: "2026-08-31T23:59:59Z",
  });

  if (error) console.error("get_dashboard_stats error:", error.message);
  else console.log("get_dashboard_stats success!");
}

testRPCs().catch(console.error);
