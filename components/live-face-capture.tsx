"use client";

import { useRef, useState } from "react";

type Props = {
  onCaptured: (blob: Blob) => void;
  disabled?: boolean;
};

export function LiveFaceCapture({ onCaptured, disabled = false }: Props) {
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setCapturing(false);
  }

  function capturePhoto() {
    const video = videoRef.current;

    if (!video || video.readyState < 2) {
      setError("Camera is not ready yet. Please try again.");
      return;
    }

    setError(null);
    setCapturing(true);

    const canvas = document.createElement("canvas");

    const size = Math.min(video.videoWidth, video.videoHeight);

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");

    if (!context) {
      setError("Unable to capture image.");
      setCapturing(false);
      return;
    }

    const sourceX = (video.videoWidth - size) / 2;
    const sourceY = (video.videoHeight - size) / 2;

    context.drawImage(
      video,
      sourceX,
      sourceY,
      size,
      size,
      0,
      0,
      size,
      size
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Unable to create captured image.");
          setCapturing(false);
          return;
        }

        setCaptured(true);
        setCapturing(false);

        onCaptured(blob);

        stopCamera();
      },
      "image/jpeg",
      0.9
    );
  }

  function retake() {
    setCaptured(false);
    setError(null);
    startCamera();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-ink-950">
          Live face capture
        </h3>

        <p className="mt-1 text-xs text-ink-700/70">
          Take a live photo using your front camera.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-alert-500/30 bg-alert-500/5 p-3">
          <p className="text-sm text-alert-500">{error}</p>
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
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="aspect-square h-auto w-full object-cover"
            />
          </div>

          <button
            type="button"
            onClick={capturePhoto}
            disabled={capturing || disabled}
            className="cf-button-primary w-full"
          >
            {capturing ? "Capturing..." : "Capture live photo"}
          </button>

          <button
            type="button"
            onClick={stopCamera}
            disabled={capturing}
            className="w-full rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700"
          >
            Cancel
          </button>
        </div>
      )}

      {captured && !cameraOpen && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <p className="text-sm font-medium text-green-700">
              Live face captured successfully.
            </p>
          </div>

          <button
            type="button"
            onClick={retake}
            disabled={disabled}
            className="w-full rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700"
          >
            Retake photo
          </button>
        </div>
      )}
    </div>
  );
}
