# CreatorFix — System Architecture & Database Design

This document covers items 1–13 of the development sequence: architecture, folder structure, ERD, schema, roles, wallet ledger, escrow, order state machine, RLS strategy, API map, media architecture, and security model. Phase plan is in the companion document.

---

## 1. System Architecture

```
Browser (Next.js client components)
        │
        ▼
Next.js App Router (Vercel)
   ├── Server Components (read-only data fetching, RLS-scoped)
   ├── Server Actions (mutations: orders, wallet, escrow, disputes)
   └── Route Handlers (webhooks: payment gateway, Cloudinary signing)
        │
        ▼
Authorization Layer (server-only)
   ├── Session → Supabase Auth user
   ├── Role lookup (profiles.role) — never trusted from client
   └── Zod validation of all inputs
        │
        ▼
Supabase PostgreSQL
   ├── RLS policies (defense layer 1)
   ├── SECURITY DEFINER functions for financial mutations (defense layer 2)
   └── Triggers for ledger integrity, audit logging
        │
        ▼
Supabase Storage (private: KYC docs, dispute evidence)
Cloudinary (public: avatars, problem screenshots, service portfolio images)
```

**Core rule:** the client never computes money. Every price, fee, escrow amount, and balance is read from the database or computed inside a `SECURITY DEFINER` Postgres function / server action that re-derives it from source rows — never from a value the client posted.

**Two independent enforcement layers for every sensitive read/write:**
1. RLS policy at the Postgres level (the floor — even a leaked service key misuse or bug can't bypass it for anon/authenticated roles).
2. Server-side authorization check + DTO shaping before anything is serialized to the client (the practical layer, since RLS alone can't reshape columns, only allow/deny rows).

---

## 2. Folder Structure

```
creatorfix/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                      # landing
│   │   ├── problems/[slug]/page.tsx
│   │   ├── platforms/[slug]/page.tsx
│   │   └── providers/[username]/page.tsx # public provider profile
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (customer)/
│   │   ├── dashboard/page.tsx
│   │   ├── wallet/page.tsx
│   │   ├── orders/[id]/page.tsx
│   │   └── disputes/page.tsx
│   ├── (provider)/
│   │   ├── provider/dashboard/page.tsx
│   │   ├── provider/services/page.tsx
│   │   ├── provider/orders/[id]/page.tsx
│   │   └── provider/earnings/page.tsx
│   ├── (admin)/
│   │   ├── admin/platforms/page.tsx
│   │   ├── admin/problems/page.tsx
│   │   ├── admin/providers/page.tsx
│   │   ├── admin/deposits/page.tsx
│   │   ├── admin/withdrawals/page.tsx
│   │   ├── admin/disputes/page.tsx
│   │   ├── admin/fees/page.tsx
│   │   └── admin/audit-logs/page.tsx
│   └── api/
│       ├── webhooks/payment/route.ts
│       └── cloudinary/sign/route.ts
├── actions/                              # Server Actions, grouped by domain
│   ├── wallet.actions.ts
│   ├── escrow.actions.ts
│   ├── orders.actions.ts
│   ├── services.actions.ts
│   ├── disputes.actions.ts
│   └── admin.actions.ts
├── lib/
│   ├── supabase/
│   │   ├── server.ts                     # server client (cookies-based)
│   │   ├── admin.ts                      # service-role client, server-only
│   │   └── middleware.ts
│   ├── dto/
│   │   ├── customer-public.dto.ts
│   │   └── provider-public.dto.ts
│   ├── validation/                       # Zod schemas, one per domain
│   ├── auth/
│   │   └── require-role.ts               # server-side role guard
│   └── money.ts                          # integer-cents helpers, never floats
├── db/
│   ├── migrations/
│   └── policies/                         # RLS SQL, one file per table
├── components/
├── .env.example
└── middleware.ts                         # route-level auth gate
```

Key discipline: **`lib/supabase/admin.ts` (service-role key) is imported only inside `actions/` and `app/api/webhooks/`, never inside anything that renders to the client**, and never inside a Client Component.

---

## 3. Entity-Relationship Overview

```
profiles ──1:1── provider_profiles
   │
   ├──1:N── wallets (one per user)
   │            └──1:N── wallet_transactions (ledger, append-only)
   │
   ├──1:N── deposits
   ├──1:N── withdrawal_requests
   │
platforms ──1:N── problems ──N:1── problem_categories
                     │
                     └──1:N── services ──N:1── provider_profiles
                                  │
                                  └──1:N── orders
                                              ├──1:1── escrow_transactions
                                              ├──1:N── order_messages
                                              ├──1:N── order_status_history
                                              ├──1:1── disputes (nullable)
                                              └──1:1── reviews (nullable)

website_dev_requests ──N:1── profiles (customer), provider_profiles (nullable)

audit_logs ──N:1── profiles (actor)
notifications ──N:1── profiles (recipient)
```

---

## 4. Complete Database Schema (PostgreSQL / Supabase)

All money columns are `bigint` storing **minor units (poisha)**, never `numeric`/`float`, to avoid rounding bugs. Fee snapshots are stored on the order row so historical orders are unaffected by later admin fee changes.

```sql
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
-- NOTE: phone/whatsapp/email on this table are the sensitive fields.
-- They are only ever selected by: the owning user, and admin.
-- Provider-facing queries MUST select from customer_public_view instead (see §7).

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
  payout_method jsonb,          -- PRIVATE: bkash/nagad/bank details — provider + admin only
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
  platform_service_fee bigint not null default 0,  -- minor units, admin-set default
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
  price bigint not null check (price >= 0),   -- minor units
  delivery_days integer not null check (delivery_days > 0),
  revisions_included integer not null default 0,
  portfolio_images text[] default '{}',
  status service_status not null default 'pending_approval',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================================
-- WALLET LEDGER (append-only)
-- ==========================================================
create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id),
  balance bigint not null default 0 check (balance >= 0),  -- denormalized cache, always derived
  reserved_balance bigint not null default 0 check (reserved_balance >= 0),
  updated_at timestamptz not null default now()
);

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(id),
  type wallet_txn_type not null,
  amount bigint not null,              -- signed: positive = credit, negative = debit
  balance_after bigint not null,       -- snapshot for audit trail
  reference_type text not null,        -- 'order' | 'deposit' | 'withdrawal' | 'dispute'
  reference_id uuid,
  idempotency_key text unique not null, -- prevents double-processing on retry
  created_by uuid references profiles(id), -- admin/system actor, for audit
  created_at timestamptz not null default now()
);
-- wallet_transactions is INSERT-ONLY at the application level.
-- No UPDATE/DELETE grants for authenticated role. balance is only ever
-- changed via the credit_wallet()/debit_wallet() SECURITY DEFINER functions below.

create table deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  amount bigint not null check (amount > 0),
  payment_method text not null,
  payment_reference text,
  proof_url text,                      -- Supabase private storage path
  status deposit_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles(id),
  amount bigint not null check (amount > 0),
  payout_destination jsonb not null,   -- snapshot of payout_method at request time
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
  service_price bigint not null,        -- snapshot at order time
  platform_fee bigint not null,         -- snapshot at order time
  total_charged bigint not null,        -- service_price + platform_fee
  provider_earning bigint not null,     -- service_price - platform commission, if any
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
-- All customer<->provider communication is scoped to an order_id.
-- No direct-message table between arbitrary users exists — this closes
-- an entire class of contact-info leakage (a DM thread with a phone number in it).

-- ==========================================================
-- DISPUTES / REVIEWS
-- ==========================================================
create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  raised_by uuid not null references profiles(id),
  reason text not null,
  evidence_urls text[] default '{}',    -- Supabase private storage
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
-- WEBSITE DEVELOPMENT REQUESTS (separate intake flow)
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
-- PLATFORM CONFIG / FEES
-- ==========================================================
create table platform_fee_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null,                 -- 'global' | 'platform' | 'problem'
  scope_ref_id uuid,                   -- platform_id or problem_id when scoped
  fee_type text not null,              -- 'flat' | 'percentage'
  fee_value bigint not null,           -- minor units if flat, basis points if percentage
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ==========================================================
-- NOTIFICATIONS / AUDIT
-- ==========================================================
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
```

---

## 5. Role / Permission Matrix

| Capability | Customer | Provider | Admin |
|---|---|---|---|
| View/edit own profile | ✅ | ✅ | ✅ |
| View own wallet & ledger | ✅ | ✅ (own earnings) | ✅ (all) |
| Deposit funds | ✅ **identity-verified only** | — | — |
| Browse problems/services | ✅ (verification not required) | ✅ | ✅ |
| Create order | ✅ **identity-verified only** | — | — |
| Publish a service | — | ✅ **identity-verified only** (own, pending approval) | ✅ (approve/reject) |
| Accept/progress assigned order | — | ✅ **identity-verified only** | — |
| Receive payout / withdraw earnings | — | ✅ **identity-verified only** | ✅ |
| See customer contact info | ❌ never | ❌ never | ✅ (support need) |
| See provider payout details | — | ✅ (own) | ✅ |
| See own identity verification evidence (paths only, not signed content) | ✅ (own) | ✅ (own) | ✅ (own, audited) |
| See another user's identity verification evidence | ❌ never | ❌ never | ✅, but every access is logged to `verification_audit_events` |
| Create/edit services | — | ✅ (own, pending approval) | ✅ (approve/reject) |
| Release escrow | ❌ | ❌ | ✅ (or auto-release on customer confirm) |
| Approve deposits | ❌ | ❌ | ✅ |
| Process withdrawals | ❌ | ❌ | ✅ |
| Manage platforms/problems/fees | ❌ | ❌ | ✅ |
| Resolve disputes | ❌ (can raise) | ❌ (can raise) | ✅ |
| Change own `profiles.role` | ❌ never — see §14 | ❌ never | ✅, only via `approve_provider_application()` |
| Change own verification `status` | ❌ never | ❌ never | ✅, only via review action |

This matrix is enforced in three independent layers, not just one:
1. RLS row-level policies (who can see/touch which **rows**).
2. Postgres column-level `GRANT`/`REVOKE` (§14) for the two columns — `profiles.role`, `profiles.status`, `provider_profiles.verification_status` — where row access should stay open but the column itself must never be client-writable.
3. `lib/auth/require-role.ts` **and** `lib/auth/require-verified.ts` server-side checks before any Server Action touches data.

A capability marked **identity-verified only** is gated by `is_identity_verified()` (Postgres) mirrored by `requireVerified()` (application layer) at every call site that creates an order, takes a deposit, publishes a service, accepts an order, or requests a withdrawal — never by disabling a button in the UI alone.

---

## 6. Wallet Ledger Design

**Principle: `wallets.balance` is a cache, `wallet_transactions` is the source of truth.** Every balance change is one `SECURITY DEFINER` function call that inserts a ledger row and updates the cached balance in the same transaction.

```sql
create or replace function apply_wallet_transaction(
  p_wallet_id uuid,
  p_type wallet_txn_type,
  p_amount bigint,              -- signed
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
  -- idempotency: safe to retry on network failure
  select * into v_txn from wallet_transactions where idempotency_key = p_idempotency_key;
  if found then
    return v_txn;
  end if;

  select balance into v_balance from wallets where id = p_wallet_id for update; -- row lock

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
```

Key properties:
- `for update` row lock prevents concurrent double-spend on the same wallet.
- `idempotency_key` (e.g. `order:{id}:hold`, `deposit:{id}:credit`) makes retries safe — a duplicated client request or webhook redelivery can never double-credit or double-debit.
- Only `service_role` can execute it — called exclusively from Server Actions / webhook route handlers, never reachable from anon/authenticated Postgres roles even if someone crafted a raw RPC call.

## 7. Escrow Design

Escrow amount is never client-supplied — it's `service_price + platform_fee` read server-side from the `services` and `platform_fee_rules` tables at order-creation time, then snapshotted onto the `orders` row.

```
create_order(service_id, requirements)
   → server re-fetches service.price + applicable fee rule
   → apply_wallet_transaction(customer_wallet, 'escrow_hold', -total, ...)
   → insert orders (status='payment_reserved', with snapshotted amounts)
   → insert escrow_transactions (amount_held=total, status='held')
```

On completion:
```
release_escrow(order_id)   -- called by customer confirmation OR admin, never by provider
   → provider_earning = orders.provider_earning (already snapshotted, minus fee)
   → apply_wallet_transaction(provider_wallet, 'provider_earning', +provider_earning, ...)
   → apply_wallet_transaction(platform_wallet, 'platform_fee', +platform_fee, ...)
   → update escrow_transactions set status='released', released_amount=total
   → update orders set status='completed'
```

On dispute resolved for customer / cancellation before acceptance:
```
refund_escrow(order_id, amount)
   → apply_wallet_transaction(customer_wallet, 'escrow_refund', +amount, ...)
   → update escrow_transactions set status='refunded' or 'partially_refunded'
```

All three flows are single Postgres functions wrapping multiple ledger calls in one transaction — either every leg posts, or none do.

## 8. Order State Machine

```
created ──► payment_reserved ──► accepted ──► in_progress ──► submitted ──► completed
    │              │                 │              │              │
    └──────────────┴─────────────────┴──────────────┴──────► cancelled (before work starts)
                                       │              │
                                       └──────────────┴──────► disputed ──► resolved_* ──► completed/refunded
```

Allowed transitions are enforced in a single server-side function `transition_order(order_id, new_status, actor)` — never as ad-hoc `UPDATE orders SET status = ...` scattered across the codebase. Illegal transitions (e.g. provider trying to jump straight to `completed`, or customer cancelling after `in_progress` without a dispute) raise an exception.

| From | To | Allowed actor |
|---|---|---|
| created | payment_reserved | system (automatic on successful wallet hold) |
| payment_reserved | accepted | provider |
| payment_reserved | cancelled | customer, admin |
| accepted | in_progress | provider |
| in_progress | submitted | provider |
| submitted | completed | customer, admin (auto-release after timeout) |
| submitted | disputed | customer |
| any active state | disputed | customer, provider |
| disputed | resolved_customer / resolved_provider / resolved_split | admin only |

## 9. Supabase RLS Strategy

General pattern per table: **deny by default, allow narrowly, never allow `select *` across roles.**

```sql
alter table profiles enable row level security;

-- Users can read/update their own full row
create policy "own profile full access"
  on profiles for select using (auth_user_id = auth.uid());
create policy "own profile update"
  on profiles for update using (auth_user_id = auth.uid());

-- Admin full access via a role-check helper (reads profiles.role for the caller)
create policy "admin full access profiles"
  on profiles for all using (is_admin(auth.uid()));

-- CRITICAL: no policy grants providers row-level access to another user's
-- profiles row at all. Providers never SELECT profiles directly for order
-- context — they SELECT from customer_public_view instead:

create view customer_public_view as
  select id, display_name, avatar_url from profiles;
grant select on customer_public_view to authenticated;
-- No RLS needed beyond the view's column list, since the view itself
-- never exposes phone/whatsapp/email — leakage is prevented structurally,
-- not just by a policy that could later be misconfigured.
```

```sql
alter table wallets enable row level security;
create policy "own wallet" on wallets for select using (
  user_id = (select id from profiles where auth_user_id = auth.uid())
);
create policy "admin wallets" on wallets for select using (is_admin(auth.uid()));
-- No insert/update/delete policy for authenticated at all — every balance
-- change goes through apply_wallet_transaction() under service_role,
-- which bypasses RLS by design (SECURITY DEFINER) but is itself unreachable
-- from the client.
```

```sql
alter table orders enable row level security;
create policy "customer sees own orders" on orders for select using (
  customer_id = (select id from profiles where auth_user_id = auth.uid())
);
create policy "provider sees assigned orders" on orders for select using (
  provider_id = (select id from provider_profiles where user_id =
    (select id from profiles where auth_user_id = auth.uid()))
);
create policy "admin sees all orders" on orders for all using (is_admin(auth.uid()));
-- No client-side insert policy: orders are only created via the
-- create_order() server function under service_role.
```

`is_admin(uuid)` is a `SECURITY DEFINER` helper function so policies don't recursively re-trigger RLS on `profiles` while evaluating the policy.

Every financially-mutating table (`wallets`, `wallet_transactions`, `escrow_transactions`, `deposits` status field, `withdrawal_requests` status field) has **no client-writable policy at all** — writes exist only through `service_role` functions.

## 10. API / Server Action Map

| Action | Caller | Notes |
|---|---|---|
| `actions/wallet.actions.ts::requestDeposit` | Customer | creates `deposits` row, status `pending` |
| `actions/wallet.actions.ts::verifyDeposit` | Admin | credits wallet via ledger fn |
| `actions/orders.actions.ts::createOrder` | Customer | re-derives price/fee, calls escrow hold |
| `actions/orders.actions.ts::acceptOrder` | Provider | role + assignment check |
| `actions/orders.actions.ts::submitWork` | Provider | |
| `actions/orders.actions.ts::confirmCompletion` | Customer | triggers `release_escrow` |
| `actions/escrow.actions.ts::releaseEscrow` | Admin (or system on timeout) | |
| `actions/disputes.actions.ts::raiseDispute` | Customer, Provider | freezes order in `disputed` |
| `actions/disputes.actions.ts::resolveDispute` | Admin | triggers refund/release split |
| `actions/wallet.actions.ts::requestWithdrawal` | Provider | checks available (non-reserved) balance |
| `actions/wallet.actions.ts::processWithdrawal` | Admin | |
| `actions/admin.actions.ts::upsertPlatform/Problem/Fee` | Admin | dynamic content, no deploy needed |
| `app/api/webhooks/payment/route.ts` | Payment gateway | signature-verified, idempotent |
| `app/api/cloudinary/sign/route.ts` | Authenticated | short-lived signed upload params only |

Every action begins with: `const user = await requireRole(['provider'])` (or whichever roles apply) before touching any data — role is re-derived server-side from the session on every call, never passed in as a parameter.

## 11. Cloudinary Architecture (public/non-sensitive media)

- Used for: problem screenshots, platform logos, service portfolio images, avatars.
- Upload flow: client requests a signed upload signature from `app/api/cloudinary/sign/route.ts` (server-side, using `CLOUDINARY_API_SECRET`, never exposed to browser) → client uploads directly to Cloudinary → client sends back the returned `secure_url` → server validates the URL's signature/format before persisting it to the DB.
- No customer-identifying content ever goes to Cloudinary (it's a public CDN by design).

## 12. Private File Architecture (Supabase Storage)

- Buckets: `deposit-proofs`, `dispute-evidence`, `kyc-documents` — all **private** (no public bucket policy).
- Access exclusively via short-lived signed URLs (`createSignedUrl`, ~5 min TTL) generated server-side after an authorization check confirms the requester is the owner, the assigned counterparty for that specific order/dispute, or an admin.
- RLS on `storage.objects` restricts path prefixes: e.g. a provider can only get a signed URL for evidence attached to a dispute on an order they're assigned to — never a directory listing.

## 14. Identity Verification (NID + Live Face Capture) — Mandatory for Both Roles

Every customer and every provider must reach `identity_verifications.status = 'verified'` before touching core marketplace functionality. **Documents submitted is not the same claim as identity verified** — the schema, RLS, and every server action enforce that distinction explicitly; nothing in the system treats an upload as proof of identity.

### 14.1 Registration flow (role is never client-chosen)

```
Register (email + password only — no role field in the form or the schema)
   ↓
Email verification
   ↓
Login
   ↓
Identity Verification Required (blocks dashboard access until submitted)
   ↓
NID front + NID back upload (private storage)
   ↓
Live camera face capture (MediaDevices API — no file picker fallback)
   ↓
Submission → status: 'pending' → (external KYC provider, when wired in) → 'in_review' → 'verified' | 'rejected'
   ↓
Verified → full customer dashboard
```

Every new account is created with `profiles.role = 'customer'` by the server — `registerAction` no longer accepts a `role` field at all (removed from `registerSchema`). There is no path, client or server, where registration produces a `provider` or `admin` row.

### 14.2 Provider onboarding (separate from registration, gated on verification)

```
Customer account (already identity-verified)
   ↓
Apply to Become Provider  →  provider_applications (status: 'submitted')
   ↓
Admin review
   ↓
approve_provider_application()  — SECURITY DEFINER, checks is_identity_verified()
   ↓
profiles.role flips to 'provider' (server-side only) + provider_profiles row created
   ↓
Provider dashboard (still gated: publishing/accepting/payout require the
provider's OWN verification_status = 'verified' on provider_profiles,
separate from identity verification, per the existing Phase 2+ approval flow)
```

A provider application can only be approved if the applicant already passed identity verification — enforced inside `approve_provider_application()` itself, not just in the admin UI, so a direct RPC call can't skip it either.

### 14.3 Schema

```sql
create type identity_verification_status as enum (
  'unverified', 'pending', 'in_review', 'verified', 'rejected'
);

create table identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status identity_verification_status not null default 'unverified',
  nid_front_path text,              -- private storage PATH, never a public URL
  nid_back_path text,
  live_face_path text,
  verification_provider text,       -- e.g. 'veriff', 'onfido' — null until wired in
  provider_reference_id text,
  provider_match_result jsonb,      -- admin-only, raw match/liveness result
  attempt_count integer not null default 1,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_requires_verified_at check (status <> 'verified' or verified_at is not null),
  constraint rejected_requires_reason check (status <> 'rejected' or rejection_reason is not null)
);
```

Full migration: `db/migrations/0003_identity_verification.sql`.

**Status vs. evidence:** kept in one table for now (see the migration's note on why), but every non-owner, non-admin read path goes through `identity_verification_status_view`, which structurally excludes all three evidence path columns — the same pattern used for `customer_public_view`. If evidence retention/deletion policy diverges from status lifecycle later, evidence splits into its own table without changing this view's contract.

### 14.4 External KYC provider abstraction

Local NID + selfie upload alone can never produce `status = 'verified'` — only `status = 'pending'` (customer/provider action) or `'in_review'` (once a provider call is in flight). The transition to `'verified'` happens in exactly one place: `actions/identity.actions.ts::reviewVerification()`, called either by:
- an external KYC provider's webhook (once integrated — `verification_provider` + `provider_reference_id` + `provider_match_result` are already in the schema for this), or
- an admin manual review action, until that integration exists.

```ts
// lib/kyc/provider.ts — the integration point. Phase 0/1 ships a
// LocalManualReviewProvider; a real provider (Veriff/Onfido/etc.) is a
// drop-in replacement behind this same interface — no schema change needed.
interface KycProvider {
  submitForVerification(input: {
    verificationId: string;
    nidFrontPath: string;
    nidBackPath: string;
    liveFacePath: string;
  }): Promise<{ providerReferenceId: string; status: "in_review" }>;
}
```

### 14.5 Storage architecture (private, path-only, no public URLs ever)

```
Supabase Storage bucket: identity-verification (private, no public policy)
  {user_id}/
    {verification_id}/
      nid-front.<ext>
      nid-back.<ext>
      live-face.<ext>
```

- Bucket is created private; there is no `SELECT` policy on `storage.objects` for `anon`, and the only `authenticated` policy scopes strictly to the caller's own `{user_id}` path prefix for **upload** (insert), never read.
- Reads happen exclusively through `createSignedUrl` (~2–5 min TTL) minted server-side inside `actions/identity.actions.ts`, after `requireRole` + ownership/admin check, and — for admin reads — after writing a `verification_audit_events` row of type `evidence_accessed` first.
- **Never Cloudinary.** Cloudinary is public-CDN-by-design (§11) and is reserved for non-identifying marketing/portfolio media; NID and face images never touch it.
- Client-side upload validation (extension, rough size) is a UX nicety only. The actual enforcement — MIME sniffing from file bytes (not the browser-supplied `Content-Type`), a hard size cap (e.g. 8 MB), and rejecting non-image payloads — happens in the Route Handler that proxies the upload, before it ever reaches Storage.
- Live face capture is captured via `navigator.mediaDevices.getUserMedia()` client-side into a `<canvas>` frame, then uploaded as image bytes — there is no `<input type="file">` accepting a selfie, so a pre-existing photo can't be substituted for a live capture. (This is a UX/integrity control, not a cryptographic liveness guarantee — real liveness detection is the external KYC provider's job once integrated, per §14.4.)

### 14.6 Privacy enforcement specifics

- `identity_verification_status_view` is the only thing customer-dashboard/provider-dashboard code queries for "am I verified yet" — it has no evidence columns, so a leak there is structurally impossible, not just policy-gated.
- No DTO (`CustomerPublicDTO`, `ProviderPublicDTO`) or public view ever includes anything from `identity_verifications` — verification status is a private, self-only (+ admin) fact, never surfaced on a public profile.
- RLS on `identity_verifications` grants the owner `SELECT` (their own row, evidence paths included — they need to see what they uploaded) and `INSERT` (a new attempt, always forced to `status = 'pending'` by the policy's `WITH CHECK`), but **no `UPDATE` policy at all**. Resubmission after rejection is a new row, not a mutation of the old one — this closes the direct IDOR path where a client tries to `PATCH` its own row to `status = 'verified'`.
- Every admin read of evidence (not just status) writes a `verification_audit_events` row first, in the same server action, before the signed URL is generated — so "admin looked at NID images" is always reconstructable later.
- Audit rows never contain the NID number, the raw image, or the raw face image — only structured metadata (`{ verificationId, fieldsAccessed: ["nid_front", "live_face"] }`).

### 14.7 Abuse resistance

- `attempt_count` increments per resubmission; `requireVerified`-adjacent action `submitVerification()` rate-limits resubmission (e.g. no more than one new `pending` row per rolling 24h) to blunt repeated-attempt abuse.
- File validation: real MIME sniffing (magic bytes) server-side, hard size ceiling, extension allow-list (`jpg`, `jpeg`, `png`, `webp` only) — a `.php` renamed to `.jpg` is rejected on content inspection, not extension.
- Storage paths are never returned to the client for direct use — the client receives only a short-lived signed URL when it legitimately needs to display its own already-uploaded evidence (e.g. "your NID front" thumbnail on the verification status page), minted fresh per request.
- `is_identity_verified()` is the single source of truth Postgres-side; every gated server action calls the identically-named `requireVerified()` TypeScript helper, which itself queries the same underlying status — there is exactly one place this logic lives, not one copy per action, to prevent the checks from drifting apart over time.

## 15. Updated Storage Architecture Summary

| Bucket | Visibility | Contents | Access pattern |
|---|---|---|---|
| Cloudinary | Public CDN | Avatars, problem screenshots, platform logos, service portfolio images | Signed upload params from server; direct client upload; public URL stored in DB |
| `deposit-proofs` (Supabase) | Private | Payment proof screenshots | Signed URL, owner or admin only |
| `dispute-evidence` (Supabase) | Private | Dispute attachments | Signed URL, order parties or admin only |
| `kyc-documents` (Supabase, legacy name — superseded by `identity-verification`) | Private | — | — |
| `identity-verification` (Supabase) | **Private, no public policy at all** | NID front/back, live face capture | Signed URL, owner (own evidence) or admin (audited) only — **never** a bare public URL, **never** Cloudinary |

## 16. Updated Registration & Role-Change Security Model

- `registerSchema` has no `role` field. `registerAction` always inserts `role: 'customer'`.
- `profiles.role` and `profiles.status`, and `provider_profiles.verification_status`/`status`, are protected by **column-level** `REVOKE`/`GRANT` (see `db/migrations/0005_lock_role_columns.sql`) in addition to row-level RLS — a user can update their own `display_name` but literally cannot issue an `UPDATE` touching `role` even against their own row, independent of any RLS policy correctness.
- The only function capable of setting `role = 'provider'` is `approve_provider_application()`, itself only callable by `service_role`, itself only invoked from an admin-authenticated Server Action, itself only succeeding if `is_identity_verified()` is true for the applicant.
- No `role = 'admin'` assignment path exists anywhere in application code — admin accounts are provisioned directly in the database by an operator, out of band, deliberately outside the app's own write surface.

## 17. Security Model Summary

1. **AuthN**: Supabase Auth, email verified before wallet/order actions unlock.
2. **AuthZ**: role re-checked server-side on every action; RLS as a second, independent floor.
3. **Financial integrity**: integer minor-units math, row-level locking, idempotency keys, append-only ledger, all mutations behind `SECURITY DEFINER` functions callable only by `service_role`.
4. **Privacy**: customer contact fields never leave `profiles`/`customer_public_view` boundary; provider-facing code paths are typed against `CustomerPublicDTO` so a leak is a compile error, not just a policy gap.
5. **Input validation**: Zod schema at every Server Action boundary, rejecting before any DB call.
6. **Audit**: every admin financial action and every status transition writes an `audit_logs` row with before/after state.
7. **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` and `CLOUDINARY_API_SECRET` only referenced in server-only files (enforced by folder convention + `server-only` package import guard).
8. **Identity verification**: no core financial or provider action (deposit, order creation, order acceptance, service publishing, withdrawal) proceeds without `is_identity_verified()` returning true, checked server-side on every call — never inferred from an upload having happened, never bypassable by a client-side flag. NID/face evidence lives only in a private, path-only, no-public-URL bucket; every admin read of that evidence is audited before the signed URL is issued. Role can only ever move `customer → provider` through `approve_provider_application()`, which itself is gated on identity verification — see §14–16.
