-- CreatorFix — Phase 0 schema migration
-- Run against a fresh Supabase Postgres database.

create extension if not exists pgcrypto;

-- ==========================================================
-- ENUMS
-- ==========================================================
create type user_role as enum ('customer', 'provider', 'admin');
create type account_status as enum ('active', 'suspended', 'banned', 'pending');
create type verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type problem_status as enum ('draft', 'published', 'archived');
create type service_status as enum ('pending_approval', 'published', 'rejected', 'paused');
create type order_status as enum (
  'created', 'payment_reserved', 'accepted', 'in_progress',
  'submitted', 'completed', 'disputed', 'cancelled', 'refunded'
);
create type escrow_status as enum ('held', 'released', 'refunded', 'partially_refunded');
create type wallet_txn_type as enum (
  'deposit', 'withdrawal', 'escrow_hold', 'escrow_release',
  'escrow_refund', 'platform_fee', 'provider_earning', 'adjustment'
);
create type deposit_status as enum ('pending', 'verified', 'rejected');
create type withdrawal_status as enum ('requested', 'processing', 'paid', 'rejected');
create type dispute_status as enum ('open', 'under_review', 'resolved_customer', 'resolved_provider', 'resolved_split');

-- ==========================================================
-- PROFILES
-- ==========================================================
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  username text unique not null,
  display_name text not null,
  email text not null,
  phone text,
  whatsapp_number text,
  avatar_url text,
  status account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  bio text,
  skills text[] default '{}',
  verification_status verification_status not null default 'unverified',
  verified_at timestamptz,
  rating_average numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  completed_orders integer not null default 0,
  response_rate numeric(5,2),
  payout_method jsonb,
  status account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================================
-- PLATFORMS / PROBLEMS
-- ==========================================================
create table platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  description text,
  status account_status not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table problem_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  sort_order integer not null default 0
);

create table problems (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references platforms(id),
  category_id uuid references problem_categories(id),
  title text not null,
  slug text unique not null,
  short_description text,
  full_description text,
  cover_image_url text,
  screenshots text[] default '{}',
  requirements text[] default '{}',
  platform_service_fee bigint not null default 0,
  status problem_status not null default 'draft',
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================================
-- SERVICES
-- ==========================================================
create table services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles(id),
  problem_id uuid references problems(id),
  title text not null,
  description text not null,
  price bigint not null check (price >= 0),
  delivery_days integer not null check (delivery_days > 0),
  revisions_included integer not null default 0,
  portfolio_images text[] default '{}',
  status service_status not null default 'pending_approval',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================================
-- WALLET LEDGER
-- ==========================================================
create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id),
  balance bigint not null default 0 check (balance >= 0),
  reserved_balance bigint not null default 0 check (reserved_balance >= 0),
  updated_at timestamptz not null default now()
);

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(id),
  type wallet_txn_type not null,
  amount bigint not null,
  balance_after bigint not null,
  reference_type text not null,
  reference_id uuid,
  idempotency_key text unique not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  amount bigint not null check (amount > 0),
  payment_method text not null,
  payment_reference text,
  proof_url text,
  status deposit_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles(id),
  amount bigint not null check (amount > 0),
  payout_destination jsonb not null,
  status withdrawal_status not null default 'requested',
  processed_by uuid references profiles(id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ==========================================================
-- ORDERS / ESCROW
-- ==========================================================
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  provider_id uuid not null references provider_profiles(id),
  service_id uuid not null references services(id),
  service_price bigint not null,
  platform_fee bigint not null,
  total_charged bigint not null,
  provider_earning bigint not null,
  status order_status not null default 'created',
  requirements_submitted jsonb,
  delivery_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  from_status order_status,
  to_status order_status not null,
  changed_by uuid references profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create table escrow_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  amount_held bigint not null,
  status escrow_status not null default 'held',
  released_amount bigint default 0,
  refunded_amount bigint default 0,
  released_by uuid references profiles(id),
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create table order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  sender_id uuid not null references profiles(id),
  body text,
  attachment_url text,
  created_at timestamptz not null default now()
);

-- ==========================================================
-- DISPUTES / REVIEWS
-- ==========================================================
create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  raised_by uuid not null references profiles(id),
  reason text not null,
  evidence_urls text[] default '{}',
  status dispute_status not null default 'open',
  resolution_note text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  customer_id uuid not null references profiles(id),
  provider_id uuid not null references provider_profiles(id),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ==========================================================
-- WEBSITE DEV REQUESTS
-- ==========================================================
create table website_dev_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  provider_id uuid references provider_profiles(id),
  project_brief text not null,
  budget_range text,
  status order_status not null default 'created',
  created_at timestamptz not null default now()
);

-- ==========================================================
-- FEES / NOTIFICATIONS / AUDIT
-- ==========================================================
create table platform_fee_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  scope_ref_id uuid,
  fee_type text not null,
  fee_value bigint not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  type text not null,
  title text not null,
  body text,
  reference_type text,
  reference_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index idx_problems_platform on problems(platform_id);
create index idx_services_provider on services(provider_id);
create index idx_orders_customer on orders(customer_id);
create index idx_orders_provider on orders(provider_id);
create index idx_wallet_txn_wallet on wallet_transactions(wallet_id);
create index idx_notifications_user on notifications(user_id, read_at);
