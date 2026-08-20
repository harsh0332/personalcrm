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
const allowedEmail = envVars.ALLOWED_EMAIL || "harshcchouksey@gmail.com";

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function seedLeads() {
  console.log("Fetching auth.users via REST API...");

  // 1. Get or create user
  const usersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, { headers });
  const usersData = await usersRes.json();

  let targetUser = (usersData.users || []).find((u) => u.email === allowedEmail);

  if (!targetUser) {
    console.log("Creating user in auth.users...");
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: allowedEmail, email_confirm: true }),
    });
    targetUser = await createRes.json();
  }

  const ownerId = targetUser.id;
  console.log("Seeding 169 initial leads for owner ID:", ownerId);

  const leads = [];
  for (let i = 1; i <= 169; i++) {
    const pad = String(i).padStart(3, "0");
    leads.push({
      owner: ownerId,
      cid: `0x396303a0cef44497:0x_dentist_${pad}`,
      name: `Indore Dental Clinic #${pad}`,
      phone: `919876500${pad}`,
      phone_e164: `+919876500${pad}`,
      area: i % 2 === 0 ? "Vijay Nagar" : "Palasia",
      city: "Indore",
      category: "dentist",
      rating: 4.5,
      review_count: 50 + i * 2,
      tier: i <= 50 ? "A" : i <= 120 ? "B" : "C",
      gap_reasons: ["no website", "low rating"],
      status: "new",
      attempts: 0,
      campaign: "Indore Dentists",
      source_run_id: "indore_dentists.csv",
    });
  }

  // Insert leads in batches of 50
  const BATCH_SIZE = 50;
  for (let b = 0; b < Math.ceil(leads.length / BATCH_SIZE); b++) {
    const batch = leads.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const res = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(batch),
    });
    console.log(`Batch ${b + 1} Status:`, res.status);
  }

  const countRes = await fetch(`${supabaseUrl}/rest/v1/leads?select=id`, {
    headers: { ...headers, Prefer: "count=exact" },
  });
  console.log("\nTotal Live Leads in Database:", countRes.headers.get("content-range"));
}

seedLeads().catch(console.error);
