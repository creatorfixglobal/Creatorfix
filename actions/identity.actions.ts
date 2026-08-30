"use server";

import { requireRole } from "@/lib/auth/require-role";
import {
  getVerificationStatus,
  type VerificationStatus,
} from "@/lib/auth/require-verified";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SubmitVerificationInput = {
  nidFrontPath: string;
  nidBackPath: string;
  liveFacePath: string;
};

type SubmitVerificationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

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

export async function submitVerificationAction(
  input: SubmitVerificationInput
): Promise<SubmitVerificationResult> {
  try {
    const profile = await requireRole(["customer", "provider", "admin"]);

    if (
      !input ||
      typeof input.nidFrontPath !== "string" ||
      typeof input.nidBackPath !== "string" ||
      typeof input.liveFacePath !== "string"
    ) {
      return {
        ok: false,
        error: "Invalid verification submission.",
      };
    }

    const nidFrontPath = input.nidFrontPath.trim();
    const nidBackPath = input.nidBackPath.trim();
    const liveFacePath = input.liveFacePath.trim();

    if (!nidFrontPath || !nidBackPath || !liveFacePath) {
      return {
        ok: false,
        error:
          "Please upload NID front, NID back, and complete the live face capture.",
      };
    }

    const isSafeStoragePath = (value: string) => {
      return (
        value.length <= 500 &&
        !value.startsWith("http://") &&
        !value.startsWith("https://") &&
        !value.includes("..")
      );
    };

    if (
      !isSafeStoragePath(nidFrontPath) ||
      !isSafeStoragePath(nidBackPath) ||
      !isSafeStoragePath(liveFacePath)
    ) {
      return {
        ok: false,
        error: "Invalid verification file path.",
      };
    }

    const supabase = createServerSupabaseClient();

    const { data: existingVerification, error: existingError } =
      await supabase
        .from("identity_verifications")
        .select("id, status")
        .eq("user_id", profile.id)
        .in("status", ["pending", "in_review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingError) {
      console.error(
        "Failed to check existing verification:",
        existingError
      );

      return {
        ok: false,
        error: "Unable to check your verification status. Please try again.",
      };
    }

    if (existingVerification) {
      return {
        ok: false,
        error: "You already have a verification submission under review.",
      };
    }

    const { count: attemptCount, error: countError } = await supabase
      .from("identity_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);

    if (countError) {
      console.error(
        "Failed to count verification attempts:",
        countError
      );

      return {
        ok: false,
        error: "Unable to prepare your verification submission.",
      };
    }

    const nextAttempt = (attemptCount ?? 0) + 1;

    const { error: insertError } = await supabase
      .from("identity_verifications")
      .insert({
        user_id: profile.id,
        status: "pending",
        nid_front_path: nidFrontPath,
        nid_back_path: nidBackPath,
        live_face_path: liveFacePath,
        attempt_count: nextAttempt,
        submitted_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(
        "Failed to submit identity verification:",
        insertError
      );

      return {
        ok: false,
        error: "Failed to submit verification. Please try again.",
      };
    }

    return {
      ok: true,
    };
  } catch (error) {
    console.error("submitVerificationAction error:", error);

    return {
      ok: false,
      error: "Something went wrong while submitting verification.",
    };
  }
}
