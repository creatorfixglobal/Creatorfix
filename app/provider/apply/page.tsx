"use client";

import { useState } from "react";
import { applyToBecomeProviderAction } from "@/provider.actions";

export default function ProviderApplyPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const skills = String(form.get("skills") || "").split(",").map((item) => item.trim()).filter(Boolean);
    setBusy(true);
    setMessage("");
    try {
      const result = await applyToBecomeProviderAction({ bio: form.get("bio"), skills });
      setMessage(result.ok ? "Provider application submitted. Await admin review." : result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{maxWidth:760,paddingTop:60}}>
      <a href="/dashboard">← Dashboard</a>
      <h1>Provider Application</h1>
      <p className="muted">Identity verification and a verified BDT 1,000 security deposit are required before a provider application can be submitted.</p><a className="btn" href="/provider/security-deposit" style={{marginTop:10}}>Manage BDT 1,000 Security Deposit</a>
      <form className="card" onSubmit={submit} style={{display:"grid",gap:16,marginTop:24}}>
        <label>Professional bio<textarea name="bio" required minLength={20} placeholder="Tell us about your experience, specialties, and relevant work." style={{width:"100%",minHeight:160,marginTop:8}} /></label>
        <label>Skills (comma separated)<input name="skills" required placeholder="Facebook recovery, YouTube copyright, TikTok appeal" style={{width:"100%",marginTop:8}} /></label>
        <button className="btn" disabled={busy}>{busy ? "Submitting..." : "Submit Provider Application"}</button>
        {message && <p aria-live="polite">{message}</p>}
      </form>
    </main>
  );
}
