import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Dev-mode indicator overlaps the desktop sidebar's account row during
   * screenshot QA (CLAUDE.md screen workflow) — off for a clean compare. */
  devIndicators: false,
  /* Authenticated Real-Data Stabilisation Phase (2026-09-03) —
   * `docs/real-data/HOSTING_DIAGNOSIS.md` §"allowedDevOrigins". Next.js
   * dev mode blocks cross-origin requests to `/_next/*`/`/__nextjs*`
   * internal endpoints whenever the request carries an `Origin` header
   * that isn't `localhost` (or this dev server's own bound hostname) —
   * real, current behaviour, confirmed against
   * `node_modules/next/dist/server/lib/router-utils/block-cross-site-dev.js`
   * in this exact installed Next 16.3.2. Client-side App Router
   * navigation (RSC "flight" fetches) and Server Action POSTs both send
   * `Origin`, so a phone reaching this dev server over LAN (necessarily
   * by IP, never `localhost`) can have some of those requests rejected
   * with a 403 the phone's own UI shows as a stalled/blank screen with
   * no visible error, while the same route loads fine from this machine
   * itself. Real, exact, private LAN IP this repo's own README/CLAUDE.md
   * dev-testing instructions point at — not a wildcard, since
   * `allowedDevOrigins` is a real cross-origin *trust* boundary, not a
   * cosmetic setting. Update this value if the Mac's own LAN IP changes
   * (`ipconfig getifaddr en0`). */
  allowedDevOrigins: ["192.168.1.1"],
};

export default nextConfig;
