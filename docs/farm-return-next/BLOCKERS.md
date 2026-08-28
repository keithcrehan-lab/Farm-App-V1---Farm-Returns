# Farm Return Next — blockers

Documented, not silently worked around, per `BUILD_PLAN.md`'s autonomy
rules: a blocked subsystem is recorded here with enough detail to resume,
and other unblocked work continues. Mirrors the discipline
`docs/real-mode-completion/COMPLETION_REPORT.md`'s "Remaining external
blockers"/"Deliberately deferred work" sections already established for
V1 — carried-over V1 blockers are listed here only where they now also
constrain a Next feature; see that file for the full V1 list.

## Carried over from V1 (still open, now also gate Next features)

- **No automated market-price feed** — confirmed blocker (V1
  `COMPLETION_REPORT.md`). Gates: any Next Prompt that would suggest a
  bulk-buy/timing decision based on price movement.
- **No sourced silage yield/DM-conversion data** — confirmed blocker.
  Gates: any Next Prompt/job around silage cutting timing.
- **Met Éireann forecast commercial licence** — pre-existing. Gates:
  weather-window Prompts beyond the observation-based (non-forecast) data
  V1 already has live.
- **Fertiliser price not yet in the price-resolution hierarchy**
  (`nutrients.ts`'s Green Book/NAP prices are still a code constant,
  deliberately deferred in V1's P2 remediation priority) — gates any
  Next fertiliser-cost Prompt from being fully price-resolved.

## New to Next

- **No separate external architecture document.** `MASTER_SPEC.md`'s
  source is the product owner's chat brief (2026-08-29) alone. If a
  separate design/spec document exists outside this repo, it needs to be
  supplied and reconciled — until then `MASTER_SPEC.md` is treated as
  complete and authoritative, not a placeholder.
- **GPS job-mode offline conflict resolution undefined** — what happens
  when a job is Confirmed twice (once offline, once after a stale sync)
  or edited on two devices before either syncs. Gates: Vertical C
  (`BUILD_PLAN.md`) shipping anything beyond a single-device, single-
  Confirm happy path.
- **Notification channel/push infrastructure undefined** — no push
  provider, no in-app notification center exists yet. Gates: Vertical G.
- **Telemetry retention policy undefined** — how long a raw GPS
  `telemetry_events` row is kept before aggregation/deletion. Not a
  blocker for Checkpoint 1's schema (additive, forward-only either way)
  but must be decided before Vertical A ships to real farmers.
- **Satellite field intelligence provider/evidence base undefined** — no
  provider selected, no evidence-register entry exists for any vegetation/
  imagery model. Vertical H is expected to stay blocked (documented, not
  silently dropped) until a provider and evidence source are chosen — the
  same honest treatment V1 gave NDVI/satellite intelligence throughout
  (`docs/real-mode-completion/COMPLETION_REPORT.md`: "NDVI / satellite
  vegetation intelligence remains deliberately deferred").
- **Decide-stage auto-rule boundary has zero implemented rules yet.**
  `SCIENTIFIC_RULES.md` defines the boundary; no specific auto-rule has
  been proposed or reviewed against it. Not a blocker — a placeholder
  noting nothing should be assumed pre-approved just because the boundary
  exists.
