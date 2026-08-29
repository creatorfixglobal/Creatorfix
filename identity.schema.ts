import { z } from "zod";

/**
 * Validates the metadata around a verification submission. The actual
 * file bytes are validated separately, server-side, by real MIME
 * sniffing in the storage upload route handler — never trusted from
 * the browser-supplied File.type alone. This schema only covers the
 * storage paths returned by that upload step.
 */
export const submitVerificationSchema = z.object({
  nidFrontPath: z.string().min(1, "NID front upload is required"),
  nidBackPath: z.string().min(1, "NID back upload is required"),
  liveFacePath: z.string().min(1, "Live face capture is required"),
});
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

export const reviewVerificationSchema = z.object({
  verificationId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  rejectionReason: z.string().max(500).optional(),
});
export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;

export const ALLOWED_VERIFICATION_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_VERIFICATION_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
