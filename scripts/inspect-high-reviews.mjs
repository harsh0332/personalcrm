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

async function inspectHighReviewLeads() {
  console.log("=== INSPECTING LEADS WITH REVIEW_COUNT > 1000 FROM SUPABASE DB ===");

  const { data: leads, error } = await adminClient
    .from("leads")
    .select("id, name, category, review_count, rating, gap_reasons, area")
    .gt("review_count", 1000)
    .order("review_count", { ascending: false });

  if (error) {
    console.error("Error fetching high review leads:", error);
    process.exit(1);
  }

  console.log(`Total leads with review_count > 1000: ${leads.length}\n`);

  leads.forEach((l, i) => {
    console.log(`${i + 1}. Name        : ${l.name}`);
    console.log(`   Category    : ${l.category || "N/A"}`);
    console.log(`   Area        : ${l.area || "N/A"}`);
    console.log(`   Reviews     : ${l.review_count} (Rating: ${l.rating || "N/A"})`);
    console.log(`   Gap Reasons : ${JSON.stringify(l.gap_reasons)}`);
    console.log("-------------------------------------------------");
  });
}

inspectHighReviewLeads().catch(console.error);
