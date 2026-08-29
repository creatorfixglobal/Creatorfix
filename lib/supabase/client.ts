import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-safe Supabase client for Client Components.
 * Use this in any component marked with 'use client'.
 * This client uses the anon/public role and respects RLS.
 */
export function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
}