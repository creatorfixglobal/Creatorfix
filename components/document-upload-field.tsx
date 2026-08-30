"use client";

import { ChangeEvent, useState } from "react";

type DocumentUploadFieldProps = {
  label: string;
  slot: "nid-front" | "nid-back";
  onUploaded: (path: string) => void;
  disabled?: boolean;
};

export function DocumentUploadField({
  label,
  slot,
  onUploaded,
  disabled = false,
}: DocumentUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setUploaded(false);

    // Basic client-side validation.
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      event.target.value = "";
      return;
    }

    // Keep uploads reasonably small.
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10 MB.");
      event.target.value = "";
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("slot", slot);

    try {
      const response = await fetch("/api/identity/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.ok || typeof result.path !== "string") {
        setError(result.error ?? "Upload failed. Please try again.");
        return;
      }

      onUploaded(result.path);
      setUploaded(true);
    } catch {
      setError("Upload failed. Please check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ink-950">
        {label}
      </label>

      <div className="cf-card p-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={disabled || uploading}
          className="block w-full text-sm text-ink-700 file:mr-4 file:rounded-lg file:border-0 file:bg-ink-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white disabled:cursor-not-allowed disabled:opacity-50"
        />

        {uploading && (
          <p className="mt-3 text-sm text-ink-700">
            Uploading...
          </p>
        )}

        {uploaded && !uploading && (
          <p className="mt-3 text-sm font-medium text-green-600">
            Upload successful.
          </p>
        )}

        {error && (
          <p className="mt-3 text-sm text-alert-500">
            {error}
          </p>
        )}
      </div>
    </div>
  );
            }
