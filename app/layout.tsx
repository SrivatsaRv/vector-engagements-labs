import type { Metadata } from "next";
import "./globals.css";
import { BrowserTelemetry } from "@/components/BrowserTelemetry";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "https://labs.reachdefence.com"),
  title: "Vector Engagement Labs by Reach Defence",
  description:
    "Explore browser-based engagement experiments with visible assumptions, synchronized simulation views, comparisons, and reproducible reports.",
  openGraph: {
    type: "website",
    url: "https://labs.reachdefence.com",
    siteName: "Vector Engagement Labs by Reach Defence",
    title: "Vector Engagement Labs by Reach Defence",
    description:
      "Explore browser-based engagement experiments with visible assumptions, synchronized simulation views, comparisons, and reproducible reports.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Vector Engagement Labs by Reach Defence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vector Engagement Labs by Reach Defence",
    description:
      "Explore browser-based engagement experiments with visible assumptions, synchronized simulation views, comparisons, and reproducible reports.",
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
