"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveIdentityVerificationAction, rejectIdentityVerificationAction } from "@/actions/admin.actions";
import { approveProviderApplicationAction, rejectProviderApplicationAction } from "@/provider.actions";

function ResultMessage({message}:{message:string}){return message ? <small style={{color:message.startsWith("Approved") || message.startsWith("Rejected") ? "#7ee7bd" : "#ffb7c3"}}>{message}</small> : null}

export function IdentityReviewControls({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(task:()=>Promise<{ok:boolean,error?:string}>, success:string) {
    setBusy(true); setMessage("");
    try { const result = await task(); setMessage(result.ok ? success : (result.error || "Request failed.")); if(result.ok) router.refresh(); }
    catch { setMessage("The admin action could not be completed. Check server permissions and try again."); }
    finally { setBusy(false); }
  }

  return <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
    <button className="btn" disabled={busy} onClick={()=>run(()=>approveIdentityVerificationAction(id),"Approved and queue refreshed.")}>Approve</button>
    <button className="btn secondary-admin" disabled={busy} onClick={()=>{const reason=window.prompt("Reason for rejection:"); if(reason) run(()=>rejectIdentityVerificationAction(id,reason),"Rejected and queue refreshed.");}}>Reject</button>
    <ResultMessage message={message}/>
  </div>;
}

export function ProviderReviewControls({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(task:()=>Promise<{ok:boolean,error?:string}>, success:string) {
    setBusy(true); setMessage("");
    try { const result = await task(); setMessage(result.ok ? success : (result.error || "Request failed.")); if(result.ok) router.refresh(); }
    catch { setMessage("The admin action could not be completed. Check server permissions and try again."); }
    finally { setBusy(false); }
  }

  return <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
    <button className="btn" disabled={busy} onClick={()=>run(()=>approveProviderApplicationAction(id),"Provider approved and queue refreshed.")}>Approve Provider</button>
    <button className="btn secondary-admin" disabled={busy} onClick={()=>{const reason=window.prompt("Reason for rejection:"); if(reason) run(()=>rejectProviderApplicationAction(id,reason),"Rejected and queue refreshed.");}}>Reject</button>
    <ResultMessage message={message}/>
  </div>;
}