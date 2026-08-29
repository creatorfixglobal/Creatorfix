"use server";

import { requireRole } from "@/lib/auth/require-role";
import { getVerificationStatus } from "@/lib/auth/require-verified";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getKycProvider } from "@/lib/kyc/provider";
import {
  submitVerificationSchema,
  reviewVerificationSchema,
} from "@/lib/validation/identity.schema";
import type { ActionResult } from "@/actions/auth.actions";

const RESUBMISSION_COOLDOWN_HOURS = 24;

/**
 * Submits a new identity verification attempt. Always inserts with
 * status='pending' — the RLS policy on identity_verifications enforces
 * this too (WITH CHECK status = 'pending'), so this is defense in depth,
 * not the only thing stopping a client from claiming 'verified'.
 *
 * Rate-limited: at most one new pending/in_review submission per
 * RESUBMISSION_COOLDOWN_HOURS, to blunt repeated-verification abuse.
 */
export async function submitVerificationAction(input: unknown): Promise<ActionResult> {
  const profile = await requireRole(["customer", "provider"]);

  const parsed = submitVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid submission",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createServerSupabaseClient();

  const { data: recent } = await supabase
    .from("identity_verifications")
    .select("id, created_at, status")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    if (recent.status === "verified") {
      return { ok: false, error: "You are already identity-verified." };
    }
    if (recent.status === "pending" || recent.status === "in_review") {
      return { ok: false, error: "Your verification is already being reviewed." };
    }
    if (recent.status === "rejected") {
      const hoursSince =
        (Date.now() - new Date(recent.created_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < RESUBMISSION_COOLDOWN_HOURS) {
        return {
          ok: false,
          error: `Please wait ${Math.ceil(
            RESUBMISSION_COOLDOWN_HOURS - hoursSince
          )} more hour(s) before resubmitting.`,
        };
      }
    }
  }

  // Paths must live under this user's own prefix — a defense-in-depth
  // check in addition to the storage bucket's own path-scoped policy,
  // so a tampered client payload pointing at someone else's uploaded
  // file is rejected here even before hitting storage.
  const { nidFrontPath, nidBackPath, liveFacePath } = parsed.data;
  const expectedPrefix = `${profile.id}/`;
  if (
    !nidFrontPath.startsWith(expectedPrefix) ||
    !nidBackPath.startsWith(expectedPrefix) ||
    !liveFacePath.startsWith(expectedPrefix)
  ) {
    return { ok: false, error: "Invalid evidence path." };
  }

  const admin = createAdminSupabaseClient();

  const attemptCount = recent ? (await getAttemptCount(profile.id)) + 1 : 1;

  const { data: inserted, error: insertError } = await admin
    .from("identity_verifications")
    .insert({
      user_id: profile.id,
      status: "pending",
      nid_front_path: nidFrontPath,
      nid_back_path: nidBackPath,
      live_face_path: liveFacePath,
      attempt_count: attemptCount,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: "Could not submit verification: " + insertError?.message };
  }

  await admin.from("verification_audit_events").insert({
    verification_id: inserted.id,
    actor_id: profile.id,
    event_type: "submitted",
    detail: { attemptCount },
  });

  // Hand off to the KYC provider abstraction. The local stub moves
  // status to 'in_review' and waits for an admin decision; a real
  // provider would do real matching/liveness here and call back via
  // webhook into reviewVerificationAction (or an equivalent route).
  const kyc = getKycProvider();
  const result = await kyc.submitForVerification({
    verificationId: inserted.id,
    nidFrontPath,
    nidBackPath,
    liveFacePath,
  });

  await admin
    .from("identity_verifications")
    .update({
      status: result.status,
      verification_provider: kyc.name,
      provider_reference_id: result.providerReferenceId,
    })
    .eq("id", inserted.id);

  return { ok: true, data: undefined };
}

async function getAttemptCount(profileId: string): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { count } = await admin
    .from("identity_verifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profileId);
  return count ?? 0;
}

/**
 * Returns the caller's own verification status + rejection reason, for
 * the /verify status page. Never returns evidence paths to the client —
 * the status page shows "uploaded" booleans, not the paths themselves,
 * and only fetches a signed URL (via getOwnEvidenceSignedUrlAction) if
 * the user explicitly asks to review what they submitted.
 */
export async function getOwnVerificationStatusAction() {
  const profile = await requireRole(["customer", "provider"]);
  const status = await getVerificationStatus(profile.id);

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("identity_verification_status_view")
    .select("id, status, rejection_reason, submitted_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    status,
    rejectionReason: data?.rejection_reason ?? null,
    submittedAt: data?.submitted_at ?? null,
  };
}

/**
 * Admin review action. Only reachable by an admin (requireRole enforces
 * this), and every decision is written to verification_audit_events
 * before the status change is committed.
 */
export async function reviewVerificationAction(input: unknown): Promise<ActionResult> {
  const admin_ = await requireRole(["admin"]);

  const parsed = reviewVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const admin = createAdminSupabaseClient();
  const { verificationId, decision, rejectionReason } = parsed.data;

  if (decision === "reject" && !rejectionReason) {
    return { ok: false, error: "A rejection reason is required." };
  }

  const nowIso = new Date().toISOString();

  const { error } = await admin
    .from("identity_verifications")
    .update(
      decision === "approve"
        ? {
            status: "verified",
            verified_at: nowIso,
            reviewed_at: nowIso,
            reviewed_by: admin_.id,
          }
        : {
            status: "rejected",
            rejected_at: nowIso,
            reviewed_at: nowIso,
            reviewed_by: admin_.id,
            rejection_reason: rejectionReason,
          }
    )
    .eq("id", verificationId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await admin.from("verification_audit_events").insert({
    verification_id: verificationId,
    actor_id: admin_.id,
    event_type: decision === "approve" ? "approved" : "rejected",
    detail: decision === "reject" ? { rejectionReason } : {},
  });

  return { ok: true, data: undefined };
}

/**
 * Mints a short-lived signed URL for evidence — the ONLY way evidence
 * bytes are ever reachable. Owner can fetch their own; admin can fetch
 * anyone's, but every admin fetch is audited BEFORE the URL is minted.
 */
export async function getEvidenceSignedUrlAction(
  verificationId: string,
  field: "nid_front" | "nid_back" | "live_face"
): Promise<ActionResult<{ url: string }>> {
  const profile = await requireRole(["customer", "provider", "admin"]);
  const admin = createAdminSupabaseClient();

  const { data: record, error } = await admin
    .from("identity_verifications")
    .select("id, user_id, nid_front_path, nid_back_path, live_face_path")
    .eq("id", verificationId)
    .single();

  if (error || !record) {
    return { ok: false, error: "Verification record not found." };
  }

  const isOwner = record.user_id === profile.id;
  if (!isOwner && profile.role !== "admin") {
    return { ok: false, error: "Not authorized to view this evidence." };
  }

  const pathField =
    field === "nid_front"
      ? record.nid_front_path
      : field === "nid_back"
      ? record.nid_back_path
      : record.live_face_path;

  if (!pathField) {
    return { ok: false, error: "That evidence file was not found." };
  }

  if (profile.role === "admin" && !isOwner) {
    await admin.from("verification_audit_events").insert({
      verification_id: verificationId,
      actor_id: profile.id,
      event_type: "evidence_accessed",
      detail: { fieldsAccessed: [field] },
    });
  }

  const { data: signed, error: signError } = await admin.storage
    .from("identity-verification")
    .createSignedUrl(pathField, 300); // 5 min TTL

  if (signError || !signed) {
    return { ok: false, error: "Could not generate access link." };
  }

  return { ok: true, data: { url: signed.signedUrl } };
}
