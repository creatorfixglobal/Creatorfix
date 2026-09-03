import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { getVerificationStatus } from "@/lib/auth/require-verified";

export default async function Dashboard() {
  const profile = await requireRole(["customer","provider","admin"]);
  const verification = await getVerificationStatus(profile.id);

  return (
    <main className="wrap" style={{paddingTop:52,paddingBottom:80}}>
      <section style={{padding:"30px 0 12px"}}>
        <span style={{color:"#7eaaff",fontWeight:800,letterSpacing:1}}>CREATORFIX ACCOUNT</span>
        <h1 style={{fontSize:"clamp(38px,6vw,70px)",margin:"10px 0"}}>Welcome back, {profile.displayName}</h1>
        <p className="muted">Manage your identity, provider journey and marketplace activity from one secure place.</p>
      </section>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:18,marginTop:28}}>
        <div className="card">
          <span className="muted">IDENTITY STATUS</span>
          <h2 style={{textTransform:"capitalize"}}>{verification.status}</h2>
          <p className="muted">{verification.status === "verified" ? "Your identity has been verified." : "Complete NID and live face verification to unlock protected features."}</p>
          {verification.status !== "verified" && <Link className="btn" href="/verify">Verify Identity</Link>}
        </div>

        {profile.role !== "provider" && profile.role !== "admin" && (
          <div className="card">
            <span className="muted">PROVIDER PROGRAM</span>
            <h2>Become a Provider</h2>
            <p className="muted">Verified specialists can apply after identity approval and the required BDT 1,000 security deposit.</p>
            <Link className="btn" href="/provider/register">Start Provider Journey</Link>
          </div>
        )}

        <div className="card">
          <span className="muted">MARKETPLACE</span>
          <h2>Find Solutions</h2>
          <p className="muted">Browse creator problems and connect with the right verified specialist.</p>
          <Link className="btn" href="/problems">Browse Problems</Link>
        </div>

        <div className="card">
          <span className="muted">ACCOUNT SECURITY</span>
          <h2>Protected by verification</h2>
          <p className="muted">Sensitive identity evidence stays private and provider privileges are controlled separately from public user access.</p>
        </div>
      </div>

      <p className="muted" style={{marginTop:30,fontSize:14}}>Administrative controls are intentionally not shown inside the user dashboard. Admin access is available only through the protected admin route.</p>
    </main>
  );
}