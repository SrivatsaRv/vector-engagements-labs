import type { Metadata } from "next";
import "./globals.css";
import { BrowserTelemetry } from "@/components/BrowserTelemetry";
import { OverlayProvider } from "@/components/ui/OverlayPrimitives";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "https://labs.reachdefence.com"),
  title: "Vector Engagement Labs by Reach Defence",
  description:
    "Open source warfare simulation that runs in your browser with physics, 3D replay, telemetry, and inspectable reports.",
  openGraph: {
    type: "website",
    url: "https://labs.reachdefence.com",
    siteName: "Vector Engagement Labs by Reach Defence",
    title: "Vector Engagement Labs by Reach Defence",
    description:
      "Open source warfare simulation that runs in your browser with physics, 3D replay, telemetry, and inspectable reports.",
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
      "Open source warfare simulation that runs in your browser with physics, 3D replay, telemetry, and inspectable reports.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <OverlayProvider>
          <BrowserTelemetry />
          {children}
        </OverlayProvider>
      </body>
    </html>
  );
}
