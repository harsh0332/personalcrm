"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, User, ShieldCheck, PhoneCall, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccountPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.replace("/login?message=expired");
          return;
        }
        setUserEmail(user.email || "Unknown User");
      } catch (err) {
        router.replace("/login?message=expired");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router, supabase]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      // Clear any cached local storage or state
      if (typeof window !== "undefined") {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
      router.replace("/login");
      // Force reload to prevent browser back-button cached state restoration
      setTimeout(() => {
        window.location.href = "/login";
      }, 100);
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 p-4 pb-24 text-zinc-100 max-w-md mx-auto w-full">
      {/* HEADER */}
      <div className="border-b border-zinc-800 pb-3 mb-6">
        <div className="flex items-center space-x-2">
          <User className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-bold text-zinc-50">Account & Profile</h1>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 py-8">
          <div className="h-12 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
          <div className="h-12 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* USER INFO CARD */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-emerald-950 border border-emerald-800 rounded-full text-emerald-400">
                <User className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block">
                  Signed In Caller
                </span>
                <p className="text-sm font-bold text-zinc-100 truncate flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  {userEmail}
                </p>
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 space-y-1 font-mono">
              <div className="flex items-center justify-between">
                <span>Auth Provider:</span>
                <span className="text-emerald-400 font-bold">Supabase Auth</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Access Status:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Authenticated
                </span>
              </div>
            </div>
          </div>

          {/* APPLICATION INFO */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-zinc-300">
              <PhoneCall className="w-4 h-4 text-emerald-400" />
              <span>CallDesk CRM v0.1.0</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Mobile-first cold calling CRM for high-velocity phone sales operations.
            </p>
          </div>

          {/* SIGN OUT BUTTON */}
          <div className="pt-4">
            <Button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full h-14 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-extrabold text-base rounded-2xl flex items-center justify-center space-x-2 shadow-lg shadow-rose-950/40 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span>{signingOut ? "Signing Out..." : "Sign Out"}</span>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
