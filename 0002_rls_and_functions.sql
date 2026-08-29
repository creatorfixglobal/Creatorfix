-- CreatorFix — Phase 0: RLS policies, helper functions, wallet ledger function
-- Run after 0001_schema.sql

-- ==========================================================
-- HELPER: is_admin — SECURITY DEFINER so it doesn't recurse through RLS
-- ==========================================================
create or replace function is_admin(p_auth_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where auth_user_id = p_auth_user_id and role = 'admin'
  );
$$;

create or replace function current_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from profiles where auth_user_id = auth.uid();
$$;

create or replace function current_provider_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select pp.id from provider_profiles pp
  join profiles p on p.id = pp.user_id
  where p.auth_user_id = auth.uid();
$$;

-- ==========================================================
-- PROFILES — deny by default, then narrow allow
-- ==========================================================
alter table profiles enable row level security;

create policy "own profile select" on profiles
  for select using (auth_user_id = auth.uid());

create policy "own profile update" on profiles
  for update using (auth_user_id = auth.uid());

create policy "admin full access profiles" on profiles
  for all using (is_admin(auth.uid()));

-- Public-safe view: the ONLY way provider-facing code may read customer info.
-- Structurally excludes phone/whatsapp/email — not a policy that could be
-- loosened later, but a view whose column list doesn't include them.
create or replace view customer_public_view as
  select id, display_name, avatar_url from profiles;

grant select on customer_public_view to authenticated;

-- ==========================================================
-- PROVIDER PROFILES
-- ==========================================================
alter table provider_profiles enable row level security;

create policy "provider own profile" on provider_profiles
  for select using (user_id = current_profile_id());

create policy "provider own profile update" on provider_profiles
  for update using (user_id = current_profile_id());

create policy "public can view verified providers (safe columns via view)" on provider_profiles
  for select using (status = 'active');
-- NOTE: payout_method must never be selected in provider-facing/public
-- queries even though this policy allows row access — enforce via the
-- ProviderPublicDTO at the application layer (see lib/dto). RLS controls
-- row visibility; column-level secrecy for payout_method is enforced by
-- always querying through provider_public_view below.

create or replace view provider_public_view as
  select
    pp.id, pp.user_id, pp.bio, pp.skills, pp.verification_status,
    pp.rating_average, pp.rating_count, pp.completed_orders,
    pp.response_rate, pp.status,
    p.display_name, p.avatar_url, p.username
  from provider_profiles pp
  join profiles p on p.id = pp.user_id;

grant select on provider_public_view to authenticated, anon;

create policy "admin full access provider_profiles" on provider_profiles
  for all using (is_admin(auth.uid()));

-- ==========================================================
-- PLATFORMS / PROBLEMS / CATEGORIES — public read, admin write
-- ==========================================================
alter table platforms enable row level security;
create policy "public read active platforms" on platforms
  for select using (status = 'active' or is_admin(auth.uid()));
create policy "admin write platforms" on platforms
  for insert with check (is_admin(auth.uid()));
create policy "admin update platforms" on platforms
  for update using (is_admin(auth.uid()));
create policy "admin delete platforms" on platforms
  for delete using (is_admin(auth.uid()));

alter table problem_categories enable row level security;
create policy "public read categories" on problem_categories for select using (true);
create policy "admin write categories" on problem_categories for all using (is_admin(auth.uid()));

alter table problems enable row level security;
create policy "public read published problems" on problems
  for select using (status = 'published' or is_admin(auth.uid()));
create policy "admin write problems" on problems
  for insert with check (is_admin(auth.uid()));
create policy "admin update problems" on problems
  for update using (is_admin(auth.uid()));
create policy "admin delete problems" on problems
  for delete using (is_admin(auth.uid()));

-- ==========================================================
-- SERVICES
-- ==========================================================
alter table services enable row level security;

create policy "public read published services" on services
  for select using (status = 'published');

create policy "provider reads own services (any status)" on services
  for select using (provider_id = current_provider_profile_id());

create policy "provider inserts own service" on services
  for insert with check (provider_id = current_provider_profile_id());

create policy "provider updates own service" on services
  for update using (provider_id = current_provider_profile_id());

create policy "admin full access services" on services
  for all using (is_admin(auth.uid()));

-- ==========================================================
-- WALLETS / LEDGER — no client write policy at all
-- ==========================================================
alter table wallets enable row level security;
create policy "own wallet select" on wallets
  for select using (user_id = current_profile_id());
create policy "admin wallets select" on wallets
  for select using (is_admin(auth.uid()));
-- Intentionally: no insert/update/delete policy for authenticated role.

alter table wallet_transactions enable row level security;
create policy "own wallet txns select" on wallet_transactions
  for select using (
    wallet_id in (select id from wallets where user_id = current_profile_id())
  );
create policy "admin wallet txns select" on wallet_transactions
  for select using (is_admin(auth.uid()));
-- Intentionally: no client insert/update/delete policy. Only
-- apply_wallet_transaction() (service_role, SECURITY DEFINER) writes here.

alter table deposits enable row level security;
create policy "customer own deposits" on deposits
  for select using (user_id = current_profile_id());
create policy "customer create deposit" on deposits
  for insert with check (user_id = current_profile_id() and status = 'pending');
create policy "admin deposits all" on deposits
  for all using (is_admin(auth.uid()));

alter table withdrawal_requests enable row level security;
create policy "provider own withdrawals" on withdrawal_requests
  for select using (provider_id = current_provider_profile_id());
create policy "provider create withdrawal" on withdrawal_requests
  for insert with check (provider_id = current_provider_profile_id() and status = 'requested');
create policy "admin withdrawals all" on withdrawal_requests
  for all using (is_admin(auth.uid()));

-- ==========================================================
-- ORDERS / ESCROW — no client insert policy (server function only)
-- ==========================================================
alter table orders enable row level security;
create policy "customer sees own orders" on orders
  for select using (customer_id = current_profile_id());
create policy "provider sees assigned orders" on orders
  for select using (provider_id = current_provider_profile_id());
create policy "admin sees all orders" on orders
  for all using (is_admin(auth.uid()));

alter table escrow_transactions enable row level security;
create policy "party sees own order escrow" on escrow_transactions
  for select using (
    order_id in (
      select id from orders
      where customer_id = current_profile_id()
         or provider_id = current_provider_profile_id()
    )
  );
create policy "admin escrow all" on escrow_transactions
  for all using (is_admin(auth.uid()));

alter table order_status_history enable row level security;
create policy "party sees own order history" on order_status_history
  for select using (
    order_id in (
      select id from orders
      where customer_id = current_profile_id()
         or provider_id = current_provider_profile_id()
    )
  );
create policy "admin order history all" on order_status_history
  for all using (is_admin(auth.uid()));

-- ==========================================================
-- ORDER MESSAGES — scoped strictly to the order's two parties
-- ==========================================================
alter table order_messages enable row level security;
create policy "party reads own order messages" on order_messages
  for select using (
    order_id in (
      select id from orders
      where customer_id = current_profile_id()
         or provider_id = current_provider_profile_id()
    )
  );
create policy "party sends message on own order" on order_messages
  for insert with check (
    sender_id = current_profile_id()
    and order_id in (
      select id from orders
      where customer_id = current_profile_id()
         or provider_id = current_provider_profile_id()
    )
  );
create policy "admin reads all messages" on order_messages
  for select using (is_admin(auth.uid()));

-- ==========================================================
-- DISPUTES / REVIEWS
-- ==========================================================
alter table disputes enable row level security;
create policy "party sees own dispute" on disputes
  for select using (
    order_id in (
      select id from orders
      where customer_id = current_profile_id()
         or provider_id = current_provider_profile_id()
    )
  );
create policy "party raises dispute on own order" on disputes
  for insert with check (
    raised_by = current_profile_id()
    and order_id in (
      select id from orders
      where customer_id = current_profile_id()
         or provider_id = current_provider_profile_id()
    )
  );
create policy "admin disputes all" on disputes
  for all using (is_admin(auth.uid()));

alter table reviews enable row level security;
create policy "public read reviews" on reviews for select using (true);
create policy "customer creates review on own completed order" on reviews
  for insert with check (customer_id = current_profile_id());
create policy "admin reviews all" on reviews for all using (is_admin(auth.uid()));

-- ==========================================================
-- NOTIFICATIONS / AUDIT LOGS
-- ==========================================================
alter table notifications enable row level security;
create policy "own notifications" on notifications
  for select using (user_id = current_profile_id());
create policy "own notifications update read" on notifications
  for update using (user_id = current_profile_id());
create policy "admin notifications all" on notifications
  for all using (is_admin(auth.uid()));

alter table audit_logs enable row level security;
create policy "admin only audit logs" on audit_logs
  for select using (is_admin(auth.uid()));
-- No client insert policy — audit_logs is written exclusively by
-- server-side triggers/functions under service_role.

-- ==========================================================
-- PLATFORM FEE RULES
-- ==========================================================
alter table platform_fee_rules enable row level security;
create policy "public read active fee rules" on platform_fee_rules
  for select using (active = true or is_admin(auth.uid()));
create policy "admin fee rules write" on platform_fee_rules
  for all using (is_admin(auth.uid()));

-- ==========================================================
-- WEBSITE DEV REQUESTS
-- ==========================================================
alter table website_dev_requests enable row level security;
create policy "customer own website requests" on website_dev_requests
  for select using (customer_id = current_profile_id());
create policy "customer create website request" on website_dev_requests
  for insert with check (customer_id = current_profile_id());
create policy "provider sees assigned website requests" on website_dev_requests
  for select using (provider_id = current_provider_profile_id());
create policy "admin website requests all" on website_dev_requests
  for all using (is_admin(auth.uid()));

-- ==========================================================
-- WALLET LEDGER FUNCTION — the only way money ever moves
-- ==========================================================
create or replace function apply_wallet_transaction(
  p_wallet_id uuid,
  p_type wallet_txn_type,
  p_amount bigint,              -- signed: positive = credit, negative = debit
  p_reference_type text,
  p_reference_id uuid,
  p_idempotency_key text,
  p_actor uuid
) returns wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_txn wallet_transactions;
begin
  select * into v_txn from wallet_transactions where idempotency_key = p_idempotency_key;
  if found then
    return v_txn; -- safe retry: already processed
  end if;

  select balance into v_balance from wallets where id = p_wallet_id for update;

  if v_balance is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  if v_balance + p_amount < 0 then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update wallets set balance = balance + p_amount, updated_at = now()
    where id = p_wallet_id;

  insert into wallet_transactions (
    wallet_id, type, amount, balance_after, reference_type,
    reference_id, idempotency_key, created_by
  ) values (
    p_wallet_id, p_type, p_amount, v_balance + p_amount, p_reference_type,
    p_reference_id, p_idempotency_key, p_actor
  ) returning * into v_txn;

  return v_txn;
end;
$$;

revoke all on function apply_wallet_transaction from public, anon, authenticated;
grant execute on function apply_wallet_transaction to service_role;

-- ==========================================================
-- ORDER STATE MACHINE FUNCTION
-- ==========================================================
create or replace function transition_order(
  p_order_id uuid,
  p_new_status order_status,
  p_actor uuid,
  p_note text default null
) returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_allowed boolean := false;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  -- allowed transition table
  if v_order.status = 'created' and p_new_status = 'payment_reserved' then v_allowed := true;
  elsif v_order.status = 'payment_reserved' and p_new_status in ('accepted','cancelled') then v_allowed := true;
  elsif v_order.status = 'accepted' and p_new_status in ('in_progress','disputed') then v_allowed := true;
  elsif v_order.status = 'in_progress' and p_new_status in ('submitted','disputed') then v_allowed := true;
  elsif v_order.status = 'submitted' and p_new_status in ('completed','disputed') then v_allowed := true;
  elsif v_order.status = 'disputed' and p_new_status in ('completed','refunded') then v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'ILLEGAL_TRANSITION: % -> %', v_order.status, p_new_status;
  end if;

  update orders set status = p_new_status, updated_at = now()
    where id = p_order_id returning * into v_order;

  insert into order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order_id, v_order.status, p_new_status, p_actor, p_note);

  return v_order;
end;
$$;

revoke all on function transition_order from public, anon, authenticated;
grant execute on function transition_order to service_role;

grant execute on function is_admin to authenticated, anon;
grant execute on function current_profile_id to authenticated;
grant execute on function current_provider_profile_id to authenticated;
