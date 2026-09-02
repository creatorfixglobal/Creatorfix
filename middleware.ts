import { NextResponse, type NextRequest } from "next/server";

/**
 * Intentionally minimal middleware.
 * Auth and Supabase session validation happen inside server components/actions.
 * This prevents a missing or malformed Supabase environment variable from
 * crashing every route at the Edge runtime.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
