import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "Teachback — Human-approved WebMCP playbooks",
  description:
    "一度見せた業務のやり方を、安全な条件と人の承認付きで再利用するWebMCPデモ。",
  openGraph: {
    title: "Teachback",
    description:
      "Turn one human-handled case into a reusable, human-approved playbook.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Teachback",
    description:
      "Turn one human-handled case into a reusable, human-approved playbook.",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
