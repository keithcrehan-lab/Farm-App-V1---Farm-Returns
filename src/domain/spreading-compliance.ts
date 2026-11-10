/**
 * One consolidated spreading-rules status for the farm, per material.
 *
 * The statutory closed period depends only on the farm's county (its
 * Nitrates zone), the material and the date, so it is the same for every
 * field. `buildAllRealPrompts` still produces one spreading-window Prompt
 * per field and material (other screens rely on that); this module is the
 * farm-level view of the same rule for Plan. Dates come from the sourced
 * `CLOSED_PERIOD_BY_ZONE_MATERIAL` table via `closedPeriodEntries`; the
 * field Prompts are read only to confirm the status and carry their
 * provenance. Nothing here is dismissible: a restriction is information,
 * not a job.
 */
import { CLOSED_PERIOD_CALENDAR_VERSION, COUNTY_ZONE, normaliseCountyForZoneLookup, type SpreadingMaterial } from "./closed-period-calendar";
import { addDays, closedPeriodEntries } from "./farm-calendar";

export const SPREADING_MATERIAL_LABEL: Record<SpreadingMaterial, string> = {
  chemical_fertiliser: "Chemical fertiliser",
  organic_fertiliser_other_than_FYM: "Slurry and soiled water",
  farmyard_manure: "Farmyard manure",
};

const MATERIALS = Object.keys(SPREADING_MATERIAL_LABEL) as SpreadingMaterial[];

export interface SpreadingRestriction {
  material: SpreadingMaterial;
  label: string;
  /** True while today is inside the statutory closed period. */
  active: boolean;
  /** The closed period that is running, or the next one. */
  closedFrom: string;
  closedThrough: string;
  /** First day spreading is allowed again (day after closedThrough). */
  reopens: string;
}

export interface SpreadingCompliance {
  county: string;
  zone: string;
  restrictions: SpreadingRestriction[];
  /** Plain-language qualifications that always apply. */
  conditions: string[];
  provenance: { rule: string; calculationVersion: string; checkedOn: string };
}

interface PromptLike {
  kind: string;
  basis: unknown;
  calculationVersion?: string;
  inputsSnapshot?: Record<string, unknown>;
}

const status = (p: PromptLike) => (p.basis as { status?: string } | null)?.status;

export function spreadingCompliance(county: string | null | undefined, today: string, prompts: readonly PromptLike[] = []): SpreadingCompliance | null {
  if (!county) return null;
  const zone = COUNTY_ZONE[normaliseCountyForZoneLookup(county)];
  if (!zone) return null;
  const periods = closedPeriodEntries(county, addDays(today, -400), addDays(today, 400));
  const windowPrompts = prompts.filter((p) => p.kind === "spreading_window");
  const restrictions = MATERIALS.flatMap((material): SpreadingRestriction[] => {
    const mine = periods.filter((e) => e.id.startsWith(`closed-${material}-`)).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const running = mine.find((e) => e.startDate <= today && e.endDate >= today);
    const next = running ?? mine.find((e) => e.startDate > today);
    if (!next) return [];
    const promptSaysClosed = windowPrompts.some((p) => p.inputsSnapshot?.material === material && status(p) === "LEGAL_PROHIBITION");
    return [{
      material,
      label: SPREADING_MATERIAL_LABEL[material],
      active: Boolean(running) || promptSaysClosed,
      closedFrom: next.startDate,
      closedThrough: next.endDate,
      reopens: addDays(next.endDate, 1),
    }];
  });
  const fromPrompt = windowPrompts.find((p) => typeof p.inputsSnapshot?.rule === "string");
  return {
    county,
    zone,
    restrictions,
    conditions: [
      "Even when the calendar is open, check ground and weather conditions before spreading.",
      "Buffer distances from water, commonage rules and the low-emission (LESS) slurry rules still apply.",
    ],
    provenance: {
      rule: (fromPrompt?.inputsSnapshot?.rule as string | undefined) ?? "Statutory closed-period spreading calendar (S.I. 588/2025)",
      calculationVersion: fromPrompt?.calculationVersion ?? CLOSED_PERIOD_CALENDAR_VERSION,
      checkedOn: today,
    },
  };
}
