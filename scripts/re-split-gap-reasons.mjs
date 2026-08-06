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

export function normalizeGapReasons(rawReasons) {
  if (!rawReasons) return null;
  if (!Array.isArray(rawReasons)) {
    if (typeof rawReasons === "string") rawReasons = [rawReasons];
    else return null;
  }

  const result = new Set();

  rawReasons.forEach((item) => {
    if (typeof item !== "string") return;
    const parts = item.split(";");
    parts.forEach((p) => {
      let trimmed = p.trim();
      if (!trimmed) return;

      if (trimmed.includes(" — ")) {
        trimmed = trimmed.split(" — ")[0].trim();
      } else if (trimmed.includes(" - ")) {
        trimmed = trimmed.split(" - ")[0].trim();
      }

      result.add(trimmed);
    });
  });

  const arr = Array.from(result);
  return arr.length > 0 ? arr : null;
}

async function reSplitLiveGapReasons() {
  console.log("=== RE-SPLITTING GAP_REASONS ON 169 LIVE LEADS IN SUPABASE DB ===");

  const { data: leads, error } = await adminClient.from("leads").select("id, name, gap_reasons");
  if (error) {
    console.error("Failed to fetch leads:", error);
    process.exit(1);
  }

  const beforeCategories = new Set();
  leads.forEach((l) => {
    if (l.gap_reasons && Array.isArray(l.gap_reasons)) {
      l.gap_reasons.forEach((r) => beforeCategories.add(r));
    }
  });

  console.log(`BEFORE Re-split: ${beforeCategories.size} distinct raw gap_reasons shapes.`);

  const updates = [];
  const afterCategories = new Set();

  for (const lead of leads) {
    if (!lead.gap_reasons) continue;

    const newReasons = normalizeGapReasons(lead.gap_reasons);
    if (newReasons) {
      newReasons.forEach((r) => afterCategories.add(r));
      updates.push(
        adminClient.from("leads").update({ gap_reasons: newReasons }).eq("id", lead.id)
      );
    }
  }

  await Promise.all(updates);

  console.log(`Successfully updated ${updates.length} leads in live database.`);
  console.log(`AFTER Re-split: ${afterCategories.size} distinct clean short gap_reasons categories.`);
  console.log("\nCLEAN SHORT CATEGORIES IN DATABASE:");
  console.log("====================================");
  for (const cat of afterCategories) {
    console.log(` - "${cat}"`);
  }
}

reSplitLiveGapReasons().catch(console.error);
