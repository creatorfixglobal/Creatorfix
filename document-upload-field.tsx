"use client";

import { useState } from "react";

type Props = {
  label: string;
  slot: "nid-front" | "nid-back";
  onUploaded: (path: string) => void;
  disabled?: boolean;
};

export function DocumentUploadField({ label, slot, onUploaded, disabled }: Props) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("slot", slot);

    try {
      const res = await fetch("/api/identity/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setStatus("error");
        setError(json.error ?? "Upload failed");
        return;
      }

      onUploaded(json.path);
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Upload failed. Check your connection and try again.");
    }
  }

  return (
    <div>
      <label className="cf-label">{label}</label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        disabled={disabled || status === "uploading"}
        className="cf-input"
      />
      {status === "uploading" && (
        <p className="mt-1 text-xs text-ink-700/60">Uploading...</p>
      )}
      {status === "done" && (
        <p className="mt-1 text-xs text-signal-600">Uploaded</p>
      )}
      {error && <p className="cf-error">{error}</p>}
    </div>
  );
}
