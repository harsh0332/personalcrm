import fs from "node:fs";
import path from "node:path";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function inspectSchema() {
  console.log("=== INSPECTING IMPORTS & LEADS TABLES VIA REST ===");

  // 1. Fetch imports table
  const impRes = await fetch(`${supabaseUrl}/rest/v1/imports?select=*`, { headers });
  const importsData = await impRes.json();
  console.log("\nImports Table Rows Count:", importsData.length || 0);
  console.log("Imports Data:", JSON.stringify(importsData, null, 2));

  // 2. Fetch leads table
  const leadsRes = await fetch(`${supabaseUrl}/rest/v1/leads?select=id,cid,name,campaign,source_run_id,attempts`, { headers });
  const leadsData = await leadsRes.json();
  console.log("\nLeads Table Total Rows:", leadsData.length || 0);

  // Group leads by source_run_id
  const runIdGroups = {};
  leadsData.forEach((l) => {
    const sId = l.source_run_id || "NULL_OR_EMPTY";
    if (!runIdGroups[sId]) runIdGroups[sId] = [];
    runIdGroups[sId].push(l);
  });

  console.log("\nLeads Grouped by source_run_id:");
  Object.entries(runIdGroups).forEach(([runId, leads]) => {
    console.log(` - source_run_id: "${runId}" -> ${leads.length} leads`);
  });

  // Check if imports table schema has specific columns
  const impSampleRes = await fetch(`${supabaseUrl}/rest/v1/imports?limit=1`, { headers });
  console.log("\nImports Table Sample:", await impSampleRes.json());
}

inspectSchema().catch(console.error);
