# CreatorFix — Identity Verification (NID + Live Face) Architecture

This is a **mandatory prerequisite** for core marketplace functionality, not an optional profile enhancement. It supersedes/extends sections 4 (schema), 5 (permission matrix), 9 (RLS), 11–12 (storage), and 14 (role/registration) of doc 01, and its own Phases 1 and 1.5 in doc 02.

---

## 1. Core Principle

**"Documents submitted" ≠ "identity verified."** These are two different facts and must never be collapsed into one boolean. A row existing in the evidence table means someone uploaded files. A row in the status table with `status = 'verified'` means an admin or an external KYC provider has confirmed the person is who they claim to be.

Concretely: nothing in the codebase may set `identity_verifications.status = 'verified'` as a side effect of an upload completing. The only two paths to `verified` are (a) an admin decision after manual review, or (b) a KYC provider webhook (once integrated — for now, only (a) exists).

## 2. Status Model — Status Table Separate From Evidence Table

Per the spec's suggestion, verification **status** (queried constantly, safe to expose narrowly to the owning user) is separated from verification **evidence** (accessed rarely, only by the owner or an explicitly audited admin review action).

**Key distinction:**
- Status is cheap to read, safe to query on every page load ("is this user verified yet?").
- Evidence is expensive to access on purpose — every admin view is logged to `verification_audit_events`, the audit trail of sensitive data access.

Why two tables instead of one: a customer-facing "am I verified yet" status check is something the UI polls/reads constantly (e.g. gating the "create order" button). That query must never have a cost that involves scanning evidence paths or large JSONB blobs. Status-only queries are fast and lightweight; evidence queries are intentionally slower (to encourage less frequent access) and fully audited.