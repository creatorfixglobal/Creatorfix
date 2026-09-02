import { requireRole } from "@/lib/auth/require-role";
import Link from "next/link";

const adminLinks = [
  ["Identity Reviews", "/admin/verification"],
  ["Users", "/admin/users"],
  ["Provider Applications", "/admin/providers"],
  ["Marketplace", "/admin/marketplace"],
] as const;

export default async function Admin() {
  await requireRole(["admin"]);
  return <main className="wrap" style={{ paddingTop: 50 }}><h1>Admin Control Center</h1><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>{adminLinks.map(([label, href]) => <Link className="card" href={href} key={label}><h3>{label}</h3><p className="muted">Administrative controls</p></Link>)}</div></main>;
}
