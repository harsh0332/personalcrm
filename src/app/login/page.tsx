"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // Validate allowlist on server side first via an API action check
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const check = await res.json();
      if (!res.ok || !check.allowed) {
        setMessage({
          type: "error",
          text: check.error || "Access denied. Email is not on the authorized allowlist.",
        });
        setLoading(false);
        return;
      }

      // If email is allowed, send magic link via Supabase Auth
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({
          type: "success",
          text: "Magic link sent! Check your email inbox to sign in.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
            CallDesk
          </h1>
          <p className="text-sm text-zinc-400">
            Sign in to access your calling CRM workspace
          </p>
        </div>

        {message && (
          <div
            className={`p-4 rounded-lg flex items-start space-x-3 text-sm border ${
              message.type === "success"
                ? "bg-emerald-950/50 border-emerald-800 text-emerald-300"
                : "bg-rose-950/50 border-rose-800 text-rose-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            )}
            <div>{message.text}</div>
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all min-h-[48px]"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold py-3 px-4 rounded-lg transition-all min-h-[48px] text-base flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-zinc-950" />
                <span>Sending Magic Link...</span>
              </>
            ) : (
              <span>Send Magic Link</span>
            )}
          </Button>
        </form>

        <p className="text-xs text-center text-zinc-500">
          Single-user access protected by email allowlist enforcement.
        </p>
      </div>
    </main>
  );
}
