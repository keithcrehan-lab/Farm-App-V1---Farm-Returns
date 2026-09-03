import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Dev-mode indicator overlaps the desktop sidebar's account row during
   * screenshot QA (CLAUDE.md screen workflow) — off for a clean compare. */
  devIndicators: false,
};

export default nextConfig;
