import { z } from "zod";

export const MAX_VERIFICATION_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

export const submitVerificationSchema = z.object({
  nidFrontPath: z.string().min(1, "NID front path is required"),
  nidBackPath: z.string().min(1, "NID back path is required"),
  liveFacePath: z.string().min(1, "Live face path is required"),
});

export const reviewVerificationSchema = z.object({
  verificationId: z.string().uuid("Invalid verification ID"),
  decision: z.enum(["approve", "reject"], {
    errorMap: () => ({ message: "Decision must be 'approve' or 'reject'" }),
  }),
  rejectionReason: z.string().optional(),
});

export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;
export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;