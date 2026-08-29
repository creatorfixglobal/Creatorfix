"use server";

import { requireRole } from "@/lib/auth/require-role";
import {
  getVerificationStatus,
  type VerificationStatus,
} from "@/lib/auth/require-verified";

export async function getOwnVerificationStatusAction(): Promise<{
  status: VerificationStatus;
  rejectionReason: string | null;
}> {
  const profile = await requireRole(["customer", "provider", "admin"]);

  const verification = await getVerificationStatus(profile.id);

  return {
    status: verification.status,
    rejectionReason: verification.rejectionReason,
  };
}
