import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CreatorFix — Your Creator Problems. Our Solutions.",
  description:
    "CreatorFix helps content creators solve platform problems and connects them with verified service providers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-body">{children}</body>
    </html>
  );
}
