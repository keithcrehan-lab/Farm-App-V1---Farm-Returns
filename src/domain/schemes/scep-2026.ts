import type { SupportProfile } from "../support-profile";
import type { SchemeDataPoint, SchemeReadiness } from "./contracts";
import { composeSchemeDataSnapshot } from "./data-snapshot";
import { SCHEME_DATA_KEYS } from "./data-keys";
import type { SchemeFactAssertion } from "./facts";
import {
  calculateSchemePayment,
  type SchemePaymentCalculator,
  type SchemePaymentEstimate,
} from "./payment";
import {
  requirementsForApplicableRules,
} from "./requirements";
import type { StoredSchemeDefinition } from "./repository";
import {
  evaluateStoredSchemeRule,
  type SchemeRuleEvaluation,
  type SchemeRuleOperator,
} from "./rule-evaluation";
import { evaluateSchemeReadiness } from "./readiness";
import { schemeDataAdaptersFromSupportProfile } from "./support-profile-adapter";

export const SCEP_2026_RULE_KEYS = {
  PARTICIPATION: "scep-2026-participation",
  BISS: "scep-2026-biss",
  SBLAS: "scep-2026-sblas",
  PAYMENT_AREA: "scep-2026-payment-area",
  CALVING: "scep-2026-calving-50pct",
  HIGH_MERIT_SIRES: "scep-2026-action1-high-merit-sires",
  GENOTYPING: "scep-2026-action3-genotyping",
  WEIGHING: "scep-2026-action4-weighing",
  ACTION5_REVIEW: "scep-2026-action5-review",
} as const;

export type Scep2026State =
  | "PARTICIPATION_UNKNOWN"
  | "NOT_PARTICIPATING"
  | "INFORMATION_MISSING"
  | "NEEDS_ATTENTION"
  | "TRACKED_ACTIONS_ON_TRACK"
  | "REVIEW_REQUIRED";

export interface Scep2026ActionProgress {
  key: "calving" | "eligible_sires" | "genotyping" | "weighing";
  label: string;
  current: number | null;
  target: number | null;
  unit: "animals" | "pairs";
  deadline: string | null;
  deadlineState: "past" | "upcoming" | null;
  state: SchemeRuleEvaluation["state"];
  detail: string;
}

export interface Scep2026View {
  schemeVersionId: string;
  schemeVersionKey: string;
  name: string;
  state: Scep2026State;
  stateLabel: string;
  summary: string;
  participation: boolean | null;
  readiness: SchemeReadiness;
  evaluations: SchemeRuleEvaluation[];
  actions: Scep2026ActionProgress[];
  payment: SchemePaymentEstimate;
  limitations: string[];
  nextYear: string[];
  sources: Array<{
    id: string;
    publisher: string;
    title: string;
    url: string;
    sourceKey: string;
  }>;
  factValues: Record<string, boolean | number | null>;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function operatorNumbers(
  values: unknown[],
  count: number,
): number[] | null {
  if (
    values.length !== count ||
    !values.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    return null;
  }
  return values as number[];
}

const floorRatioOfReference: SchemeRuleOperator = ({
  values,
  parameters,
}) => {
  const numbers = operatorNumbers(values, 2);
  const ratio = parameters.ratio;
  if (
    !numbers ||
    typeof ratio !== "number" ||
    !Number.isFinite(ratio) ||
    ratio < 0
  ) {
    return {
      supported: false,
      detail: "This SCEP target needs a valid count, reference number and ratio.",
    };
  }
  const [actual, reference] = numbers;
  const target = Math.floor(reference * ratio);
  return {
    supported: true,
    passes: actual >= target,
    detail: String(actual) + " recorded; target " + String(target) + ".",
  };
};

const highMeritSiresYear4: SchemeRuleOperator = ({ values, parameters }) => {
  const numbers = operatorNumbers(values, 3);
  const ratio = parameters.ratio;
  if (
    !numbers ||
    typeof ratio !== "number" ||
    !Number.isFinite(ratio) ||
    ratio < 0
  ) {
    return {
      supported: false,
      detail: "The Year 4 eligible-sire target could not be calculated.",
    };
  }
  const [actual, calvesBorn, reference] = numbers;
  const denominator = Math.min(calvesBorn, reference);
  const target = Math.ceil(denominator * ratio);
  return {
    supported: true,
    passes: actual >= target,
    detail:
      String(actual) +
      " recorded; target " +
      String(target) +
      " (85% of eligible calves born, capped at the yearly reference number).",
  };
};

const weighingYear4: SchemeRuleOperator = ({ values, parameters }) => {
  const numbers = operatorNumbers(values, 3);
  const ratio = parameters.ratio;
  if (
    !numbers ||
    typeof ratio !== "number" ||
    !Number.isFinite(ratio) ||
    ratio < 0
  ) {
    return {
      supported: false,
      detail: "The Year 4 weighing target could not be calculated.",
    };
  }
  const [actual, calvesBorn, reference] = numbers;
  const target = Math.floor(Math.min(calvesBorn, reference) * ratio);
  return {
    supported: true,
    passes: actual >= target,
    detail:
      String(actual) +
      " pairs recorded; target " +
      String(target) +
      " (80% of eligible calves born, capped at the yearly reference number).",
  };
};

export const SCEP_2026_RULE_OPERATORS: Readonly<
  Record<string, SchemeRuleOperator>
> = {
  scep_floor_ratio_of_reference: floorRatioOfReference,
  scep_high_merit_year4: highMeritSiresYear4,
  scep_weighing_year4: weighingYear4,
};

function assertionPoint(
  assertion: SchemeFactAssertion | undefined,
  key: string,
  participation: boolean | null,
): SchemeDataPoint {
  const anchor = "scep-fact-" + key.replaceAll(".", "-");
  const route = "/schemes?scheme=scep&version=2026#" + anchor;

  if (
    participation === false &&
    key !== SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key
  ) {
    return {
      key,
      owner: "schemes",
      state: "NOT_APPLICABLE",
      resolutionOwner: "system",
    };
  }

  if (!assertion) {
    return {
      key,
      owner: "schemes",
      state: "MISSING",
      resolutionOwner: "farmer",
      route: {
        href: route,
        returnTo: route,
      },
    };
  }

  return {
    key,
    owner: "schemes",
    state: "KNOWN",
    value: assertion.value,
    resolutionOwner: "farmer",
    route: {
      href: route,
      returnTo: route,
    },
    evidence: [
      {
        sourceKind:
          assertion.assertionStatus === "verified_external"
            ? "verified_external"
            : assertion.assertionStatus === "imported"
              ? "imported"
              : assertion.assertionStatus === "adviser_confirmed"
                ? "adviser_confirmed"
                : "farmer_confirmed",
        sourceRef: assertion.sourceRef ?? assertion.id,
        observedAt: assertion.observedAt ?? undefined,
        receivedAt: assertion.receivedAt,
      },
    ],
  };
}

export function buildScep2026Snapshot(
  profile: SupportProfile,
  assertions: SchemeFactAssertion[],
): ReadonlyMap<string, SchemeDataPoint> {
  const latest = new Map<string, SchemeFactAssertion>();
  for (const assertion of assertions) {
    const existing = latest.get(assertion.dataKey);
    if (
      !existing ||
      assertion.receivedAt > existing.receivedAt ||
      (assertion.receivedAt === existing.receivedAt &&
        assertion.id > existing.id)
    ) {
      latest.set(assertion.dataKey, assertion);
    }
  }

  const participation = asBoolean(
    latest.get(SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key)?.value,
  );

  const scepKeys = [
    SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
    SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
    SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key,
    SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key,
    SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key,
    SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key,
    SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key,
    SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key,
    SCHEME_DATA_KEYS.SCEP_SURVEYS_SUBMITTED_2026.key,
  ];

  return composeSchemeDataSnapshot([
    ...schemeDataAdaptersFromSupportProfile(profile),
    {
      owner: "schemes",
      points: scepKeys.map((key) =>
        assertionPoint(latest.get(key), key, participation),
      ),
    },
  ]);
}

function sourceIds(
  definition: StoredSchemeDefinition,
  sourceKeys: string[],
): string[] {
  const wanted = new Set(sourceKeys);
  return definition.sources
    .filter((source) => wanted.has(source.sourceKey))
    .map((source) => source.id);
}

function finiteRuleNumber(
  rule: StoredSchemeDefinition["rules"][number] | undefined,
  key: string,
): number | null {
  const value = rule?.parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const scep2026PaymentCalculator: SchemePaymentCalculator = ({
  definition,
  snapshot,
}) => {
  const paymentRule = definition.rules.find(
    (rule) => rule.ruleKey === SCEP_2026_RULE_KEYS.PAYMENT_AREA,
  );
  const paymentSourceIds = paymentRule
    ? [paymentRule.sourceId]
    : sourceIds(definition, ["dafm-service"]);

  const participation = asBoolean(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key)?.value,
  );
  if (participation === false) {
    return {
      state: "UNSUPPORTED",
      currency: "EUR",
      amount: null,
      low: null,
      high: null,
      method: null,
      rateStatus: "not_applicable",
      detail: "No SCEP payment is estimated because this farm is recorded as not participating.",
      sourceIds: paymentSourceIds,
    };
  }

  const reference = asFiniteNumber(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key)?.value,
  );
  const eligibleForage = asFiniteNumber(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key)?.value,
  );

  if (reference === null || eligibleForage === null) {
    return {
      state: "INSUFFICIENT_DATA",
      currency: "EUR",
      amount: null,
      low: null,
      high: null,
      method: "scep_2026_area_rate",
      rateStatus: "final",
      detail:
        "Enter the 2026 yearly reference number and DAFM-determined eligible forage area to calculate the maximum potential gross SCEP payment.",
      sourceIds: paymentSourceIds,
    };
  }

  const referenceDivisor = finiteRuleNumber(paymentRule, "reference_divisor");
  const firstBandHa = finiteRuleNumber(paymentRule, "first_band_ha");
  const firstBandRate = finiteRuleNumber(
    paymentRule,
    "first_band_eur_per_ha",
  );
  const remainingRate = finiteRuleNumber(
    paymentRule,
    "remaining_eur_per_ha",
  );
  const minimumAreaFraction = finiteRuleNumber(
    paymentRule,
    "minimum_area_fraction_for_stated_payment_rule",
  );

  if (
    referenceDivisor === null ||
    referenceDivisor <= 0 ||
    firstBandHa === null ||
    firstBandHa < 0 ||
    firstBandRate === null ||
    firstBandRate < 0 ||
    remainingRate === null ||
    remainingRate < 0 ||
    minimumAreaFraction === null ||
    minimumAreaFraction < 0 ||
    minimumAreaFraction > 1
  ) {
    return {
      state: "REVIEW_REQUIRED",
      currency: "EUR",
      amount: null,
      low: null,
      high: null,
      method: null,
      rateStatus: "not_applicable",
      detail:
        "The stored source-pinned SCEP payment parameters are unavailable or invalid, so Farm Return will not calculate an amount.",
      sourceIds: paymentSourceIds,
    };
  }

  const maximumPayableArea = reference / referenceDivisor;
  const minimumAreaForKnownRule =
    maximumPayableArea * minimumAreaFraction;
  if (eligibleForage < minimumAreaForKnownRule) {
    return {
      state: "REVIEW_REQUIRED",
      currency: "EUR",
      amount: null,
      low: null,
      high: null,
      method: "scep_2026_area_rate",
      rateStatus: "final",
      detail:
        "The recorded eligible forage area is below " +
        String(Math.round(minimumAreaFraction * 100)) +
        "% of the maximum payable area. The source used by Farm Return does not state the resulting payment rule, so no amount is guessed.",
      sourceIds: paymentSourceIds,
    };
  }

  const payableArea = Math.min(eligibleForage, maximumPayableArea);
  const firstBand = Math.min(payableArea, firstBandHa);
  const secondBand = Math.max(0, payableArea - firstBandHa);
  const amount =
    Math.round(
      (firstBand * firstBandRate + secondBand * remainingRate) * 100,
    ) / 100;

  return {
    state: "CALCULATED",
    currency: "EUR",
    amount,
    low: amount,
    high: amount,
    method: "scep_2026_area_rate",
    rateStatus: "final",
    detail:
      "Maximum potential gross payment from the stored source-pinned area rates and the recorded 2026 eligible forage area. Full payment still depends on all SCEP requirements and may be reduced by deductions such as genotyping costs or non-compliance.",
    sourceIds: paymentSourceIds,
  };
};

function evaluationByRuleKey(
  evaluations: SchemeRuleEvaluation[],
  key: string,
): SchemeRuleEvaluation | null {
  return evaluations.find((evaluation) => evaluation.ruleKey === key) ?? null;
}

function storedRuleByKey(
  definition: StoredSchemeDefinition,
  key: string,
) {
  return definition.rules.find((rule) => rule.ruleKey === key);
}

function consequenceDate(
  definition: StoredSchemeDefinition,
  ruleKey: string,
  field: string,
): string | null {
  const value = storedRuleByKey(definition, ruleKey)?.consequence[field];
  return typeof value === "string" && value.length >= 10
    ? value.slice(0, 10)
    : null;
}

function deadlineState(
  deadline: string | null,
  nowIso: string,
): "past" | "upcoming" | null {
  if (!deadline) return null;
  return nowIso.slice(0, 10) > deadline ? "past" : "upcoming";
}

function actionProgress(
  evaluations: SchemeRuleEvaluation[],
  snapshot: ReadonlyMap<string, SchemeDataPoint>,
  definition: StoredSchemeDefinition,
  nowIso: string,
): Scep2026ActionProgress[] {
  const reference = asFiniteNumber(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key)?.value,
  );
  const calves = asFiniteNumber(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key)?.value,
  );
  const highMerit = asFiniteNumber(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key)?.value,
  );
  const genotypes = asFiniteNumber(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key)?.value,
  );
  const weighedPairs = asFiniteNumber(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key)?.value,
  );

  const calvingRatio = finiteRuleNumber(
    storedRuleByKey(definition, SCEP_2026_RULE_KEYS.CALVING),
    "ratio",
  );
  const sireRatio = finiteRuleNumber(
    storedRuleByKey(definition, SCEP_2026_RULE_KEYS.HIGH_MERIT_SIRES),
    "ratio",
  );
  const genotypeRatio = finiteRuleNumber(
    storedRuleByKey(definition, SCEP_2026_RULE_KEYS.GENOTYPING),
    "ratio",
  );
  const weighingRatio = finiteRuleNumber(
    storedRuleByKey(definition, SCEP_2026_RULE_KEYS.WEIGHING),
    "ratio",
  );

  const calvingDeadline = consequenceDate(
    definition,
    SCEP_2026_RULE_KEYS.CALVING,
    "scheme_year_calving_end",
  );
  const sireDeadline = consequenceDate(
    definition,
    SCEP_2026_RULE_KEYS.HIGH_MERIT_SIRES,
    "scheme_year_calving_end",
  );
  const genotypeDeadline = consequenceDate(
    definition,
    SCEP_2026_RULE_KEYS.GENOTYPING,
    "deadline",
  );
  const weighingDeadline = consequenceDate(
    definition,
    SCEP_2026_RULE_KEYS.WEIGHING,
    "deadline",
  );

  const rows: Scep2026ActionProgress[] = [
    {
      key: "calving",
      label: "Calving requirement",
      current: calves,
      target:
        reference === null || calvingRatio === null
          ? null
          : Math.floor(reference * calvingRatio),
      unit: "animals",
      deadline: calvingDeadline,
      deadlineState: deadlineState(calvingDeadline, nowIso),
      state:
        evaluationByRuleKey(evaluations, SCEP_2026_RULE_KEYS.CALVING)?.state ??
        "UNKNOWN",
      detail:
        evaluationByRuleKey(evaluations, SCEP_2026_RULE_KEYS.CALVING)?.detail ??
        "Record the Scheme Year 4 eligible calf count from ICBF/AgFood.",
    },
    {
      key: "eligible_sires",
      label: "Action 1 · Eligible sire / AI",
      current: highMerit,
      target:
        reference === null || calves === null || sireRatio === null
          ? null
          : Math.ceil(Math.min(reference, calves) * sireRatio),
      unit: "animals",
      deadline: sireDeadline,
      deadlineState: deadlineState(sireDeadline, nowIso),
      state:
        evaluationByRuleKey(
          evaluations,
          SCEP_2026_RULE_KEYS.HIGH_MERIT_SIRES,
        )?.state ?? "UNKNOWN",
      detail:
        evaluationByRuleKey(
          evaluations,
          SCEP_2026_RULE_KEYS.HIGH_MERIT_SIRES,
        )?.detail ??
        "Record the number of eligible calves sired by a SCEP-eligible 4- or 5-star source.",
    },
    {
      key: "genotyping",
      label: "Action 3 · Genotyping",
      current: genotypes,
      target:
        reference === null || genotypeRatio === null
          ? null
          : Math.floor(reference * genotypeRatio),
      unit: "animals",
      deadline: genotypeDeadline,
      deadlineState: deadlineState(genotypeDeadline, nowIso),
      state:
        evaluationByRuleKey(evaluations, SCEP_2026_RULE_KEYS.GENOTYPING)
          ?.state ?? "UNKNOWN",
      detail:
        evaluationByRuleKey(evaluations, SCEP_2026_RULE_KEYS.GENOTYPING)
          ?.detail ??
        "Record the 2026 genotype count shown by ICBF.",
    },
    {
      key: "weighing",
      label: "Action 4 · Cow-calf weighing",
      current: weighedPairs,
      target:
        reference === null || calves === null || weighingRatio === null
          ? null
          : Math.floor(Math.min(reference, calves) * weighingRatio),
      unit: "pairs",
      deadline: weighingDeadline,
      deadlineState: deadlineState(weighingDeadline, nowIso),
      state:
        evaluationByRuleKey(evaluations, SCEP_2026_RULE_KEYS.WEIGHING)
          ?.state ?? "UNKNOWN",
      detail:
        evaluationByRuleKey(evaluations, SCEP_2026_RULE_KEYS.WEIGHING)
          ?.detail ??
        "Record the eligible cow-calf pairs whose weights were submitted to ICBF.",
    },
  ];

  return rows;
}

function viewState(
  participation: boolean | null,
  evaluations: SchemeRuleEvaluation[],
): { state: Scep2026State; stateLabel: string; summary: string } {
  if (participation === null) {
    return {
      state: "PARTICIPATION_UNKNOWN",
      stateLabel: "Check participation",
      summary:
        "Tell Farm Return whether this farm is in SCEP before it asks for any programme-specific figures.",
    };
  }
  if (!participation) {
    return {
      state: "NOT_PARTICIPATING",
      stateLabel: "Not participating",
      summary:
        "This farm is recorded as not participating in the 2023–2027 SCEP programme. New entry is not treated as open.",
    };
  }

  const actionable = evaluations.filter(
    (evaluation) =>
      evaluation.ruleKey !== SCEP_2026_RULE_KEYS.PARTICIPATION &&
      evaluation.ruleKey !== SCEP_2026_RULE_KEYS.ACTION5_REVIEW,
  );

  if (actionable.some((evaluation) => evaluation.state === "FAIL")) {
    return {
      state: "NEEDS_ATTENTION",
      stateLabel: "Needs attention",
      summary:
        "At least one tracked 2026 SCEP requirement is below the source-pinned target.",
    };
  }

  if (
    actionable.some(
      (evaluation) =>
        evaluation.state === "EVIDENCE_CONFLICT" ||
        evaluation.state === "INVALID_EVIDENCE" ||
        evaluation.state === "REVIEW_REQUIRED" ||
        evaluation.state === "UNSUPPORTED",
    )
  ) {
    return {
      state: "REVIEW_REQUIRED",
      stateLabel: "Needs review",
      summary:
        "Farm Return cannot safely determine at least one tracked requirement from the current evidence.",
    };
  }

  if (actionable.some((evaluation) => evaluation.state === "UNKNOWN")) {
    return {
      state: "INFORMATION_MISSING",
      stateLabel: "Information needed",
      summary:
        "The farm is recorded as participating; complete the remaining SCEP figures to assess the tracked 2026 actions.",
    };
  }

  return {
    state: "TRACKED_ACTIONS_ON_TRACK",
    stateLabel: "Tracked actions on track",
    summary:
      "Every 2026 action Farm Return currently evaluates is at or above its source-pinned target. This is not a declaration of full DAFM compliance.",
  };
}

export function buildScep2026View(input: {
  definition: StoredSchemeDefinition;
  profile: SupportProfile;
  assertions: SchemeFactAssertion[];
  nowIso: string;
}): Scep2026View {
  const { definition, profile, assertions, nowIso } = input;
  const snapshot = buildScep2026Snapshot(profile, assertions);
  const participation = asBoolean(
    snapshot.get(SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key)?.value,
  );

  const applicableRuleIds = new Set<string>();
  const participationRule = definition.rules.find(
    (rule) => rule.ruleKey === SCEP_2026_RULE_KEYS.PARTICIPATION,
  );
  if (participationRule) applicableRuleIds.add(participationRule.id);
  if (participation === true) {
    for (const rule of definition.rules) applicableRuleIds.add(rule.id);
  }

  const evaluations = definition.rules
    .filter((rule) => applicableRuleIds.has(rule.id))
    .map((rule) =>
      evaluateStoredSchemeRule(
        rule,
        snapshot,
        nowIso,
        SCEP_2026_RULE_OPERATORS,
      ),
    );

  const requirements = requirementsForApplicableRules(
    definition,
    applicableRuleIds,
  );
  const schemeVersionKey =
    definition.version.schemeKey +
    ":" +
    String(definition.version.schemeYear) +
    ":" +
    definition.version.rulesVersion;
  const readiness = evaluateSchemeReadiness(
    schemeVersionKey,
    requirements,
    snapshot,
  );
  const state = viewState(participation, evaluations);
  const payment = calculateSchemePayment(definition, snapshot, {
    [schemeVersionKey]: scep2026PaymentCalculator,
  });

  const factKeys = [
    SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
    SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
    SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key,
    SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key,
    SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key,
    SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key,
    SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key,
    SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key,
    SCHEME_DATA_KEYS.SCEP_SURVEYS_SUBMITTED_2026.key,
  ];
  const factValues: Record<string, boolean | number | null> = {};
  for (const key of factKeys) {
    const value = snapshot.get(key)?.value;
    factValues[key] =
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
        ? value
        : null;
  }

  return {
    schemeVersionId: definition.version.id,
    schemeVersionKey,
    name: definition.version.displayName,
    ...state,
    participation,
    readiness,
    evaluations,
    actions:
      participation === true
        ? actionProgress(evaluations, snapshot, definition, nowIso)
        : [],
    payment,
    limitations: [
      "Farm Return is currently tracking the source-pinned Year 4 calving, eligible-sire, genotyping and weighing requirements. Action 5 survey completion and all penalty calculations are not yet used to declare full SCEP compliance.",
      "Figures entered here are farmer-confirmed snapshots from AgFood/ICBF unless a future verified external import replaces them. They are not presented as DAFM-verified.",
      "The payment figure is a maximum potential gross amount from the published area rates. It is not a guaranteed payment and excludes deductions such as genotyping costs or penalties.",
    ],
    nextYear: [
      "SCEP Year 5 increases the eligible-sire / AI target to 90%.",
      "The next female-replacement checkpoint is 75% of the yearly reference number by 31 October 2027.",
    ],
    sources: definition.sources.map((source) => ({
      id: source.id,
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      sourceKey: source.sourceKey,
    })),
    factValues,
  };
}
