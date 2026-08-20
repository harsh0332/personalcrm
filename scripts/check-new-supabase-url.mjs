import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const newSupabaseUrl = "https://sfvejlxbjgcrrmpgkanh.supabase.co";
const anonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

async function checkNewProject() {
  console.log(`Checking connection to ${newSupabaseUrl}...`);

  // 1. Try ping with anon key
  try {
    const res = await fetch(`${newSupabaseUrl}/rest/v1/leads?select=count`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: "count=exact",
      },
    });
    console.log("Anon Key Response Status:", res.status, res.statusText);
    console.log("Anon Key Headers:", Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log("Anon Key Body:", text);
  } catch (err) {
    console.log("Anon Key Fetch Error:", err.message);
  }

  // 2. Try ping with service role key
  try {
    const res = await fetch(`${newSupabaseUrl}/rest/v1/leads?select=count`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "count=exact",
      },
    });
    console.log("\nService Role Key Response Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Service Role Key Body:", text);
  } catch (err) {
    console.log("Service Role Key Fetch Error:", err.message);
  }
}

checkNewProject().catch(console.error);
