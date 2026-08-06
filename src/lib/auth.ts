export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlistEnv = process.env.ALLOWED_EMAIL || process.env.ALLOWED_EMAILS || "";
  const allowedEmails = allowlistEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // If no allowlist is configured yet, fall back to checking if ALLOWED_EMAIL exists
  if (allowedEmails.length === 0) {
    return true; // fallback until env var is set
  }

  return allowedEmails.includes(email.trim().toLowerCase());
}
