/**
 * Farm Return Next Checkpoint 2, Vertical B — real, ISO-shape-validated-
 * style entry point for the local water-buffer override layer (AF010,
 * `GFT089`-`GFT090`), added for
 * `src/orchestration/prompt/local-buffer-override.ts` following the same
 * precedent `field-soil-test-age.ts`/`spreading-window-gate.ts` already
 * established: a genuinely new `src/domain/` module (per
 * `DOMAIN_CONTRACTS.md`'s "New contracts this build programme adds"
 * section), not a change to the frozen `buffer-gate.ts` itself.
 *
 * Deliberately its own file, not a change to `buffer-gate.ts`'s
 * `checkLocalBufferOverride` — a frozen `DOMAIN_CONTRACTS.md` contract
 * this vertical is not authorised to modify unilaterally (`AGENTS.md`'s
 * "Parallel/worktree work" section). This module only ever *imports*
 * `checkLocalBufferOverride`, unmodified — that frozen file gained no new
 * export or changed signature because of this.
 *
 * **Why this module exists — a real Codex audit finding, not invented
 * ahead of one.** `promptForLocalBufferOverride`'s own first version
 * called `checkLocalBufferOverride` directly with
 * `actualDistanceM: field.waterBufferContext?.value.distanceM ?? 0` —
 * copied from `nutrients.ts:1175`'s own real call site. A first Codex
 * audit round (`docs/farm-return-next/audit-logs/20260901T102220Z.md`,
 * CRITICAL) correctly rejected that default: when
 * `localOverrideStatus` is `"authoritative_rule"` and the real distance
 * was never measured, `0` would reach `checkLocalBufferOverride`'s own
 * distance comparison and produce a real `LEGAL_PROHIBITION` whose own
 * consequence text asserted "...exceeds the actual distance of 0m" — a
 * fabricated number reaching a real Prompt.
 *
 * The first fix moved the missing-distance guard into the orchestration
 * layer directly (an inline `if` in `local-buffer-override.ts` before
 * ever calling `checkLocalBufferOverride`). A second Codex audit round
 * (`docs/farm-return-next/audit-logs/20260901T103024Z.md`, HIGH)
 * correctly rejected *that* too: deciding which `EngineOutcome` arm
 * applies (and which reason code names it) is real fail-closed
 * classification logic — `AGENTS.md`/`SCIENTIFIC_RULES.md`'s "scientific/
 * regulatory calculations and `EngineOutcome` classification originate in
 * `src/domain/`" rule applies to this decision exactly as much as it does
 * to `checkLocalBufferOverride`'s own existing missing-`localOverrideDistanceM`
 * guard, which already lives inside `buffer-gate.ts` for the identical
 * reason. This module is that fix, moved to the right layer.
 *
 * **The real, honest divergence from `nutrients.ts` that remains, not
 * silently dropped.** `calculateNutrientPlan`'s own real call site
 * (`nutrients.ts:1175`) still uses the `?? 0` default this audit rejected
 * — this module does not, and cannot, change that (a frozen V1
 * calculation, out of this vertical's authority to modify unilaterally).
 * This means a field with an `"authoritative_rule"` local override and no
 * recorded actual distance genuinely produces two different real answers
 * today: `calculateNutrientPlan` silently suppresses the chemical-
 * fertiliser recommendation via a fabricated `0m` `LEGAL_PROHIBITION`,
 * while this module (and the Prompt built on it) honestly reports
 * `BLOCKED_INSUFFICIENT_EVIDENCE`. This is the same "latent, not live"
 * shape `field-soil-test-age.ts`/`checkFieldSoilTestAgeValidity`'s own
 * documented divergence from `calculateNutrientPlan` already established
 * for an analogous situation (see that module's own doc comment and
 * `BLOCKERS.md`'s matching "FINAL POSITION" entry) — genuinely fixing
 * `nutrients.ts`'s own default is real, in-scope future work for whoever
 * has standing to change that frozen calculation, not invented or routed
 * around here.
 */
import { blockedInsufficientEvidence, type EngineOutcome } from "./evidence";
import { checkLocalBufferOverride } from "./buffer-gate";

export const LOCAL_BUFFER_OVERRIDE_GATE_VERSION = "local_buffer_override_gate_v1.0.0";

export interface LocalBufferOverrideEvidence {
  /** `undefined` when the field's actual distance to the relevant water
   * feature has never been measured/recorded — genuinely distinct from
   * `0`, and never coerced to it by this module except in the one case
   * proven inert below. */
  actualDistanceM: number | undefined;
  /** Resolved via `input-gates.ts`'s `resolveLocalWaterBufferOverrideStatus`. */
  localOverrideStatus: EngineOutcome<"authoritative_rule" | "verified_none" | "unknown">;
  localOverrideDistanceM: number | undefined;
}

/**
 * `GFT089`/`GFT090`, missing-actual-distance-validated. Every real
 * classification decision for a *known* local-override status comes
 * entirely from the frozen `checkLocalBufferOverride`, unmodified — this
 * function decides only one thing of its own: whether the actual
 * distance is genuinely needed and genuinely missing.
 *
 * `actualDistanceM ?? 0` below is real, but provably inert where it's
 * reached: `checkLocalBufferOverride`'s own logic (`buffer-gate.ts`)
 * only ever reads `actualDistanceM` inside its `"authoritative_rule"`
 * branch, after its own `localOverrideDistanceM` guard — the branch
 * above already returns `BLOCKED_INSUFFICIENT_EVIDENCE` for exactly the
 * one case (`"authoritative_rule"` + missing `actualDistanceM`) where
 * that value would otherwise reach a real conclusion. For
 * `"verified_none"`/`"unknown"` (both early returns in
 * `checkLocalBufferOverride` before its distance comparison) and for
 * `"authoritative_rule"` with a real `actualDistanceM` already present,
 * the placeholder is either never read or never used — tested directly
 * in this module's own colocated test file, not merely asserted.
 */
export function checkLocalBufferOverrideWithEvidence(evidence: LocalBufferOverrideEvidence): EngineOutcome<"NATIONAL_BASELINE_APPLIES"> {
  // The `localOverrideDistanceM !== undefined` guard matters: when
  // *both* the override distance and the actual distance are missing,
  // `checkLocalBufferOverride`'s own pre-existing guard (missing
  // `localOverrideDistanceM`, reason code `LOCAL_BUFFER_STATUS_UNKNOWN`)
  // is the real, already-established answer — this module's own new
  // guard only adds a distinct reason for the one case that guard
  // doesn't cover (the override distance IS known, only the field's own
  // measured distance isn't), never pre-empting it.
  if (
    evidence.localOverrideStatus.status === "OK" &&
    evidence.localOverrideStatus.value === "authoritative_rule" &&
    evidence.localOverrideDistanceM !== undefined &&
    evidence.actualDistanceM === undefined
  ) {
    return blockedInsufficientEvidence("MISSING_LOCAL_BUFFER_ACTUAL_DISTANCE", ["actualDistanceM"]);
  }
  return checkLocalBufferOverride({
    actualDistanceM: evidence.actualDistanceM ?? 0,
    localOverrideStatus: evidence.localOverrideStatus,
    localOverrideDistanceM: evidence.localOverrideDistanceM,
  });
}
