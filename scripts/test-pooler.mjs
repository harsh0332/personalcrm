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
  const regions = [
    "aws-0-ap-south-1.pooler.supabase.com",
    "aws-0-us-east-1.pooler.supabase.com",
    "aws-0-eu-central-1.pooler.supabase.com",
  ];

  for (const host of regions) {
    try {
      const client = new pg.Client({
        host,
        port: 6543,
        database: "postgres",
        user: "postgres.oglhztdqdwkbopcldyyl",
        password: serviceRoleKey,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 3000,
      });
      await client.connect();
      console.log("SUCCESS connected to host:", host);
      await client.query("ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;");
      console.log("Successfully ran ALTER TABLE activities ADD COLUMN performed_by!");
      await client.end();
      return;
    } catch (e) {
      console.log(`Failed host ${host}:`, e.message);
    }
  }
}

main().catch(console.error);
