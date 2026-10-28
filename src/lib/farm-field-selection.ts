import { resolveFieldSlurryAllocation } from "@/domain/nutrients";
import type { Field, SlurryAllocation } from "@/domain/types";
import type { Prompt } from "@/orchestration/prompt";
import { formatNumber } from "@/lib/format";
import { landUseLabel } from "@/lib/status";
import type { FarmLensId } from "@/lib/farm-spatial-lenses";
import { fieldNutrientPlanHref, fieldWorkspaceHref, type FarmFieldLensView } from "@/lib/farm-spatial-field-lens";
import { nutrientCellText, type FieldNutrientPlanView } from "@/lib/field-nutrient-plan-presentation";

/**
 * Farm + Fields redesign — what the selected-field panel over the Farm map
 * says (`docs/design/farm-fields-high-fidelity-reference.md` "Selected field
 * contextual panel"), in its approved order: identity → one current-state
 * statement → quiet next/planned context → one primary action → deeper
 * links.
 *
 * Presentation only. Every statement and row is read from data the caller
 * already holds: the persisted `Field`, the active lens's
 * `FarmFieldLensView`, the field's canonical `FieldNutrientPlanView`
 * (`buildFieldNutrientPlan` via `fieldNutrientPlanView`) and the field's own
 * leading `Prompt` (`selectPrimaryPrompt` over the real producers). Nothing
 * is calculated, ranked or inferred here. When evidence is missing the
 * panel says so plainly, and the primary action stays the neutral
 * "Open field workspace" rather than guessing at work.
 *
 * Deliberately never shown, because the model has no source for it yet:
 * livestock on a field (groups carry no field location), a current use
 * distinct from the recorded planned use, grass cover, or a field-level
 * ground-conditions verdict.
 */

export type SelectionTone = "fact" | "unknown" | "blocked";

export interface SelectionStatement {
  text: string;
  tone: SelectionTone;
}

export interface SelectionContextRow {
  label: string;
  value: string;
  tone: SelectionTone;
}

export interface SelectionLink {
  label: string;
  href: string;
}

export interface FarmFieldSelectionView {
  /** "3.40 ha" — the polygon-derived area. */
  area: string;
  /** "Planned · Grazing", or undefined when no use is recorded. */
  useLine?: string;
  statement: SelectionStatement;
  /** At most three quiet rows of next/planned context. */
  context: SelectionContextRow[];
  primaryAction: SelectionLink;
  secondaryLinks: SelectionLink[];
}

export interface FarmFieldSelectionInput {
  lens: FarmLensId;
  field: Field;
  lensView: FarmFieldLensView;
  /** The field's canonical nutrient plan view, when one was assembled. */
  nutrientPlan?: FieldNutrientPlanView;
  /** The field's own leading Prompt from the real producers, if any. */
  leadingPrompt?: Prompt;
  /** Real farm-wide spreading-calendar lines (Conditions lens). */
  conditionsFacts?: readonly string[];
  /** The farm's persisted slurry allocations (planned spreading). */
  slurryAllocations: readonly SlurryAllocation[];
}

const MAX_CONTEXT_ROWS = 3;

function plannedUse(field: Field): string | undefined {
  const tracked = field.plannedUse;
  if (!tracked || tracked.status === "unavailable") return undefined;
  return landUseLabel(tracked.value);
}

function promptStatement(prompt: Prompt): SelectionStatement {
  const status = prompt.basis.status;
  return { text: prompt.title, tone: status === "LEGAL_PROHIBITION" ? "blocked" : status === "OK" ? "fact" : "unknown" };
}

function nutrientStatement(plan: FieldNutrientPlanView | undefined): SelectionStatement {
  if (!plan) return { text: "This field's nutrient plan isn't assembled yet.", tone: "unknown" };
  if (plan.status === "unavailable") return { text: plan.message, tone: "unknown" };
  const remainingN = plan.rows[2].cells.n;
  if (remainingN.state === "value") {
    const basis = plan.organic.state === "planned" ? "after planned slurry" : "with no slurry planned";
    return { text: `${nutrientCellText(remainingN)} kg N/ha remaining ${basis}.`, tone: "fact" };
  }
  return { text: plan.unknownReasons[0] ?? "Nitrogen still needed can't be worked out from the evidence on file.", tone: "unknown" };
}

/** The first statutory gate the canonical plan reports as blocking —
 * never re-evaluated here, and absent when no plan was assembled. */
function legalGateRow(plan: FieldNutrientPlanView | undefined): SelectionContextRow | undefined {
  if (!plan || plan.status !== "available") return undefined;
  const gate = plan.legalGates.find((g) => g.state === "prohibited" || g.state === "blocked");
  return gate ? { label: "Legal gate", value: `${gate.label} · ${gate.text}`, tone: "blocked" } : undefined;
}

function factRow(view: FarmFieldLensView, label: string): SelectionContextRow | undefined {
  const fact = view.facts.find((f) => f.label === label);
  if (!fact) return undefined;
  return { label, value: fact.basis ? `${fact.value} · ${fact.basis}` : fact.value, tone: fact.missing ? "unknown" : "fact" };
}

function present<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function farmFieldSelectionView(input: FarmFieldSelectionInput): FarmFieldSelectionView {
  const { lens, field, lensView, nutrientPlan, leadingPrompt } = input;
  const use = plannedUse(field);
  const useRow: SelectionContextRow = use ? { label: "Planned use", value: use, tone: "fact" } : { label: "Planned use", value: "Not set", tone: "unknown" };
  const legal = legalGateRow(nutrientPlan);
  const workspace: SelectionLink = { label: "Open field workspace", href: fieldWorkspaceHref(field.id) };

  let statement: SelectionStatement;
  let context: (SelectionContextRow | undefined)[];
  let primaryAction: SelectionLink = workspace;

  switch (lens) {
    case "current":
      statement = leadingPrompt ? promptStatement(leadingPrompt) : { text: "No open prompt for this field.", tone: "unknown" };
      context = [useRow, plannedSlurryRow(input), legal];
      break;
    case "grass":
      statement = { text: lensView.unavailableNote ?? "Grass isn't measured for this field yet.", tone: "unknown" };
      context = [useRow];
      break;
    case "nutrients":
      statement = nutrientStatement(nutrientPlan);
      context = [legal, factRow(lensView, "P"), factRow(lensView, "K"), factRow(lensView, "Soil test")];
      if (nutrientPlan?.status === "available") {
        primaryAction = { label: "Open nutrient plan", href: fieldNutrientPlanHref(field.id) };
      } else if (!field.fertility.verifiedTest) {
        // A real, supported workflow for a real absence: no lab test is on record.
        primaryAction = { label: "Take soil sample", href: `/soil-sample/${encodeURIComponent(field.id)}` };
      }
      break;
    case "conditions": {
      const facts = input.conditionsFacts ?? [];
      statement = facts.length > 0 ? { text: facts.join(" · "), tone: facts.some((f) => /closed/i.test(f)) ? "blocked" : "fact" } : { text: "Spreading calendar not assessed yet.", tone: "unknown" };
      context = [{ label: "Scope", value: "Farm-wide calendar, not a field verdict", tone: "unknown" }, useRow];
      break;
    }
  }

  const secondaryLinks: SelectionLink[] = [
    ...(primaryAction.href === workspace.href ? [] : [workspace]),
    { label: "Nutrients", href: fieldWorkspaceHref(field.id, "nutrients") },
    { label: "History", href: fieldWorkspaceHref(field.id, "history") },
  ];

  return {
    area: `${formatNumber(field.areaHa, 2)} ha`,
    ...(use ? { useLine: `Planned · ${use}` } : {}),
    statement,
    context: context.filter(present).slice(0, MAX_CONTEXT_ROWS),
    primaryAction,
    secondaryLinks,
  };
}

/** Planned spreading from the field's own persisted allocation — shown only
 * when one exists (no allocation is not news on the Current lens). */
function plannedSlurryRow(input: FarmFieldSelectionInput): SelectionContextRow | undefined {
  const allocation = resolveFieldSlurryAllocation(input.slurryAllocations, input.field.id);
  return allocation ? { label: "Slurry planned", value: `${formatNumber(allocation.volumeM3, 0)} m³`, tone: "fact" } : undefined;
}
