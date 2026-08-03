import type { Metadata } from "next";
import "./globals.css";
import { BrowserTelemetry } from "@/components/BrowserTelemetry";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:4317"),
  title: "Vector Engagement Labs",
  description:
    "A browser-based engagement experiment lab with visible public-model assumptions.",
  openGraph: {
    title: "Vector Engagement Labs",
    description:
      "Construct, simulate, observe, explain, compare, and report a browser-based engagement experiment.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vector Engagement Labs",
    description:
      "Construct, simulate, observe, explain, compare, and report a browser-based engagement experiment.",
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
      <body><BrowserTelemetry />{children}</body>
    </html>
  );
}
