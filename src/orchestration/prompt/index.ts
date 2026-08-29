/**
 * Prompt stage — `SCIENTIFIC_RULES.md`'s Prompt-stage boundary: "A Prompt
 * is a presentation of an Estimate the domain layer already computed — it
 * must never contain a number the Estimate stage didn't produce." Where
 * the underlying Estimate is blocked (`DOMAIN_CONTRACTS.md`'s
 * `EngineOutcome<T>` fail-closed pattern), the Prompt says so honestly
 * rather than falling back to a plausible-sounding suggestion.
 *
 * `basis` is typed as `EngineOutcome<unknown>` deliberately — this module
 * is generic over whatever `src/domain/*.ts` Estimate function produced it
 * (`nutrients.ts`'s `NutrientPlan`, `spreading.ts`'s `SpreadingFieldScore`,
 * ...); it must never itself recompute a figure the caller's Estimate
 * already produced or blocked.
 */
import type { EngineOutcome, EvidenceState } from "@/domain/evidence";
import type { RegulatoryStatus } from "@/domain/types";

export interface Prompt extends RegulatoryStatus {
  id: string;
  farmId: string;
  /** e.g. "spreading_window", "soil_test_age" — free-form today, the same
   * "reviewed starter registry, not a closed enum" shape `evidence.ts`'s
   * `ReasonCode` uses, until enough real Prompt kinds exist to warrant a
   * closed union. */
  kind: string;
  title: string;
  description: string;
  /** The Estimate this Prompt presents — `status: "OK"` or one of the
   * fail-closed arms. A Prompt built from a non-OK Estimate must say so in
   * `description` (see `describeBlockedBasis` below) rather than presenting
   * a plausible-sounding suggestion. */
  basis: EngineOutcome<unknown>;
  /** Absent for a Prompt not scoped to one field (not every Prompt kind is
   * field-level). Present and real for a field-scoped Prompt (e.g.
   * `soil_test_age`) — added Checkpoint 2, Vertical B, in response to a
   * real Codex audit HIGH (`audit-logs/20260829T085255Z.md`): the first
   * version of `promptForSoilTestAge` computed `title`/`description` from
   * a field name but never carried any field identifier onto the `Prompt`
   * itself, so the object returned to a caller (and, later, whatever
   * Decision/trace is built from it) had no way to say which field's
   * evidence it actually was — `SCIENTIFIC_RULES.md`'s "a Prompt's own
   * trace... must be inspectable" requires this be a real, inspectable
   * field, not just baked into freeform `title`/`description` prose. Not
   * itself a same-farm ownership *proof* — see `buildPrompt`'s doc comment
   * on `fieldId` for what still isn't verified here. */
  fieldId?: string;
  /** The real, exported version constant of the `src/domain/*.ts` module
   * that computed `basis` (e.g. `SOIL_TEST_VALIDITY_VERSION`) — absent
   * when a producer doesn't supply one. Added alongside `fieldId`
   * (Checkpoint 2, Vertical B, Codex audit HIGH,
   * `audit-logs/20260829T090928Z.md`) as a partial answer to that
   * finding's "Prompt's trace loses which calculation version produced
   * it" — the same "container carries its own calculationVersion" shape
   * `NutrientPlan.calculationVersion` already established. See
   * `inputsSnapshot` below for the Estimate's raw inputs. */
  calculationVersion?: string;
  /** A real snapshot of the raw inputs the producer fed to the domain
   * function that computed `basis`, taken at the moment this `Prompt` was
   * built — not derivable from `basis` alone (which carries only the
   * final classified value/reason), and not safely re-derivable later
   * from a live `Field` lookup, since a field's own data can change after
   * this `Prompt` was built (`Decision`s persist; `Field`s don't freeze).
   * Absent for a producer that doesn't supply one — a plain data bag, the
   * same "producer-specific, generic shape" `basis`'s own
   * `EngineOutcome<unknown>` already is.
   *
   * Added Checkpoint 2, Vertical B, after four real Codex audit rounds
   * (`audit-logs/20260829T090928Z.md` through `20260829T094314Z.md`)
   * kept correctly rejecting "the bare `EngineOutcome` plus `fieldId`/
   * `calculationVersion` is enough" as insufficient for
   * `SCIENTIFIC_RULES.md`'s "which Estimate, which evidence, which legal
   * check" requirement — the `NutrientPlan`-parity argument this
   * checkpoint's earlier rounds made was a real, honest comparison, but
   * "an existing precedent has the same weakness" doesn't answer "is the
   * weakness itself acceptable," which is the actual question
   * `SCIENTIFIC_RULES.md` asks. This field is the real fix, not another
   * round of the same argument: a producer that wants its Prompt's trace
   * to survive past a mutable `Field` changing populates this with
   * whatever raw values it read (`promptForSoilTestAge`'s own doc comment
   * shows the concrete shape it uses). */
  inputsSnapshot?: Record<string, unknown>;
  /** ISO datetime. */
  createdAt: string;
}

/**
 * Turns a blocked/ambiguous/not-applicable/prohibited/unknown Estimate
 * outcome into honest Prompt copy — the only sanctioned way to describe a
 * non-OK `EngineOutcome` in a Prompt, so a caller can't hand-write a
 * softer-sounding message that hides the real reason
 * (`SCIENTIFIC_RULES.md`'s "never falls back to a plausible-sounding
 * suggestion" rule).
 */
export function describeBlockedBasis(basis: Exclude<EngineOutcome<unknown>, { status: "OK" }>): string {
  switch (basis.status) {
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return `Not enough evidence yet (${basis.reasonCode}) — missing: ${basis.missingInputs.join(", ")}.`;
    case "AMBIGUOUS":
      return `Unresolved: ${basis.detail}`;
    case "NOT_APPLICABLE":
      return `Not applicable here (${basis.reasonCode}).`;
    case "LEGAL_PROHIBITION":
      return `Not permitted: ${basis.consequence}`;
    case "UNKNOWN":
      return `Status unknown (${basis.reasonCode}).`;
  }
}

/**
 * The sanctioned smart constructor for a real `Prompt`. Closes
 * `docs/farm-return-next/BLOCKERS.md`'s "Prompt's blocked-description
 * isn't yet structurally enforced" finding (originally Codex audit
 * Medium, `audit-logs/20260829T002345Z.md`) for every caller that
 * constructs its `Prompt` through this function — not an unconditional,
 * type-level guarantee for any hypothetical caller (see the note at the
 * end of this comment on why an object-literal bypass is still possible,
 * flagged accurately rather than overclaimed after a real Codex audit
 * finding, MEDIUM, `audit-logs/20260829T085255Z.md`, on this comment's
 * first, overclaiming wording).
 *
 * Decision (Checkpoint 2, Vertical B): a caller supplies `describeOk` (the
 * only place kind-specific domain knowledge belongs — what "VALID" vs.
 * "INDEX4_PERSISTED" *means* for a soil test, say, is not something a
 * generic helper could know) and `titleWhenBlocked` (a short, honest
 * headline that names no specific fact the Estimate didn't establish —
 * "Soil test status needs review", never "Soil test failed" or similar).
 * `description` for every non-OK arm is always exactly
 * `describeBlockedBasis(basis)` — computed inside this function, not
 * accepted as a parameter, so a caller going through `buildPrompt` has no
 * code path to hand-write a softer or mismatched blocked-description.
 * This is stronger than "a strong test" for that caller: a future Prompt
 * kind built through `buildPrompt` gets the guarantee automatically, with
 * no per-kind test required to catch a regression (though
 * `promptForSoilTestAge`'s own tests still assert it, as belt-and-braces,
 * the same way `decideAsFarmer`'s tests assert `decide/index.ts`'s own
 * invariant even though the throw already enforces it).
 *
 * A kind-specific producer that bypassed `buildPrompt` and constructed a
 * `Prompt` object literal directly could still hand-write a mismatched
 * description — this guarantee only holds for callers that go through
 * this constructor. Making it airtight for every caller would mean
 * removing `description` from the `Prompt` interface's public shape
 * entirely (e.g. a private/branded field only `buildPrompt` can set),
 * which is a bigger interface change than this slice's scope and would
 * need its own review given `Prompt` is a Checkpoint 1 contract other
 * verticals may already be reading. Recorded here rather than silently
 * assumed airtight.
 */
export function buildPrompt<T>(params: {
  id: string;
  farmId: string;
  kind: string;
  basis: EngineOutcome<T>;
  createdAt: string;
  regulatory?: RegulatoryStatus["regulatory"];
  /** See `Prompt.fieldId`'s own doc comment. Carried through verbatim —
   * `buildPrompt` does not verify it belongs to `farmId`; that binding is
   * the caller's responsibility, the same trust boundary
   * `decideAsFarmer`/`actRecordWeightObservation` already place on their
   * own callers (a real same-farm ownership *proof* needs a DB-backed
   * check, which a pure orchestration function has no way to perform, and
   * which `BLOCKERS.md`'s `jobs.target_type` entry already deferred for
   * the same reason: a real, agreed target-entity design, not invented
   * ad hoc here). `promptForSoilTestAge` closes the *caller-side* half of
   * this gap by deriving both `fieldId`/`farmId` and the calculation's raw
   * evidence from the one real `Field` record it accepts — so within this
   * checkpoint's actual call site, `fieldId`/`farmId` and the evidence
   * they're attached to cannot be mismatched by accident. */
  fieldId?: string;
  /** See `Prompt.calculationVersion`'s own doc comment. Carried through
   * verbatim, same as `fieldId`. */
  calculationVersion?: string;
  /** See `Prompt.inputsSnapshot`'s own doc comment. Carried through
   * verbatim, same as `fieldId`/`calculationVersion` — `buildPrompt` does
   * not inspect or validate its shape (each Prompt kind's own raw inputs
   * differ). */
  inputsSnapshot?: Record<string, unknown>;
  /** Shown when `basis.status !== "OK"` — must not state a fact the
   * Estimate didn't establish; the real reason always comes from
   * `describeBlockedBasis` in `description`, not from this string. */
  titleWhenBlocked: string;
  /** Only called when `basis.status === "OK"` — the one place a caller
   * supplies real, kind-specific copy for what the Estimate's value
   * means. */
  describeOk: (value: T, evidenceState: EvidenceState) => { title: string; description: string };
}): Prompt {
  const shared = {
    id: params.id,
    farmId: params.farmId,
    kind: params.kind,
    // Codex audit HIGH (audit-logs/20260829T104708Z.md): a shared
    // reference to the caller's own `basis` object would let it be
    // mutated after this Prompt is built, silently rewriting the
    // Prompt's own calculation result while `inputsSnapshot` (already
    // cloned, below) stayed frozen at the real calculation-time values —
    // an internal inconsistency between a Prompt's own two trace fields.
    // Deep-cloned for the same reason `decideAsFarmer` already clones
    // `prompt.basis` into `estimateSnapshot`, just one stage earlier.
    basis: structuredClone(params.basis),
    fieldId: params.fieldId,
    calculationVersion: params.calculationVersion,
    // Codex audit HIGH (audit-logs/20260829T095253Z.md): a shared object
    // reference here would let a caller mutate `inputsSnapshot` after
    // building the Prompt, silently rewriting its own calculation-time
    // trace (and whatever Decision was already cloned from it, since
    // `decideAsFarmer`'s clone only protects against mutation *after*
    // decision time, not before). Deep-cloned here, the same discipline
    // `decideAsFarmer` already applies to `estimateSnapshot`.
    inputsSnapshot: params.inputsSnapshot === undefined ? undefined : structuredClone(params.inputsSnapshot),
    createdAt: params.createdAt,
    regulatory: params.regulatory,
  };
  if (params.basis.status !== "OK") {
    return { ...shared, title: params.titleWhenBlocked, description: describeBlockedBasis(params.basis) };
  }
  const { title, description } = params.describeOk(params.basis.value, params.basis.evidenceState);
  return { ...shared, title, description };
}
