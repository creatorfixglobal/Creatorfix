"use client";

import { useRef, useState } from "react";

type LiveFaceCaptureProps = {
  onCaptured: (blob: Blob) => void | Promise<void>;
  disabled?: boolean;
};

export function LiveFaceCapture({
  onCaptured,
  disabled = false,
}: LiveFaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);

  async function startCamera() {
    setError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Your browser does not support camera access.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraOpen(true);
    } catch (err) {
      console.error("Camera access error:", err);
      setError(
        "Unable to access your camera. Please allow camera permission and try again."
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setCapturing(false);
  }

  async function captureFace() {
    if (!videoRef.current) {
      setError("Camera is not ready.");
      return;
    }

    setError(null);
    setCapturing(true);

    try {
      const video = videoRef.current;

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        setError("Camera image is not ready yet. Please try again.");
        return;
      }

      const canvas = document.createElement("canvas");

      const maxSize = 720;
      const scale = Math.min(
        1,
        maxSize / Math.max(video.videoWidth, video.videoHeight)
      );

      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const context = canvas.getContext("2d");

      if (!context) {
        setError("Unable to capture camera image.");
        return;
      }

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.9);
      });

      if (!blob) {
        setError("Failed to create face capture.");
        return;
      }

      await onCaptured(blob);

      setCaptured(true);
      stopCamera();
    } catch (err) {
      console.error("Face capture error:", err);
      setError("Face capture failed. Please try again.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-ink-950">
          Live face capture
        </p>

        <p className="mt-1 text-xs text-ink-700">
          Use your front camera and capture a clear image of your face.
        </p>
      </div>

      {cameraOpen && (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-square w-full object-cover"
          />
        </div>
      )}

      {!cameraOpen && !captured && (
        <button
          type="button"
          onClick={startCamera}
          disabled={disabled}
          className="cf-button-primary w-full"
        >
          Open camera
        </button>
      )}

      {cameraOpen && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={captureFace}
            disabled={disabled || capturing}
            className="cf-button-primary flex-1"
          >
            {capturing ? "Capturing..." : "Capture face"}
          </button>

          <button
            type="button"
            onClick={stopCamera}
            disabled={capturing}
            className="cf-button-secondary flex-1"
          >
            Cancel
          </button>
        </div>
      )}

      {captured && !cameraOpen && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <p className="text-sm font-medium text-green-600">
            Live face captured successfully.
          </p>

          <button
            type="button"
            onClick={() => {
              setCaptured(false);
              setError(null);
              void startCamera();
            }}
            disabled={disabled}
            className="mt-2 text-xs font-medium underline"
          >
            Capture again
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-alert-500">
          {error}
        </p>
      )}
    </div>
  );
        }
