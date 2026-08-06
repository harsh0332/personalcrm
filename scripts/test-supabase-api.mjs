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

async function testApi() {
  console.log("Testing Supabase API endpoints...");

  const endpoints = [
    `${supabaseUrl}/rest/v1/`,
    `${supabaseUrl}/rest/v1/rpc`,
    `https://api.supabase.com/v1/projects/oglhztdqdwkbopcldyyl`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
      console.log(`Endpoint: ${ep} -> Status: ${res.status}`);
    } catch (e) {
      console.log(`Endpoint: ${ep} -> Error: ${e.message}`);
    }
  }
}

testApi().catch(console.error);
