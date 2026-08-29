import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthenticatedProfile } from "@/lib/auth/require-role";

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "in_review"
  | "verified"
  | "rejected";

/**
 * Returns the caller's latest identity verification status by querying
 * the same underlying data as the Postgres `current_verification_status()`
 * function — via `identity_verification_status_view`, which never exposes
 * evidence paths. This is the ONLY place application code should check
 * verification status; every gated Server Action calls requireVerified()
 * below rather than re-implementing this query.
 */
export async function getVerificationStatus(
  profileId: string
): Promise<VerificationStatus> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("identity_verification_status_view")
    .select("status")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return "unverified";
  return data.status as VerificationStatus;
}

/**
 * Redirect-based gate for PAGES: if the caller isn't identity-verified,
 * send them to /verify instead of rendering the protected page at all.
 * Use this in Server Components for full-page gates (e.g. /dashboard).
 */
export async function requireVerifiedPage(
  profile: AuthenticatedProfile
): Promise<VerificationStatus> {
  const status = await getVerificationStatus(profile.id);
  if (status !== "verified") {
    redirect("/verify");
  }
  return status;
}

/**
 * Throwing gate for SERVER ACTIONS (deposits, order creation, service
 * publishing, order acceptance, withdrawals). Actions can't redirect the
 * same way pages can from inside a mutation — they throw, and the caller
 * (a form handler) surfaces the error. This is checked server-side on
 * every call, never inferred from client state, so a direct call to the
 * action (bypassing the UI) is rejected identically.
 */
export async function requireVerified(profile: AuthenticatedProfile): Promise<void> {
  const status = await getVerificationStatus(profile.id);
  if (status !== "verified") {
    throw new Error(
      `IDENTITY_NOT_VERIFIED: current status is '${status}'. Complete identity verification at /verify before using this feature.`
    );
  }
}
