import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { IdentityReviewControls, ProviderReviewControls } from "@/components/admin-review-controls";

export default async function Admin() {
  await requireRole(["admin"]);
  const supabase = createServerSupabaseClient();

  const [{ data: verifications }, { data: applications }, { data: profiles }] = await Promise.all([
    supabase.from("identity_verifications").select("id,user_id,status,submitted_at,created_at").in("status", ["pending","in_review"]).order("created_at", {ascending:false}).limit(20),
    supabase.from("provider_applications").select("id,user_id,bio,skills,status,created_at").eq("status","submitted").order("created_at", {ascending:false}).limit(20),
    supabase.from("profiles").select("id,display_name,email,role,status").order("created_at",{ascending:false}).limit(20),
  ]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  return (
    <main className="wrap" style={{paddingTop:42,paddingBottom:70}}>
      <style>{`.admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.admin-section{margin-top:34px}.queue{display:grid;gap:12px}.queue-item{padding:18px;border:1px solid #26364a;border-radius:14px;background:#0b1626}.secondary-admin{background:#3b2030!important;color:#ffd6df!important}.admin-nav{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 28px}`}</style>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"start",flexWrap:"wrap"}}>
        <div><span className="muted">ADMIN CONTROL CENTER</span><h1 style={{margin:"8px 0"}}>CreatorFix Operations</h1><p className="muted">Review users, identity verification, providers, services and platform operations.</p></div>
        <Link className="btn" href="/">View Site</Link>
      </div>

      <div className="admin-nav">
        {["Users","Providers","Identity","Platforms","Problems","Services","Orders","Payments","Disputes","Fees","Audit"].map((item) => <span className="card" style={{padding:"10px 14px"}} key={item}>{item}</span>)}
      </div>

      <div className="admin-grid">
        <div className="card"><h3>Pending Identity</h3><h2>{verifications?.length || 0}</h2></div>
        <div className="card"><h3>Provider Applications</h3><h2>{applications?.length || 0}</h2></div>
        <div className="card"><h3>Recent Users</h3><h2>{profiles?.length || 0}</h2></div>
        <div className="card"><h3>System</h3><h2>Online</h2></div>
      </div>

      <section className="admin-section">
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

      <section className="admin-section">
        <h2>Provider Application Queue</h2>
        <div className="queue">
          {!applications?.length && <div className="queue-item muted">No provider applications are waiting for review.</div>}
          {applications?.map((item) => {
            const person = profileMap.get(item.user_id);
            return <div className="queue-item" key={item.id}>
              <strong>{person?.display_name || "Unknown user"}</strong>
              <p className="muted">{person?.email || item.user_id}</p>
              <p>{item.bio}</p>
              <p className="muted">Skills: {(item.skills || []).join(", ")}</p>
              <ProviderReviewControls id={item.id} />
            </div>;
          })}
        </div>
      </section>
    </main>
  );
}
