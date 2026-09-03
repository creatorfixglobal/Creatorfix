-- CreatorFix — Provider Security Deposit Workflow
-- BDT 1,000 is stored as 100000 poisha and must remain held while a provider is active.

create type provider_security_deposit_status as enum ('pending','held','release_requested','released','rejected');

create table provider_security_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  amount bigint not null default 100000 check (amount = 100000),
  payment_method text not null,
  payment_reference text not null,
  status provider_security_deposit_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  release_requested_at timestamptz,
  released_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table provider_security_deposits enable row level security;
create policy "own security deposit select" on provider_security_deposits for select using (user_id = app_private.current_profile_id());
create policy "own security deposit insert" on provider_security_deposits for insert with check (user_id = app_private.current_profile_id() and status = 'pending');
create policy "admin security deposits all" on provider_security_deposits for all using (app_private.is_admin(auth.uid()));

-- Approval of a provider application must require a held BDT 1,000 security deposit.
-- Requesting release suspends the provider profile and pauses services immediately.
-- Actual payment transfer remains an admin/payment-gateway operation; this schema
-- records the protected business state and enforces the marketplace gate.