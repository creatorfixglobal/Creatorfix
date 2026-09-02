-- CreatorFix — Core schema foundation
-- Money uses bigint minor units (poisha). Never float/numeric for money.
create extension if not exists pgcrypto;

do $$ begin create type user_role as enum ('customer','provider','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type account_status as enum ('active','suspended','banned','pending'); exception when duplicate_object then null; end $$;
do $$ begin create type verification_status as enum ('unverified','pending','verified','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type service_status as enum ('pending_approval','published','rejected','paused'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status as enum ('created','payment_reserved','accepted','in_progress','submitted','completed','disputed','cancelled','refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type escrow_status as enum ('held','released','refunded','partially_refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type wallet_txn_type as enum ('deposit','withdrawal','escrow_hold','escrow_release','escrow_refund','platform_fee','provider_earning','adjustment'); exception when duplicate_object then null; end $$;
do $$ begin create type deposit_status as enum ('pending','verified','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type withdrawal_status as enum ('requested','processing','paid','rejected'); exception when duplicate_object then null; end $$;

create table if not exists profiles (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid not null unique references auth.users(id) on delete cascade,
 role user_role not null default 'customer',
 username text unique not null, display_name text not null, email text not null,
 phone text, whatsapp_number text, avatar_url text,
 status account_status not null default 'active',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists provider_profiles (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references profiles(id) on delete cascade,
 bio text, skills text[] not null default '{}',
 verification_status verification_status not null default 'unverified',
 payout_method jsonb, status account_status not null default 'pending',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists identity_verifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references profiles(id) on delete cascade,
 nid_front_path text, nid_back_path text, live_face_path text,
 status verification_status not null default 'unverified',
 rejection_reason text, reviewed_by uuid references profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists platforms (id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null, logo_url text, description text, status account_status not null default 'active', sort_order integer not null default 0);
create table if not exists problem_categories (id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null, sort_order integer not null default 0);
create table if not exists problems (id uuid primary key default gen_random_uuid(), platform_id uuid not null references platforms(id), category_id uuid references problem_categories(id), title text not null, slug text unique not null, short_description text, full_description text, cover_image_url text, screenshots text[] not null default '{}', requirements text[] not null default '{}', platform_service_fee bigint not null default 0 check(platform_service_fee>=0));
create table if not exists services (id uuid primary key default gen_random_uuid(), provider_id uuid not null references provider_profiles(id), problem_id uuid references problems(id), title text not null, description text not null, price bigint not null check(price>=0), delivery_days integer not null check(delivery_days>0), portfolio_images text[] not null default '{}', status service_status not null default 'pending_approval');
create table if not exists wallets (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles(id), balance bigint not null default 0 check(balance>=0), reserved_balance bigint not null default 0 check(reserved_balance>=0 and reserved_balance<=balance), updated_at timestamptz not null default now());
create table if not exists wallet_transactions (id uuid primary key default gen_random_uuid(), wallet_id uuid not null references wallets(id), type wallet_txn_type not null, amount bigint not null, balance_after bigint not null check(balance_after>=0), reference_type text not null, reference_id uuid, idempotency_key text unique not null, created_by uuid references profiles(id), created_at timestamptz not null default now());
create table if not exists deposits (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), amount bigint not null check(amount>0), payment_method text not null, payment_reference text, proof_path text, status deposit_status not null default 'pending', reviewed_by uuid references profiles(id), reviewed_at timestamptz);
create table if not exists withdrawal_requests (id uuid primary key default gen_random_uuid(), provider_id uuid not null references provider_profiles(id), amount bigint not null check(amount>0), payout_destination jsonb not null, status withdrawal_status not null default 'requested');
create table if not exists orders (id uuid primary key default gen_random_uuid(), customer_id uuid not null references profiles(id), provider_id uuid not null references provider_profiles(id), service_id uuid not null references services(id), service_price bigint not null check(service_price>=0), platform_fee bigint not null check(platform_fee>=0), total_charged bigint not null check(total_charged=service_price+platform_fee), provider_earning bigint not null check(provider_earning>=0), status order_status not null default 'created', requirements_submitted jsonb, created_at timestamptz not null default now());
create table if not exists escrow_transactions (id uuid primary key default gen_random_uuid(), order_id uuid not null unique references orders(id), amount_held bigint not null check(amount_held>=0), status escrow_status not null default 'held', released_amount bigint not null default 0, refunded_amount bigint not null default 0);
create table if not exists order_messages (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade, sender_id uuid not null references profiles(id), body text, attachment_path text, created_at timestamptz not null default now(), check(body is not null or attachment_path is not null));
create table if not exists notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), type text not null, title text not null, body text, created_at timestamptz not null default now());
create table if not exists audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references profiles(id), action text not null, entity_type text not null, entity_id uuid, before_state jsonb, after_state jsonb, created_at timestamptz not null default now());

create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_provider on orders(provider_id);
create index if not exists idx_messages_order on order_messages(order_id);
create index if not exists idx_ledger_wallet_created on wallet_transactions(wallet_id,created_at desc);