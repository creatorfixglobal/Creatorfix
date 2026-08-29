# CreatorFix — Identity Verification (NID + Live Face) Architecture

This is a **mandatory prerequisite** for core marketplace functionality, not an optional profile enhancement. It supersedes/extends sections 4 (schema), 5 (permission matrix), 9 (RLS), 11–12 (storage), and 13 (security model) of `01-architecture-and-schema.md`, and Phase 0/1 of `02-development-phases.md`.

---

## 1. Core Principle

**"Documents submitted" ≠ "identity verified."** These are two different facts and must never be collapsed into one boolean. A row existing in the evidence table means someone uploaded files. A row's `status = 'verified'` means a verification decision — human or KYC-provider — was actually made. The system must be structurally incapable of treating the former as the latter.

Concretely: nothing in the codebase may set `identity_verifications.status = 'verified'` as a side effect of an upload completing. The only two paths to `verified` are (a) an admin decision after review, or (b) an external KYC provider's callback confirming a successful match — both are explicit, auditable, server-only actions.

## 2. Status Model — Status Table Separate From Evidence Table

Per the spec's suggestion, verification **status** (queried constantly, safe to expose narrowly to the owning user) is separated from verification **evidence** (accessed rarely, only by the owner or an authorized/audited admin, never joined into ordinary queries).

```sql
create type identity_verification_status as enum (
  'unverified',   -- no submission yet
  'pending',      -- submitted, awaiting processing/queueing
  'in_review',    -- actively being reviewed (human or KYC provider)
  'verified',
  'rejected'
);

create type identity_verification_method as enum (
  'manual_admin_review',
  'external_kyc_provider'
);

-- ==========================================================
-- STATUS TABLE — safe for the owning user to read directly.
-- Contains NO storage paths, NO provider reference IDs, NO evidence.
-- ==========================================================
create table identity_verification_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  status identity_verification_status not null default 'unverified',
  attempt_count integer not null default 0,
  last_submitted_at timestamptz,
  reviewed_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,       -- user-facing, kept free of internal detail
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================================
-- EVIDENCE TABLE — never joined into public/customer/provider-facing
-- queries. Storage paths only, never public URLs. Selected only by:
-- the owning user's own submission flow, and an explicit, audited
-- admin review action.
-- ==========================================================
create table identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status identity_verification_status not null default 'pending',
  method identity_verification_method not null default 'manual_admin_review',

  nid_front_path text not null,   -- storage path, NOT a public URL
  nid_back_path text not null,
  live_face_path text not null,

  -- Set only if/when an external KYC provider is integrated (§6). Never
  -- populated by anything the client can influence.
  kyc_provider_name text,
  kyc_provider_reference_id text,
  kyc_provider_raw_result jsonb,  -- provider's decision payload, admin-only

  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),  -- admin who reviewed, if manual
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_identity_verifications_user on identity_verifications(user_id);
create index idx_identity_verifications_status on identity_verifications(status);
create index idx_identity_verification_status_user on identity_verification_status(user_id);
```

Why two tables instead of one: a customer-facing "am I verified yet" status check is something the UI polls/reads constantly (e.g. gating the "create order" button). That query must never have a code path anywhere near it that could accidentally `select *` and leak a storage path or a KYC provider's raw JSON payload. Splitting the tables makes that leak structurally impossible rather than reliant on someone remembering to write a narrow `select`.

## 3. Attempt Tracking & Abuse Prevention

- `attempt_count` on the status row increments on every new submission to `identity_verifications`. A server-side function (`submit_identity_verification`, see §5) enforces a maximum (e.g. 5) before requiring admin intervention to reset — preventing automated resubmission abuse.
- A user with `status = 'pending'` or `'in_review'` cannot create a new submission — the submit function checks current status first and rejects with `VERIFICATION_ALREADY_IN_PROGRESS`.
- Old `rejected` submissions are never deleted — they remain as an audit trail; a new submission is a new row, linked by `user_id`, not an overwrite.
- Rate limiting at the API route level (e.g. max N submission attempts per hour per user) belongs in front of `submit_identity_verification`, independent of the DB-level attempt cap.

## 4. Storage Architecture

**Dedicated private bucket**, never Cloudinary, never public:

```
identity-verification/               (private bucket, no public policy)
  {user_id}/
    {verification_id}/
      nid-front.<ext>
      nid-back.<ext>
      live-face.<ext>
```

Rules:
- Bucket is created with `public = false`. No storage policy ever grants `anon` or unauthenticated `authenticated` broad read.
- **File validation is server-side only** — the browser-supplied MIME type is never trusted. The upload route/Server Action reads the file's actual magic bytes (e.g. via a library like `file-type`) server-side, allow-lists `image/jpeg`, `image/png`, `application/pdf` (for NID scans) only, and rejects anything else before it ever reaches storage.
- Max file size enforced server-side (e.g. 8MB) — not just a client `accept`/size hint, which is trivially bypassed.
- Access exclusively via **short-lived signed URLs** (≤5 minutes), generated only inside an admin-review Server Action that has already run an authorization + audit-log check. There is no code path that generates a signed URL for these objects on a customer-support convenience basis or a "just in case" prefetch.
- Storage RLS policies (`storage.objects` for this bucket) restrict path access so that even a signed-URL-generation bug could only ever expose a path prefixed with the requesting admin's own audited request — not an arbitrary directory listing.

## 5. Live Face Capture — Why It's Structurally Different From a Selfie Upload

The requirement is a **live camera capture**, not a file picker that happens to accept images. This is enforced entirely client-side at the capture UI level (there is no way to cryptographically prove liveness purely from the resulting still image without a real liveness-detection provider — see §6), but the UI must not offer a fallback "or upload a photo instead" path for this specific step:

- The capture page requests `navigator.mediaDevices.getUserMedia({ video: true })`.
- The `<video>` element streams the live feed; a "Capture" button draws the current frame to a `<canvas>` and produces the image (`toBlob`) client-side.
- No `<input type="file">` exists anywhere on this step of the flow.
- The captured blob is uploaded directly via a Server Action that accepts only `multipart/form-data` from this specific flow — there's no shared "upload any image" endpoint that this step reuses, which would otherwise create an accidental bypass path.
- **This client-side discipline is a UX/abuse-friction measure, not a security guarantee** — a sufficiently motivated user can defeat any client-side liveness check. Real Sybil/spoof resistance requires an external liveness-detection/KYC provider (§6). The architecture must not claim otherwise.

## 6. External KYC Provider Integration Point

Until a real KYC/liveness provider is integrated, `method = 'manual_admin_review'` on every submission — an admin visually compares the NID photo and the live-face capture via signed URLs. This is real human verification, not fake verification, but it is explicitly the weaker of the two paths and should be labeled as such internally.

The schema is designed so a provider can be added later with zero migration changes:

```typescript
// lib/kyc/provider.ts — the abstraction boundary
export interface KycProvider {
  name: string;
  /**
   * Submits NID + face evidence to the external provider and either
   * returns an immediate result or a reference ID for async webhook
   * resolution. Never called from the client — server/action only.
   */
  submitVerification(input: {
    userId: string;
    nidFrontPath: string;
    nidBackPath: string;
    liveFacePath: string;
  }): Promise<
    | { outcome: "approved"; referenceId: string; rawResult: unknown }
    | { outcome: "rejected"; referenceId: string; reason: string; rawResult: unknown }
    | { outcome: "pending"; referenceId: string }
  >;
}
```

When a provider is wired in, `identity_verifications.method` becomes `'external_kyc_provider'`, `kyc_provider_name`/`kyc_provider_reference_id`/`kyc_provider_raw_result` populate, and the webhook handler (`app/api/webhooks/kyc/route.ts`, signature-verified like the payment webhook) is the only thing allowed to move status from `pending`/`in_review` to `verified`/`rejected` for that method. Manual admin review remains available as a fallback/appeals path even after a KYC provider exists.

## 7. Server-Side Functions

```sql
-- Submission: creates the evidence row, bumps attempt_count, sets status
-- to 'pending'. Rejects if a submission is already pending/in_review or
-- the attempt cap is exceeded. Callable only by service_role (invoked
-- from a Server Action that has already validated files server-side).
create or replace function submit_identity_verification(
  p_user_id uuid,
  p_nid_front_path text,
  p_nid_back_path text,
  p_live_face_path text,
  p_max_attempts integer default 5
) returns identity_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status identity_verification_status;
  v_attempts integer;
  v_row identity_verifications;
begin
  select status, attempt_count into v_status, v_attempts
    from identity_verification_status where user_id = p_user_id for update;

  if v_status in ('pending', 'in_review') then
    raise exception 'VERIFICATION_ALREADY_IN_PROGRESS';
  end if;

  if v_status = 'verified' then
    raise exception 'ALREADY_VERIFIED';
  end if;

  if v_attempts >= p_max_attempts then
    raise exception 'MAX_ATTEMPTS_EXCEEDED';
  end if;

  insert into identity_verifications (
    user_id, status, nid_front_path, nid_back_path, live_face_path
  ) values (
    p_user_id, 'pending', p_nid_front_path, p_nid_back_path, p_live_face_path
  ) returning * into v_row;

  insert into identity_verification_status (user_id, status, attempt_count, last_submitted_at)
    values (p_user_id, 'pending', 1, now())
    on conflict (user_id) do update set
      status = 'pending',
      attempt_count = identity_verification_status.attempt_count + 1,
      last_submitted_at = now(),
      updated_at = now();

  return v_row;
end;
$$;

revoke all on function submit_identity_verification from public, anon, authenticated;
grant execute on function submit_identity_verification to service_role;

-- Admin decision: the ONLY path to 'verified' for manual review. Writes
-- both tables, and the caller (a Server Action) is responsible for the
-- audit_logs insert in the same request.
create or replace function decide_identity_verification(
  p_verification_id uuid,
  p_decision identity_verification_status,  -- 'verified' | 'rejected'
  p_reviewer_id uuid,
  p_rejection_reason text default null
) returns identity_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row identity_verifications;
begin
  if p_decision not in ('verified', 'rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  update identity_verifications set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = p_reviewer_id,
    verified_at = case when p_decision = 'verified' then now() else verified_at end,
    rejected_at = case when p_decision = 'rejected' then now() else rejected_at end,
    rejection_reason = p_rejection_reason,
    updated_at = now()
  where id = p_verification_id
  returning * into v_row;

  if not found then
    raise exception 'VERIFICATION_NOT_FOUND';
  end if;

  update identity_verification_status set
    status = p_decision,
    reviewed_at = now(),
    verified_at = case when p_decision = 'verified' then now() else verified_at end,
    rejected_at = case when p_decision = 'rejected' then now() else rejected_at end,
    rejection_reason = p_rejection_reason,
    updated_at = now()
  where user_id = v_row.user_id;

  return v_row;
end;
$$;

revoke all on function decide_identity_verification from public, anon, authenticated;
grant execute on function decide_identity_verification to service_role;
```

## 8. RLS Policies

```sql
alter table identity_verification_status enable row level security;

create policy "own verification status" on identity_verification_status
  for select using (user_id = current_profile_id());

create policy "admin verification status all" on identity_verification_status
  for all using (is_admin(auth.uid()));

-- No client insert/update policy on either table — both are written
-- exclusively via submit_identity_verification() / decide_identity_verification()
-- under service_role.

alter table identity_verifications enable row level security;

create policy "own verification evidence select" on identity_verifications
  for select using (user_id = current_profile_id());
-- NOTE: this policy allows the owning user to see their OWN row — including
-- their own storage paths, which is fine (it's their own document). What
-- it does NOT do is let them see anyone else's row, and it never appears
-- in a join that a provider or another customer's query could reach.

create policy "admin verification evidence all" on identity_verifications
  for all using (is_admin(auth.uid()));
```

**Customer/provider cross-visibility is closed by construction**, not just by these policies: there is no view, DTO, or order-related query anywhere in the codebase that joins `identity_verifications` or `identity_verification_status` against another user's data. A provider fetching order details gets `CustomerPublicDTO` (§ existing doc) — which has no verification fields at all, verified or otherwise, because a counterparty doesn't need to see verification evidence, only the fact that the platform enforced it before allowing the order to exist.

## 9. Audit Logging

Every state-changing verification event writes to the existing `audit_logs` table:

| Event | `action` | Notes |
|---|---|---|
| Submission | `identity_verification.submitted` | `after_state` = `{status: 'pending', attempt_count}` — never the file paths or NID number |
| Admin opens evidence (signed URL generated) | `identity_verification.evidence_accessed` | logged even for a "just looking" review — this is the sensitive-access trail the spec requires |
| Admin decision | `identity_verification.reviewed` | `before_state`/`after_state` = status transition only |
| Status change (any) | `identity_verification.status_changed` | redundant with the above but kept as a single queryable trail for "show me every status change for user X" |

**Never logged, per the spec:** NID numbers, the face image itself, or the NID image itself. `before_state`/`after_state` on these audit rows are limited to `{status, attempt_count, reviewed_by}` shaped objects — never raw file bytes or paths copy-pasted into a JSON blob for convenience.

## 10. Verification Gate — Server-Side Enforcement

A new server-side helper, `requireVerified()`, sits alongside `requireRole()`:

```typescript
// lib/auth/require-verified.ts
import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthenticatedProfile } from "./require-role";

export async function requireVerifiedIdentity(
  profile: AuthenticatedProfile
): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("identity_verification_status")
    .select("status")
    .eq("user_id", profile.id)
    .single();

  if (data?.status !== "verified") {
    redirect("/verify-identity");
  }
}
```

This is called at the top of every Server Action that gates core financial/marketplace functionality:

| Action | Gate |
|---|---|
| `createOrder` (customer) | `requireRole(["customer"])` then `requireVerifiedIdentity` |
| `requestDeposit` (customer) | same |
| `createService` / publish (provider) | `requireRole(["provider"])` then `requireVerifiedIdentity` |
| `acceptOrder` (provider) | same |
| `requestWithdrawal` (provider) | same |

This is enforced **inside the Server Action itself**, re-checked from the database on every call — never inferred from a client-supplied flag, a cached client-side value, or a disabled button. A button being greyed out in the UI is a courtesy; the actual authorization decision happens here, server-side, on every request.

RLS reinforces this at the data layer too: `orders`, `deposits`, `services` (insert), and `withdrawal_requests` insert policies (§9 of doc 01) are updated to additionally require `is_identity_verified(auth.uid())`:

```sql
create or replace function is_identity_verified(p_auth_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from identity_verification_status ivs
    join profiles p on p.id = ivs.user_id
    where p.auth_user_id = p_auth_user_id and ivs.status = 'verified'
  );
$$;

grant execute on function is_identity_verified to authenticated;

-- Example: deposits insert policy tightened
drop policy "customer create deposit" on deposits;
create policy "customer create deposit" on deposits
  for insert with check (
    user_id = current_profile_id() and status = 'pending'
    and is_identity_verified(auth.uid())
  );
```

This means even a bug or bypass in a Server Action can't create a financial row for an unverified user — the database itself refuses the insert.

## 11. Registration Flow Correction

**A new account always starts as `customer`.** The registration form must not submit a `role` field at all — it is hardcoded server-side to `'customer'` in the Server Action, and `provider_profiles` is never created at registration time.

```
Register (email + password + username + display name only — no role field)
   ↓
Email verification
   ↓
Login
   ↓
Identity Verification Required (gate: requireVerifiedIdentity)
   ↓
NID front + NID back upload
   ↓
Live camera face capture
   ↓
Submit → status: pending → (admin review | KYC provider) → verified | rejected
   ↓
Verified → role-appropriate dashboard (customer)
```

**Provider onboarding is a separate, later flow**, only reachable from an already-verified customer account:

```
Verified Customer Account
      ↓
"Apply to become a Provider" (Server Action: applyToBecomeProvider)
      ↓
Creates provider_profiles row (status: 'pending', verification_status: 'unverified' —
   note: provider re-verification can reuse the same identity_verification_status
   row, since it's the same person; no re-KYC required unless product wants that)
      ↓
Admin reviews the provider application (skills, bio, portfolio — separate from
   identity KYC, which is already satisfied)
      ↓
Admin approves → provider_profiles.status = 'active' → provider dashboard unlocked
```

**`profiles.role` is never writable by the client under any circumstance.** There is no Server Action, RLS policy, or API route that accepts a client-supplied role value and writes it — becoming a provider is `applyToBecomeProvider()` + admin approval, which is a distinct, audited transition, not a self-service role change.

## 12. Updated Role/Permission Matrix (delta from doc 01 §5)

| Capability | Unverified Customer | Verified Customer | Unverified/Pending Provider | Active Verified Provider | Admin |
|---|---|---|---|---|---|
| Browse public content | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit identity verification | ✅ | — (already done) | ✅ (if not yet done) | — | — |
| Deposit funds | ❌ | ✅ | n/a | n/a | — |
| Create order | ❌ | ✅ | n/a | n/a | — |
| Apply to become provider | ❌ (must verify first) | ✅ | n/a | n/a | — |
| Create/publish services | n/a | n/a | ❌ | ✅ | ✅ (approve/reject) |
| Accept orders | n/a | n/a | ❌ | ✅ | — |
| Request withdrawal | n/a | n/a | ❌ | ✅ | — |
| View own verification evidence | ✅ (own only) | ✅ (own only) | ✅ (own only) | ✅ (own only) | ✅ (own + audited access to any) |
| View another user's verification evidence | ❌ never | ❌ never | ❌ never | ❌ never | ✅ only via audited review action |

## 13. Updated Storage Bucket Summary (delta from doc 01 §12)

| Bucket | Public? | Contents | Access pattern |
|---|---|---|---|
| `deposit-proofs` | Private | Payment screenshots | Signed URL, owner or admin |
| `dispute-evidence` | Private | Dispute attachments | Signed URL, order parties or admin |
| `identity-verification` | **Private, most restrictive** | NID front/back, live face capture | Signed URL (≤5 min), **owner or audited admin review action only** — no support-convenience access, no bulk export |

## 14. Updated Security Model Summary (delta from doc 01 §13)

8. **Identity verification is a real authorization prerequisite**, enforced redundantly at three layers: (a) Server Action gate (`requireVerifiedIdentity`), (b) RLS insert policies on financial/service tables via `is_identity_verified()`, (c) UI affordances reflecting status — with (c) treated as a courtesy only, never the actual control.
9. **Status/evidence separation**: verification status is cheap and safe to read anywhere it's needed; verification evidence is expensive to access on purpose — every access is a deliberate, audited action, never a side effect of an ordinary query.
10. **No fake verification**: no code path sets `status = 'verified'` as a consequence of upload completion. Only `decide_identity_verification()` (admin) or a KYC provider webhook can do so.
11. **Live capture is UX-layer liveness friction, not cryptographic proof** — the architecture doesn't overclaim what a plain camera capture can guarantee; real Sybil-resistance is deferred to the KYC provider integration point (§6) and the doc says so plainly rather than implying otherwise.
