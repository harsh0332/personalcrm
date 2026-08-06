import { createClient } from "@supabase/supabase-js";
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

const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function inspectLiveGapReasons() {
  console.log("=== INSPECTING LIVE LEADS GAP_REASONS FROM SUPABASE DB ===");

  const { data: leads, error } = await adminClient
    .from("leads")
    .select("id, name, gap_reasons");

  if (error) {
    console.error("Error fetching leads:", error);
    process.exit(1);
  }

  console.log(`Total live leads in DB: ${leads.length}`);

  const rawGapShapes = new Map();
  let totalWithGap = 0;

  leads.forEach((l) => {
    if (l.gap_reasons && Array.isArray(l.gap_reasons) && l.gap_reasons.length > 0) {
      totalWithGap++;
      const rawStr = JSON.stringify(l.gap_reasons);
      rawGapShapes.set(rawStr, (rawGapShapes.get(rawStr) || 0) + 1);
    }
  });

  console.log(`Leads with non-null gap_reasons: ${totalWithGap}`);
  console.log("\nRAW DISTINCT GAP_REASONS SHAPES IN LIVE DATABASE:");
  console.log("=================================================");
  for (const [shape, count] of rawGapShapes.entries()) {
    console.log(`${count} rows -> ${shape}`);
  }
}

inspectLiveGapReasons().catch(console.error);
