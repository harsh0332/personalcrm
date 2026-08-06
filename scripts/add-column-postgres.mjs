import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

// Supabase direct connection string format
const dbUrl = envVars.DATABASE_URL || `postgres://postgres.oglhztdqdwkbopcldyyl:${envVars.SUPABASE_SERVICE_ROLE_KEY}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

async function run() {
  console.log("Connecting to PostgreSQL...");
  const sql = postgres(dbUrl, { ssl: "require", connect_timeout: 10 });

  try {
    console.log("Executing ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists';");
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists';`;
    console.log("Migration executed successfully!");
  } catch (err) {
    console.error("Postgres connection error:", err.message);
  } finally {
    await sql.end();
  }
}

run().catch(console.error);
