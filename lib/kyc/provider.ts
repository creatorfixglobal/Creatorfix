import "server-only";

/**
 * The integration point for a real external KYC/identity-verification
 * vendor (Veriff, Onfido, Persona, etc.). Phase 0/1 ships only
 * LocalManualReviewProvider, which does NOT perform real identity
 * matching or liveness detection — it moves a submission to 'in_review'
 * and waits for a human admin decision. It never returns 'verified'
 * itself; only reviewVerification() in identity.actions.ts can do that,
 * and only after an admin decision (or, once a real provider is wired
 * in, that provider's own webhook-driven match result).
 *
 * Swapping in a real provider means implementing this interface and
 * changing one line in identity.actions.ts — no schema or RLS change
 * required, since `verification_provider`, `provider_reference_id`, and
 * `provider_match_result` already exist on `identity_verifications` for
 * exactly this purpose.
 */
export interface KycProvider {
  name: string;
  submitForVerification(input: {
    verificationId: string;
    nidFrontPath: string;
    nidBackPath: string;
    liveFacePath: string;
  }): Promise<{ providerReferenceId: string; status: "in_review" }>;
}

export class LocalManualReviewProvider implements KycProvider {
  name = "local-manual-review";

  async submitForVerification(input: {
    verificationId: string;
    nidFrontPath: string;
    nidBackPath: string;
    liveFacePath: string;
  }): Promise<{ providerReferenceId: string; status: "in_review" }> {
    // No real matching/liveness happens here. This exists so the
    // submission flow, the DB shape, and the admin review queue all
    // behave identically to how they will once a real provider is
    // wired in — the only thing that changes later is which class this
    // function is implemented by.
    return {
      providerReferenceId: `local-${input.verificationId}`,
      status: "in_review",
    };
  }
}

export function getKycProvider(): KycProvider {
  return new LocalManualReviewProvider();
}