import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: "VECTOR — Engagement Lab",
  description:
    "A browser-based engagement experiment lab with visible public-model assumptions.",
  openGraph: {
    title: "VECTOR — Engagement Lab",
    description:
      "Configure, run, compare, and explain a browser-based engagement experiment.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "VECTOR — Engagement Lab",
    description:
      "Configure, run, compare, and explain a browser-based engagement experiment.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
