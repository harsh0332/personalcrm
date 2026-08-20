import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envContent = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const allowedEmail = envVars.ALLOWED_EMAIL || "harshcchouksey@gmail.com";

const supabase = createClient(supabaseUrl, serviceKey);

async function ensureUser() {
  console.log("Checking auth.users for:", allowedEmail);
  const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
  
  let targetUser = (usersData?.users || []).find((u) => u.email === allowedEmail);

  if (!targetUser) {
    console.log("User not found. Creating user in auth.users...");
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: allowedEmail,
      email_confirm: true,
      user_metadata: { role: "caller" },
    });
    if (createErr) throw createErr;
    targetUser = newUser.user;
  }

  console.log("User UUID:", targetUser.id);
  return targetUser.id;
}

ensureUser().catch(console.error);
