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

async function executeSql() {
  console.log("Executing SQL migration: ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists'...");

  // Send raw SQL query to Supabase via management / pg REST or RPC endpoint
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      sql_query: "ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists';",
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.log("RPC exec_sql status:", res.status, txt);

    // Try executing SQL via Supabase SQL endpoint if available
    const sqlRes = await fetch(`${supabaseUrl}/pg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        query: "ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists';",
      }),
    });
    console.log("pg status:", sqlRes.status, await sqlRes.text());
  } else {
    console.log("SQL Migration executed successfully!");
  }
}

executeSql().catch(console.error);
