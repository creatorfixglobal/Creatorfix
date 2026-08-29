"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onCaptured: (blob: Blob) => void;
  disabled?: boolean;
};

/**
 * Captures a live selfie via the browser's camera only. There is
 * deliberately no <input type="file"> anywhere in this component — a
 * pre-existing photo cannot be substituted for a live capture through
 * this UI. (This is an integrity control against casual substitution,
 * not a cryptographic liveness guarantee; real liveness detection is
 * the external KYC provider's responsibility once one is integrated.)
 */
export function LiveFaceCapture({ onCaptured, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<
    "idle" | "requesting" | "live" | "captured" | "denied" | "error"
  >("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  async function startCamera() {
    setCameraState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("live");
    } catch {
      setCameraState("denied");
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPreviewUrl(URL.createObjectURL(blob));
        onCaptured(blob);
        setCameraState("captured");
        stopStream();
      },
      "image/jpeg",
      0.9
    );
  }

  function retake() {
    setPreviewUrl(null);
    setCameraState("idle");
  }

  return (
    <div className="cf-card p-4">
      <p className="cf-label">Live face capture</p>

      {cameraState === "idle" && (
        <button
          type="button"
          onClick={startCamera}
          disabled={disabled}
          className="cf-button-primary"
        >
          Enable camera
        </button>
      )}

      {cameraState === "requesting" && (
        <p className="text-sm text-ink-700">Requesting camera access...</p>
      )}

      {cameraState === "denied" && (
        <p className="cf-error">
          Camera access was denied. Live face capture requires camera
          permission — please allow access and try again.
        </p>
      )}

      {cameraState === "live" && (
        <div className="space-y-3">
          <video
            ref={videoRef}
            className="w-full max-w-sm rounded-lg bg-black"
            muted
            playsInline
          />
          <button type="button" onClick={capture} className="cf-button-primary">
            Capture photo
          </button>
        </div>
      )}

      {cameraState === "captured" && previewUrl && (
        <div className="space-y-3">
          <img
            src={previewUrl}
            alt="Captured selfie preview"
            className="w-full max-w-sm rounded-lg"
          />
          <button
            type="button"
            onClick={retake}
            className="text-sm text-signal-600 underline"
          >
            Retake
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
