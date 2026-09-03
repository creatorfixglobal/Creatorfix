import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Problems() {
  const supabase = createServerSupabaseClient();
  const { data: problems } = await supabase
    .from("problems")
    .select("id,title,slug,short_description,featured,platforms(name,slug)")
    .eq("status","published")
    .order("featured",{ascending:false})
    .order("sort_order",{ascending:true});

  return (
    <main className="wrap" style={{paddingTop:48,paddingBottom:70}}>
      <Link href="/">← Home</Link>
      <h1 style={{fontSize:"clamp(40px,7vw,70px)",marginBottom:8}}>Find Your Creator Solution</h1>
      <p className="muted" style={{maxWidth:760}}>Choose a problem category and connect with the right verified specialist through a secure, tracked workflow.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16,marginTop:30}}>
        {(problems || []).map((problem:any) => (
          <Link href={"/problems/" + problem.slug} className="card" key={problem.id} style={{minHeight:190}}>
            <span className="muted">{problem.platforms?.name || "CreatorFix"}</span>
            <h2>{problem.title}</h2>
            <p className="muted">{problem.short_description}</p>
            <strong style={{color:"#7bb0ff"}}>Explore solution →</strong>
          </Link>
        ))}
        {!problems?.length && <div className="card"><h3>No problems published yet</h3><p className="muted">The marketplace is being configured by the administrator.</p></div>}
      </div>
    </main>
  );
}
