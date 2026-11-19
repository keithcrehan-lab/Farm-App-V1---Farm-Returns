/**
 * Farm Overview Phase 1 (2026-11-19,
 * `docs/farm-return-next/design/FARM_OVERVIEW_SMART_HYBRID_PHASE1_BRIEF_20261119.md`)
 * — what the Overview map's "Farm Today" panel and its field indicators say.
 *
 * Presentation only. Every input is already computed by the Farm page's
 * canonical producers (`buildAllRealPrompts`, `buildTodayOpportunities`);
 * nothing here recomputes, scores or invents a scientific, regulatory or
 * financial value. Two different questions are kept strictly apart:
 *
 * - **Farm-wide topics** (`TodayOpportunity`): "how important is Slurry /
 *   Lime / Fertiliser / Soil for the farm today?" Their priority is the
 *   canonical farm-topic priority and is shown as such, labelled
 *   "Farm-wide". Category membership (`affectedFieldIds`) is never turned
 *   into a field marker: a topic never marks a field.
 * - **Field actions**: a field is marked only when one of its OWN real,
 *   field-scoped Prompts is in an actionable state that the producer itself
 *   established for that field:
 *     - `soil_test_age` OK with value `DISREGARD` — the statutory 4-year
 *       rule says this field's own soil test can no longer be used and a new
 *       test is needed (`soil-test-age.ts`).
 *     - `fertiliser_recommendation` OK — the nutrient engine recommends a
 *       purchased product for this field — and only while that SAME field's
 *       own chemical-fertiliser spreading-window Prompt is OK (open). In the
 *       statutory closed period it cannot be acted on, so it stays a
 *       farm-wide planning topic only, never a field marker.
 *   Spreading-window, commonage and local-buffer Prompts are calendar or
 *   evidence-gap facts, not field actions, and never mark a field.
 *
 * Ordering is deterministic and claims no field-level urgency: farm-wide
 * topics keep the canonical order `buildTodayOpportunities` returns; field
 * groups are ordered by field name then stable field id (this app has no
 * field-level priority model — `today-opportunities.ts`'s closing note).
 * At most `FARM_TODAY_MAX_MAP_LABELS` mapped fields get a text label; any
 * other field with a real action gets a count badge only.
 */
import { EVIDENCE_STATE_UI_LABEL } from "@/domain/evidence";
import type { Field } from "@/domain/types";
import type { Prompt } from "@/orchestration/prompt";
import { FERTILISER_RECOMMENDATION_PROMPT_KIND } from "@/orchestration/prompt/fertiliser-recommendation";
import { SOIL_TEST_AGE_PROMPT_KIND } from "@/orchestration/prompt/soil-test-age";
import { SPREADING_WINDOW_PROMPT_KIND } from "@/orchestration/prompt/spreading-window";
import type { TodayOpportunity, TodayOpportunityCategory } from "@/orchestration/prompt/today-opportunities";
import type { TodayPriority } from "@/orchestration/prompt/today-priority";

/** Owner brief item 7: at most three expanded action labels on the map. */
export const FARM_TODAY_MAX_MAP_LABELS = 3;
/** How many list items the expanded panel shows before "Show more". */
export const FARM_TODAY_INITIAL_VISIBLE = 5;

export const FARM_TODAY_EMPTY_TEXT = "No outstanding actions identified from available records";
export const FARM_TODAY_EMPTY_CAVEAT =
  "Based only on the soil, nutrient, lime and spreading records Farm Return holds for this farm. Missing records can hide work, so this is not an all-clear.";

export type FarmTodayFieldActionKind = "soil_test_renewal" | "fertiliser_recommended";

/** Fixed display wording per field-action kind. `order` is a stable
 * display order within one field, not a severity. */
const FIELD_ACTION_COPY: Record<FarmTodayFieldActionKind, { typeLabel: string; mapLabel: string; order: number }> = {
  soil_test_renewal: { typeLabel: "Soil test", mapLabel: "New soil test needed", order: 0 },
  fertiliser_recommended: { typeLabel: "Fertiliser", mapLabel: "Fertiliser recommended", order: 1 },
};

export interface FarmTodayFieldAction {
  /** Stable across re-renders (Prompt ids are regenerated on every build). */
  key: string;
  kind: FarmTodayFieldActionKind;
  fieldId: string;
  fieldName: string;
  /** True only for a field with a real boundary MapHero can draw/select. */
  mapped: boolean;
  typeLabel: string;
  mapLabel: string;
  /** The producer's own title, verbatim. */
  title: string;
  /** Short provenance line built only from the Prompt's own trace. */
  evidence: string;
  /** The real Prompt — opened in `ExpandedPromptSheet` for its basis. */
  prompt: Prompt;
}

export interface FarmTodayFieldGroup {
  fieldId: string;
  fieldName: string;
  mapped: boolean;
  actions: FarmTodayFieldAction[];
}

export interface FarmTodayTopic {
  key: string;
  category: TodayOpportunityCategory;
  categoryLabel: string;
  headline: string;
  priority: TodayPriority;
  priorityLabel: string;
  /** The topic's first real blocker, verbatim, when one exists. */
  blocker?: string;
  evidence?: string;
  opportunity: TodayOpportunity;
}

export interface FarmTodayMapBadge {
  count: number;
  /** Present only for the (at most three) labelled fields. */
  label?: string;
}

export type FarmTodayLead = { kind: "topic"; topic: FarmTodayTopic } | { kind: "field"; group: FarmTodayFieldGroup };

export interface FarmTodayView {
  status: "loading" | "unavailable" | "ready";
  /** Honest reason for `unavailable`. */
  message?: string;
  /** Canonical HIGH / MEDIUM farm topics. */
  attentionTopics: FarmTodayTopic[];
  /** Canonical LOW / "For later" farm topics — on record, not urgent. */
  laterTopics: FarmTodayTopic[];
  fieldGroups: FarmTodayFieldGroup[];
  fieldActionCount: number;
  /** Mapped field ids carrying a text label on the map (max 3). */
  labelledFieldIds: string[];
  badgeByField: ReadonlyMap<string, FarmTodayMapBadge>;
  lead?: FarmTodayLead;
  /** One-line summary for the collapsed panel. */
  summary: string;
}

export interface BuildFarmTodayViewInput {
  /** False until the page's post-mount producers have run. */
  ready: boolean;
  fields: readonly Pick<Field, "id" | "name" | "polygon">[];
  prompts: readonly Prompt[];
  opportunities: readonly TodayOpportunity[];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatSampleDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

/** The field's own chemical-fertiliser spreading-window status, keyed by
 * field id — the same material split the Farm page's calendar uses. */
function chemicalWindowStatusByField(prompts: readonly Prompt[]): Map<string, Prompt["basis"]["status"]> {
  const byField = new Map<string, Prompt["basis"]["status"]>();
  for (const prompt of prompts) {
    if (prompt.kind !== SPREADING_WINDOW_PROMPT_KIND || !prompt.fieldId) continue;
    if (prompt.inputsSnapshot?.material === "organic_fertiliser_other_than_FYM") continue;
    byField.set(prompt.fieldId, prompt.basis.status);
  }
  return byField;
}

/** Which field action, if any, this one real Prompt establishes for its
 * own field. Exported for tests; see this module's header for the rule. */
export function fieldActionKindForPrompt(
  prompt: Prompt,
  chemicalWindowStatus: ReadonlyMap<string, Prompt["basis"]["status"]>,
): FarmTodayFieldActionKind | undefined {
  if (!prompt.fieldId || prompt.basis.status !== "OK") return undefined;
  if (prompt.kind === SOIL_TEST_AGE_PROMPT_KIND) return prompt.basis.value === "DISREGARD" ? "soil_test_renewal" : undefined;
  if (prompt.kind === FERTILISER_RECOMMENDATION_PROMPT_KIND) {
    return chemicalWindowStatus.get(prompt.fieldId) === "OK" ? "fertiliser_recommended" : undefined;
  }
  return undefined;
}

function evidenceFor(kind: FarmTodayFieldActionKind, prompt: Prompt): string {
  if (kind === "soil_test_renewal") {
    const sampled = formatSampleDate(prompt.inputsSnapshot?.sampleDate);
    return sampled ? `Lab test sampled ${sampled} · statutory 4-year rule` : "Statutory 4-year soil-test rule";
  }
  const tier = prompt.basis.status === "OK" ? EVIDENCE_STATE_UI_LABEL[prompt.basis.evidenceState] : undefined;
  return [tier, "nutrient plan", "chemical calendar open"].filter(Boolean).join(" · ");
}

function topicFrom(opportunity: TodayOpportunity): FarmTodayTopic {
  return {
    key: `topic:${opportunity.category}`,
    category: opportunity.category,
    categoryLabel: opportunity.categoryLabel,
    headline: opportunity.headline,
    priority: opportunity.priority,
    priorityLabel: opportunity.priorityLabel,
    ...(opportunity.blockers[0] ? { blocker: opportunity.blockers[0] } : {}),
    ...(opportunity.evidenceSummary ? { evidence: opportunity.evidenceSummary } : {}),
    opportunity,
  };
}

const EMPTY_BADGES: ReadonlyMap<string, FarmTodayMapBadge> = new Map();

export function buildFarmTodayView(input: BuildFarmTodayViewInput): FarmTodayView {
  const base = { attentionTopics: [], laterTopics: [], fieldGroups: [], fieldActionCount: 0, labelledFieldIds: [], badgeByField: EMPTY_BADGES };
  if (!input.ready) return { ...base, status: "loading", summary: "Checking this farm's records…" };
  if (input.fields.length === 0) {
    return {
      ...base,
      status: "unavailable",
      message: "No fields are on record for this farm yet, so there is nothing to check.",
      summary: "No fields on record yet",
    };
  }

  const topics = input.opportunities.map(topicFrom);
  const attentionTopics = topics.filter((t) => t.priority === "HIGH" || t.priority === "MEDIUM");
  const laterTopics = topics.filter((t) => t.priority === "LOW" || t.priority === "VERY_LOW");

  const fieldById = new Map(input.fields.map((f) => [f.id, f]));
  const chemicalWindow = chemicalWindowStatusByField(input.prompts);
  const groupsById = new Map<string, FarmTodayFieldGroup>();
  for (const prompt of input.prompts) {
    const kind = fieldActionKindForPrompt(prompt, chemicalWindow);
    if (!kind) continue;
    // Only this farm's own listed fields; anything else is ignored.
    const field = fieldById.get(prompt.fieldId!);
    if (!field) continue;
    const group = groupsById.get(field.id) ?? { fieldId: field.id, fieldName: field.name, mapped: Boolean(field.polygon), actions: [] };
    if (group.actions.some((a) => a.kind === kind)) continue;
    const copy = FIELD_ACTION_COPY[kind];
    group.actions.push({
      key: `${kind}:${field.id}`,
      kind,
      fieldId: field.id,
      fieldName: field.name,
      mapped: group.mapped,
      typeLabel: copy.typeLabel,
      mapLabel: copy.mapLabel,
      title: prompt.title,
      evidence: evidenceFor(kind, prompt),
      prompt,
    });
    groupsById.set(field.id, group);
  }
  const fieldGroups = [...groupsById.values()]
    .map((g) => ({ ...g, actions: [...g.actions].sort((a, b) => FIELD_ACTION_COPY[a.kind].order - FIELD_ACTION_COPY[b.kind].order) }))
    .sort((a, b) => a.fieldName.localeCompare(b.fieldName, "en-IE") || (a.fieldId < b.fieldId ? -1 : a.fieldId > b.fieldId ? 1 : 0));
  const fieldActionCount = fieldGroups.reduce((sum, g) => sum + g.actions.length, 0);

  const labelledFieldIds = fieldGroups.filter((g) => g.mapped).slice(0, FARM_TODAY_MAX_MAP_LABELS).map((g) => g.fieldId);
  const badgeByField = new Map<string, FarmTodayMapBadge>();
  for (const group of fieldGroups) {
    if (!group.mapped) continue;
    const count = group.actions.length;
    const label = labelledFieldIds.includes(group.fieldId)
      ? `${group.actions[0].mapLabel}${count > 1 ? ` +${count - 1}` : ""}`
      : undefined;
    badgeByField.set(group.fieldId, { count, ...(label ? { label } : {}) });
  }

  const lead: FarmTodayLead | undefined = attentionTopics[0]
    ? { kind: "topic", topic: attentionTopics[0] }
    : fieldGroups[0]
      ? { kind: "field", group: fieldGroups[0] }
      : undefined;

  const parts: string[] = [];
  if (attentionTopics.length > 0) parts.push(`${plural(attentionTopics.length, "farm-wide topic")} to review`);
  if (fieldActionCount > 0) parts.push(`${plural(fieldActionCount, "field action")}`);
  const summary = parts.length > 0 ? parts.join(" · ") : FARM_TODAY_EMPTY_TEXT;

  return { status: "ready", attentionTopics, laterTopics, fieldGroups, fieldActionCount, labelledFieldIds, badgeByField, ...(lead ? { lead } : {}), summary };
}

/** A stable string of the map indicators, for `MapHero`'s `markerContentKey`. */
export function farmTodayBadgeSignature(view: FarmTodayView): string {
  return [...view.badgeByField.entries()].map(([id, badge]) => `${id}=${badge.count}${badge.label ? `:${badge.label}` : ""}`).join(",");
}
