# CreatorFix — Development Phases

Each phase ends with: type check, lint, tests, manual RLS/authorization verification, and a working deployable slice. No phase starts until the previous one's checklist is green.

## Phase 0 — Foundation
- Next.js App Router + TypeScript + Tailwind + shadcn/ui scaffold
- Supabase project, `.env.example`, environment wiring
- Base schema migration (all tables from doc 01), enums, RLS enabled on every table (deny-by-default)
- **Identity verification foundation** (doc 03): `identity_verification_status` enum, `identity_verification_status` table (status only), `identity_verifications` table (evidence), indexes, RLS (owner-read/admin-full)
- `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/auth/require-role.ts`, `lib/auth/require-verified.ts`
- Auth pages: register (email + password + username + display name **only — no role field, no role parameter accepted anywhere**), login, logout, email verification, password reset
- On register: server creates the `profiles` row with `role` **hardcoded to `'customer'`**, plus a `wallets` row and an `identity_verification_status` row (`status: 'unverified'`). No `provider_profiles` row.

**Exit checklist:**
- A user can register, verify email, log in, and land on the customer dashboard — the only role reachable via registration.
- RLS confirmed by attempting a cross-user `select` in the SQL editor and seeing it denied, including for `identity_verifications` / `identity_verification_status`.
- Automated test: POSTing `role: 'admin'` or `role: 'provider'` to the registration action either fails Zod validation or is silently ignored — the resulting profile is always `customer`.
- `identity-verification` bucket confirmed private (a direct object URL returns unauthorized, not the file).