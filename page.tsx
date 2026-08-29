import { requireRole } from "@/lib/auth/require-role";
import { getOwnVerificationStatusAction } from "@/actions/identity.actions";
import { VerifyClient } from "./verify-client";

export default async function VerifyPage() {
  const profile = await requireRole(["customer", "provider"]);
  const status = await getOwnVerificationStatusAction();

  return (
    <VerifyClient
      displayName={profile.displayName}
      status={status.status}
      rejectionReason={status.rejectionReason}
    />
  );
}
