/**
 * V3 closure pass (second pass) — `RECOMMENDATION_AUDIT_REPORT_SPEC.md`
 * §6 "Exports": a mandatory Reports-section requirement ("Keep existing
 * simple CSV reports, and add: [Recommendation Audit Report] [Audit Data
 * Pack] [JSON]"), independently confirmed required (not optional) by the
 * closure-pass verification, and previously entirely unbuilt (RPT021/
 * RPT022 both NOT_ATTEMPTED — "No CSV audit-pack export exists... No JSON
 * export/schema-validation step exists").
 *
 * Everything below is a pure, additive serialiser over an already-sealed
 * `CalculationRun` (Priority I/Phase 1's real trace) — it invents no new
 * number, only reshapes what the trace already computed and recorded.
 * Historical consistency (spec's own "persisted trace, not reconstructed
 * current state") is structural here: the input is always a sealed
 * `CalculationRun` object, never re-derived from current farm state.
 *
 * No new dependency was added for this (no zip/PDF library) — see this
 * module's own README-style note in `UNATTENDED_BUILD_LOG.md` for why:
 * the "Audit Data Pack" is delivered as 8 separately downloadable,
 * relationally joined CSVs (via `calculation_run_id`/`recommendation_id`,
 * exactly matching `reports/audit_export_tables.csv`'s own schema) rather
 * than a literal `.zip` container.
 */

import { toCsv } from "@/lib/csv";
import type { CalculationRun, DecisionRecord } from "./audit-trace";
import type { PeerReview } from "./audit-trace";

export const AUDIT_EXPORT_VERSION = "audit_export_v1.0.0";
export const RECOMMENDATION_TRACE_REPORT_VERSION = "farm-return-recommendation-trace-v1";

// ---------------------------------------------------------------------------
// Audit Data Pack — 8 relational CSVs, reports/audit_export_tables.csv's
// own file/primary-key/foreign-key contract, verbatim.
// ---------------------------------------------------------------------------

export function buildRunMetadataCsv(run: CalculationRun): string {
  return toCsv(
    ["calculation_run_id", "farm_snapshot_id", "calculated_at", "ruleset_id", "ruleset_source_checked_at", "build_sha", "sealed", "trace_sha256"],
    [
      [
        run.calculationRunId,
        run.farmSnapshotId,
        run.calculatedAt,
        run.ruleset.rulesetId,
        run.ruleset.sourceCheckedAt,
        run.buildSha ?? "",
        run.sealed,
        run.traceSha256 ?? "",
      ],
    ],
  );
}

export function buildRecommendationsCsv(run: CalculationRun): string {
  return toCsv(
    ["recommendation_id", "calculation_run_id", "decision_type", "scope_type", "scope_id", "action", "quantity_value", "quantity_unit", "reason_codes", "evidence_state"],
    run.decisionRecords.map((d) => [
      d.recommendationId,
      run.calculationRunId,
      d.decisionType,
      d.scope.type,
      d.scope.id,
      d.action,
      d.quantity?.value ?? "",
      d.quantity?.unit ?? "",
      d.reasonCodes.join("; "),
      d.evidenceState,
    ]),
  );
}

export function buildRecommendationInputsCsv(run: CalculationRun): string {
  const rows: (string | number | boolean | null)[][] = [];
  for (const d of run.decisionRecords) {
    d.inputs.forEach((input, i) => {
      rows.push([
        `${d.recommendationId}-input-${i}`,
        run.calculationRunId,
        d.recommendationId,
        input.name,
        JSON.stringify(input.rawValue),
        JSON.stringify(input.normalisedValue),
        input.unit ?? "",
        input.sourceKind,
        input.evidenceState,
        input.recordedAt ?? "",
        input.override,
        input.originalValueBeforeOverride !== undefined ? JSON.stringify(input.originalValueBeforeOverride) : "",
        input.sourceDocument ?? "",
      ]);
    });
  }
  return toCsv(
    ["input_evidence_id", "calculation_run_id", "recommendation_id", "name", "raw_value", "normalised_value", "unit", "source_kind", "evidence_state", "recorded_at", "override", "original_value_before_override", "source_document"],
    rows,
  );
}

export function buildCalculationStepsCsv(run: CalculationRun): string {
  const rows: (string | number | boolean | null)[][] = [];
  for (const d of run.decisionRecords) {
    for (const step of d.calculationSteps) {
      rows.push([
        `${d.recommendationId}-step-${step.sequence}`,
        run.calculationRunId,
        d.recommendationId,
        step.sequence,
        step.formulaRuleId,
        step.description,
        step.formulaExpression,
        step.substitutedValues !== undefined ? JSON.stringify(step.substitutedValues) : "",
        JSON.stringify(step.result),
        step.unit ?? "",
        step.roundingRule ?? "",
        step.sourceIds.join("; "),
      ]);
    }
  }
  return toCsv(
    ["calculation_step_id", "calculation_run_id", "recommendation_id", "sequence", "formula_rule_id", "description", "formula_expression", "substituted_values", "result", "unit", "rounding_rule", "source_ids"],
    rows,
  );
}

export function buildComplianceChecksCsv(run: CalculationRun): string {
  const rows: (string | number | boolean | null)[][] = [];
  for (const d of run.decisionRecords) {
    d.complianceChecks.forEach((check, i) => {
      rows.push([
        `${d.recommendationId}-check-${i}`,
        run.calculationRunId,
        d.recommendationId,
        check.checkId,
        check.rule,
        check.evaluatedValue !== undefined ? JSON.stringify(check.evaluatedValue) : "",
        check.result,
        check.consequence,
        check.instrument ?? "",
        check.effectiveDate ?? "",
        check.sourceId,
      ]);
    });
  }
  return toCsv(
    ["compliance_check_id", "calculation_run_id", "recommendation_id", "check_id", "rule", "evaluated_value", "result", "consequence", "instrument", "effective_date", "source_id"],
    rows,
  );
}

export function buildAssumptionsAndGapsCsv(run: CalculationRun): string {
  const rows: (string | number | boolean | null)[][] = [];
  for (const d of run.decisionRecords) {
    const all = [...d.assumptions, ...d.dataGaps];
    all.forEach((entry, i) => {
      rows.push([
        `${d.recommendationId}-assumption-${i}`,
        run.calculationRunId,
        d.recommendationId,
        entry.kind,
        entry.description,
        entry.reason,
        entry.sourceId ?? "",
        entry.replaceableByMeasurement,
        entry.limitation ?? "",
        entry.blockedOutput ?? "",
        entry.resolution ?? "",
      ]);
    });
  }
  return toCsv(
    ["assumption_gap_id", "calculation_run_id", "recommendation_id", "kind", "description", "reason", "source_id", "replaceable_by_measurement", "limitation", "blocked_output", "resolution"],
    rows,
  );
}

export function buildSourceReferencesCsv(run: CalculationRun): string {
  const rows: (string | number | boolean | null)[][] = [];
  for (const d of run.decisionRecords) {
    d.sources.forEach((source, i) => {
      rows.push([
        `${d.recommendationId}-source-${i}`,
        run.calculationRunId,
        d.recommendationId,
        source.sourceId,
        source.authority,
        source.section ?? "",
        source.effectiveStatus,
      ]);
    });
  }
  return toCsv(
    ["recommendation_source_id", "calculation_run_id", "recommendation_id", "source_id", "authority", "section", "effective_status"],
    rows,
  );
}

/**
 * `peerReviews` is passed in explicitly (not read from `run`) — reviewer
 * judgement is a strictly separate record from the immutable calculation
 * (spec §1/RPT014), never embedded on `DecisionRecord` itself. A run with
 * no matching review rows exports an empty (but present) table, not an
 * omitted file — the report spec's "reviewer status" column must exist
 * even when unreviewed.
 */
export function buildPeerReviewCsv(run: CalculationRun, peerReviews: PeerReview[]): string {
  const relevant = peerReviews.filter((r) => r.calculationRunId === run.calculationRunId);
  return toCsv(
    ["peer_review_id", "calculation_run_id", "recommendation_id", "review_status", "reviewed_at", "reviewer_note", "issue_category", "follow_up"],
    relevant.map((r) => [r.peerReviewId, r.calculationRunId, r.recommendationId, r.reviewStatus, r.reviewedAt, r.reviewerNote ?? "", r.issueCategory ?? "", r.followUp ?? ""]),
  );
}

export interface AuditDataPackFile {
  filename: string;
  content: string;
}

/** All 8 files, `reports/audit_export_tables.csv`'s own file list, in
 * that file's own order. */
export function buildAuditDataPack(run: CalculationRun, peerReviews: PeerReview[]): AuditDataPackFile[] {
  return [
    { filename: "run_metadata.csv", content: buildRunMetadataCsv(run) },
    { filename: "recommendations.csv", content: buildRecommendationsCsv(run) },
    { filename: "recommendation_inputs.csv", content: buildRecommendationInputsCsv(run) },
    { filename: "calculation_steps.csv", content: buildCalculationStepsCsv(run) },
    { filename: "compliance_checks.csv", content: buildComplianceChecksCsv(run) },
    { filename: "assumptions_and_gaps.csv", content: buildAssumptionsAndGapsCsv(run) },
    { filename: "source_references.csv", content: buildSourceReferencesCsv(run) },
    { filename: "peer_review.csv", content: buildPeerReviewCsv(run, peerReviews) },
  ];
}

// ---------------------------------------------------------------------------
// JSON trace export — schemas/recommendation_trace.schema.json, exact
// snake_case field names.
// ---------------------------------------------------------------------------

export function buildRecommendationTraceJson(run: CalculationRun): Record<string, unknown> {
  return {
    report_version: RECOMMENDATION_TRACE_REPORT_VERSION,
    calculation_run_id: run.calculationRunId,
    farm_snapshot_id: run.farmSnapshotId,
    calculated_at: run.calculatedAt,
    ruleset: {
      ruleset_id: run.ruleset.rulesetId,
      source_checked_at: run.ruleset.sourceCheckedAt,
      source_ids: run.ruleset.sourceIds,
    },
    decision_records: run.decisionRecords.map((d) => decisionRecordToJson(d)),
    integrity: { trace_sha256: run.traceSha256 ?? "" },
  };
}

function decisionRecordToJson(d: DecisionRecord): Record<string, unknown> {
  return {
    recommendation_id: d.recommendationId,
    decision_type: d.decisionType,
    scope: { type: d.scope.type, id: d.scope.id },
    action: d.action,
    ...(d.quantity ? { quantity_value: d.quantity.value, quantity_unit: d.quantity.unit } : {}),
    reason_codes: d.reasonCodes,
    evidence_state: d.evidenceState,
    inputs: d.inputs.map((i) => ({
      name: i.name,
      raw_value: i.rawValue,
      normalised_value: i.normalisedValue,
      unit: i.unit ?? null,
      source_kind: i.sourceKind,
      evidence_state: i.evidenceState,
      recorded_at: i.recordedAt ?? null,
      override: i.override,
      original_value_before_override: i.originalValueBeforeOverride ?? null,
      source_document: i.sourceDocument ?? null,
    })),
    calculation_steps: d.calculationSteps.map((s) => ({
      sequence: s.sequence,
      formula_rule_id: s.formulaRuleId,
      description: s.description,
      formula_expression: s.formulaExpression,
      substituted_values: s.substitutedValues ?? null,
      // "result" (not "result_value") — matching
      // reports/sample_recommendation_audit.json's own worked example
      // exactly, not the JSON-schema's untyped `"type": "object"` steps
      // array (which doesn't itself name this field).
      result: s.result,
      unit: s.unit ?? null,
      rounding_rule: s.roundingRule ?? null,
      source_ids: s.sourceIds,
    })),
    compliance_checks: d.complianceChecks.map((c) => ({
      check_id: c.checkId,
      rule: c.rule,
      evaluated_value: c.evaluatedValue ?? null,
      result: c.result,
      consequence: c.consequence,
      instrument: c.instrument ?? null,
      effective_date: c.effectiveDate ?? null,
      source_id: c.sourceId,
    })),
    assumptions: d.assumptions.map(assumptionOrGapToJson),
    data_gaps: d.dataGaps.map(assumptionOrGapToJson),
    ...(d.alternatives ? { alternatives: d.alternatives } : {}),
    sources: d.sources.map((s) => ({
      source_id: s.sourceId,
      authority: s.authority,
      section: s.section ?? null,
      effective_status: s.effectiveStatus,
    })),
    narrative_explanation: d.narrativeExplanation ?? null,
  };
}

function assumptionOrGapToJson(a: DecisionRecord["assumptions"][number]): Record<string, unknown> {
  return {
    kind: a.kind,
    description: a.description,
    reason: a.reason,
    source_id: a.sourceId ?? null,
    replaceable_by_measurement: a.replaceableByMeasurement,
    limitation: a.limitation ?? null,
    blocked_output: a.blockedOutput ?? null,
    resolution: a.resolution ?? null,
  };
}

// ---------------------------------------------------------------------------
// Human-readable Recommendation Audit Report — spec §6's "Human-readable
// print/PDF-ready view generated from the trace." Plain text, not a PDF
// binary (no PDF-generation library was added — see this module's own
// header note) — the browser's native Print -> Save as PDF on this text
// is the standard dependency-free way to get a PDF from it, so the
// content itself is what's built here, not a specific file format.
// ---------------------------------------------------------------------------

function formatDecisionSection(d: DecisionRecord): string {
  const lines: string[] = [];
  lines.push(`Recommendation: ${d.recommendationId}`);
  lines.push(`Decision type: ${d.decisionType}`);
  lines.push(`Scope: ${d.scope.type} ${d.scope.id}`);
  lines.push(`Action: ${d.action}`);
  if (d.quantity) lines.push(`Quantity: ${d.quantity.value} ${d.quantity.unit}`);
  lines.push(`Reason codes: ${d.reasonCodes.join(", ")}`);
  lines.push(`Evidence state: ${d.evidenceState}`);
  if (d.calculationSteps.length > 0) {
    lines.push("Calculation steps:");
    for (const s of d.calculationSteps) {
      lines.push(`  ${s.sequence}. ${s.description}: ${s.formulaExpression} = ${JSON.stringify(s.result)}${s.unit ? ` ${s.unit}` : ""}`);
      if (s.roundingRule) lines.push(`     Rounding: ${s.roundingRule}`);
    }
  }
  if (d.complianceChecks.length > 0) {
    lines.push("Compliance checks:");
    for (const c of d.complianceChecks) {
      lines.push(`  [${c.result}] ${c.rule} -- ${c.consequence}`);
    }
  }
  const gaps = [...d.assumptions, ...d.dataGaps];
  if (gaps.length > 0) {
    lines.push("Assumptions / missing evidence:");
    for (const g of gaps) {
      lines.push(`  [${g.kind}] ${g.description} -- ${g.resolution ?? g.reason}`);
    }
  }
  if (d.alternatives && d.alternatives.length > 0) {
    lines.push("Alternatives considered and not selected:");
    for (const alt of d.alternatives) {
      lines.push(`  ${alt.action} -- ${alt.reason}`);
    }
  }
  lines.push(`Sources: ${d.sources.map((s) => `${s.sourceId}${s.section ? ` (${s.section})` : ""} [${s.effectiveStatus}]`).join("; ")}`);
  return lines.join("\n");
}

/** Deliberately reads ONLY the persisted `run` object — never re-derives
 * anything from current farm state (spec's own "persisted trace, not
 * reconstructed current state", RPT002). */
export function buildRecommendationAuditReportText(run: CalculationRun): string {
  const header = [
    "FARM RETURN — RECOMMENDATION AUDIT REPORT",
    `Calculation run: ${run.calculationRunId}`,
    `Farm snapshot: ${run.farmSnapshotId}`,
    `Calculated at: ${run.calculatedAt}`,
    `Ruleset: ${run.ruleset.rulesetId} (checked ${run.ruleset.sourceCheckedAt})`,
    `Sealed: ${run.sealed ? "yes" : "no"}`,
    `Trace integrity fingerprint (SHA-256): ${run.traceSha256 ?? "(not yet sealed)"}`,
    "",
    `This report lists every decision this run made, including what it`,
    `refused to recommend and what it could not determine — not only`,
    `successful recommendations (spec: "The reviewer must see what Farm`,
    `Return refused to recommend as well as what it recommended").`,
    "",
    `${run.decisionRecords.length} recommendation(s) in this run.`,
    "",
  ].join("\n");
  const body = run.decisionRecords.map((d, i) => `--- ${i + 1} ---\n${formatDecisionSection(d)}`).join("\n\n");
  return `${header}\n${body}\n`;
}

// ---------------------------------------------------------------------------
// Schema-shape validation — RPT022 "Machine trace validates against
// schema". No JSON-Schema library dependency was added for this: a
// hand-written structural check over `recommendation_trace.schema.json`'s
// own `required`/`enum` constraints, matching this codebase's existing
// "own the domain logic" convention (`report-validator.ts` does the same
// for report-acceptance structural rules).
// ---------------------------------------------------------------------------

const VALID_DECISION_TYPES = new Set([
  "ACTION_RECOMMENDATION",
  "NO_ACTION_RECOMMENDED",
  "LEGAL_PROHIBITION",
  "DATA_REQUEST",
  "ESTIMATE",
  "WARNING",
  "BLOCKED_INSUFFICIENT_EVIDENCE",
  "ALTERNATIVE_SCENARIO",
]);

const VALID_EVIDENCE_STATES = new Set(["MEASURED", "DERIVED", "IRISH_MODEL", "IRISH_DEFAULT", "INSUFFICIENT"]);

export interface TraceSchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validates exactly the constraints `recommendation_trace.schema.json`
 * declares as `required` at the top level and per decision record, plus
 * its two closed `enum`s and the trace-hash `pattern`. Not a general
 * JSON-Schema engine — a schema-shaped structural check, sufficient for
 * this app's own export to self-verify against its own contract before a
 * farmer/reviewer downloads it. */
export function validateRecommendationTraceJson(json: Record<string, unknown>): TraceSchemaValidationResult {
  const errors: string[] = [];
  for (const key of ["report_version", "calculation_run_id", "ruleset", "farm_snapshot_id", "decision_records", "integrity"]) {
    if (!(key in json)) errors.push(`missing required top-level field: ${key}`);
  }
  const integrity = json.integrity as { trace_sha256?: unknown } | undefined;
  if (!integrity || typeof integrity.trace_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(integrity.trace_sha256)) {
    errors.push("integrity.trace_sha256 must be a 64-character lowercase hex string");
  }
  const records = Array.isArray(json.decision_records) ? (json.decision_records as Record<string, unknown>[]) : [];
  records.forEach((d, i) => {
    for (const key of ["recommendation_id", "decision_type", "scope", "action", "reason_codes", "inputs", "calculation_steps", "compliance_checks", "sources", "evidence_state"]) {
      if (!(key in d)) errors.push(`decision_records[${i}] missing required field: ${key}`);
    }
    if (typeof d.decision_type === "string" && !VALID_DECISION_TYPES.has(d.decision_type)) {
      errors.push(`decision_records[${i}].decision_type "${d.decision_type}" is not a valid decision_type`);
    }
    if (typeof d.evidence_state === "string" && !VALID_EVIDENCE_STATES.has(d.evidence_state)) {
      errors.push(`decision_records[${i}].evidence_state "${d.evidence_state}" is not a valid evidence_state`);
    }
    if (Array.isArray(d.reason_codes) && d.reason_codes.length === 0) {
      errors.push(`decision_records[${i}].reason_codes must have at least one item`);
    }
    if (Array.isArray(d.sources) && d.sources.length === 0) {
      errors.push(`decision_records[${i}].sources must have at least one item`);
    }
  });
  return { valid: errors.length === 0, errors };
}
