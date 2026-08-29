-- CreatorFix — Provider Onboarding (role change is never client-writable)
-- Run after 0003_identity_verification.sql

create type provider_application_status as enum ('submitted', 'approved', 'rejected');

create table provider_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  bio text,
  skills text[] default '{}',
  payout_method jsonb,             -- private; only admin + owner read it
  status provider_application_status not null default 'submitted',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_provider_applications_user_id on provider_applications(user_id);

alter table provider_applications enable row level security;

create policy "own application select" on provider_applications
  for select using (user_id = current_profile_id());

create policy "own application insert" on provider_applications
  for insert with check (
    user_id = current_profile_id()
    and status = 'submitted'
  );
-- No update policy for the owner — resubmission after rejection is a
-- fresh insert, same reasoning as identity_verifications.

create policy "admin applications all" on provider_applications
  for all using (is_admin(auth.uid()));

-- ==========================================================
-- The ONLY function that may flip profiles.role. Requires: the caller
-- is admin (checked in the calling Server Action via requireRole(['admin'])
-- before this is ever invoked), the applicant is identity-verified, and
-- their application is in 'submitted' status. Nothing in the schema lets
-- a client UPDATE profiles.role directly — there is no RLS update policy
-- on that column for non-admins (see 0002, "own profile update" only
-- allows updating columns other than role at the application layer).
-- ==========================================================
create or replace function approve_provider_application(
  p_application_id uuid,
  p_admin_id uuid
) returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app provider_applications;
  v_profile profiles;
begin
  select * into v_app from provider_applications where id = p_application_id for update;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  if v_app.status <> 'submitted' then
    raise exception 'APPLICATION_NOT_PENDING';
  end if;

  if not is_identity_verified(v_app.user_id) then
    raise exception 'APPLICANT_NOT_IDENTITY_VERIFIED';
  end if;

  update provider_applications
    set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
    where id = p_application_id;

  update profiles set role = 'provider', updated_at = now()
    where id = v_app.user_id
    returning * into v_profile;

  insert into provider_profiles (user_id, bio, skills, payout_method, verification_status, status)
  values (v_app.user_id, v_app.bio, v_app.skills, v_app.payout_method, 'unverified', 'pending')
  on conflict (user_id) do update
    set bio = excluded.bio, skills = excluded.skills, payout_method = excluded.payout_method;

  return v_profile;
end;
$$;

revoke all on function approve_provider_application from public, anon, authenticated;
grant execute on function approve_provider_application to service_role;

create or replace function reject_provider_application(
  p_application_id uuid,
  p_admin_id uuid,
  p_reason text
) returns provider_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app provider_applications;
begin
  update provider_applications
    set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(),
        rejection_reason = p_reason
    where id = p_application_id and status = 'submitted'
    returning * into v_app;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND_OR_NOT_PENDING';
  end if;

  return v_app;
end;
$$;

revoke all on function reject_provider_application from public, anon, authenticated;
grant execute on function reject_provider_application to service_role;
