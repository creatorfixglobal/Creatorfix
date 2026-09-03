import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthenticatedProfile } from "./require-role";

export type VerificationStatus = "unverified" | "pending" | "in_review" | "verified" | "rejected";

export interface VerificationStatusResult {
  status: VerificationStatus;
  rejectionReason: string | null;
}

/**
 * Reads the owner's verification row directly. The previous view query was
 * returning 403 in production because the view security mode and RLS did not
 * preserve the caller's authenticated policy context.
 */
export async function getVerificationStatus(profileId: string): Promise<VerificationStatusResult> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("identity_verifications")
    .select("status, rejection_reason")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { status: "unverified", rejectionReason: null };
  }

  return {
    status: (data?.status as VerificationStatus | undefined) ?? "unverified",
    rejectionReason: data?.rejection_reason ?? null,
  };
}

export async function requireVerified(profile: AuthenticatedProfile): Promise<void> {
  const verification = await getVerificationStatus(profile.id);
  if (verification.status !== "verified") redirect("/verify");
}