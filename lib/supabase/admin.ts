import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * The admin/service-role Supabase client.
 * NEVER import this into Client Components or anything that touches the browser.
 * Enforce with `import "server-only"` at the top of files that use this.
 *
 * This client bypasses RLS because it authenticates as the `service_role`,
 * which Postgres trusts implicitly. It's used only inside:
 * - Server Actions (actions/ folder)
 * - API routes (app/api/ folder)
 * - Server-side utilities that explicitly declare `server-only`
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}