"use client";

import Link from "next/link";
import {useState} from "react";
import {submitProviderSecurityDepositAction} from "@/provider.actions";

export default function SecurityDepositPage(){
 const [method,setMethod]=useState("bkash"),[reference,setReference]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const r=await submitProviderSecurityDepositAction({paymentMethod:method,paymentReference:reference});setMessage(r.ok?"Security deposit submitted. It will be held after admin verification.":r.error||"Submission failed.");}catch{setMessage("Unable to submit the security deposit.");}finally{setBusy(false)}}
 return <main className="wrap" style={{maxWidth:760,paddingTop:58,paddingBottom:80}}>
  <Link href="/provider/register">← Provider Program</Link>
  <section className="card" style={{marginTop:24}}>
   <span className="muted">PROVIDER SECURITY DEPOSIT</span>
   <h1 style={{fontSize:"clamp(38px,7vw,68px)",margin:"8px 0"}}>BDT 1,000 refundable hold</h1>
   <p className="muted">This deposit is a provider security hold designed to reduce fraud. While it remains held, your provider account can stay active. If you request withdrawal, provider services are paused immediately and you cannot continue accepting work until the provider program is reactivated.</p>
   <div style={{padding:18,border:"1px solid var(--line)",borderRadius:14,margin:"22px 0",background:"#0a1120"}}>
    <strong>Amount: BDT 1,000</strong><p className="muted" style={{marginBottom:0}}>Submit your payment method and transaction reference. Admin verification is required before the amount becomes a held security deposit.</p>
   </div>
   <form onSubmit={submit} style={{display:"grid",gap:16}}>
    <label>Payment method<select value={method} onChange={e=>setMethod(e.target.value)} style={{width:"100%",marginTop:7,padding:12,borderRadius:10}}><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="bank">Bank</option></select></label>
    <label>Transaction / reference ID<input required minLength={4} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Enter payment transaction ID" style={{width:"100%",marginTop:7,padding:12,borderRadius:10}}/></label>
    <button className="btn" disabled={busy}>{busy?"Submitting...":"Submit BDT 1,000 Security Deposit"}</button>
    {message&&<p className="muted" aria-live="polite">{message}</p>}
   </form>
  </section>
 </main>
}