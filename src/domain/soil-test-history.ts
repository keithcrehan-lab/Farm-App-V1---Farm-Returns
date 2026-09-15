/**
 * Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding F4;
 * Codex audit round 1 HIGH) — chronological ordering for a field's real
 * `SoilTest` history chain (`SoilTest.previous`).
 *
 * The first version of "allow a new dated lab result on an
 * already-tested field" (`addSoilTestToField` / `farm-store.tsx`'s mock
 * `addSoilTest`) made every newly-ENTERED record the active one, with no
 * check against the currently-active test's own `sampleDate`. That is
 * correct for the common case (a genuinely new, later result) but wrong
 * for a real, disclosed farm workflow this app must support: a farmer or
 * lab backfilling an OLDER result that simply arrived late (post, a
 * delayed report, correcting a typo'd date). Backfilling an older result
 * silently demoted the genuinely newer, already-active test into
 * history and made every P/K-Index, lime, validity, and evidence-report
 * calculation use the stale older evidence instead — a real regression
 * a Codex audit caught.
 *
 * This module is the one place that decides where a real, newly-entered
 * `SoilTest` belongs in the chain, purely by comparing real
 * `sampleDate`s — never by entry order. Both real (`src/lib/farm-data/
 * soil.ts`) and mock-mode (`src/store/farm-store.tsx`) callers use this
 * same function so they can never diverge on the rule.
 *
 * Codex audit round 2 HIGH x2, both fixed here:
 * - A retried submission of the exact same real result (e.g.
 *   `recordLabResultForCompositeSample`'s own documented resumable-retry
 *   design, `orchestration/lab-result/index.ts`) used to insert another,
 *   duplicate history node every time, because an equal `sampleDate`
 *   alone was enough to make `input` "become active" — this module now
 *   recognises an identical resubmission and treats it as a genuine
 *   no-op, never growing the chain. Codex audit round 3 HIGH: the first
 *   version of this fix only checked `input` against the active head
 *   (`current`) — a retry of an OLDER backfilled submission already
 *   sitting somewhere in `previous` still inserted a second duplicate
 *   node, because `insertIntoHistory` itself never checked for one. The
 *   idempotency check now scans the ENTIRE real chain (`findSameSubmission`),
 *   not just the head, before ever inserting anything.
 * - An unparseable `sampleDate` used to be silently promoted to active
 *   evidence (the "can't compare safely, so assume newest" fallback) —
 *   but the public server action (`app/actions/farm.ts`'s
 *   `addSoilTestAction`) passes client input straight through with no
 *   server-side date validation, so a forged/non-UI request could have
 *   replaced a field's genuinely current fertility evidence with an
 *   unorderable record. `input.sampleDate` is now validated as a real
 *   calendar date up front and rejected (thrown) otherwise — the one
 *   real boundary both callers share, matching this app's own
 *   established `field-soil-test-age.ts`/`spreading-window-gate.ts`
 *   convention of a real calendar-date check, not merely `new Date(...)`
 *   not throwing (see `iso-datetime.ts`'s own doc comment on why that's
 *   insufficient).
 */
import type { SoilTest } from "./types";

export type NewSoilTestInput = Omit<SoilTest, "reportFileUrl" | "previous">;

export interface SoilTestChainResult {
  /** The real chain's new head — always the genuinely newest-dated real
   * test on file, regardless of the order tests were entered in. */
  head: SoilTest;
  /** True only when `input` itself is now the active/head test (a
   * genuinely later-or-equal-dated real result). False when `input` was
   * either inserted into history because a genuinely later-dated real
   * test was already on file, or was an identical resubmission of the
   * already-active test (a no-op) — callers must not treat `input` as
   * the field's new active fertility evidence in either case. */
  inputBecameActive: boolean;
}

/** Same real check `field-soil-test-age.ts`'s own private
 * `isValidIsoDate` already uses (duplicated per that module's own
 * documented precedent — a ten-line, generic, non-scientific syntax
 * check is not the "duplicated domain calculation" `DOMAIN_CONTRACTS.md`
 * guards against): `YYYY-MM-DD` syntax *and* a real calendar date,
 * rejecting `Date`'s own silent day/month rollover
 * (`new Date("2026-02-30")` quietly normalises to 2 March rather than
 * throwing). */
function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === iso;
}

function sampleDateMs(test: Pick<SoilTest, "sampleDate">): number {
  return new Date(test.sampleDate).getTime();
}

/** True when `input` is a real resubmission of the exact same evidence
 * `current` already represents — never a genuinely new/different test
 * that merely happens to share a `sampleDate`. A real `labResultId`
 * (guided-sampling path) is authoritative on its own, the same real id
 * `recordLabResultForCompositeSample`'s own retry passes unchanged every
 * time; the legacy/manual path has no such id, so every other real field
 * is compared instead. */
function isSameSubmission(current: SoilTest, input: NewSoilTestInput): boolean {
  if (current.labResultId !== undefined || input.labResultId !== undefined) {
    return current.labResultId === input.labResultId;
  }
  return (
    current.sampleDate === input.sampleDate &&
    current.laboratory === input.laboratory &&
    current.sampleRef === input.sampleRef &&
    current.p === input.p &&
    current.k === input.k &&
    current.pH === input.pH &&
    (current.limeRequirement ?? null) === (input.limeRequirement ?? null) &&
    (current.mg ?? null) === (input.mg ?? null) &&
    (current.organicMatterPct ?? null) === (input.organicMatterPct ?? null) &&
    (current.compositeSampleId ?? null) === (input.compositeSampleId ?? null)
  );
}

/** True when `input` is a real resubmission of ANY node already in this
 * chain (the active head or anywhere in its real `previous` history) —
 * Codex audit round 3 HIGH: idempotency must not be checked only against
 * the active head, or a retried submission of an already-inserted OLDER
 * backfilled result would still insert a second duplicate node. */
function findSameSubmission(node: SoilTest | undefined, input: NewSoilTestInput): boolean {
  for (let t = node; t; t = t.previous) {
    if (isSameSubmission(t, input)) return true;
  }
  return false;
}

function insertIntoHistory(node: SoilTest, input: NewSoilTestInput, inputMs: number): SoilTest {
  if (!node.previous) {
    // Oldest real test seen so far in this chain — input belongs after it.
    return { ...node, previous: { ...input } };
  }
  const previousMs = sampleDateMs(node.previous);
  if (!Number.isFinite(previousMs) || previousMs <= inputMs) {
    // input sits between `node` and `node.previous` in real date order.
    return { ...node, previous: { ...input, previous: node.previous } };
  }
  return { ...node, previous: insertIntoHistory(node.previous, input, inputMs) };
}

/**
 * Resolves where a newly-entered real `SoilTest` (`input`) belongs
 * relative to the field's current chain (`current`, the presently-active
 * test if one exists). Compares real `sampleDate`s, never entry order.
 *
 * Fails closed (throws) for a real calendar-invalid `input.sampleDate` —
 * see this module's own header for why silently promoting one to active
 * evidence is unsafe. Every real UI caller only ever supplies a value a
 * validated `<input type="date">` already produced, so this should never
 * actually throw in practice; it exists for the one real boundary
 * (`addSoilTestAction`) that trusts caller input without re-validating.
 */
export function resolveSoilTestChain(current: SoilTest | undefined, input: NewSoilTestInput): SoilTestChainResult {
  if (!isValidIsoDate(input.sampleDate)) {
    throw new Error(`resolveSoilTestChain: input.sampleDate "${input.sampleDate}" is not a real calendar date (YYYY-MM-DD) — rejected, never silently applied.`);
  }

  if (!current) return { head: { ...input }, inputBecameActive: true };

  if (findSameSubmission(current, input)) {
    // A real retried/re-confirmed identical submission — anywhere in the
    // real chain, not just the active head — is a genuine no-op, never a
    // duplicate history node.
    return { head: current, inputBecameActive: false };
  }

  const inputMs = sampleDateMs(input);
  const currentMs = sampleDateMs(current);

  // `current.sampleDate` was itself validated by this same function at
  // insertion time, so it should always be finite here — this guard is
  // defence in depth for a pre-existing/imported row only, never the
  // expected path. Treating it as "can't trust the existing active
  // date, so the freshly-validated `input` takes over" avoids an
  // unorderable historical node permanently blocking every future real
  // submission.
  if (!Number.isFinite(currentMs) || inputMs >= currentMs) {
    return { head: { ...input, previous: current }, inputBecameActive: true };
  }

  return { head: insertIntoHistory(current, input, inputMs), inputBecameActive: false };
}
