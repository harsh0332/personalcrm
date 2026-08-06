import { isEmailAllowed } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { allowed: false, error: "Invalid email parameter" },
        { status: 400 }
      );
    }

    const allowed = isEmailAllowed(email);

    if (!allowed) {
      return NextResponse.json(
        {
          allowed: false,
          error: "Access denied. Email is not on the authorized allowlist.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ allowed: true });
  } catch {
    return NextResponse.json(
      { allowed: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
