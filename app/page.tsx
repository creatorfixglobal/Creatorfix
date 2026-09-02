const platforms = ["Facebook", "YouTube", "TikTok", "Instagram"];
const steps = [
  ["1", "Choose your problem", "Select the platform and issue you need help with."],
  ["2", "Get matched", "Find a verified service provider for your request."],
  ["3", "Secure payment", "Payment is protected through the CreatorFix wallet and escrow flow."],
];

export default function HomePage() {
  return (
    <main>
      <header style={{maxWidth:1180,margin:"0 auto",padding:"22px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <strong style={{fontSize:26}}>Creator<span style={{color:"#38bdf8"}}>Fix</span></strong>
        <nav style={{display:"flex",gap:20,color:"#cbd5e1"}}><span>Problems</span><span>Providers</span><span>How it works</span><span>Login</span></nav>
      </header>
      <section style={{maxWidth:1180,margin:"0 auto",padding:"80px 24px 60px",textAlign:"center"}}>
        <div style={{display:"inline-block",padding:"8px 14px",border:"1px solid #1e3a5f",borderRadius:999,color:"#7dd3fc",background:"#0c1728"}}>Built for Bangladeshi Content Creators</div>
        <h1 style={{fontSize:"clamp(42px,7vw,76px)",lineHeight:1.05,maxWidth:900,margin:"24px auto"}}>Fix your creator problems.<br/><span style={{color:"#38bdf8"}}>Grow without limits.</span></h1>
        <p style={{fontSize:19,color:"#94a3b8",maxWidth:720,margin:"0 auto 30px"}}>CreatorFix connects creators with verified professionals for Facebook, YouTube, TikTok and other platform-related services.</p>
        <div style={{display:"flex",justifyContent:"center",gap:12,flexWrap:"wrap"}}>
          <button style={{padding:"14px 22px",border:0,borderRadius:10,background:"#38bdf8",fontWeight:700,cursor:"pointer"}}>Find a Solution</button>
          <button style={{padding:"14px 22px",border:"1px solid #334155",borderRadius:10,background:"transparent",color:"#fff",fontWeight:700}}>Become a Provider</button>
        </div>
      </section>
      <section style={{maxWidth:1180,margin:"0 auto",padding:"30px 24px 70px"}}>
        <h2 style={{textAlign:"center",fontSize:32}}>Popular Platforms</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:16,marginTop:28}}>
          {platforms.map((p)=><div key={p} style={{padding:28,border:"1px solid #1e293b",borderRadius:16,background:"#0b1220"}}><h3 style={{fontSize:22,margin:0}}>{p}</h3><p style={{color:"#94a3b8"}}>Explore creator problems and professional solutions.</p></div>)}
        </div>
      </section>
      <section style={{background:"#0b1220",padding:"70px 24px"}}>
        <div style={{maxWidth:1180,margin:"0 auto"}}>
          <h2 style={{textAlign:"center",fontSize:32}}>How CreatorFix Works</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:20,marginTop:35}}>
            {steps.map(([n,t,d])=><div key={n} style={{padding:28,borderRadius:16,background:"#101a2c"}}><div style={{color:"#38bdf8",fontWeight:800,fontSize:28}}>{n}</div><h3>{t}</h3><p style={{color:"#94a3b8",lineHeight:1.6}}>{d}</p></div>)}
          </div>
        </div>
      </section>
      <section style={{maxWidth:900,margin:"0 auto",padding:"80px 24px",textAlign:"center"}}>
        <h2 style={{fontSize:36}}>Secure by Design</h2>
        <p style={{color:"#94a3b8",lineHeight:1.7}}>NID and live-face verification, role-based access control, protected wallet operations and order-scoped communication are part of the CreatorFix foundation.</p>
      </section>
      <footer style={{borderTop:"1px solid #1e293b",padding:"30px 24px",textAlign:"center",color:"#64748b"}}>© 2026 CreatorFix — Work in progress preview</footer>
    </main>
  );
}