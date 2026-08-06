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

async function getOpenApiSpec() {
  console.log("Fetching OpenAPI spec from PostgREST...");
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  const json = await res.json();
  console.log("OpenAPI Title:", json.info?.title);
  console.log("Available Definitions/Tables:", Object.keys(json.definitions || {}));

  // Check RPC functions available in paths
  const rpcs = Object.keys(json.paths || {}).filter((p) => p.startsWith("/rpc/"));
  console.log("Available RPC endpoints:", rpcs);
}

getOpenApiSpec().catch(console.error);
