"use client";
import { useState } from "react";
import Link from "next/link";

const MAX_BYTES = 100 * 1024 * 1024;

export default function UploadShortVideo() {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload() {
    if (!file) return setMessage("Choose a video first.");
    if (!file.type.startsWith("video/")) return setMessage("Please choose a valid video file.");
    if (file.size > MAX_BYTES) return setMessage("Video is too large. Maximum upload size is 100 MB.");

    setBusy(true); setMessage("");
    try {
      const sign = await fetch("/api/cloudinary/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "video" })
      });
      const signed = await sign.json().catch(() => ({}));
      if (!sign.ok) throw new Error(signed.error || "Cloudinary upload is unavailable.");

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signed.apiKey);
      form.append("timestamp", String(signed.timestamp));
      form.append("signature", signed.signature);
      form.append("folder", signed.folder);

      const cloud = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/video/upload`, { method: "POST", body: form });
      const asset = await cloud.json().catch(() => ({}));
      if (!cloud.ok) throw new Error(asset.error?.message || "Video upload failed.");

      const save = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbackUrl: asset.secure_url,
          thumbnailUrl: asset.secure_url ? asset.secure_url.replace("/upload/", "/upload/so_0/") + ".jpg" : null,
          cloudinaryPublicId: asset.public_id,
          caption
        })
      });
      const result = await save.json().catch(() => ({}));
      if (!save.ok) throw new Error(result.error || "Could not publish the video.");

      window.location.assign("/videos");
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  return <main className="up">
    <style>{`.up{min-height:100vh;padding:32px 18px;background:radial-gradient(circle at 80% 0,#1b4278,transparent 40%),#070b16}.box{max-width:680px;margin:30px auto;padding:30px;border:1px solid #294563;border-radius:28px;background:#0c1727}.muted{color:#9eafc6;line-height:1.65}.field{display:grid;gap:8px;margin:18px 0}.field input,.field textarea{background:#08111f;color:#fff;border:1px solid #29415e;border-radius:14px;padding:14px}.note{font-size:13px;color:#7f93b1}`}</style>
    <Link href="/videos">← Back to Shorts</Link>
    <section className="box">
      <span className="muted">CREATORFIX SHORTS</span>
      <h1>Upload a short video</h1>
      <p className="muted">Your public creator video is uploaded directly to Cloudinary through a short-lived server signature. Identity documents never use this media pipeline.</p>
      <label className="field"><b>Video</b><input type="file" accept="video/*" onChange={e=>setFile(e.target.files?.[0]||null)}/><span className="note">MP4, MOV and other browser-supported video formats · max 100 MB</span></label>
      <label className="field"><b>Caption</b><textarea rows={4} maxLength={500} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Tell the CreatorFix community about this short..."/></label>
      <button className="btn" disabled={busy} onClick={upload}>{busy ? "Uploading and publishing..." : "Publish Short Video"}</button>
      {message && <p className="muted" style={{color:"#ffb8c5"}}>{message}</p>}
    </section>
  </main>;
}