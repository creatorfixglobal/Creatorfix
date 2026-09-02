import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CreatorFix — Creator Support Marketplace",
  description: "Professional solutions for content creators.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#070b14", color: "#fff" }}>
        {children}
      </body>
    </html>
  );
}