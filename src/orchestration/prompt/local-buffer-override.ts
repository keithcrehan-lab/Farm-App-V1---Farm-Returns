/**
 * Farm Return Next Checkpoint 2, Vertical B, fourth real Prompt producer —
 * build-priority #2 (product-owner decision, 2026-09-01). Identified as a
 * real, promising candidate in the previous overnight-run session
 * (`IMPLEMENTATION_LOG.md`'s Phase 2 entry, `buffer-gate.ts`) but deferred
 * pending closer investigation of whether it needs live proposed-
 * application context this app has nowhere to capture yet — the same
 * disqualifying reason `sell-hold-economics-gate.ts`/`milking-platform.ts`/
 * `soiled-water-gate.ts` were rejected for. Investigated further here:
 * `checkNationalBufferDistance` genuinely does (it needs `material`,
 * which material a farmer is about to spread — not a field-static fact),
 * but `checkLocalBufferOverride` does not — every real input it needs
 * (`localOverrideStatus`, `actualDistanceM`, `localOverrideDistanceM`) is
 * already captured on `Field.waterBufferContext`, the exact same real
 * data `nutrients.ts:1175` already reads for the identical composition
 * (`resolveLocalWaterBufferOverrideStatus` + `checkLocalBufferOverride`).
 * Accepted for that reason — narrower in scope than the full buffer-gate
 * candidate, but genuinely real and field-static like `commonage_status`.
 *
 * Wraps `src/domain/input-gates.ts`'s `resolveLocalWaterBufferOverrideStatus`
 * and the new `src/domain/local-buffer-override-gate.ts`'s
 * `checkLocalBufferOverrideWithEvidence` — see that module's own doc
 * comment for why a genuinely new `src/domain/` module (not a change to
 * the frozen `buffer-gate.ts`) was needed here, unlike `commonage_status`
 * (real Codex audit findings across three rounds,
 * `docs/farm-return-next/audit-logs/20260901T102220Z.md`,
 * `20260901T103024Z.md`, and `20260901T104040Z.md`, on this file's own
 * earlier versions — a fabricated `0m` distance reaching a real Prompt, a
 * fail-closed classification decision made in the orchestration layer
 * instead of `src/domain/`, and (see `describeLocalBufferOverrideOk`'s
 * own doc comment) copy that misstated the real statutory relationship
 * between a satisfied local override and the national baseline).
 *
 * Real, present value: `Field.waterBufferContext` defaults to `null`
 * for every new field (`src/lib/farm-data/fields.ts`'s own
 * `fieldToInsertRow`) unless a farmer explicitly sets it — so most real
 * fields in this app sit at "never assessed" today, which today silently
 * suppresses `calculateNutrientPlan`'s chemical-fertiliser recommendation
 * for that field (via `nationalBufferDistanceStatus`'s own
 * `BLOCKED_INSUFFICIENT_EVIDENCE` arm) with no active prompt telling the
 * farmer why — the identical real gap `commonage_status` closed for the
 * commonage input, now closed for this one.
 */
import { checkLocalBufferOverrideWithEvidence, LOCAL_BUFFER_OVERRIDE_GATE_VERSION } from "@/domain/local-buffer-override-gate";
import { resolveLocalWaterBufferOverrideStatus } from "@/domain/input-gates";
import type { Field } from "@/domain/types";
import { buildPrompt, type Prompt } from "./index";

/** `Prompt.kind` for every Prompt this module produces. */
export const LOCAL_BUFFER_OVERRIDE_PROMPT_KIND = "local_buffer_override";

/**
 * The one real, farm-scoped source this producer reads from — matches
 * `promptForSoilTestAge`/`promptForCommonageStatus`'s own `Pick`-of-one-
 * real-`Field` precedent exactly (never a hand-typed id/status bag a
 * caller could mismatch against a different field's evidence).
 */
export type LocalBufferOverrideField = Pick<Field, "id" | "farmId" | "name" | "waterBufferContext">;

/**
 * `checkLocalBufferOverrideWithEvidence`'s single OK value
 * (`"NATIONAL_BASELINE_APPLIES"`) is deliberately the same string whether
 * it resolved because no local override exists at all (`"verified_none"`)
 * or because one exists and the recorded distance satisfies it
 * (`"authoritative_rule"` + a sufficient `actualDistanceM`) — the
 * underlying frozen gate doesn't distinguish those two real, different
 * situations in its own return value. This function is given the real,
 * already-resolved `localOverrideStatus` value (computed once in
 * `promptForLocalBufferOverride`, not re-derived here) specifically to
 * tell a farmer *which* of the two real situations they're in, since
 * conflating them into one generic message would be a real loss of
 * information the underlying evidence actually supports — and, per the
 * next finding below, because the two situations have a genuinely
 * different real relationship to the national baseline, not an identical
 * one.
 *
 * Codex audit HIGH, `docs/farm-return-next/audit-logs/20260901T104040Z.md`:
 * an earlier version's `"authoritative_rule"`-satisfied copy claimed "the
 * national buffer distances apply on top of this, unaffected" — verified
 * against the real source data
 * (`docs/scientific-engine/v3/rules_statutory/local_buffer_override_rules_2026.csv`,
 * whose own `precedence` column reads "local specified distance
 * *overrides* national baseline" / "local determination *overrides*
 * generic baseline for that source"), that claim was factually backwards:
 * a satisfied authoritative local override doesn't sit alongside the
 * national baseline, it replaces it for that water source. Fixed: the
 * `"authoritative_rule"`-satisfied copy now says the local determination
 * overrides the national distance, sourced to the same statute. The
 * `"verified_none"` copy is unaffected by this fix — with no local
 * override at all, the national baseline is simply the one applicable
 * rule, no precedence question exists. Whether this checkpoint's `?? 0`-
 * fixing sibling module has any bearing on `nutrients.ts`'s own separate,
 * independent composition of the two checks (which does not currently
 * model this override relationship — see `BLOCKERS.md`) is a real,
 * evidenced, separate question, documented there, not resolved here.
 *
 * `confirmed` is real, farmer-side provenance this function reads
 * directly from `field.waterBufferContext.status` — deliberately NOT
 * from `basis.evidenceState`. Codex audit HIGH,
 * `docs/farm-return-next/audit-logs/20260901T102220Z.md`: an earlier
 * version presented every OK result with full confidence ("has been
 * confirmed"/"is satisfied") regardless of whether the underlying
 * `TrackedValue` was ever farmer-confirmed. Unlike
 * `commonage_status`'s `requireCommonageStatus` (whose OK arm passes the
 * `TrackedValue`'s own status through via `evidenceStateForDirectAssertion`),
 * `checkLocalBufferOverride` (`buffer-gate.ts`) hardcodes
 * `evidenceState: "DERIVED"` for both real success branches — that
 * real, frozen-module behaviour (documented and tested in
 * `local-buffer-override-gate.test.ts`) means `basis.evidenceState`
 * structurally cannot carry this distinction for this specific gate, so
 * it has to be read from the raw `TrackedValue.status` directly instead,
 * the one place it still exists.
 */
function describeLocalBufferOverrideOk(
  localOverrideStatusValue: "authoritative_rule" | "verified_none",
  confirmed: boolean,
  fieldName: string,
): { title: string; description: string } {
  if (localOverrideStatusValue === "verified_none") {
    return confirmed
      ? {
          title: `${fieldName} has no local water-buffer override`,
          description: `${fieldName} has been confirmed to have no local-authority water-buffer override — the national buffer distances apply here. (This checks the local override layer only; the separate national buffer distance itself is a different check.)`,
        }
      : {
          title: `${fieldName} may have no local water-buffer override — please confirm`,
          description: `${fieldName} is currently recorded as having no local-authority water-buffer override, but this hasn't been confirmed — it's Farm Return's own unconfirmed estimate, not a farmer declaration. Please confirm or correct this field's water-buffer assessment.`,
        };
  }
  return confirmed
    ? {
        title: `${fieldName}'s local water-buffer override is satisfied`,
        description: `${fieldName} has a recorded local-authority water-buffer override, and the recorded distance meets it — this local determination overrides the generic national buffer distance for this water source (S.I. 588/2025). (This checks the local override layer only.)`,
      }
    : {
        title: `${fieldName} may have a local water-buffer override — please confirm`,
        description: `${fieldName} is currently recorded as having a local-authority water-buffer override with a distance that would meet it, but this hasn't been confirmed — it's Farm Return's own unconfirmed estimate, not a farmer declaration. Please confirm or correct this field's water-buffer assessment.`,
      };
}

/**
 * Builds a real `Prompt` for one field's local water-buffer override
 * status. `field.waterBufferContext` is passed straight to
 * `resolveLocalWaterBufferOverrideStatus`/`checkLocalBufferOverrideWithEvidence`
 * — this function makes no decision about which `EngineOutcome` arm
 * applies, including the missing-actual-distance case; that logic lives
 * entirely in `src/domain/input-gates.ts`/
 * `src/domain/local-buffer-override-gate.ts` (see that module's own doc
 * comment for the real Codex audit history — a fabricated `0m` default,
 * then a fail-closed decision made in the wrong layer — that led to it
 * existing at all, and for the real, disclosed divergence from
 * `nutrients.ts`'s own frozen `?? 0` default that remains).
 *
 * `calculationVersion` cites `LOCAL_BUFFER_OVERRIDE_GATE_VERSION` — the
 * real version of the exact new module that computes `basis`. Does not
 * additionally cite `BUFFER_GATE_VERSION` (the frozen module
 * `local-buffer-override-gate.ts` itself wraps): the new module's own
 * version already changes whenever either its own logic or its use of
 * the frozen gate changes, so citing the wrapper's version is sufficient
 * and doesn't overstate what changed, the same "cite the real module
 * that computed this result" discipline every other Prompt producer
 * here already follows. `input-gates.ts` still exports no version
 * constant at all (the same real, disclosed gap `commonage_status`
 * already documented) — not invented here either.
 *
 * `regulatory: "compliance_value"` — a local water-buffer override is a
 * real statutory determination (AF010, `GFT089`/`GFT090`), not a general
 * planning suggestion, matching `promptForCommonageStatus`'s identical
 * classification for the same reason.
 *
 * For every non-OK arm (`BLOCKED_INSUFFICIENT_EVIDENCE` — assessment
 * never captured, an `"authoritative_rule"` status with no recorded
 * override distance, or an `"authoritative_rule"` status with no
 * recorded actual distance; `UNKNOWN` — status explicitly recorded as
 * `"unknown"`; `LEGAL_PROHIBITION` — a local override applies and the
 * recorded distance doesn't meet it) — `description` comes from
 * `buildPrompt`'s own call to `describeBlockedBasis`, not from any
 * string this function supplies; see `buildPrompt`'s doc comment for why
 * that is structural, not caller-discipline.
 */
export function promptForLocalBufferOverride(field: LocalBufferOverrideField, createdAt: string): Prompt {
  const localOverrideStatus = resolveLocalWaterBufferOverrideStatus(field);
  const actualDistanceM = field.waterBufferContext?.value.distanceM;
  const localOverrideDistanceM = field.waterBufferContext?.value.localOverrideDistanceM;

  const basis = checkLocalBufferOverrideWithEvidence({
    actualDistanceM,
    localOverrideStatus,
    localOverrideDistanceM,
  });

  // MEASURED-equivalent (a real farmer declaration or adjustment) vs.
  // IRISH_DEFAULT-equivalent (Farm Return's own unconfirmed estimate) —
  // read from the raw TrackedValue's own status, not from
  // basis.evidenceState, which checkLocalBufferOverrideWithEvidence's own
  // underlying gate hardcodes to "DERIVED" for both real OK branches
  // regardless of this distinction (see describeLocalBufferOverrideOk's
  // own doc comment). Same classification `evidenceStateForDirectAssertion`
  // (`input-gates.ts`) itself uses.
  const confirmed = field.waterBufferContext?.status === "verified" || field.waterBufferContext?.status === "farmer_adjusted";

  return buildPrompt({
    id: globalThis.crypto.randomUUID(),
    farmId: field.farmId,
    fieldId: field.id,
    kind: LOCAL_BUFFER_OVERRIDE_PROMPT_KIND,
    basis,
    createdAt,
    regulatory: "compliance_value",
    calculationVersion: LOCAL_BUFFER_OVERRIDE_GATE_VERSION,
    inputsSnapshot: {
      waterBufferContext: field.waterBufferContext,
      actualDistanceM,
      rule: "S.I. 588/2025 AF010 local-authority water-buffer override layer (GFT089-GFT090) — resolved via input-gates.ts's resolveLocalWaterBufferOverrideStatus and local-buffer-override-gate.ts's checkLocalBufferOverrideWithEvidence (Field.waterBufferContext); does not include the separate national buffer distance check",
    },
    titleWhenBlocked: `Local water-buffer override needs confirming — ${field.name}`,
    describeOk: () => {
      // Reached only when basis.status === "OK", which
      // checkLocalBufferOverrideWithEvidence only ever returns when
      // localOverrideStatus.status === "OK" and its value is
      // "verified_none" or "authoritative_rule" (never "unknown", which
      // maps to the top-level UNKNOWN arm buildPrompt already handles as
      // non-OK) -- both narrowed, real, not assumed.
      const value = localOverrideStatus.status === "OK" ? localOverrideStatus.value : undefined;
      return describeLocalBufferOverrideOk(value === "verified_none" ? "verified_none" : "authoritative_rule", confirmed, field.name);
    },
  });
}
