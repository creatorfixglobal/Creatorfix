"use server";

import { requireRole } from "@/lib/auth/require-role";
import { requireVerified } from "@/lib/auth/require-verified";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { z } from "zod";
import type { ActionResult } from "@/actions/auth.actions";

const applyProviderSchema = z.object({
  bio: z.string().trim().min(20, "Tell us a bit more about your experience").max(2000),
  skills: z.array(z.string().trim().min(1)).min(1, "List at least one skill").max(20),
});

/**
 * A customer applies to become a provider. Requires identity
 * verification FIRST — requireVerified() throws server-side if not,
 * regardless of what the client-side UI shows. This only ever creates
 * a `provider_applications` row; it never touches `profiles.role`
 * directly (that column isn't even client-writable — see
 * db/migrations/0005_lock_role_columns.sql).
 */
export async function applyToBecomeProviderAction(input: unknown): Promise<ActionResult> {
  const profile = await requireRole(["customer"]);
  await requireVerified(profile);

  const parsed = applyProviderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("provider_applications")
    .select("id, status")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "submitted") {
    return { ok: false, error: "You already have a pending application." };
  }
  if (existing?.status === "approved") {
    return { ok: false, error: "You are already an approved provider." };
  }

  const { error } = await supabase.from("provider_applications").insert({
    user_id: profile.id,
    bio: parsed.data.bio,
    skills: parsed.data.skills,
    status: "submitted",
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}

/**
 * Admin approves a provider application. Calls the SECURITY DEFINER
 * `approve_provider_application()` function, which itself re-checks
 * identity verification server-side (Postgres-side) before flipping
 * `profiles.role` — so this can't succeed even via a direct RPC call
 * for an unverified applicant, independent of this action's own
 * requireRole(['admin']) check.
 */
export async function approveProviderApplicationAction(
  applicationId: string
): Promise<ActionResult> {
  const admin_ = await requireRole(["admin"]);
  const admin = createAdminSupabaseClient();

  const { error } = await admin.rpc("approve_provider_application", {
    p_application_id: applicationId,
    p_admin_id: admin_.id,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}

export async function rejectProviderApplicationAction(
  applicationId: string,
  reason: string
): Promise<ActionResult> {
  const admin_ = await requireRole(["admin"]);
  const admin = createAdminSupabaseClient();

  const { error } = await admin.rpc("reject_provider_application", {
    p_application_id: applicationId,
    p_admin_id: admin_.id,
    p_reason: reason,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}
