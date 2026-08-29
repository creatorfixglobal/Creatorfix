"use server";

import { requireRole } from "@/lib/auth/require-role";
import { getVerificationStatus } from "@/lib/auth/require-verified";

/**
 * Retrieves the current user's own identity verification status.
 *
 * This action:
 * - Requires an authenticated user with an allowed role.
 * - Gets the profile from the server-side session.
 * - Reads verification status using the server-side verification helper.
 * - Never accepts a profile/user ID from the client.
 */
export async function getOwnVerificationStatusAction(): Promise<{
  status: "unverified" | "pending" | "in_review" | "verified" | "rejected";
}> {
  const profile = await requireRole(["customer", "provider", "admin"]);

  const status = await getVerificationStatus(profile.id);

  return {
    status,
  };
}
