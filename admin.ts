import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * SERVICE-ROLE Supabase client. Bypasses RLS entirely.
 *
 * RULES — do not violate these:
 * 1. Never import this file from a Client Component ("use client").
 * 2. Never import this file from anything that renders a value to the
 *    browser without an explicit DTO/authorization check first.
 * 3. Only import it inside: actions/*.ts (Server Actions) and
 *    app/api/webhooks/**\/route.ts.
 * 4. Every call site using this client MUST have already verified the
 *    caller's role via lib/auth/require-role.ts before touching data.
 *
 * The `server-only` import above causes a build-time error if this file
 * is ever pulled into client bundle — that's intentional insurance.
 */
let _adminClient: ReturnType<typeof createClient> | null = null;

export function createAdminSupabaseClient() {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "This client must never be constructed without both."
    );
  }

  _adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _adminClient;
}
