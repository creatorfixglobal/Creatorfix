-- CreatorFix — RLS baseline and security helpers
create or replace function public.current_profile_id() returns uuid language sql stable security definer set search_path=public as $$ select id from profiles where auth_user_id=auth.uid() $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where auth_user_id=auth.uid() and role='admin' and status='active') $$;

alter table profiles enable row level security;
alter table provider_profiles enable row level security;
alter table identity_verifications enable row level security;
alter table platforms enable row level security;
alter table problem_categories enable row level security;
alter table problems enable row level security;
alter table services enable row level security;
alter table wallets enable row level security;
alter table wallet_transactions enable row level security;
alter table deposits enable row level security;
alter table withdrawal_requests enable row level security;
alter table orders enable row level security;
alter table escrow_transactions enable row level security;
alter table order_messages enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

create policy "profiles_select_own_or_admin" on profiles for select using (auth_user_id=auth.uid() or is_admin());
create policy "profiles_update_own_or_admin" on profiles for update using (auth_user_id=auth.uid() or is_admin()) with check (auth_user_id=auth.uid() or is_admin());
create policy "provider_public_read" on provider_profiles for select using (true);
create policy "provider_owner_write" on provider_profiles for all using (user_id=current_profile_id() or is_admin()) with check (user_id=current_profile_id() or is_admin());
create policy "identity_owner_read" on identity_verifications for select using (user_id=current_profile_id() or is_admin());
create policy "identity_owner_update" on identity_verifications for update using (user_id=current_profile_id() or is_admin()) with check (user_id=current_profile_id() or is_admin());
create policy "identity_owner_insert" on identity_verifications for insert with check (user_id=current_profile_id() or is_admin());
create policy "catalog_read_platforms" on platforms for select using (status='active' or is_admin());
create policy "catalog_read_categories" on problem_categories for select using (true);
create policy "catalog_read_problems" on problems for select using (true);
create policy "catalog_read_services" on services for select using (status='published' or provider_id in (select id from provider_profiles where user_id=current_profile_id()) or is_admin());
create policy "wallet_owner_read" on wallets for select using (user_id=current_profile_id() or is_admin());
create policy "ledger_owner_read" on wallet_transactions for select using (wallet_id in (select id from wallets where user_id=current_profile_id()) or is_admin());
create policy "deposit_owner_read" on deposits for select using (user_id=current_profile_id() or is_admin());
create policy "order_participant_read" on orders for select using (customer_id=current_profile_id() or provider_id in (select id from provider_profiles where user_id=current_profile_id()) or is_admin());
create policy "message_participant_read" on order_messages for select using (order_id in (select id from orders where customer_id=current_profile_id() or provider_id in (select id from provider_profiles where user_id=current_profile_id())) or is_admin());
create policy "message_participant_insert" on order_messages for insert with check (sender_id=current_profile_id() and order_id in (select id from orders where customer_id=current_profile_id() or provider_id in (select id from provider_profiles where user_id=current_profile_id())));
create policy "notifications_owner_read" on notifications for select using (user_id=current_profile_id() or is_admin());

revoke all on wallets,wallet_transactions,escrow_transactions from anon,authenticated;

create or replace function apply_wallet_transaction(p_wallet_id uuid,p_type wallet_txn_type,p_amount bigint,p_reference_type text,p_reference_id uuid,p_idempotency_key text,p_actor uuid)
returns wallet_transactions language plpgsql security definer set search_path=public as $$
declare v_balance bigint; v_tx wallet_transactions;
begin
 select * into v_tx from wallet_transactions where idempotency_key=p_idempotency_key;
 if found then return v_tx; end if;
 select balance into v_balance from wallets where id=p_wallet_id for update;
 if not found then raise exception 'WALLET_NOT_FOUND'; end if;
 if v_balance+p_amount<0 then raise exception 'INSUFFICIENT_FUNDS'; end if;
 update wallets set balance=v_balance+p_amount,updated_at=now() where id=p_wallet_id;
 insert into wallet_transactions(wallet_id,type,amount,balance_after,reference_type,reference_id,idempotency_key,created_by)
 values(p_wallet_id,p_type,p_amount,v_balance+p_amount,p_reference_type,p_reference_id,p_idempotency_key,p_actor) returning * into v_tx;
 return v_tx;
end $$;
revoke all on function apply_wallet_transaction(uuid,wallet_txn_type,bigint,text,uuid,text,uuid) from public,anon,authenticated;