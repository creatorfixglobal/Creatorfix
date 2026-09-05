"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitVerificationAction } from "@/actions/identity.actions";
import { DocumentUploadField } from "@/components/document-upload-field";
import { LiveFaceCapture } from "@/components/live-face-capture";

type Status = "unverified" | "pending" | "in_review" | "verified" | "rejected";

type Props = {
  displayName: string;
  status: Status;
  rejectionReason: string | null;
};

export function VerifyClient({ displayName, status, rejectionReason }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nidFrontPath, setNidFrontPath] = useState<string | null>(null);
  const [nidBackPath, setNidBackPath] = useState<string | null>(null);
  const [liveFaceBlob, setLiveFaceBlob] = useState<Blob | null>(null);
  const [liveFacePath, setLiveFacePath] = useState<string | null>(null);
  const [uploadingFace, setUploadingFace] = useState(false);

  if (status === "verified") {
    return (
      <Shell title="Identity verified">
        <p className="text-sm text-ink-700">
          Hi {displayName}, your identity is verified. You have full access to
          CreatorFix.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="cf-button-primary mt-4"
        >
          Go to dashboard
        </button>
      </Shell>
    );
  }

  if (status === "pending" || status === "in_review") {
    return (
      <Shell title="Verification in progress">
        <p className="text-sm text-ink-700">
          Thanks, {displayName} — we&apos;ve received your documents and live
          capture. This is being reviewed now. You&apos;ll get access to the
          rest of CreatorFix once it&apos;s approved.
        </p>
      </Shell>
    );
  }

  async function handleFaceCaptured(blob: Blob) {
    setLiveFaceBlob(blob);
    setUploadingFace(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", blob, "live-face.jpg");
    formData.append("slot", "live-face");

    try {
      const res = await fetch("/api/identity/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Face capture upload failed");
        setUploadingFace(false);
        return;
      }
      setLiveFacePath(json.path);
    } catch {
      setError("Face capture upload failed. Check your connection.");
    } finally {
      setUploadingFace(false);
    }
  }

  function handleSubmit() {
    setError(null);

    if (!nidFrontPath || !nidBackPath || !liveFacePath) {
      setError("Please complete NID front, NID back, and live face capture first.");
      return;
    }

    startTransition(async () => {
      const result = await submitVerificationAction({
        nidFrontPath,
        nidBackPath,
        liveFacePath,
      });
      if (!result.ok) {
        setError(result.error || "Verification submission failed.");
        return;
      }
      router.refresh();
    });
  }

  const canSubmit = Boolean(nidFrontPath && nidBackPath && liveFacePath) && !uploadingFace;

  return (
    <Shell title="Verify your identity">
      {status === "rejected" && (
        <div className="mb-6 rounded-lg border border-alert-500/30 bg-alert-500/5 p-4">
          <p className="text-sm font-medium text-alert-500">
            Your previous submission was rejected
          </p>
          {rejectionReason && (
            <p className="mt-1 text-sm text-ink-700">{rejectionReason}</p>
          )}
          <p className="mt-1 text-xs text-ink-700/60">
            You can resubmit below.
          </p>
        </div>
      )}

      <p className="mb-6 text-sm text-ink-700">
        CreatorFix requires identity verification for every customer and
        provider before you can deposit funds, create orders, or offer
        services. Upload both sides of your NID and complete a live camera
        capture below.
      </p>

      <div className="space-y-6">
        <DocumentUploadField
          label="NID — front side"
          slot="nid-front"
          onUploaded={setNidFrontPath}
          disabled={isPending}
        />
        <DocumentUploadField
          label="NID — back side"
          slot="nid-back"
          onUploaded={setNidBackPath}
          disabled={isPending}
        />
        <LiveFaceCapture onCaptured={handleFaceCaptured} disabled={isPending} />

        {error && <p className="cf-error">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          className="cf-button-primary w-full"
        >
          {isPending ? "Submitting..." : "Submit for verification"}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <div className="cf-card p-8">
        <h1 className="mb-4 font-display text-xl font-semibold text-ink-950">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}
