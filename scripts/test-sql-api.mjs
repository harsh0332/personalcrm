import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = "oglhztdqdwkbopcldyyl";

async function main() {
  console.log("Testing Management API SQL query...");

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      query: "ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;",
    }),
  });

  console.log("Management API Response Status:", res.status);
  const text = await res.text();
  console.log("Response Body:", text);
}

main();
