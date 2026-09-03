import type { NextConfig } from "next";

/* Authenticated Real-Data Stabilisation Phase (2026-09-03) —
 * `docs/real-data/HOSTING_DIAGNOSIS.md` §"allowedDevOrigins". Next.js
 * dev mode blocks cross-origin requests to `/_next/*`/`/__nextjs*`
 * internal endpoints whenever the request carries an `Origin` header
 * that isn't `localhost` (or this dev server's own bound hostname) —
 * real, current behaviour, confirmed against
 * `node_modules/next/dist/server/lib/router-utils/block-cross-site-dev.js`
 * in this exact installed Next 16.3.2. Client-side App Router
 * navigation (RSC "flight" fetches) and Server Action POSTs both send
 * `Origin`, so a phone reaching this dev server over LAN (necessarily by
 * IP, never `localhost`) can have some of those requests rejected with a
 * 403 the phone's own UI shows as a stalled/blank screen with no visible
 * error, while the same route loads fine from this machine itself.
 *
 * Codex audit round 1 (LOW): an earlier version of this hardcoded one
 * developer's own DHCP-assigned LAN IP directly into shared source, and
 * claimed this repo's README/CLAUDE.md already documented that exact
 * address — neither file does; that instruction only exists in this
 * session's own chat reply to the product owner. Fixed: read from a real
 * env var instead — `DEV_LAN_IP` in `.env.local` (gitignored, same as
 * every other machine-specific value in this repo, e.g. Supabase/Mapbox
 * keys), empirically confirmed to be visible at `next.config.ts`
 * evaluation time in this exact Next version (a real dev-server startup
 * probe, not assumed). Unset on a machine that hasn't configured it —
 * `allowedDevOrigins` then stays `[]`, the same as before this phase, a
 * safe no-op rather than a silently wrong IP for a different developer.
 * To test from a phone on the same Wi-Fi: find this Mac's own LAN IP
 * (`ipconfig getifaddr en0`), add `DEV_LAN_IP=<that address>` to
 * `.env.local`, and restart `next dev`. */
const devLanIp = process.env.DEV_LAN_IP;

const nextConfig: NextConfig = {
  /* Dev-mode indicator overlaps the desktop sidebar's account row during
   * screenshot QA (CLAUDE.md screen workflow) — off for a clean compare. */
  devIndicators: false,
  allowedDevOrigins: devLanIp ? [devLanIp] : [],
};

export default nextConfig;
