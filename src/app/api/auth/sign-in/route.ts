import { isEmailAllowed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body?.email;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing email parameter." },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Server-side allowlist enforcement
    if (!isEmailAllowed(trimmedEmail)) {
      return NextResponse.json(
        { error: "Access denied. Email is not on the authorized allowlist." },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const origin = new URL(request.url).origin;

    // Send magic link server-side only
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Magic link sent successfully. Please check your inbox.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}
