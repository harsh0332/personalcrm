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
  console.log("Testing SQL execution endpoints...");

  // Endpoint 1: /rest/v1/rpc/query or similar
  const sql = `ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;`;

  // Check if we can create a postgres function or if we can use postgres endpoint
  const url = `${supabaseUrl}/rest/v1/`;
  console.log("Supabase URL:", url);

  // Check if performed_by column exists
  const { data, error } = await adminClient.from("activities").select("performed_by").limit(1);
  console.log("Direct query performed_by:", { data, error });
}

main();
