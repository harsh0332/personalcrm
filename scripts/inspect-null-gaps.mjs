import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { generateCallScript } from "../src/lib/call-script-templates.ts";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function inspectNullGapLeads() {
  console.log("=== INSPECTING LEADS WITH NULL OR EMPTY GAP_REASONS ===");

  const { data: leads, error } = await adminClient.from("leads").select("*");
  if (error) {
    console.error("Error fetching leads:", error);
    process.exit(1);
  }

  const nullGapLeads = leads.filter(
    (l) => !l.gap_reasons || !Array.isArray(l.gap_reasons) || l.gap_reasons.length === 0
  );

  console.log(`Total live leads in DB      : ${leads.length}`);
  console.log(`Leads with NULL/Empty gaps  : ${nullGapLeads.length} (${((nullGapLeads.length / leads.length) * 100).toFixed(1)}%)`);

  const tierDistribution = {};
  nullGapLeads.forEach((l) => {
    const t = l.tier || "U (Unassigned)";
    tierDistribution[t] = (tierDistribution[t] || 0) + 1;
  });

  console.log("\nTIER DISTRIBUTION FOR NULL-GAP LEADS:");
  console.table(
    Object.entries(tierDistribution).map(([Tier, Count]) => ({ Tier, Count }))
  );

  if (nullGapLeads.length > 0) {
    const exampleLead = nullGapLeads[0];
    console.log(`\nFULL 5-BLOCK SCRIPT FOR NULL-GAP LEAD: "${exampleLead.name}":`);
    console.log("=================================================");
    const script = generateCallScript(exampleLead);
    console.log("Block A (Opener)     :", JSON.stringify(script.opener, null, 2));
    console.log("Block B (Why Them)   :", JSON.stringify(script.whyThem, null, 2));
    console.log("Block C (Observation):", JSON.stringify(script.observation, null, 2));
    console.log("Block D (Cost)       :", JSON.stringify(script.costOfProblem, null, 2));
    console.log("Block E (Objections) :", JSON.stringify(script.objections, null, 2));
  }
}

inspectNullGapLeads().catch(console.error);
