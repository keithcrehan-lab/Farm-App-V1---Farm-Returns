/**
 * Farm Return Next Checkpoint 2, Vertical B, third real Prompt producer —
 * overnight autonomous build run, Phase 3 (Phase 1 was Checkpoint 2
 * Vertical D's final security-review round; Phase 2 was this search
 * itself, surveying every unwired `src/domain/*.ts` gate for one with
 * real, already-capturable evidence before settling on this one — see
 * `IMPLEMENTATION_LOG.md`'s Phase 2 entry for the full account of why
 * `milking-platform.ts`/`soiled-water-gate.ts`/`sell-hold-economics-gate.ts`
 * were rejected as candidates: each needs a real farm-data input this app
 * has nowhere to capture yet, which would make any Prompt built on them
 * permanently, unconditionally `BLOCKED_INSUFFICIENT_EVIDENCE` for every
 * real farm — not a genuine vertical slice, closer to the "placeholder
 * functionality presented as complete" this run's own brief forbids).
 *
 * Wraps `src/domain/input-gates.ts`'s `requireCommonageStatus` — unlike
 * `promptForSoilTestAge`/`promptForSpreadingWindow`, no new `src/domain/`
 * module was needed here: `requireCommonageStatus` is already exactly the
 * right shape (one `Field`-scoped evidence gate, already tested in
 * `input-gates.test.ts`), and is already a real, live dependency of
 * `calculateNutrientPlan` (`nutrients.ts:1165`, via
 * `checkCommonageFertiliserGate(requireCommonageStatus(field),
 * "chemical_fertiliser")`) — so this Prompt presents the identical
 * evidence gate NutrientPlan's own chemical-fertiliser recommendation
 * already silently depends on, just as an active nudge instead of a
 * silent block.
 *
 * Real, present value, not speculative: `src/lib/farm-data/fields.ts`
 * (`fieldToInsertRow` — actually `fields.ts`'s own read path, see that
 * file's own default) defaults every new field's `commonageStatus` to
 * `tracked("unknown", "estimated", "Farm Return assumption")` unless a
 * farmer has explicitly set it via the real, already-shipped
 * `FieldDrawer.tsx` UI — so most real fields in this app sit at
 * `"unknown"` today, which today silently suppresses
 * `calculateNutrientPlan`'s chemical-fertiliser recommendation for that
 * field with no active prompt telling the farmer why or what to do about
 * it. This Prompt is that active nudge: `MASTER_SPEC.md`'s Observe stage
 * "ingests whatever it can see without asking" (the field's current
 * `commonageStatus`, however it resolves) and Prompt "surfaces it," per
 * the loop's own stated job — closing a real gap between what
 * `calculateNutrientPlan` already silently knows and what the farmer is
 * ever actively told.
 */
import type { EvidenceState } from "@/domain/evidence";
import { requireCommonageStatus } from "@/domain/input-gates";
import type { Field } from "@/domain/types";
import { buildPrompt, type Prompt } from "./index";

/** `Prompt.kind` for every Prompt this module produces. */
export const COMMONAGE_STATUS_PROMPT_KIND = "commonage_status";

/**
 * The one real, farm-scoped source this producer reads from — matches
 * `promptForSoilTestAge`'s own `SoilTestAgeField` precedent exactly (a
 * `Pick` of the one real `Field`, never a hand-typed id/name/status bag a
 * caller could mismatch against a different field's evidence — the same
 * anti-mixup discipline four real Codex audit rounds established for
 * that producer, applied here from the start rather than rediscovered).
 */
export type CommonageStatusField = Pick<Field, "id" | "farmId" | "name" | "commonageStatus">;

/**
 * Real, honest copy for the two arms `requireCommonageStatus` can return
 * under `status: "OK"`.
 *
 * Deliberately states only the field's own commonage classification —
 * never the downstream fertiliser-legality consequence
 * (`checkCommonageFertiliserGate`'s own `LEGAL_PROHIBITION`/`NOT_APPLICABLE`
 * result). Fixed after a real Codex audit finding (HIGH,
 * `docs/farm-return-next/audit-logs/20260831T211859Z.md`): an earlier
 * version's copy asserted "chemical fertiliser is not permitted... this
 * field's nutrient plan already reflects that" — restating
 * `checkCommonageFertiliserGate`'s own legal conclusion in prose without
 * ever calling it (a real `DOMAIN_CONTRACTS.md` duplication: if that
 * gate's rule ever changed, this copy could silently drift from it), and
 * asserting a specific claim about a live `NutrientPlan` this function
 * never computed or inspected. Whichever future work surfaces the real
 * `checkCommonageFertiliserGate` outcome to a farmer (the nutrient plan
 * screen itself already does, via `calculateNutrientPlan`) is the right
 * place for that claim, not this Prompt.
 *
 * Also branches on `evidenceState`, not just `value` — second real Codex
 * audit finding, same round: `requireCommonageStatus` can resolve `OK`
 * from an `"estimated"`/`"mapped"` (never farmer-confirmed) `TrackedValue`
 * just as much as a `"verified"`/`"farmer_adjusted"` one
 * (`evidenceStateForDirectAssertion`, `input-gates.ts`) — `IRISH_DEFAULT`
 * means Farm Return's own unconfirmed default/estimate, not a fact the
 * farmer actually asserted. An earlier version's copy said "is commonage
 * land"/"is confirmed not commonage" unconditionally, presenting an
 * unconfirmed default with the same confidence as a real farmer
 * declaration — a real provenance-fidelity loss `MEASURED`-vs-`IRISH_DEFAULT`
 * exists specifically to prevent. `MEASURED` gets a confirmed statement;
 * `IRISH_DEFAULT` gets an explicit "not yet confirmed" framing that
 * actively invites the farmer to verify it, matching this Prompt's own
 * real job (surfacing exactly this kind of unconfirmed default so it
 * stops being silently assumed).
 */
function describeCommonageStatusOk(
  value: "commonage" | "not_commonage",
  evidenceState: EvidenceState,
  fieldName: string,
): { title: string; description: string } {
  const confirmed = evidenceState === "MEASURED";
  if (value === "commonage") {
    return confirmed
      ? {
          title: `${fieldName} is commonage land`,
          description: `${fieldName} is confirmed as commonage land.`,
        }
      : {
          title: `${fieldName} may be commonage land — please confirm`,
          description: `${fieldName} is currently recorded as commonage land, but this hasn't been confirmed — it's Farm Return's own unconfirmed default/estimate, not a farmer declaration. Please confirm or correct this field's commonage status.`,
        };
  }
  return confirmed
    ? {
        title: `${fieldName} is confirmed not commonage`,
        description: `${fieldName} is confirmed as not commonage land.`,
      }
    : {
        title: `${fieldName} is recorded as not commonage — please confirm`,
        description: `${fieldName} is currently recorded as not commonage land, but this hasn't been confirmed — it's Farm Return's own unconfirmed default/estimate, not a farmer declaration. Please confirm or correct this field's commonage status.`,
      };
}

/**
 * Builds a real `Prompt` for one field's commonage status.
 * `field.commonageStatus` is passed straight to `requireCommonageStatus` —
 * this function makes no decision about which `EngineOutcome` arm
 * applies; that logic lives entirely in `src/domain/input-gates.ts`. It
 * does not call `checkCommonageFertiliserGate` and never asserts that
 * gate's own legal conclusion — see `describeCommonageStatusOk`'s own doc
 * comment for the real Codex audit finding that fix responds to.
 *
 * `calculationVersion` is deliberately omitted, not guessed: unlike
 * `nutrients.ts`/`soil-test-validity.ts`/`closed-period-calendar.ts`
 * (every domain module the two prior Prompt producers cite),
 * `input-gates.ts` exports no version constant at all — a real,
 * pre-existing gap in that frozen module this vertical has no authority
 * to add to unilaterally (`DOMAIN_CONTRACTS.md`'s contract-change
 * protocol). `Prompt.calculationVersion`'s own doc comment already
 * treats this field as optional ("absent when a producer doesn't supply
 * one") for exactly this reason — inventing a version string
 * `input-gates.ts` itself never defined would misrepresent this Prompt's
 * trace, the opposite of what that field exists to guarantee.
 *
 * `inputsSnapshot` carries the one real raw input this calculation
 * actually reads (`field.commonageStatus`, the whole `TrackedValue`, not
 * just its resolved `.value` — `status`/`source`/`asOf` are all part of
 * what "which evidence" means here) plus `rule`, a human-readable
 * citation of the statutory basis that makes this field's own commonage
 * status worth checking at all (internal trace metadata, not a claim this
 * Prompt's own visible copy makes — the citation names why the check
 * exists, not what `checkCommonageFertiliserGate` would conclude from
 * it), following `promptForSoilTestAge`'s own `inputsSnapshot` precedent.
 *
 * `regulatory: "compliance_value"` — a field's commonage classification
 * feeds a real statutory prohibition
 * (`checkCommonageFertiliserGate`/`nutrients.ts`) even though this
 * specific Prompt never computes that downstream result itself, matching
 * `promptForSoilTestAge`'s identical classification for the same reason
 * (that Prompt's own basis doesn't run the full nutrient plan either).
 *
 * For the one non-OK arm (`BLOCKED_INSUFFICIENT_EVIDENCE` — commonage
 * status absent or still `"unknown"`) — `description` comes from
 * `buildPrompt`'s own call to `describeBlockedBasis`, not from any string
 * this function supplies; see `buildPrompt`'s doc comment for why that is
 * structural, not caller-discipline.
 */
export function promptForCommonageStatus(field: CommonageStatusField, createdAt: string): Prompt {
  const basis = requireCommonageStatus(field);
  return buildPrompt({
    id: globalThis.crypto.randomUUID(),
    farmId: field.farmId,
    fieldId: field.id,
    kind: COMMONAGE_STATUS_PROMPT_KIND,
    basis,
    createdAt,
    regulatory: "compliance_value",
    inputsSnapshot: {
      commonageStatus: field.commonageStatus,
      rule: "S.I. 588/2025 commonage rules (rules_statutory/commonage_rules_2026.csv) make a field's commonage status relevant to fertiliser compliance — this Prompt only resolves the status itself (input-gates.ts's requireCommonageStatus), not the downstream fertiliser-legality result (a separate check, checkCommonageFertiliserGate/commonage-gate.ts)",
    },
    titleWhenBlocked: `Commonage status needs confirming — ${field.name}`,
    describeOk: (value, evidenceState) => describeCommonageStatusOk(value, evidenceState, field.name),
  });
}
