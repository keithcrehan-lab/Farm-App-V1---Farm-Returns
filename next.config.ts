import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Dev-mode indicator overlaps the desktop sidebar's account row during
   * screenshot QA (CLAUDE.md screen workflow) — off for a clean compare. */
  devIndicators: false,
  /* Local QA is sometimes opened via 127.0.0.1 rather than localhost.
   * Next.js otherwise blocks the client chunks/HMR as cross-origin, which
   * leaves the server-rendered onboarding screen visible but unhydrated. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
