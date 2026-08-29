import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthenticatedProfile } from "./require-role";

/**
 * Retrieves the current verification status for a profile.
 * Used inside both requireVerified() (gate check) and getOwnVerificationStatusAction (status page).
 */
export async function getVerificationStatus(
  profileId: string
): Promise<"unverified" | "pending" | "in_review" | "verified" | "rejected"> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("identity_verification_status_view")
    .select("status")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.status ?? "unverified";
}

/**
 * Server-side identity verification gate: verifies the current session's
 * user has reached `identity_verifications.status = 'verified'`. If not,
 * redirects to /verify.
 *
 * This is called at the top of every Server Action that touches:
 * - Customer deposits (requestDeposit)
 * - Customer order creation (createOrder)
 * - Provider service publishing (createService)
 * - Provider order acceptance (acceptOrder)
 * - Provider withdrawal (requestWithdrawal)
 *
 * Verification status is re-checked from the database on every call, never
 * cached or inferred from a client-side flag.
 */
export async function requireVerified(profile: AuthenticatedProfile): Promise<void> {
  const status = await getVerificationStatus(profile.id);
  if (status !== "verified") {
    redirect("/verify");
  }
}