import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: "VECTOR — Engagement Lab",
  description: "A browser-based educational engagement simulator and instructor station built on public-data assumptions.",
  openGraph: {
    title: "VECTOR — Engagement Lab",
    description: "Build, simulate, understand, and report an abstract browser-based engagement.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "VECTOR — Engagement Lab",
    description: "Build, simulate, understand, and report an abstract browser-based engagement.",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
