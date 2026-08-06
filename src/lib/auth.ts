export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;

  const allowlistEnv = process.env.ALLOWED_EMAIL || process.env.ALLOWED_EMAILS || "";
  const allowedEmails = allowlistEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    console.error(
      "[CRITICAL SECURITY FAILURE] ALLOWED_EMAIL environment variable is missing or empty. Failing closed to prevent unauthorized access."
    );
    return false;
  }

  return allowedEmails.includes(email.trim().toLowerCase());
}
