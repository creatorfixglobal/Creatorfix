import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Never crash the entire website because a runtime environment variable is absent.
  // Auth-protected pages still enforce authorization server-side.
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) { return request.cookies.get(name)?.value; },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Do not turn a transient auth/network failure into a site-wide 500.
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};