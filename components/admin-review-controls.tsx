"use client";

import { useState } from "react";
import { approveIdentityVerificationAction, rejectIdentityVerificationAction } from "@/actions/admin.actions";
import { approveProviderApplicationAction, rejectProviderApplicationAction } from "@/provider.actions";

export function IdentityReviewControls({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function approve() {
    setBusy(true);
    const result = await approveIdentityVerificationAction(id);
    setMessage(result.ok ? "Approved. Refresh to update the queue." : result.error);
    setBusy(false);
  }

  async function reject() {
    const reason = window.prompt("Reason for rejection:");
    if (!reason) return;
    setBusy(true);
    const result = await rejectIdentityVerificationAction(id, reason);
    setMessage(result.ok ? "Rejected. Refresh to update the queue." : result.error);
    setBusy(false);
  }

  return <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
    <button className="btn" disabled={busy} onClick={approve}>Approve</button>
    <button className="btn secondary-admin" disabled={busy} onClick={reject}>Reject</button>
    {message && <small>{message}</small>}
  </div>;
}

export function ProviderReviewControls({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function approve() {
    setBusy(true);
    const result = await approveProviderApplicationAction(id);
    setMessage(result.ok ? "Provider approved. Refresh to update the queue." : result.error);
    setBusy(false);
  }

  async function reject() {
    const reason = window.prompt("Reason for rejection:");
    if (!reason) return;
    setBusy(true);
    const result = await rejectProviderApplicationAction(id, reason);
    setMessage(result.ok ? "Rejected. Refresh to update the queue." : result.error);
    setBusy(false);
  }

  return <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
    <button className="btn" disabled={busy} onClick={approve}>Approve Provider</button>
    <button className="btn secondary-admin" disabled={busy} onClick={reject}>Reject</button>
    {message && <small>{message}</small>}
  </div>;
}
