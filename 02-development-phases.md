# CreatorFix — Development Phases

Each phase ends with: type check, lint, tests, manual RLS/authorization verification, and a working deployable slice. No phase starts until the previous one's checklist is green.

## Phase 0 — Foundation
- Next.js App Router + TypeScript + Tailwind + shadcn/ui scaffold
- Supabase project, `.env.example`, environment wiring
- Base schema migration (all tables from doc 01), enums, RLS enabled on every table (deny-by-default)
- **Identity verification foundation** (doc 03): `identity_verification_status` enum, `identity_verification_status` table (status only), `identity_verifications` table (evidence), indexes, RLS (own-row select only, no client insert/update on either table), `is_identity_verified()` / `current_profile_id()` helpers, `submit_identity_verification()` / `decide_identity_verification()` SECURITY DEFINER functions, private `identity-verification` storage bucket created with no public policy
- `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/auth/require-role.ts`, `lib/auth/require-verified.ts`
- Auth pages: register (email + password + username + display name **only — no role field, no role parameter accepted anywhere**), login, logout, email verification, password reset
- On register: server creates the `profiles` row with `role` **hardcoded to `'customer'`**, plus a `wallets` row and an `identity_verification_status` row (`status: 'unverified'`). No `provider_profiles` row is ever created at registration.

**Exit checklist:**
- A user can register, verify email, log in, and land on the customer dashboard — the only role reachable via registration.
- RLS confirmed by attempting a cross-user `select` in the SQL editor and seeing it denied, including for `identity_verifications` / `identity_verification_status`.
- Automated test: POSTing `role: 'admin'` or `role: 'provider'` to the registration action either fails Zod validation or is silently ignored — the resulting profile is always `customer`.
- `identity-verification` bucket confirmed private (a direct object URL returns unauthorized, not the file).

## Phase 1 — Identity Verification Onboarding (blocks core functionality until complete)
- NID front + NID back upload UI (a file picker is fine here — these are documents, not the liveness step) with server-side magic-byte + size validation before anything reaches storage; browser-supplied MIME type is never trusted
- Live camera face capture UI using `navigator.mediaDevices.getUserMedia` — **no file-upload fallback exists anywhere in this step's render tree**
- `submitIdentityVerificationAction` → calls `submit_identity_verification()`; enforces the attempt cap and rejects a second submission while `pending`/`in_review`
- Verification status page (`/verify-identity`) reading only from `identity_verification_status` — never touches the evidence table
- `requireVerifiedIdentity()` gate implemented now and wired into every Server Action that will touch deposits, order creation, service publishing, order acceptance, and withdrawals in later phases — built once, here, so nothing is retrofitted insecurely afterward
- `KycProvider` interface defined (doc 03 §6); only `manual_admin_review` is implemented behind it for now — this is the seam, not a real vendor integration, and the UI/copy must not claim otherwise
- Audit log entries wired for: submission, admin evidence access (signed URL generation), review decision, status change

**Exit checklist:**
- Automated test: calling `createOrder`/`requestDeposit`/`createService`/`requestWithdrawal` directly as an unverified user (bypassing the UI) is rejected server-side.
- Manual QA: no `<input type="file">` exists anywhere in the live-face-capture step under any state.
- Automated test: uploading a renamed executable as `nid-front.jpg` is rejected by the magic-byte check.
- Automated test: a second submission attempt while `status = 'pending'` returns `VERIFICATION_ALREADY_IN_PROGRESS` and creates no duplicate row.
- Automated test: `identity_verifications.status` can only become `'verified'` via `decide_identity_verification()` — grep-level check that no other code path writes that column to that value.

## Phase 1.5 — Profiles, Provider Onboarding & Public Directory
- Customer/provider profile edit forms (Zod-validated)
- **Provider onboarding**: `applyToBecomeProviderAction`, reachable only from an already-verified customer account (`requireVerifiedIdentity` runs first) — creates `provider_profiles` with `status: 'pending'`; a separate admin approval action flips it to `'active'`. No code path anywhere lets a client write `profiles.role` directly — becoming a provider is this explicit, audited transition only.
- `customer_public_view` and `CustomerPublicDTO` / `ProviderPublicDTO` implemented and unit-tested (assert phone/email/whatsapp **and any verification-evidence field** are structurally absent from the type and the underlying query)
- Public provider profile page (`/providers/[username]`) — shows verification as a "Verified" badge only, sourced from `is_identity_verified()`, never the status detail or evidence

**Exit checklist:**
- Fetch a provider-facing API response as a provider and assert (automated test) that no contact field and no verification-evidence field appears anywhere in the payload.
- Automated test: an authenticated non-admin user attempting `update profiles set role = 'admin'` via the Supabase client is denied by RLS.

## Phase 2 — Admin: Platforms, Problems, Categories
- Admin CRUD for `platforms`, `problem_categories`, `problems` (with Cloudinary image upload flow — never identity documents)
- Public problem pages driven entirely by DB content — no hardcoded problem list in code
- Admin fee rule management (`platform_fee_rules`)
- Admin provider-application review queue (approve/reject from Phase 1.5)
- Admin identity-verification review queue: generates short-lived signed URLs for NID/face evidence only inside an audited action; approve/reject via `decide_identity_verification()`

**Exit checklist:** admin adds a brand-new platform + problem + fee through the UI with zero code changes, and it appears live on the public site immediately. Opening a verification submission's evidence in the admin queue produces an `audit_logs` row for that access.

## Phase 3 — Wallet & Deposits
- `wallets`, `wallet_transactions`, `apply_wallet_transaction()` function
- Customer deposit request flow (gated by `requireVerifiedIdentity`) + private proof upload (Supabase Storage, separate bucket from identity verification)
- Admin deposit verification queue → credits wallet via the ledger function
- Idempotency key tests: simulate a duplicate webhook/request and assert only one credit lands

**Exit checklist:** concurrent deposit-verification double-click cannot double-credit (tested with parallel requests). An unverified user's deposit request is rejected server-side even if attempted via direct action call.

## Phase 4 — Services Marketplace
- Provider service creation (`pending_approval`, gated by `requireVerifiedIdentity` + active provider status) + admin approval queue
- Public service browsing under a problem page
- Service edit/pause by provider (re-enters approval if price/description changes — admin-configurable)

**Exit checklist:** an unapproved service never appears in public listings even via direct API call. An unverified or non-active provider cannot create a service even via direct action call.

## Phase 5 — Orders & Escrow
- `createOrder` server action (gated by `requireVerifiedIdentity`): re-derives price + fee, calls `apply_wallet_transaction` (escrow_hold), inserts `orders` + `escrow_transactions`
- Order state machine function `transition_order()` with the allowed-transition table enforced
- Provider accept/in-progress/submit flow (accept gated by `requireVerifiedIdentity` + active provider status)
- Customer confirm-completion → `release_escrow`
- Order messaging (`order_messages`) scoped strictly to `order_id`, with attachment upload

**Exit checklist:** attempt an illegal transition (e.g. provider marking `completed` directly) and confirm it's rejected server-side; confirm escrow amount in DB matches `service.price + fee` even if a manipulated client request tries to send a different `total_charged`.

## Phase 6 — Disputes & Reviews
- Dispute raise/evidence-upload (private storage, signed URLs)
- Admin dispute resolution → triggers `refund_escrow`/`release_escrow` split
- Reviews (only after `completed`, one per order)

**Exit checklist:** dispute evidence uploaded by a customer is not retrievable by an unrelated provider (signed URL scoping test).

## Phase 7 — Withdrawals
- Provider withdrawal request (gated by `requireVerifiedIdentity`; checks `balance - reserved_balance`)
- Admin processing queue → ledger debit on payout confirmation

**Exit checklist:** a withdrawal request for more than available (non-reserved) balance is rejected server-side even if the client sends a smaller "reserved" flag. An unverified provider cannot request a withdrawal even via direct action call.

## Phase 8 — Notifications, Audit Logs, Admin Dashboard Polish
- Notification triggers on key events (order accepted, deposit verified, dispute opened, verification approved/rejected, etc.)
- Audit log writer wrapped around every admin mutation, including every verification-evidence access
- Admin revenue/analytics dashboard (platform fee totals, order volume)

## Phase 9 — Website Development Service Line
- Intake form → `website_dev_requests`
- Reuses the same order/escrow/messaging primitives once a provider is matched, rather than a parallel financial system

## Phase 10 — External KYC Provider Integration (optional, behind the existing seam)
- Implement a real `KycProvider` behind the interface defined in doc 03 §6
- Webhook handler (`app/api/webhooks/kyc/route.ts`), signature-verified and idempotent like the payment webhook
- `identity_verifications.method` transitions to `'external_kyc_provider'` for new submissions; manual review remains available as an appeals path
- No schema migration required — this is exactly the point of the abstraction built in Phase 1

## Phase 11 — Hardening & Launch Prep
- Full security pass: RLS penetration checklist (attempt every cross-role read/write listed in the permission matrix, including every row in doc 03 §12, and confirm denial)
- Load-test the ledger function for lock contention
- Confirm no code path anywhere sets `identity_verifications.status = 'verified'` except `decide_identity_verification()` / the KYC webhook (grep + code review)
- Accessibility pass (keyboard nav, ARIA, contrast) — including the camera-capture UI, which needs a clear non-visual fallback explanation for why a photo upload isn't offered
- Mobile QA across the full customer/provider/admin journeys, with particular attention to camera permission flows on iOS Safari and Android Chrome
- Production build, SEO metadata, final `.env.example` review for accidental secret exposure

---

## Suggested Immediate Next Step

Phase 0 already has working code (auth, RLS, wallet ledger). The registration flow needs a fix — it currently accepts a `role` field from the client, which must be removed per doc 03 §11. Once that's patched and the identity-verification migration is added, Phase 0's exit checklist is satisfiable, and Phase 1 (verification onboarding UI) can start.
