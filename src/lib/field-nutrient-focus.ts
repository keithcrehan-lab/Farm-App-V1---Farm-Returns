/**
 * Deep-link targets inside a field's Nutrients chapter. Quote readiness
 * links each missing input to the exact control that records it, carrying
 * the quote-planning season so the field workspace edits the same season
 * the plan is calculated for. A stage target opens the stage; an input
 * target also opens its stage and focuses that one control.
 */
export const FIELD_NUTRIENT_STAGE_TARGETS = [
  "production-cycle",
  "soil-evidence",
  "legal-checks",
] as const;

export type FieldNutrientStageTarget =
  (typeof FIELD_NUTRIENT_STAGE_TARGETS)[number];

/** Each exact input target and the stage that holds its control. */
const FIELD_NUTRIENT_INPUT_STAGE = {
  "prior-fertiliser": "production-cycle",
  "production-target": "production-cycle",
  "soil-p": "soil-evidence",
  "soil-k": "soil-evidence",
  "soil-test-date": "soil-evidence",
  commonage: "legal-checks",
  "water-buffer": "legal-checks",
  "slurry-spreading": "legal-checks",
} as const satisfies Record<string, FieldNutrientStageTarget>;

export type FieldNutrientInputTarget = keyof typeof FIELD_NUTRIENT_INPUT_STAGE;

export const FIELD_NUTRIENT_FOCUS_TARGETS = [
  ...FIELD_NUTRIENT_STAGE_TARGETS,
  ...(Object.keys(FIELD_NUTRIENT_INPUT_STAGE) as FieldNutrientInputTarget[]),
] as const;

export type FieldNutrientFocusTarget =
  | FieldNutrientStageTarget
  | FieldNutrientInputTarget;

export function parseFieldNutrientFocusTarget(
  value: string | null | undefined,
): FieldNutrientFocusTarget | undefined {
  return FIELD_NUTRIENT_FOCUS_TARGETS.find((target) => target === value);
}

/** The Nutrients stage that must be open for a focus target. */
export function fieldNutrientFocusStage(
  focus: FieldNutrientFocusTarget | undefined,
): FieldNutrientStageTarget | undefined {
  if (!focus) return undefined;
  return (FIELD_NUTRIENT_STAGE_TARGETS as readonly string[]).includes(focus)
    ? (focus as FieldNutrientStageTarget)
    : FIELD_NUTRIENT_INPUT_STAGE[focus as FieldNutrientInputTarget];
}

/** Attribute that marks the exact control for an input target. */
export const FIELD_NUTRIENT_FOCUS_ATTRIBUTE = "data-nutrient-focus";

export function fieldNutrientsHref(
  fieldId: string,
  options: { focus?: FieldNutrientFocusTarget; planningSeason?: string } = {},
): string {
  const params = [
    `field=${encodeURIComponent(fieldId)}`,
    "chapter=nutrients",
    ...(options.focus ? [`focus=${options.focus}`] : []),
    ...(options.planningSeason
      ? [`season=${encodeURIComponent(options.planningSeason)}`]
      : []),
  ];
  const stage = fieldNutrientFocusStage(options.focus);
  return `/fields?${params.join("&")}${stage ? `#${stage}` : ""}`;
}

/** Deep-link targets in a field's Overview chapter: the field-use editor
 * and the mapped boundary that defines the field's area. */
export type FieldOverviewFocusTarget = "field-use" | "field-area";

export function fieldOverviewFocusHref(
  fieldId: string,
  focus: FieldOverviewFocusTarget,
  planningSeason?: string,
): string {
  const params = [
    `field=${encodeURIComponent(fieldId)}`,
    "chapter=overview",
    `focus=${focus}`,
    ...(planningSeason ? [`season=${encodeURIComponent(planningSeason)}`] : []),
  ];
  return `/fields?${params.join("&")}#${focus}`;
}
