# Overnight build log — `claude/overnight-farm-return-core`

Unattended sequential build session. Branched from `claude/app-discussion-dea2t1`
(clean tip). Per instruction: no upfront plan, no approval gate — phases are
defined and logged as each one starts, in the order surfaced by the most
recent "what's left" audit (small real-data wins first, then larger
buildable features), skipping anything blocked on external data/access and
recording the blocker instead. Quality checks (test/typecheck/lint/build)
run after every phase; each phase commits locally (no push) before moving
on.

Session start: see git log timestamps for exact times (not tracked here to
avoid drift between the shell clock and log edits).

---

## Phase 1 — Soil coverage: real field-mapped / verified-test counts

**Scope.** `SoilCoverageCard` (Soil screen) and the Dashboard's "Mapped
fields" metric currently read `mockFarmStats.totalFieldsMapped` (42 — a
generic placeholder that doesn't even match this farm's real 4 fields) and
`mockFarmStats.totalVerifiedTests` (12, static). Both are directly
computable from real store data already: `totalFieldsMapped` = fields with
a real drawn boundary (`Field.polygon` set, via the Mapbox field-boundary
feature), `totalVerifiedTests` = fields with a real lab-verified soil test
(`SoilFertility.verifiedTest` set, via `addSoilTest`).

**Deliberately left mock, and why.** `SoilCoverageCard`'s third stat
("planning accuracy %") and the Dashboard's "Plan Confidence"/carbon-grade
figures have no defined real methodology anywhere in this app's evidence
base — computing them would mean inventing a scoring formula, which
CLAUDE.md's "never invent a production number" rule forbids. Left as
`mockFarmStats` fields, untouched.

**Implementation.** `src/domain/farm-stats.ts` (new, tested):
`calculateFarmCoverageStats(fields)` — `totalFieldsMapped` =
`fields.filter(f => f.polygon !== undefined).length`, `totalVerifiedTests`
= `fields.filter(f => f.fertility.verifiedTest !== undefined).length`.
Wired into `SoilCoverageCard` (now a client component reading `useFields()`
directly) and the Dashboard's mobile-only "Mapped fields" `MetricCard`.
Also removed that card's hardcoded `changePct={2}` — a fabricated "+2%"
delta with no real historical basis, now sitting next to a real value
where it would have been actively misleading rather than just generically
mock.

**Verified.** Soil screen now shows **0 fields mapped** (correct and
interesting: none of this farm's 4 mock-seeded fields have had a real
boundary drawn via the Mapbox field-boundary tool yet — a real, honest
result, not a bug) and **1 verified tests** (matches River Field's real
12 May 2025 lab test exactly). Dashboard mobile "Mapped fields" card shows
the same real 0. Both screens visually confirmed at mobile/desktop, zero
console errors, no layout regression.

**Quality checks.** 4 new tests (`farm-stats.test.ts`) — 391/391 total
passing. typecheck clean. lint clean. Production build clean (all 25
routes generate, `/livestock/lg-weanlings` still included).

Status: **complete.** Committed locally.
