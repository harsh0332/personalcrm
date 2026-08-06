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
  console.log("Applying performed_by migration to live Supabase...");

  // Try applying via raw postgres RPC if available, or test inserting performed_by
  // Supabase service_role allows schema modifications or postgres connection if available.
  // Let's test if rest query works or if we can run raw query via postgres endpoint.

  const sqlQuery = `
    ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  `;

  // We can execute SQL via Supabase REST sql API if enabled or raw RPC
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ query: sqlQuery }),
    });

    console.log("RPC exec_sql response status:", res.status);
  } catch (e) {
    console.log("RPC error:", e.message);
  }
}

main();
