"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the ANON key only — safe for the client.
 * Used for: auth flows (sign up, sign in, sign out, password reset) and
 * realtime subscriptions. Never used for financial reads/writes; those
 * go through Server Actions so authorization is enforced server-side.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
