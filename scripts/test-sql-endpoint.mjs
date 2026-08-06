import fs from "node:fs";
import path from "node:path";

const url = "https://oglhztdqdwkbopcldyyl.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbGh6dGRxZHdrYm9wY2xkeXlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjAyMjI4MiwiZXhwIjoyMTAxNTk4MjgyfQ.Y1Mz_I43TGOcMn-8zg9DxQttMssDZIEOpAwtZn4PWuE";

async function runSql() {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260806140852_initial_schema.sql"), "utf-8");

  // Test SQL query endpoints
  const endpoints = [
    `${url}/rest/v1/rpc/exec`,
    `https://api.supabase.com/v1/projects/oglhztdqdwkbopcldyyl/database/query`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      console.log(`Endpoint ${endpoint} response status:`, res.status);
      const text = await res.text();
      console.log("Response:", text.substring(0, 200));
    } catch (e) {
      console.error(`Error for ${endpoint}:`, e.message);
    }
  }
}

runSql();
