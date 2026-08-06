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

async function findRpcs() {
  console.log("Searching for available RPC functions in Supabase...");

  // PostgREST swagger / openapi spec lists all callable RPC routes under paths
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  const spec = await res.json();
  const paths = Object.keys(spec.paths || {});
  const rpcPaths = paths.filter((p) => p.startsWith("/rpc/"));

  console.log("Available /rpc/ paths in schema cache:");
  rpcPaths.forEach((p) => console.log(" -", p));
}

findRpcs().catch(console.error);
