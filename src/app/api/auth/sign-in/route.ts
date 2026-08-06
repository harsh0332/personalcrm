import { isEmailAllowed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body || {};

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Server-side allowlist enforcement
    if (!isEmailAllowed(trimmedEmail)) {
      // Security discipline: return the identical status and error message as invalid credentials
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // 2. Authenticate against Supabase with email + password
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Signed in successfully.",
      redirect: "/",
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }
}
