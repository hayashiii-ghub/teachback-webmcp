import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "Teachback — Human-approved WebMCP playbooks",
  description:
    "一度見せた業務のやり方を、安全な条件と人の承認付きで再利用するWebMCPデモ。",
  openGraph: {
    title: "Teachback",
    description: "Show once. Reuse with approval.",
    images: [{ url: "/og.png", width: 1731, height: 909 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Teachback",
    description: "Show once. Reuse with approval.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
