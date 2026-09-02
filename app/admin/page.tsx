import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
const links=[["Identity Reviews","/admin/verification"],["Users","/admin/users"],["Provider Applications","/admin/providers"],["Marketplace","/admin/marketplace"]];
export default async function Admin(){
 try{
  const s=createServerSupabaseClient();const {data:{user},error:authError}=await s.auth.getUser();
  if(authError||!user)return <main className="wrap" style={{paddingTop:70}}><h1>Admin Login Required</h1><p className="muted">Please sign in with an administrator account.</p><Link className="btn" href="/login">Go to Login</Link></main>;
  const {data:profile,error}=await s.from("profiles").select("role,status,display_name").eq("auth_user_id",user.id).maybeSingle();
  if(error||!profile)return <main className="wrap" style={{paddingTop:70}}><h1>Admin Setup Required</h1><p className="muted">Your account exists but no administrator profile could be verified. Check the profiles table and set role to admin.</p></main>;
  if(profile.status!=="active"||profile.role!=="admin")return <main className="wrap" style={{paddingTop:70}}><h1>Access Restricted</h1><p className="muted">This account does not currently have administrator permission.</p></main>;
  return <main className="wrap" style={{paddingTop:50}}><h1>Admin Control Center</h1><p className="muted">Welcome, {profile.display_name}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>{links.map(([label,href])=><Link className="card" href={href} key={label}><h3>{label}</h3><p className="muted">Administrative controls</p></Link>)}</div></main>;
 }catch(e){return <main className="wrap" style={{paddingTop:70}}><h1>Admin Panel Configuration Error</h1><p className="muted">Check Supabase environment variables and deployment logs. The page is protected and no admin data was exposed.</p></main>}
}