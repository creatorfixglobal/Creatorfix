import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ProblemDetailPage({ params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();

  const { data: problem, error } = await supabase
    .from("problems")
    .select("id,title,slug,short_description,full_description,status,platforms(name,slug)")
    .eq("slug", params.slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !problem) notFound();

  const platform = Array.isArray(problem.platforms) ? problem.platforms[0] : problem.platforms;

  return (
    <main className="problem-page">
      <style>{`
        .problem-page{min-height:100vh;background:radial-gradient(circle at 88% 8%,#183e70 0,transparent 30%),radial-gradient(circle at 10% 90%,#311851 0,transparent 34%),#07111f;color:#f8fbff;padding:28px 20px 80px}
        .problem-shell{max-width:1080px;margin:auto}.crumb{color:#a9bdd5;font-weight:700}.hero-card{margin-top:36px;padding:clamp(28px,6vw,64px);border:1px solid #294866;border-radius:30px;background:linear-gradient(145deg,#101f34ee,#09111fee);box-shadow:0 30px 90px #0007}
        .eyebrow{color:#82b6ff;font-weight:900;letter-spacing:1.5px;font-size:12px}.problem-title{font-size:clamp(46px,8vw,92px);line-height:.98;letter-spacing:-3px;margin:18px 0}.problem-copy{color:#afbdd0;line-height:1.8;font-size:18px;max-width:760px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}.primary,.secondary{padding:15px 20px;border-radius:14px;font-weight:900;transition:transform .22s ease,box-shadow .22s ease}.primary{background:linear-gradient(135deg,#4b8dff,#7b5cff);box-shadow:0 18px 40px #4b7cff33}.secondary{border:1px solid #365574;background:#0d1828}.primary:hover,.secondary:hover{transform:translateY(-3px)}
        .flow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:20px}.flow-card{padding:22px;border:1px solid #28435f;border-radius:18px;background:#0b1626}.flow-card b{display:block;color:#7db2ff;margin-bottom:8px}@media(max-width:760px){.flow{grid-template-columns:1fr}.problem-title{letter-spacing:-2px}}
      `}</style>
      <div className="problem-shell">
        <Link className="crumb" href="/problems">← All solutions</Link>
        <section className="hero-card">
          <span className="eyebrow">{platform?.name || "CREATORFIX"} • VERIFIED WORKFLOW</span>
          <h1 className="problem-title">{problem.title}</h1>
          <p className="problem-copy">{problem.short_description}</p>
          {problem.full_description && <p className="problem-copy">{problem.full_description}</p>}
          <div className="actions">
            <Link className="primary" href={"/register?problem=" + encodeURIComponent(problem.slug)}>Start Your Case →</Link>
            <Link className="secondary" href="/problems">Browse Other Solutions</Link>
          </div>
        </section>

        <section className="flow">
          <div className="flow-card"><b>01 — Submit</b><span className="problem-copy">Create an account and describe your case securely.</span></div>
          <div className="flow-card"><b>02 — Review</b><span className="problem-copy">The marketplace workflow connects your case to eligible verified specialists.</span></div>
          <div className="flow-card"><b>03 — Track</b><span className="problem-copy">Follow progress through your account instead of relying on informal communication.</span></div>
        </section>
      </div>
    </main>
  );
}
