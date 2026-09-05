-- Wallet withdrawals and BDT 100 identity verification fee.
-- Applied to Supabase production as migration wallet_withdrawals_and_identity_fee.
create table if not exists wallet_withdrawal_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
 amount bigint not null check(amount>0), payout_method text not null, payout_account text not null,
 status withdrawal_status not null default 'requested', processed_by uuid references profiles(id), processed_at timestamptz,
 rejection_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table wallet_withdrawal_requests enable row level security;
create policy "own wallet withdrawal select" on wallet_withdrawal_requests for select using (user_id=app_private.current_profile_id());
create policy "admin wallet withdrawals all" on wallet_withdrawal_requests for all using (app_private.is_admin(auth.uid()));
-- Runtime functions submit_wallet_withdrawal_request, review_wallet_withdrawal_request,
-- and submit_identity_verification_with_fee are defined in the applied Supabase migration.