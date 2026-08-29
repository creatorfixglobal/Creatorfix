-- CreatorFix — Identity Verification (NID + live face capture)
-- Run after 0002_rls_and_functions.sql

-- ==========================================================
-- ENUM
-- ==========================================================
create type identity_verification_status as enum (
  'unverified', 'pending', 'in_review', 'verified', 'rejected'
);

-- ==========================================================
-- TABLE — status and evidence live together for now (see note below)
-- but every evidence column is a private storage PATH, never a URL,
-- and is never selected by the DTOs/views the rest of the app uses.
-- ==========================================================
create table identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,

  status identity_verification_status not null default 'unverified',

  -- Private Supabase Storage paths only — e.g.
  -- identity-verification/{user_id}/{verification_id}/nid-front.jpg
  -- Never a public URL. Never a Cloudinary asset.
  nid_front_path text,
  nid_back_path text,
  live_face_path text,

  -- Populated once a real external KYC/liveness provider is wired in.
  -- Nullable by design: local submission only proves "documents
  -- submitted", never "identity verified" — see the check below.
  verification_provider text,
  provider_reference_id text,
  provider_match_result jsonb,     -- provider's raw match/liveness result, admin-only

  attempt_count integer not null default 1,

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A user can have historical rejected attempts, but only one active
  -- (pending/in_review/verified) record at a time is meaningful for
  -- gating — enforced in application logic via the "latest" query,
  -- not a DB constraint, since we want to preserve rejection history.

  constraint verified_requires_verified_at
    check (status <> 'verified' or verified_at is not null),
  constraint rejected_requires_reason
    check (status <> 'rejected' or rejection_reason is not null)
);

create index idx_identity_verifications_user_id on identity_verifications(user_id);
create index idx_identity_verifications_status on identity_verifications(status);
create index idx_identity_verifications_user_latest
  on identity_verifications(user_id, created_at desc);

-- NOTE ON SEPARATING STATUS FROM EVIDENCE:
-- We keep them in one table for Phase 0/1 (local submission only) to
-- limit schema churn, but every non-admin, non-owner read path uses
-- identity_verification_status_view (below), which excludes the three
-- evidence path columns entirely. If evidence access patterns diverge
-- further (e.g. a dedicated document-retention/deletion policy), split
-- evidence into identity_verification_documents(verification_id, ...)
-- in a later migration — the status table's shape won't need to change.

create or replace view identity_verification_status_view as
  select
    id, user_id, status, attempt_count,
    submitted_at, reviewed_at, verified_at, rejected_at, rejection_reason,
    created_at, updated_at
  from identity_verifications;

grant select on identity_verification_status_view to authenticated;

-- ==========================================================
-- RLS
-- ==========================================================
alter table identity_verifications enable row level security;

-- Owner can see their OWN row including evidence paths (they need to
-- know what they already uploaded, e.g. to show "NID front: uploaded").
-- This does not leak the file content — a path string is meaningless
-- without a signed URL, which is only ever minted server-side after a
-- fresh authorization check (see actions/identity.actions.ts).
create policy "own verification select" on identity_verifications
  for select using (user_id = current_profile_id());

-- Owner can create a new submission for themselves, always starting
-- 'pending' — never 'verified' — no matter what the client sends.
create policy "own verification insert" on identity_verifications
  for insert with check (
    user_id = current_profile_id()
    and status = 'pending'
  );

-- Owner may NOT update their own row at all. Resubmission after a
-- rejection is a new INSERT (new attempt), not an UPDATE of the old
-- one — this closes the obvious IDOR/status-flip vector where a client
-- PATCHes status='verified' on a row it owns.
-- (No update policy for the owner is intentional — absence = deny.)

-- Admin: explicit, auditable access only — see requireAdminVerificationAccess()
-- in actions/identity.actions.ts, which logs every read via this policy
-- to audit_logs before returning evidence paths to admin UI.
create policy "admin verification all" on identity_verifications
  for all using (is_admin(auth.uid()));

-- ==========================================================
-- HELPER: latest verification status for a user (for gate checks)
-- ==========================================================
create or replace function current_verification_status(p_profile_id uuid)
returns identity_verification_status
language sql
security definer
set search_path = public
stable
as $$
  select status from identity_verifications
  where user_id = p_profile_id
  order by created_at desc
  limit 1;
$$;

grant execute on function current_verification_status to authenticated, service_role;

create or replace function is_identity_verified(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(current_verification_status(p_profile_id) = 'verified', false);
$$;

grant execute on function is_identity_verified to authenticated, service_role;

-- ==========================================================
-- SERVER-SIDE FINANCIAL/ROLE GATES NOW REQUIRE VERIFICATION
-- Re-create the wallet ledger and order-transition functions' CALLERS
-- (not the functions themselves — those stay generic) to check
-- verification before ever reaching apply_wallet_transaction /
-- transition_order. This is enforced in actions/*.ts server code
-- (createOrder, requestDeposit, publishService, requestWithdrawal),
-- with is_identity_verified() as the single source of truth so the
-- check can never drift between call sites.
-- ==========================================================

-- ==========================================================
-- AUDIT: dedicated event type for verification-evidence access,
-- distinct from the generic audit_logs table so admin evidence
-- views are trivially queryable/alertable without a wildcard scan.
-- ==========================================================
create table verification_audit_events (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references identity_verifications(id),
  actor_id uuid references profiles(id),
  event_type text not null,   -- 'submitted' | 'reviewed' | 'approved' | 'rejected'
                               -- | 'evidence_accessed' | 'status_changed'
  detail jsonb,                -- structured, NEVER the NID number or raw image
  created_at timestamptz not null default now()
);

alter table verification_audit_events enable row level security;

create policy "admin reads verification audit" on verification_audit_events
  for select using (is_admin(auth.uid()));
-- No client insert/update/delete policy at all — written exclusively
-- by service_role inside actions/identity.actions.ts.

create index idx_verification_audit_verification_id
  on verification_audit_events(verification_id);
