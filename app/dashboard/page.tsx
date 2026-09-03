import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { getVerificationStatus } from "@/lib/auth/require-verified";

export default async function Dashboard() {
  const profile = await requireRole(["customer","provider","admin"]);
  const verification = await getVerificationStatus(profile.id);

  return (
    <main className="wrap" style={{paddingTop:50,paddingBottom:70}}>
      <h1>Welcome, {profile.displayName}</h1>
      <p className="muted">Manage your CreatorFix account and marketplace activity.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:16,marginTop:26}}>
        <div className="card">
          <h3>Identity Verification</h3>
          <p className="muted">Current status: <strong>{verification.status}</strong></p>
          {verification.status !== "verified" && <Link className="btn" href="/verify">Verify Identity</Link>}
        </div>
        <div className="card">
          <h3>Become a Provider</h3>
          <p className="muted">Verified specialists can apply to offer services.</p>
          <Link className="btn" href="/provider/apply">Provider Application</Link>
        </div>
        <div className="card">
          <h3>Find Solutions</h3>
          <p className="muted">Browse current creator problems and available solutions.</p>
          <Link className="btn" href="/problems">Browse Problems</Link>
        </div>
        {profile.role === "admin" && <div className="card">
          <h3>Admin Control Center</h3>
          <p className="muted">Review identity and provider queues.</p>
          <Link className="btn" href="/admin">Open Admin Panel</Link>
        </div>}
      </div>
    </main>
  );
}
