import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowlistEnv = process.env.ALLOWED_EMAIL || process.env.ALLOWED_EMAILS;

  // HARD FAIL-CLOSED SECURITY GUARD: Missing environment configuration renders an immediate 500 hard error.
  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseUrl.includes("placeholder") ||
    !allowlistEnv ||
    !allowlistEnv.trim()
  ) {
    return new NextResponse(
      "Configuration Error: Missing required Supabase credentials or ALLOWED_EMAIL environment variables.",
      { status: 500, headers: { "content-type": "text/plain" } }
    );
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/login";
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth/");
  const isCheckEmailApi = request.nextUrl.pathname.startsWith("/api/auth/");

  if (isAuthCallback || isCheckEmailApi) {
    return response;
  }

  const isAuthenticated = user && isEmailAllowed(user.email);

  if (!isAuthenticated && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isLoginPage) {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
