"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPlatformAction, setPlatformStatusAction, createProblemAction, setProblemStatusAction
} from "@/actions/admin-content.actions";

type Platform={id:string;name:string;slug:string;status:string;description?:string|null};
type Problem={id:string;title:string;slug:string;status:string;short_description?:string|null;platform_id:string};

function Status({message}:{message:string}){return message?<p className="muted" style={{margin:"8px 0",color:message.startsWith("✓")?"#7ee7bd":"#ffb7c3"}}>{message}</p>:null}

export function AdminContentControls({platforms,problems}:{platforms:Platform[];problems:Problem[]}){
 const router=useRouter(); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 async function run(task:()=>Promise<any>,ok:string){setBusy(true);setMessage("");try{const r=await task();setMessage(r?.ok?"✓ "+ok:(r?.error||"Action failed."));if(r?.ok)router.refresh()}catch{setMessage("Action failed. Check permissions and try again.")}finally{setBusy(false)}}
 return <div style={{display:"grid",gap:18}}>
   <section className="queue-item">
    <h3 style={{marginTop:0}}>Platform Manager</h3>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(()=>createPlatformAction({name:f.get("name"),slug:f.get("slug"),description:f.get("description")}),"Platform created.");e.currentTarget.reset()}} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
      <input required name="name" placeholder="Platform name e.g. Facebook"/><input required name="slug" placeholder="facebook"/><input name="description" placeholder="Short description"/><button className="btn" disabled={busy}>Add Platform</button>
    </form>
    <div style={{display:"grid",gap:8,marginTop:14}}>{platforms.map(p=><div className="table-row" key={p.id}><span><b>{p.name}</b> <small className="muted">/{p.slug} · {p.status}</small></span><button className="btn" disabled={busy} onClick={()=>run(()=>setPlatformStatusAction(p.id,p.status==="active"?"suspended":"active"),p.status==="active"?"Platform suspended.":"Platform activated.")}>{p.status==="active"?"Suspend":"Activate"}</button></div>)}</div>
   </section>
   <section className="queue-item">
    <h3 style={{marginTop:0}}>Problem Manager</h3>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(()=>createProblemAction({platformId:f.get("platformId"),title:f.get("title"),slug:f.get("slug"),shortDescription:f.get("shortDescription"),fullDescription:f.get("fullDescription")}),"Problem created as draft.");e.currentTarget.reset()}} style={{display:"grid",gap:10}}>
      <select required name="platformId" defaultValue=""><option value="" disabled>Select platform</option>{platforms.filter(p=>p.status==="active").map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select>
      <input required name="title" placeholder="Problem title"/><input required name="slug" placeholder="problem-slug"/><input name="shortDescription" placeholder="Short description"/><textarea name="fullDescription" rows={3} placeholder="Full description"/>
      <button className="btn" disabled={busy}>Create Draft Problem</button>
    </form>
    <div style={{display:"grid",gap:8,marginTop:14}}>{problems.map(p=><div className="table-row" key={p.id}><span><b>{p.title}</b> <small className="muted">/{p.slug} · {p.status}</small></span><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{p.status!=="published"&&<button className="btn" disabled={busy} onClick={()=>run(()=>setProblemStatusAction(p.id,"published"),"Problem published.")}>Publish</button>}{p.status!=="draft"&&<button className="btn secondary-admin" disabled={busy} onClick={()=>run(()=>setProblemStatusAction(p.id,"draft"),"Problem moved to draft.")}>Draft</button>}{p.status!=="archived"&&<button className="btn secondary-admin" disabled={busy} onClick={()=>run(()=>setProblemStatusAction(p.id,"archived"),"Problem archived.")}>Archive</button>}</div></div>)}</div>
   </section>
   <Status message={message}/>
 </div>
}