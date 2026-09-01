# Farm Return Next — scientific governance

This does not replace V1's scientific governance — it binds the new Prompt/
Decide/Learn stages to it. The authoritative rules remain:

- `CLAUDE.md`'s "Science before AI" principle and Never rules.
- `docs/evidence-register.md` — every production scientific/regulatory/
  financial number's source.
- `docs/scientific-engine/v3/README.md`'s core governance rule: every
  recommendation, legal stop, estimate and blocked calculation exposes
  `input -> normalisation -> calculation -> scientific evidence -> legal
  checks -> final decision`, persisted at calculation time and available
  for peer review. **Unsupported does not mean guessed — it means fail
  closed.**

Nothing below loosens any of that. It exists because Next adds two new
things V1 never had — a Prompt that suggests an action, and a Learn stage
that watches whether estimates matched reality — and both need an explicit
boundary against the "AI may explain... but must never invent" rule.

## Prompt stage

A Prompt is a presentation of an Estimate the domain layer already
computed — it must never contain a number the Estimate stage didn't
produce. Where the underlying Estimate is `BLOCKED_INSUFFICIENT_EVIDENCE`
(the `EngineOutcome<T>` pattern, `DOMAIN_CONTRACTS.md`), the Prompt says so
honestly ("not enough evidence yet to suggest a spreading window here") —
it never falls back to a plausible-sounding suggestion to avoid showing an
empty state. This is the same discipline the P3/P9 remediation pass
applied to V1's dashboard/finance cards
(`docs/real-mode-completion/BUILD_LOG.md`): an honest "not yet available"
beats a labelled guess.

A Prompt's own trace (which Estimate, which evidence, which legal check)
must be inspectable the same way `NutrientPlan`'s trace already is —
Today's Prompt detail view (`UX_DESIGN.md`'s locked IA — there is no
separate Activity screen; the Prompt/Decide surface lives on Today) is
this trace, not a summary that hides it.

## Decide stage — the auto-rule boundary

Every Decide is a farmer decision by default. An auto-rule (the app
deciding without a farmer confirming) is permitted **only** where:

1. The underlying Estimate/Prompt is `regulatory: "planning_advice"`
   (never `"compliance_value"` — a legal/statutory decision is never
   automated), **and**
2. The action is fully reversible with no real-world side effect until a
   farmer separately confirms it (e.g. pre-filling a suggested job is
   fine; actually marking one complete, ordering an input, or committing
   a spreading run is not).

No auto-rule exists yet — this is a boundary for when one is proposed, not
an implemented feature. Any specific auto-rule proposal is a
`BUILD_PLAN.md` checkpoint of its own, reviewed against these two
conditions explicitly before it ships.

## Learn stage — the calibration boundary

Learn compares an Estimate to its later Actual and produces a **confidence
calibration** — e.g. "this farm's fertiliser-cost estimates have run 8%
high over the last 3 confirmed jobs" — surfaced as metadata alongside a
future Estimate of the same type.

Learn **must never**:

- Change a Green Book/NAP/statutory table value, a price-resolution
  hierarchy rule, or any other `docs/evidence-register.md`-sourced
  constant. Those change only the way V1 already changes them: a new
  sourced evidence entry, a versioned rule-set update, reviewed the same
  way `docs/scientific-engine/v3`'s tables were.
- Silently adjust the number an Estimate function returns. A calibration
  is a **separate, labelled figure** ("Estimate: €X. This farm's estimates
  of this type have run ~8% high recently.") — never blended into the
  Estimate itself, per the same "never overwrite provenance" rule that
  governs a farmer-adjusted value overwriting an estimate
  (`product-requirements.md` §2's data-precedence table).
- Apply across farms. A calibration is scoped to the one farm (and,
  eventually, the one field/enterprise) whose actuals produced it — never
  pooled into a shared model without a separate, explicitly-evidenced
  decision to do so.

`estimate_calibration` (`ARCHITECTURE.md`) is additive, versioned, and
carries its own provenance (which decisions/actuals it was computed from,
when) — the same discipline as every other tracked value in this app.

## New Next-only calculations

Any new domain calculation this build programme needs (a spreading-window
Prompt score, a GPS-derived area correction, satellite-derived field
intelligence) follows exactly the process every V1 calculation used: a
pure `src/domain/` module, a colocated test file, an
`docs/evidence-register.md` entry naming its real source, before it
reaches a production screen as anything other than explicitly-labelled
sample data. No exception for "it's just for Next."
