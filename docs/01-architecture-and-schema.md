# CreatorFix — System Architecture & Database Design

This document covers items 1–13 of the development sequence: architecture, folder structure, ERD, schema, roles, wallet ledger, escrow, order state machine, RLS strategy, API map, media architecture, and identity verification.

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

**Core rule:** the client never computes money. Every price, fee, escrow amount, and balance is read from the database or computed inside a `SECURITY DEFINER` Postgres function / server action that runs with the `service_role` key, never the `anon` or `authenticated` roles.

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

Key discipline: **`lib/supabase/admin.ts` (service-role key) is imported only inside `actions/` and `app/api/webhooks/`, never inside anything that renders to the client**, and never inside a Client Component (enforced by folder convention + `server-only` package import guard).