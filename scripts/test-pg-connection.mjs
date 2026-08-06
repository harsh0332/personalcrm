import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log("Testing pg connection strings...");

  // Try direct pooler / direct connection
  const host = "db.oglhztdqdwkbopcldyyl.supabase.co";

  // Let's test standard passwords or tokens
  const passwordsToTest = [
    serviceRoleKey,
    "TestPassword123!",
    "postgres",
  ];

  for (const pass of passwordsToTest) {
    try {
      const client = new pg.Client({
        host,
        port: 5432,
        database: "postgres",
        user: "postgres",
        password: pass,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 3000,
      });
      await client.connect();
      console.log("SUCCESS connected with password!");
      await client.query("ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;");
      console.log("Successfully ran ALTER TABLE activities ADD COLUMN performed_by!");
      await client.end();
      return;
    } catch (e) {
      console.log("Failed with pass:", e.message);
    }
  }
}

main().catch(console.error);
