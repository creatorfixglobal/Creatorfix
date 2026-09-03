"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const idSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(3).max(1000);

export async function approveIdentityVerificationAction(verificationId: string) {
  const parsed = idSchema.safeParse(verificationId);
  if (!parsed.success) return { ok: false, error: "Invalid verification ID." };

  const adminProfile = await requireRole(["admin"]);
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();

  const { data: verification, error: readError } = await admin
    .from("identity_verifications")
    .select("id,user_id,status")
    .eq("id", parsed.data)
    .single();

  if (readError || !verification) return { ok: false, error: "Verification record not found." };
  if (!["pending", "in_review"].includes(verification.status)) return { ok: false, error: "This verification is no longer awaiting review." };

  const { error } = await admin
    .from("identity_verifications")
    .update({ status: "verified", reviewed_at: now, reviewed_by: adminProfile.id, verified_at: now, rejection_reason: null })
    .eq("id", parsed.data);

  if (error) return { ok: false, error: error.message };

  await admin.from("verification_audit_events").insert({
    verification_id: parsed.data,
    actor_id: adminProfile.id,
    event_type: "approved",
    detail: { source: "admin_panel" },
  });

  return { ok: true };
}

export async function rejectIdentityVerificationAction(verificationId: string, reason: string) {
  const id = idSchema.safeParse(verificationId);
  const reasonResult = reasonSchema.safeParse(reason);
  if (!id.success || !reasonResult.success) return { ok: false, error: "A valid rejection reason is required." };

  const adminProfile = await requireRole(["admin"]);
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("identity_verifications")
    .update({
      status: "rejected",
      reviewed_at: now,
      reviewed_by: adminProfile.id,
      rejected_at: now,
      rejection_reason: reasonResult.data,
    })
    .eq("id", id.data)
    .in("status", ["pending", "in_review"]);

  if (error) return { ok: false, error: error.message };

  await admin.from("verification_audit_events").insert({
    verification_id: id.data,
    actor_id: adminProfile.id,
    event_type: "rejected",
    detail: { source: "admin_panel", reason: reasonResult.data },
  });

  return { ok: true };
}
