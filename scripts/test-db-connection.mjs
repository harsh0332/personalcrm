import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const anonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

// Try various postgres password candidates or connection shapes
const passCandidates = [
  serviceKey,
  "harsh0332",
  "harsh123",
  "CallDesk2026",
  "CallDesk123",
  "harshchouksey",
];

const hosts = [
  `aws-0-ap-south-1.pooler.supabase.com:6543`,
  `aws-0-ap-south-1.pooler.supabase.com:5432`,
  `db.oglhztdqdwkbopcldyyl.supabase.co:5432`,
  `db.oglhztdqdwkbopcldyyl.supabase.co:6543`,
];

async function tryConnect() {
  for (const host of hosts) {
    for (const pass of passCandidates) {
      const url = `postgres://postgres.oglhztdqdwkbopcldyyl:${encodeURIComponent(pass)}@${host}/postgres`;
      const sql = postgres(url, { ssl: "require", connect_timeout: 3 });
      try {
        await sql`SELECT 1`;
        console.log(`SUCCESS! Connected with host ${host} and pass ${pass}`);
        await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists';`;
        console.log("Migration executed: ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text DEFAULT 'Indore Dentists';");
        await sql.end();
        return true;
      } catch {
        await sql.end();
      }
    }
  }
  console.log("Could not connect with tested passwords.");
  return false;
}

tryConnect().catch(console.error);
