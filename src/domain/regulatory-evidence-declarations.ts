/**
 * Campaign B minimal evidence UX — what the farmer is shown about a store's
 * regulatory neat cattle slurry and a field's spreadable area, and the one
 * shape a farmer's own declaration of either takes.
 *
 * Nothing here selects or resolves evidence. The usable fact comes from the
 * canonical context (`buildSlurryRegulatoryContextFromRecords` →
 * `StoreSlurryIdentity.regulatoryNeatVolumeM3`,
 * `FieldSpreadableAreaEvidence.spreadableAreaHa`) and the record on file
 * from the audited selectors (`currentNeatSlurryEvidenceByHousing`,
 * `currentSpreadableAreaByField`). These views only translate the fact's
 * state into plain language — no reason code, status enum or legal code
 * reaches the farmer — and never fill a missing fact from physical store
 * volume or gross field area.
 */
import type { EvidenceFact } from "./slurry-evidence-context";
import {
  currentNeatSlurryEvidenceByHousing,
  currentSpreadableAreaByField,
  isTiedEvidence,
  type CurrentEvidenceRecord,
  type NeatSlurryEvidenceRecord,
  type SpreadableAreaRecord,
} from "./regulatory-evidence-records";
import type { SlurryRegulatoryContext } from "./slurry-regulatory-context";

export const REGULATORY_EVIDENCE_DECLARATIONS_VERSION = "regulatory_evidence_declarations_v1.0.0";

/** The `source` of every farmer declaration made on these screens. Fixed,
 * so an identical re-save never reads as a contradictory tie. */
export const NEAT_SLURRY_DECLARATION_SOURCE = "Farmer declaration on the housing screen";
export const SPREADABLE_AREA_DECLARATION_SOURCE = "Farmer declaration on the field's constraints";

export type RegulatoryEvidenceViewState = "not_recorded" | "in_use" | "no_figure" | "not_current" | "conflicting" | "unreadable";

export interface RegulatoryEvidenceView<R> {
  state: RegulatoryEvidenceViewState;
  /** The single current record on file, if there is one — shown with its
   * value and date even when it is not in use. Absent for a tie. */
  record?: R;
  /** Plain-language status line. */
  message: string;
}

// ---------------------------------------------------------------------------
// Regulatory neat cattle slurry (per store)
// ---------------------------------------------------------------------------

export function neatSlurryEvidenceView(input: {
  /** `StoreSlurryIdentity.regulatoryNeatVolumeM3` from the canonical context. */
  fact: EvidenceFact<number>;
  /** `StoreSlurryIdentity.physicalVolumeM3` — context for the explanation only. */
  physicalVolume: EvidenceFact<number>;
  /** `currentNeatSlurryEvidenceByHousing(records).get(housingId)`. */
  current: CurrentEvidenceRecord<NeatSlurryEvidenceRecord> | undefined;
}): RegulatoryEvidenceView<NeatSlurryEvidenceRecord> {
  const { fact, physicalVolume, current } = input;
  const record = current !== undefined && !isTiedEvidence(current) ? current : undefined;
  const withRecord = (state: RegulatoryEvidenceViewState, message: string) => ({ state, message, ...(record ? { record } : {}) });
  if (fact.state === "known") return withRecord("in_use", "In use for nitrates calculations.");
  if (current === undefined) {
    return withRecord(
      "not_recorded",
      "Not recorded yet. Farm Return won't assume how much of the slurry in this tank is neat cattle slurry, so nitrates calculations that need it are on hold.",
    );
  }
  if (fact.state === "conflicting") {
    return isTiedEvidence(current)
      ? withRecord("conflicting", "Different figures were saved at the same time, so none of them is used. Record the correct figure to settle it.")
      : withRecord(
          "conflicting",
          "This figure is more than the slurry recorded in the tank, so neither is used. Check the tank's fill reading or record a corrected figure.",
        );
  }
  if (record?.status === "unavailable") {
    return withRecord("no_figure", "You recorded that you don't have a figure for this tank, so nitrates calculations that need it stay on hold.");
  }
  if (fact.reasonCode === "REGULATORY_NEAT_SLURRY_NOT_COMPARABLE_WITH_CURRENT_STORE_STATE") {
    return withRecord(
      "not_current",
      physicalVolume.state === "known"
        ? "Kept on record but not in use: it is dated on or before the latest fill reading or spreading from this tank, so it may not describe what is in the tank now. Record a figure dated after the latest fill reading."
        : "Kept on record but not in use: Farm Return doesn't yet know how much slurry is in this tank now, so this figure can't be matched to it. Record the tank's fill level first.",
    );
  }
  return withRecord("unreadable", "The figure on record can't be used. Record the figure again to replace it.");
}

// ---------------------------------------------------------------------------
// Spreadable area (per field)
// ---------------------------------------------------------------------------

export function spreadableAreaEvidenceView(input: {
  /** `FieldSpreadableAreaEvidence.spreadableAreaHa` from the canonical context. */
  fact: EvidenceFact<number>;
  /** `currentSpreadableAreaByField(records).get(fieldId)`. */
  current: CurrentEvidenceRecord<SpreadableAreaRecord> | undefined;
}): RegulatoryEvidenceView<SpreadableAreaRecord> {
  const { fact, current } = input;
  const record = current !== undefined && !isTiedEvidence(current) ? current : undefined;
  const withRecord = (state: RegulatoryEvidenceViewState, message: string) => ({ state, message, ...(record ? { record } : {}) });
  if (fact.state === "known") return withRecord("in_use", "In use for slurry planning.");
  if (current === undefined) {
    return withRecord(
      "not_recorded",
      "Not confirmed yet. Farm Return won't treat the whole field as spreadable, so a total slurry volume for this field can't be worked out.",
    );
  }
  if (fact.state === "conflicting") {
    return isTiedEvidence(current)
      ? withRecord("conflicting", "Different areas were saved at the same time, so none of them is used. Record the correct area to settle it.")
      : withRecord("conflicting", "This area is more than the field's current size, so neither is used. Check the field's boundary or record a corrected area.");
  }
  return withRecord("unreadable", "The area on record can't be used. Record the area again to replace it.");
}

// ---------------------------------------------------------------------------
// Per store / per field, from the canonical context
// ---------------------------------------------------------------------------

/**
 * Every store's and active field's view, from the canonical context (built
 * over the same records) and the audited current-record selectors. A store
 * or field absent from the context (an archived field) has no view.
 */
export function regulatoryEvidenceViews(
  context: Pick<SlurryRegulatoryContext, "stores" | "spreadableArea">,
  records: { neatSlurryEvidenceRecords: readonly NeatSlurryEvidenceRecord[]; spreadableAreaRecords: readonly SpreadableAreaRecord[] },
): {
  neatSlurryByHousing: Map<string, RegulatoryEvidenceView<NeatSlurryEvidenceRecord>>;
  spreadableAreaByField: Map<string, RegulatoryEvidenceView<SpreadableAreaRecord>>;
} {
  const neat = currentNeatSlurryEvidenceByHousing(records.neatSlurryEvidenceRecords);
  const area = currentSpreadableAreaByField(records.spreadableAreaRecords);
  return {
    neatSlurryByHousing: new Map(
      context.stores.map((s) => [s.housingId, neatSlurryEvidenceView({ fact: s.regulatoryNeatVolumeM3, physicalVolume: s.physicalVolumeM3, current: neat.get(s.housingId) })]),
    ),
    spreadableAreaByField: new Map(context.spreadableArea.map((a) => [a.fieldId, spreadableAreaEvidenceView({ fact: a.spreadableAreaHa, current: area.get(a.fieldId) })])),
  };
}
