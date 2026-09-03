"use client";

import { useEffect, useRef, useState } from "react";
import { submitVerificationAction } from "@/actions/identity.actions";

type Slot = "nid-front" | "nid-back" | "live-face";

async function upload(slot: Slot, file: File) {
  const form = new FormData();
  form.append("slot", slot);
  form.append("file", file);
  const response = await fetch("/api/identity/upload", { method: "POST", body: form });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok || !payload?.ok) {
    if (payload?.code === "AUTH_REQUIRED") {
      throw new Error("Your login session has expired. Please log in again, then return to identity verification.");
    }
    throw new Error(payload?.error || "The upload service returned an unexpected response.");
  }

  return payload.path as string;
}

export default function VerifyPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function startCamera() {
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch {
      setMessage("Camera access is required for live face verification.");
    }
  }

  function captureFace() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "live-face.jpg", { type: "image/jpeg" });
      setFiles((current) => ({ ...current, "live-face": file }));
      setMessage("Live face photo captured.");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraOn(false);
    }, "image/jpeg", 0.92);
  }

  async function submit() {
    const front = files["nid-front"];
    const back = files["nid-back"];
    const face = files["live-face"];
    if (!front || !back || !face) {
      setMessage("Please provide NID front, NID back, and a live face capture.");
      return;
    }

    setBusy(true);
    setMessage("Uploading verification files securely...");
    try {
      const [nidFrontPath, nidBackPath, liveFacePath] = await Promise.all([
        upload("nid-front", front),
        upload("nid-back", back),
        upload("live-face", face),
      ]);
      const result = await submitVerificationAction({ nidFrontPath, nidBackPath, liveFacePath });
      setMessage(result.ok ? "Verification submitted successfully. An admin will review your identity." : result.error);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="verify-page">
      <style>{`
        .verify-page{min-height:100vh;padding:36px 20px;background:radial-gradient(circle at 90% 0,#183a68 0,transparent 32%),#07111f;color:#f8fbff}.verify-shell{max-width:860px;margin:auto}.verify-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.verify-card{background:#0d1929;border:1px solid #29435f;border-radius:18px;padding:22px}.verify-card input{width:100%;margin-top:12px}.verify-btn{border:0;border-radius:12px;padding:14px 18px;background:linear-gradient(135deg,#4b8cff,#7b5cff);color:#fff;font-weight:800;cursor:pointer}.verify-btn:disabled{opacity:.55}.video{width:100%;border-radius:14px;background:#05080d;min-height:220px;object-fit:cover}.status{margin-top:18px;padding:14px;border-radius:12px;background:#101f33;color:#b9cdf0}@media(max-width:700px){.verify-grid{grid-template-columns:1fr}}
      `}</style>
      <div className="verify-shell">
        <a href="/dashboard">← Dashboard</a>
        <h1 style={{fontSize:"clamp(38px,7vw,64px)",marginBottom:8}}>Identity Verification</h1>
        <p style={{color:"#9fb1c7",lineHeight:1.7,maxWidth:700}}>To protect CreatorFix users and prevent fraud, identity documents are stored privately and reviewed by an administrator. Your NID and face image are never public.</p>
        <div className="verify-grid" style={{marginTop:28}}>
          <section className="verify-card">
            <h2>NID Front</h2>
            <p style={{color:"#9fb1c7"}}>Clear photo of the front side of your National ID card.</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && setFiles((current) => ({...current,"nid-front":e.target.files![0]}))} />
            <p>{files["nid-front"] ? "✓ Ready" : "Choose image"}</p>
          </section>
          <section className="verify-card">
            <h2>NID Back</h2>
            <p style={{color:"#9fb1c7"}}>Clear photo of the back side of your National ID card.</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && setFiles((current) => ({...current,"nid-back":e.target.files![0]}))} />
            <p>{files["nid-back"] ? "✓ Ready" : "Choose image"}</p>
          </section>
          <section className="verify-card" style={{gridColumn:"1 / -1"}}>
            <h2>Live Face Verification</h2>
            <p style={{color:"#9fb1c7"}}>Use your device camera and capture a fresh live photo. This step does not accept gallery uploads.</p>
            <video ref={videoRef} autoPlay playsInline className="video" style={{display:cameraOn ? "block" : "none"}} />
            {!cameraOn && !files["live-face"] && <button className="verify-btn" onClick={startCamera}>Open Camera</button>}
            {cameraOn && <button className="verify-btn" onClick={captureFace}>Capture Live Face</button>}
            {files["live-face"] && <p>✓ Live face capture ready</p>}
          </section>
        </div>
        <div style={{marginTop:24}}>
          <button className="verify-btn" disabled={busy} onClick={submit}>{busy ? "Submitting securely..." : "Submit for Verification"}</button>
          {message && <div className="status" aria-live="polite">{message}</div>}
        </div>
      </div>
    </main>
  );
}
