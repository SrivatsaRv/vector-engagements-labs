import type { NextConfig } from "next";
import { BROWSER_SECURITY_HEADERS } from "./lib/security/browser-response";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(BROWSER_SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
