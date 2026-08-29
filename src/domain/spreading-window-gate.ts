/**
 * Real, ISO-calendar-validated entry point for the statutory spreading
 * closed-period calendar — a genuinely new `src/domain/` module, per
 * `DOMAIN_CONTRACTS.md`'s own "New contracts this build programme adds"
 * section ("New `src/domain/` modules... join this table via the same
 * process every V1 domain module used: pure function, colocated test
 * file... They are proposed, not frozen, until they ship"). Added
 * Checkpoint 2, Vertical B, second slice, for
 * `src/orchestration/prompt/spreading-window.ts`.
 *
 * Deliberately its own file, not a change to `closed-period-calendar.ts`
 * itself — a frozen `DOMAIN_CONTRACTS.md` contract this vertical is not
 * authorised to modify unilaterally (`AGENTS.md`'s "Parallel/worktree
 * work" section, and the identical discipline this checkpoint's own
 * `field-soil-test-age.ts` already established for the analogous
 * `nutrients.ts`/`soil-test-validity.ts` situation — see that module's
 * own doc comment for the full precedent this one follows). This module
 * only ever *imports* `checkClosedPeriodCalendar` from
 * `closed-period-calendar.ts`, unmodified — that frozen file gained no
 * new export or changed signature because of this.
 *
 * **Calendar-only by design, not by omission — the real journey that
 * led here across eleven Codex audit rounds** (the full, honest account;
 * nothing below is smoothed over):
 *
 * 1. (`audit-logs/20260829T135101Z.md`, HIGH) `checkClosedPeriodCalendar`
 *    only ever reads `input.date.slice(5, 10)`; it never validates that
 *    `date` is a real, syntactically-and-calendrically-valid ISO date. A
 *    malformed or calendar-invalid value (e.g. `"2026-02-30"`, which
 *    JavaScript's `Date` parser silently rolls over to 2 March rather
 *    than rejecting) could reach the frozen calendar unchecked and
 *    produce a confident, real compliance Prompt from corrupt input.
 *    `checkSpreadingWindowGate` (below) validates `date` first, failing
 *    closed (`UNKNOWN_BLOCK`) for anything that isn't a real calendar
 *    date. This part of the fix has stood unchanged since round 1.
 * 2. This module originally also composed `spreading-legal-gate.ts`'s
 *    `checkSpreadingLegalGate` — the frozen gate that layers five real,
 *    named statutory ground/weather hard stops (`SPREAD_STOP_FLOOD`
 *    etc.) on top of the calendar, when a caller supplies already-
 *    assessed ground-condition booleans. Four further real Codex audit
 *    rounds progressively found that composition unsafe to expose from
 *    this Prompt producer, for reasons that kept sharpening rather than
 *    repeating:
 *    - (`audit-logs/20260829T141429Z.md`, HIGH) An absent/partial
 *      `ground` still produced the fuller gate's literal `"PERMITTED"`
 *      value, since every condition a caller doesn't supply is treated
 *      as `false`. First fix: only trust `"PERMITTED"` for a *complete*
 *      assessment.
 *    - (`audit-logs/20260829T142100Z.md`, HIGH) Correctly rejected: even
 *      a complete assessment carries no observation timestamp or
 *      source, so a "clear this morning" reading is indistinguishable,
 *      once passed in, from one from three days ago. Real fix at the
 *      time: never surface `"PERMITTED"` at all — always fall back to
 *      the calendar's own `"BASELINE_OPEN"`.
 *    - (`audit-logs/20260829T143333Z.md`, HIGH, the round that actually
 *      settled it) Pressed further, and correctly: the *negative* claim
 *      (a real ground/weather `LEGAL_PROHIBITION`) has exactly the same
 *      provenance gap as the positive one — "bare ground-condition
 *      booleans can produce a real `LEGAL_PROHIBITION` compliance
 *      Prompt without an observation timestamp, source, or provenance
 *      ... otherwise the ground-dependent result must fail closed."
 *      Checked structurally, not just argued: `SpreadingGroundConditions`
 *      (`spreading-legal-gate.ts`'s own type) has no timestamp/source
 *      field of any kind — unlike `SoilTest` (`types.ts`), which
 *      *does* carry its own `sampleDate` as part of the type itself,
 *      this is a real, structural absence in the frozen type this
 *      vertical cannot add to unilaterally (that would be a breaking
 *      `DOMAIN_CONTRACTS.md` change to `spreading-legal-gate.ts`, the
 *      exact escalation boundary this checkpoint already respects
 *      elsewhere). And, checked empirically
 *      (`grep -rn "checkSpreadingLegalGate" src`): no other real call
 *      site anywhere in this app (`real-alerts.ts`,
 *      `spreading/page.tsx`) ever supplies `ground` at all — both
 *      already only ever call `checkClosedPeriodCalendar` directly, the
 *      one real, already-live pattern for this exact situation. Ground
 *      support was removed from this module entirely, not patched a
 *      fifth time: `checkSpreadingWindowGate` now only ever validates
 *      the date and delegates to the calendar, matching the app's own
 *      only real precedent exactly. `checkSpreadingLegalGate` is no
 *      longer imported here at all — real ground/weather compliance
 *      support (`SPREAD_STOP_FLOOD` etc.) stays a real, tested, frozen
 *      capability for whichever future work adds the real timestamp/
 *      source provenance model `SpreadingGroundConditions` itself would
 *      need first, not invented here without it.
 * 3. **The closed-period calendar's own unbounded-year exposure — built,
 *    audited, narrowed, and finally reverted, a real self-correction
 *    across four rounds, not a single clean fix.**
 *    `checkClosedPeriodCalendar` (frozen) applies `closed_periods_
 *    2026.csv`'s table to *any* year indefinitely, since it compares
 *    only the mm-dd portion of `date`.
 *    - (`audit-logs/20260829T140705Z.md`, HIGH) First raised. Answered
 *      with a documented `BLOCKERS.md` deferral: no sourced "valid
 *      through" year exists, and this vertical has no authority to
 *      change the frozen calendar file itself.
 *    - (`audit-logs/20260829T144928Z.md`, HIGH) Correctly rejected that
 *      deferral outright: "Documenting the limitation in `BLOCKERS.md`
 *      does not make the result fail closed." This prompted a real
 *      attempt at a fix rather than a restated defence: `source-
 *      register.ts`'s own real `checkedDate` for `LAW_IE_SI_588_2025`
 *      (`2026-08-26`) was used to derive a valid year range (the checked
 *      year, plus the immediately following year in full, reasoning
 *      that closed periods wrap across the calendar year).
 *    - (`audit-logs/20260829T145652Z.md`, HIGH) Correctly narrowed that
 *      first attempt: accepting the *whole* following year would have
 *      silently accepted a brand-new, never-verified autumn cycle in
 *      that year too, not just the genuine wraparound tail. Fixed by
 *      deriving the real latest `closedThroughMmDd` across every zone/
 *      material row from the frozen table itself, bounding the
 *      following-year acceptance to that real date.
 *    - (`audit-logs/20260829T150329Z.md`, two real HIGHs, the round that
 *      actually settled it) Two further, real, structural problems with
 *      even that narrowed fix, neither fixable by narrowing further:
 *      (a) the boundary used the *global* latest `closedThroughMmDd`
 *      across every zone/material row, not the *specific* row the
 *      query's own county/material actually resolve to — a real,
 *      demonstrable bug (Cork organic fertiliser on `2027-02-14` would
 *      have incorrectly passed the guard, since Zone C chemical
 *      fertiliser's later end date leaked into a query for a different
 *      zone/material combination whose own real wrapped period ends far
 *      earlier); and (b), the deeper, decisive point: `source-
 *      register.ts`'s `checkedDate` is bibliographic "statute last
 *      verified current" metadata — it says nothing at all about which
 *      calendar year(s) the *specific extracted table*
 *      `closed_periods_2026.csv` represents applies to. If the statute
 *      were re-verified in 2027 without the underlying table itself
 *      being re-extracted, this construction would have silently shifted
 *      real compliance answers into 2027/2028 on the strength of a
 *      timestamp that measures something else entirely. On reflection,
 *      this second point is fatal to the whole approach, not just this
 *      version of it: this codebase's own repeated framing elsewhere
 *      (`real-alerts.ts`, `spreading/page.tsx`, this module's own earlier
 *      `BLOCKERS.md` entries) is that NAP closed periods are, by the
 *      statute's own design, a *recurring annual mm-dd pattern* — not a
 *      year-specific one-off table that expires. If that's true (and
 *      nothing in this codebase's own evidence disputes it), there is no
 *      real "year of applicability" to derive from any available source
 *      at all, and inventing an inference that one exists — even one
 *      built entirely from real, already-recorded fields, as both
 *      attempts here were — is itself exactly the kind of invented
 *      regulatory boundary `CLAUDE.md`'s "never invent a production
 *      regulatory number" rule exists to prevent, just one level more
 *      subtle than inventing a raw cutoff number directly. **Reverted,
 *      this time for good**: `checkSpreadingWindowGate` validates only
 *      that `date` is a real calendar date (point 1, above) and
 *      delegates every real classification decision to the frozen
 *      `checkClosedPeriodCalendar` unmodified, exactly as it did before
 *      any of this year-range work began. `source-register.ts` is no
 *      longer imported here. `CLOSED_PERIOD_BY_ZONE_MATERIAL` is no
 *      longer imported here. This is the same real, evidenced,
 *      already-live gap `real-alerts.ts`/`spreading/page.tsx` already
 *      carry — not a defect this module introduces, and not one this
 *      module can honestly close alone. See `BLOCKERS.md` for the
 *      complete, final account of why this genuinely needs a real,
 *      sourced revalidation-cadence design (the statute's own periodic
 *      re-confirmation process, tracked as real, dated evidence, not
 *      inferred from a field that measures something else) before any
 *      further attempt, and why that design is outside this vertical's
 *      own scope and evidence to construct alone.
 */
import { blockedInsufficientEvidence, type EngineOutcome } from "./evidence";
import { checkClosedPeriodCalendar, type SpreadingMaterial } from "./closed-period-calendar";

export const SPREADING_WINDOW_GATE_VERSION = "spreading_window_gate_v2.0.0";

export interface SpreadingWindowGateInput {
  county: string;
  /** ISO date (YYYY-MM-DD). Validated as a real calendar date by this
   * function before ever reaching `checkClosedPeriodCalendar` — see this
   * module's own header. */
  date: string;
  material: SpreadingMaterial;
}

/** Real, strict ISO calendar-date validation — identical in shape (and
 * purpose) to `field-soil-test-age.ts`'s own private `isValidIsoDate`:
 * `YYYY-MM-DD` syntax *and* a real calendar date, rejecting `Date`'s own
 * silent day/month rollover. Not exported — this module's own one real
 * caller applies it to the one date `checkClosedPeriodCalendar` reads.
 * Duplicating this ten-line, generic, non-scientific check (rather than
 * importing it from `field-soil-test-age.ts`, which doesn't export it)
 * is not the "duplicated domain calculation" `DOMAIN_CONTRACTS.md`
 * guards against — no scientific/regulatory rule is reimplemented here. */
function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.toISOString().slice(0, 10) === iso;
}

/**
 * `GFT057`-`GFT080`, date-validated. Every real classification decision
 * comes entirely from the frozen `checkClosedPeriodCalendar`, unmodified
 * — this function decides only one thing of its own: whether `date` is a
 * real calendar date. See this module's own header for why it does not
 * also compose `checkSpreadingLegalGate`'s ground/weather stops, and for
 * the real, reverted attempt at a year-range guard (point 3) — the
 * closed-period calendar's own unbounded-year exposure is a real,
 * deliberately deferred gap, documented in `BLOCKERS.md`, not silently
 * dropped.
 */
export function checkSpreadingWindowGate(input: SpreadingWindowGateInput): EngineOutcome<"BASELINE_OPEN"> {
  if (!isValidIsoDate(input.date)) {
    return blockedInsufficientEvidence("UNKNOWN_BLOCK", ["date"]);
  }
  return checkClosedPeriodCalendar({ county: input.county, date: input.date, material: input.material });
}
