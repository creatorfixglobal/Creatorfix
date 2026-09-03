import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthenticatedProfile } from "./require-role";

export type VerificationStatus = "unverified" | "pending" | "in_review" | "verified" | "rejected";

export interface VerificationStatusResult {
  status: VerificationStatus;
  rejectionReason: string | null;
}

export async function getVerificationStatus(profileId: string): Promise<VerificationStatusResult> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("identity_verification_status_view")
    .select("status, rejection_reason")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    status: (data?.status as VerificationStatus | undefined) ?? "unverified",
    rejectionReason: data?.rejection_reason ?? null,
  };
}

export async function requireVerified(profile: AuthenticatedProfile): Promise<void> {
  const verification = await getVerificationStatus(profile.id);
  if (verification.status !== "verified") redirect("/verify");
}
