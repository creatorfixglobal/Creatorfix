"use client";

import Link from "next/link";
import { useState } from "react";

export default function ProviderRegister() {
  const [lang, setLang] = useState<"en" | "bn">("en");
  const bn = lang === "bn";
  const t = (en: string, bangla: string) => (bn ? bangla : en);

  return (
    <main className="provider-onboarding">
      <style>{`
        .provider-onboarding{min-height:100vh;background:radial-gradient(circle at 85% 10%,#183e70 0,transparent 30%),radial-gradient(circle at 10% 90%,#3a1b5d 0,transparent 35%),#07111f;color:#fff;padding:28px 20px}
        .provider-shell{max-width:980px;margin:auto}.provider-top{display:flex;justify-content:space-between;align-items:center;gap:16px}.lang{background:#14233a;color:#fff;border:1px solid #38587e;border-radius:10px;padding:9px 13px;cursor:pointer}.provider-hero{margin-top:55px;display:grid;grid-template-columns:1.1fr .9fr;gap:32px;align-items:start}.provider-card{border:1px solid #294564;background:#0d1929cc;border-radius:22px;padding:24px}.steps{display:grid;gap:12px}.step{padding:18px;border-radius:14px;background:#101f33;border:1px solid #253f5d}.step strong{display:block;color:#77adff;margin-bottom:5px}.cta{display:inline-block;margin-top:22px;padding:15px 20px;border-radius:12px;background:linear-gradient(135deg,#438cff,#7658ff);font-weight:800}.note{color:#9fb1c7;line-height:1.7}@media(max-width:760px){.provider-hero{grid-template-columns:1fr}}
      `}</style>
      <div className="provider-shell">
        <div className="provider-top">
          <Link href="/">← CreatorFix</Link>
          <button className="lang" onClick={() => setLang(bn ? "en" : "bn")}>{bn ? "English" : "বাংলা"}</button>
        </div>

        <section className="provider-hero">
          <div>
            <span style={{color:"#8ab8ff",fontWeight:800}}>VERIFIED PROVIDER PROGRAM</span>
            <h1 style={{fontSize:"clamp(42px,8vw,76px)",lineHeight:1,margin:"18px 0"}}>{t("Build trust. Earn professionally.","বিশ্বাস তৈরি করুন। প্রফেশনালি আয় করুন।")}</h1>
            <p className="note">{t("CreatorFix only allows verified specialists to offer services. NID and live face verification are mandatory, followed by a manual admin review.","CreatorFix-এ শুধুমাত্র যাচাইকৃত বিশেষজ্ঞরা সার্ভিস দিতে পারবেন। NID এবং লাইভ ফেস ভেরিফিকেশন বাধ্যতামূলক, এরপর অ্যাডমিন রিভিউ হবে।")}</p>
            <Link className="cta" href="/register">{t("Create Account & Start", "অ্যাকাউন্ট খুলে শুরু করুন")} →</Link>
          </div>

          <div className="provider-card">
            <h2 style={{marginTop:0}}>{t("Your verification journey","আপনার ভেরিফিকেশন ধাপ")}</h2>
            <div className="steps">
              <div className="step"><strong>01 — {t("Account","অ্যাকাউন্ট")}</strong>{t("Create and verify your CreatorFix account.","CreatorFix অ্যাকাউন্ট তৈরি ও ভেরিফাই করুন।")}</div>
              <div className="step"><strong>02 — {t("Identity","পরিচয়")}</strong>{t("Upload NID front, NID back and live face capture.","NID-এর সামনে, পেছন এবং লাইভ ফেস ক্যাপচার দিন।")}</div>
              <div className="step"><strong>03 — {t("Application","আবেদন")}</strong>{t("Add your professional bio and skills.","আপনার অভিজ্ঞতা ও দক্ষতা যোগ করুন।")}</div>
              <div className="step"><strong>04 — {t("Admin review","অ্যাডমিন রিভিউ")}</strong>{t("Approval is required before you can offer services.","সার্ভিস দেওয়ার আগে অ্যাডমিন অনুমোদন প্রয়োজন।")}</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
