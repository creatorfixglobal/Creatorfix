import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { IdentityReviewControls, ProviderReviewControls } from "@/components/admin-review-controls";

const nav = [
  ["overview","Overview"],["users","Users"],["providers","Providers"],["identity","Identity"],
  ["platforms","Platforms"],["problems","Problems"],["services","Services"],["orders","Orders"],
  ["payments","Payments"],["disputes","Disputes"],["fees","Fees"],["audit","Audit"]
] as const;

export default async function Admin() {
  await requireRole(["admin"]);
  const supabase = createServerSupabaseClient();

  const [
    { data: verifications }, { data: applications }, { data: profiles },
    { count: platformCount }, { count: problemCount }, { count: serviceCount },
    { count: orderCount }, { count: depositCount }, { count: disputeCount },
    { count: feeCount }, { count: auditCount }
  ] = await Promise.all([
    supabase.from("identity_verifications").select("id,user_id,status,submitted_at,created_at").in("status", ["pending","in_review"]).order("created_at", {ascending:false}).limit(30),
    supabase.from("provider_applications").select("id,user_id,bio,skills,status,created_at").eq("status","submitted").order("created_at", {ascending:false}).limit(30),
    supabase.from("profiles").select("id,display_name,email,role,status,created_at").order("created_at",{ascending:false}).limit(30),
    supabase.from("platforms").select("*",{count:"exact",head:true}),
    supabase.from("problems").select("*",{count:"exact",head:true}),
    supabase.from("services").select("*",{count:"exact",head:true}),
    supabase.from("orders").select("*",{count:"exact",head:true}),
    supabase.from("deposits").select("*",{count:"exact",head:true}),
    supabase.from("disputes").select("*",{count:"exact",head:true}),
    supabase.from("platform_fee_rules").select("*",{count:"exact",head:true}),
    supabase.from("audit_logs").select("*",{count:"exact",head:true}),
  ]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  return (
    <main className="wrap" style={{paddingTop:40,paddingBottom:90}}>
      <style>{`
        .admin-shell{display:grid;grid-template-columns:240px 1fr;gap:28px}.admin-side{position:sticky;top:20px;height:max-content;padding:16px;border:1px solid var(--line);border-radius:18px;background:#0a1020}.admin-side a{display:block;padding:10px 12px;border-radius:10px;color:#aebbd0}.admin-side a:hover{background:#15213a;color:#fff}.admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}.admin-section{scroll-margin-top:25px;margin-top:42px}.queue{display:grid;gap:12px}.queue-item{padding:18px;border:1px solid var(--line);border-radius:14px;background:#0b1626}.secondary-admin{background:#3b2030!important;color:#ffd6df!important}.metric{min-height:130px}.table-row{display:flex;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid var(--line)}@media(max-width:860px){.admin-shell{grid-template-columns:1fr}.admin-side{position:relative;display:flex;gap:4px;overflow:auto}.admin-side a{white-space:nowrap}}
      `}</style>

      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"start",flexWrap:"wrap",marginBottom:24}}>
        <div><span className="muted">PROTECTED ADMIN CONTROL CENTER</span><h1 style={{fontSize:"clamp(40px,6vw,72px)",margin:"8px 0"}}>CreatorFix Operations</h1><p className="muted">Review marketplace operations, verification queues and system data from one protected workspace.</p></div>
        <Link className="btn" href="/">View Public Site</Link>
      </div>

      <div className="admin-shell">
        <aside className="admin-side" aria-label="Admin navigation">
          {nav.map(([id,label]) => <a href={`#${id}`} key={id}>{label}</a>)}
        </aside>

        <div>
          <section id="overview" className="admin-grid">
            <div className="card metric"><span className="muted">PENDING IDENTITY</span><h2>{verifications?.length || 0}</h2></div>
            <div className="card metric"><span className="muted">PROVIDER APPLICATIONS</span><h2>{applications?.length || 0}</h2></div>
            <div className="card metric"><span className="muted">RECENT USERS</span><h2>{profiles?.length || 0}</h2></div>
            <div className="card metric"><span className="muted">SYSTEM</span><h2 style={{color:"#5ee7b5"}}>Online</h2></div>
          </section>

          <section id="identity" className="admin-section">
            <h2>Identity Verification Queue</h2>
            <div className="queue">
              {!verifications?.length && <div className="queue-item muted">No identity verification is waiting for review.</div>}
              {verifications?.map((item) => {
                const person = profileMap.get(item.user_id);
                return <div className="queue-item" key={item.id}>
                  <strong>{person?.display_name || "Unknown user"}</strong>
                  <p className="muted">{person?.email || item.user_id} · {item.status}</p>
                  <IdentityReviewControls id={item.id} />
                </div>;
              })}
            </div>
          </section>

          <section id="providers" className="admin-section">
            <h2>Provider Application Queue</h2>
            <div className="queue">
              {!applications?.length && <div className="queue-item muted">No provider applications are waiting for review.</div>}
              {applications?.map((item) => {
                const person = profileMap.get(item.user_id);
                return <div className="queue-item" key={item.id}>
                  <strong>{person?.display_name || "Unknown user"}</strong>
                  <p className="muted">{person?.email || item.user_id}</p>
                  <p>{item.bio}</p><p className="muted">Skills: {(item.skills || []).join(", ")}</p>
                  <ProviderReviewControls id={item.id} />
                </div>;
              })}
            </div>
          </section>

          <section id="users" className="admin-section"><h2>Users</h2><div className="card">{(profiles || []).map((p)=><div className="table-row" key={p.id}><span>{p.display_name || "Unnamed user"}</span><span className="muted">{p.role} · {p.status}</span></div>)}</div></section>

          <section id="platforms" className="admin-section"><h2>Platform Operations</h2><div className="card"><strong>{platformCount || 0} platforms</strong><p className="muted">Platform records are currently managed through the database-backed marketplace layer.</p></div></section>
          <section id="problems" className="admin-section"><h2>Problems</h2><div className="card"><strong>{problemCount || 0} problem records</strong><p className="muted">Published problem content is available to the public marketplace.</p></div></section>
          <section id="services" className="admin-section"><h2>Services</h2><div className="card"><strong>{serviceCount || 0} services</strong><p className="muted">Provider services remain subject to provider verification and approval rules.</p></div></section>
          <section id="orders" className="admin-section"><h2>Orders</h2><div className="card"><strong>{orderCount || 0} orders</strong><p className="muted">Order workflow and escrow data are tracked in the protected backend.</p></div></section>
          <section id="payments" className="admin-section"><h2>Payments & Deposits</h2><div className="card"><strong>{depositCount || 0} deposit records</strong><p className="muted">Deposit verification and provider security deposits will appear here as backend payment workflows are completed.</p></div></section>
          <section id="disputes" className="admin-section"><h2>Disputes</h2><div className="card"><strong>{disputeCount || 0} disputes</strong></div></section>
          <section id="fees" className="admin-section"><h2>Fee Rules</h2><div className="card"><strong>{feeCount || 0} fee rules</strong></div></section>
          <section id="audit" className="admin-section"><h2>Audit</h2><div className="card"><strong>{auditCount || 0} audit events</strong><p className="muted">Sensitive administrative actions should remain traceable through audit records.</p></div></section>
        </div>
      </div>
    </main>
  );
}