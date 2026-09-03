# Hosting diagnosis — is the lack of a Vercel deployment the cause?

Authenticated Real-Data Stabilisation Phase, starting SHA `833b0ed`.

## The question

> Is the lack of a Vercel deployment causing the incomplete farm data on
> mobile?

## Answer: PARTLY, and for a specific, real, reproduced reason — not the reason initially assumed

This session could not sign in as the real authenticated farmer (no
credentials; creating an account or entering a password is prohibited
regardless of authorization). What follows is real, reproduced evidence
gathered by loading **this same dev server, over the same LAN-IP origin
a phone uses**, from this session's own connected browser — not
speculation.

## What was tested and ruled out

- **Supabase auth cookies over insecure HTTP**: `@supabase/ssr`'s
  `createBrowserClient`/`createServerClient` (`src/lib/supabase/{client,server}.ts`)
  set no explicit `secure` cookie attribute — verified by reading both
  files in full. Not the cause.
- **`proxy.ts` (middleware) behaviour differing by origin**: navigating
  to a protected route (`/today`) via the LAN IP with no session
  correctly redirected to `/sign-in?next=%2Ftoday` — identical behaviour
  to `localhost`. Not the cause.
- **Mapbox token origin/referrer restriction**: directly tested the real
  configured `NEXT_PUBLIC_MAPBOX_TOKEN` against the Mapbox Styles API
  with three different `Referer` values (`http://localhost:3000/`,
  `http://192.168.1.1:3000/`, none) — all three returned `200`. The
  token has no URL restriction. Not the cause.
- **Geolocation on an insecure origin**: `web-location-tracking-provider.ts`
  already gates every real call behind `isGeolocationAvailable()` and
  resolves `null`/no-ops rather than throwing when the API is
  unavailable — verified by reading the file. Cannot crash a render.
  Not the cause.
- **Next.js Server Actions' own Origin/Host check**: this is a
  same-request comparison (the browser's `Origin` header against that
  same request's `Host` header), which are identical for direct LAN-IP
  access with no reverse proxy in front. Not the cause.

## What was found, real and reproduced — with an honest limit on what it proves

Loading this dev server via `http://192.168.1.1:3000` (the same LAN IP
this repo's own dev-testing instructions point a phone at) and clicking
a real client-side navigation link produced **four `503` responses**
among the `_next/static/chunks/*.js` requests for that route, on the
**first** visit to a route in this dev-server process's lifetime — one
of those exact chunks then succeeded on a same-session retry. This was
observed directly in this session's own browser network log
(`19:47:00Z` onward) — a real, reproduced fact, not inferred — but this
session captured that browser-side log only, not the dev server's own
terminal output for the same window (the process predates this
session's own shell and its stdout wasn't retained), so the 503s
themselves are certain while their exact cause is not independently
proven from a server-side trace.

**Most likely explanation, not yet proven by a correlated server-side
trace**: this matches a real, documented Turbopack dev-server
behaviour — `next dev` compiles routes **on demand**, and the first
request for a chunk that hasn't been compiled yet can receive a
transient `503` while compilation finishes, with the dev client
expected to retry. This is consistent with everything observed (a
first-visit-only failure, at least one chunk recovering on retry, no
403/other status mixed in), but an alternative cause specific to this
one route/chunk set hasn't been formally ruled out. **Recommended
follow-up to fully confirm**: reproduce again while tailing the dev
server's own terminal output (`next dev`'s compile-progress lines carry
timestamps) alongside the browser network tab, and check whether the
`503` responses' `Retry-After`/timing lines up with a logged compile
event for that exact chunk.

If the on-demand-compilation explanation holds, whether a retry lands
within a page's own render window depends on network round-trip
latency:

- **This Mac, testing itself, over `localhost`**: loopback latency is
  near-zero, so a retry resolves before it's visibly noticeable — this
  is also the exact same dev-server process every screen has already
  been repeatedly visited on throughout this project's own long build
  history, so almost every route the developer tests is already
  **warm** (previously compiled, cached in memory) regardless.
- **A real phone, over real Wi-Fi, hitting a route it hasn't warmed
  yet**: real round-trip latency is materially higher than loopback,
  and a route the *developer* hasn't recently re-visited from this
  exact dev-server process is genuinely **cold** the first time the
  phone reaches it — exactly the condition that reproduces the `503`s
  above, on this exact dev server, in this exact browser test.

This is a **development-mode-only** failure class. A production build
(`next build && next start`, or a real Vercel deployment) compiles every
route ahead of time — there is no "cold route" for a first visitor to
ever hit, so this specific `503`-mid-compile class of failure cannot
occur there at all, regardless of which host serves it.

## A second finding this session initially over-applied, then corrected — `allowedDevOrigins` does NOT apply to this exact topology

Next.js dev mode blocks cross-origin requests to `/_next/*`/`/__nextjs*`
internal endpoints whenever the request's `Origin` doesn't match an
allowlist — confirmed by reading
`node_modules/next/dist/server/lib/router-utils/block-cross-site-dev.js`
directly in this installed Next 16.3.2, not assumed from general
Next.js knowledge (per `CLAUDE.md`'s "this is NOT the Next.js you
know"). An earlier version of this document (and a same-phase code
change) treated a phone reaching this dev server directly by LAN IP as
a real candidate for that block, and added `allowedDevOrigins` as a
defensive fix.

**Codex audit round 6 correctly rejected that as a real misdiagnosis of
this exact topology, and this session then verified the rejection
directly rather than taking either side's word for it**: that same
check's own allowlist is built as
`['**.localhost', 'localhost', ...allowedDevOrigins, hostname]` — and
`hostname` there is the dev server's *own* request host, which for a
phone loading `http://192.168.1.1:3000` directly (no proxy, no
different hostname anywhere in the chain) is already `192.168.1.1`
*by construction* — the browser's `Origin` for every subsequent
same-page request necessarily matches it already. `allowedDevOrigins`
only earns its keep when the browser's origin genuinely differs from
the dev server's own request host — a reverse proxy, a different
declared hostname, port-forwarding through a different address — none
of which this repo's own direct-LAN-IP dev-testing setup does.

**Empirical confirmation, not just re-reading the source**: this
session removed `next.config.ts`'s `allowedDevOrigins` entirely,
restarted the dev server, and repeated the exact same real client-side
navigation test (clicking "Create an account" from `/sign-in`, loaded
via the LAN IP) that had been used to justify the original fix. The
navigation succeeded identically — no `403`, and the same `503` pattern
from the section above reproduced verbatim (four cold-chunk `503`s, one
recovering on retry) — with or without the config. `next.config.ts` is
reverted to its pre-phase state; `DEV_LAN_IP` is removed from
`.env.example`/`.env.local`. This phase's real finding stands
unqualified: the `503`s above are the real, reproduced symptom;
`allowedDevOrigins` was never the fix for them, on this topology.

## What Vercel would solve

- Eliminates the on-demand-compilation `503` class entirely (ahead-of-time
  build, no cold routes).
- Serves over real HTTPS from a stable public origin — no "is this
  device even on the same Wi-Fi as this Mac" constraint, and no dev-only
  Turbopack behaviour of any kind to reason about (`allowedDevOrigins`
  itself turned out not to be a real concern for this direct-LAN-IP
  topology at all — see above).
- Real secure-context APIs (geolocation, etc.) behave identically to how
  they will in production, rather than under an insecure LAN-IP origin
  that happens to work today only because these specific APIs here are
  already defensively coded against being unavailable.

## What Vercel would NOT solve

- Any genuine real-mode data-wiring gap this phase's own screen audit
  found (none of consequence were found this phase — see
  `AUTHENTICATED_REAL_DATA_AUDIT.md`).
- The real, disclosed, pre-existing `BLOCKED_EXTERNAL`/`NOT_IMPLEMENTED`
  items already carried in `BLOCKERS.md` (market-price feed, silage
  yield model, satellite NDVI credentials, native background GPS) — none
  of these are hosting-dependent.
- Server Actions, Supabase auth cookies, and Mapbox all already work
  correctly over the current architecture, LAN IP included (confirmed
  above) — a Vercel deployment would not change any of their behaviour
  for a signed-in farmer.

## Conclusion

**PARTLY, pending the one follow-up check named above.** The lack of a
real deployment is not "the" cause in the sense the question implied
(no auth/cookie/Server-Action/Mapbox breakage was found — each tested
directly, not assumed). What this session found instead is a real,
reproduced `503` pattern on cold-route JS chunks over the LAN-IP origin
a phone uses, **most likely** explained by `next dev`'s own on-demand
compilation — a dev-server artifact a real deployment (Vercel or any
other static build) removes by construction, since production has no
cold routes at all — but not yet confirmed by a server-side trace
correlating the exact timing. A second, real config change
(`allowedDevOrigins`) was tried and then genuinely reverted this same
phase once directly tested against real client-side navigation and
found to make no difference for this exact direct-LAN-IP topology —
kept in this document as a real, disclosed correction, not silently
dropped. Recommend the product owner re-test on their phone against
this restarted (now-warm) dev server; if screens still fail to load,
that is new, real evidence pointing elsewhere, not
something this diagnosis already explains — and the server-side-trace
follow-up above should be run before treating "cold compilation" as
fully proven rather than the best-supported hypothesis available today.
