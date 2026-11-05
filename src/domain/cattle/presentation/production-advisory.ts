/**
 * Production advisory v1 — a group's "Production recommendation": whether
 * Farm Return can issue a biological production-path recommendation from
 * the records it already holds (READINESS), how well supported that
 * recommendation is (CONFIDENCE), and — separately — whether economics can
 * be assessed (ECONOMICS, never a blocker).
 *
 * Deterministic and conservative. Everything here is a reading of records
 * the farm already holds; nothing is re-asked of the farmer:
 *  - animal type: the group's category and goal (`livestock_groups`);
 *  - age: every individually recorded member's C1 date of birth, or the
 *    group record's average age;
 *  - liveweight: every member's C4 latest weight (never averaged), or the
 *    group record's average weight;
 *  - production system: the group record's grazing / housed system.
 *
 * The only biological figure used is the class guideline gain already
 * encoded from Teagasc DairyBeef 500 Table 3 (`targetADGForAnimalType`,
 * `TEAGASC_DAIRYBEEF_DMD`). No target weight, sale date, processor spec,
 * price or margin is derived — so v1 is advisory only and never saves a
 * production plan. Age is a readiness fact and shown in the reasons; v1
 * applies no age-band rule (none is evidenced in the repository).
 *
 * Confidence rule (documented, tested): the applicable supporting records
 * (breed, sex where the category doesn't imply it, weight history,
 * grass/silage context, confirmed feeding situation) — none missing → High,
 * one or two missing → Moderate, three or more → Low; then capped at
 * Moderate for a group at grass (the guideline is for a housed grass-silage
 * winter diet) and at Low for finishing bulls (no published guideline gain).
 */

import { compareInstants } from "@/domain/cattle/animal-ledger";
import { targetADGForAnimalType } from "@/domain/livestock";
import { BEEF_CONCENTRATE_ITEM_ID, INPUT_MARKET_CATALOGUE } from "@/domain/inputs-market";
import { SOURCE_REGISTER } from "@/domain/source-register";
import type { CattleFeedingSituation, SilageQualityBasis } from "@/domain/cattle-group-production-plan";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import type { CattleOutputs } from "./cattle-outputs";
import type { DisplayTone } from "./display-states";
import type { HerdVM } from "./herd-view";
import { listedItems, details, type Details } from "./view-state";
import { ageInMonths, formatAge, formatDate, formatKgNumber } from "./format";
import { latestWeightOf } from "./weight-view";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One individually recorded member, read from its C1 snapshot and C4 series. `null` = not known. */
export interface GroupAnimalFact {
  dateOfBirth: string | null;
  sex: "MALE" | "FEMALE" | null;
  breedKnown: boolean;
  latestWeightKg: number | null;
  latestWeighedAt: string | null;
  /** Live, in-view weighings. */
  weighings: number;
}

/** The group's individually recorded members, or UNAVAILABLE when their records couldn't be read (never "none"). */
export type GroupAnimalFacts = { state: "KNOWN"; animals: readonly GroupAnimalFact[] } | { state: "UNAVAILABLE" };

export interface ProductionAdvisoryInput {
  category: LivestockCategory;
  goal?: LivestockGoal;
  system?: "grazing" | "housed";
  /** Group record facts. */
  groupSex?: "male" | "female" | "mixed";
  groupBreed?: string;
  groupAvgAgeMonths?: number;
  groupAverageWeightKg?: number;
  groupAverageWeightSource?: string;
  /** Members recorded individually; absent when the evaluation supplied none for the group. */
  animals?: GroupAnimalFacts;
  currentFieldRecorded: boolean;
  plan?: {
    feedingSituation?: CattleFeedingSituation;
    silageQualityBasis?: SilageQualityBasis;
    concentratePriceEurT?: number;
  };
  asOfDate: string;
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type AdvisoryActionVM =
  | { kind: "LINK"; label: string; href: string }
  | { kind: "OPEN_EDITOR"; label: string }
  | { kind: "OPEN_LOCATION"; label: string }
  /** No safe in-app route exists: `label` says what must be recorded. */
  | { kind: "INSTRUCTION"; label: string };

export interface AdvisoryItemVM {
  code: string;
  label: string;
  /** The value read from the records, or why it isn't usable. */
  value: string;
  met: boolean;
  action: AdvisoryActionVM;
}

export interface AdvisoryStatusVM {
  label: string;
  detail: string;
  tone: DisplayTone;
}

export type AdvisoryState = "READY" | "ALMOST_READY" | "NOT_COVERED" | "UNAVAILABLE";

export interface ProductionAdvisoryVM {
  state: AdvisoryState;
  title: string;
  summary: string;
  readiness: AdvisoryStatusVM;
  confidence: AdvisoryStatusVM;
  economics: AdvisoryStatusVM;
  /** The core facts readiness is decided on (met and missing). */
  core: Details<AdvisoryItemVM>;
  /** Core facts still missing — the "required to recommend" checklist. */
  required: Details<AdvisoryItemVM>;
  reasons: Details<string>;
  /** Supporting records not yet in place (each would raise confidence). */
  improve: Details<AdvisoryItemVM>;
  alternatives: string;
  /** Why there is no "Use recommended plan" action. */
  actionNote: string;
  limitations: Details<string>;
  evidence: Details<{ title: string; meta: string; url: string }>;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const ADVISORY_ROUTES = {
  addCattle: "/cattle/manage",
  groupAnimals: "#group-animals",
} as const;

const CONFIDENCE_LABEL = { HIGH: "High", MODERATE: "Moderate", LOW: "Low" } as const;
type ConfidenceLevel = keyof typeof CONFIDENCE_LABEL;
const RANK: Record<ConfidenceLevel, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };

const NOT_ASSESSED: AdvisoryStatusVM = {
  label: "Confidence not assessed",
  detail: "Confidence is assessed once the core facts are in place.",
  tone: "unknown",
};

const ALTERNATIVES_NOT_RANKED =
  "Alternatives aren't ranked yet. Comparing finishing, selling as stores or a different pace needs sale-price and feed-response evidence Farm Return doesn't hold.";

const ADVISORY_ONLY =
  "Advisory only. This recommends a production path and pace, not a target weight or sale date, so nothing is saved for you. Use Override / edit production target to set your own target; the feeding plan follows it.";

const DAIRYBEEF = SOURCE_REGISTER.TEAGASC_DAIRYBEEF_DMD;

const EVIDENCE = details([
  {
    title: DAIRYBEEF.title,
    meta: `${DAIRYBEEF.authority}${DAIRYBEEF.publicationDate ? ` · ${formatDate(DAIRYBEEF.publicationDate)}` : ""} · guideline gain by class (Table 3)`,
    url: DAIRYBEEF.url ?? "",
  },
]);

const LIMITATIONS = details([
  "v1 uses the published class guideline gain only. It does not set a target weight, sale date or processor specification.",
  "Age is checked as a recorded fact; no age-band rule is applied in v1.",
  "Economics are not part of this recommendation.",
]);

// ---------------------------------------------------------------------------
// Animal facts (from the frozen engines' outputs, read-only)
// ---------------------------------------------------------------------------

/**
 * Per group: its individually recorded members' facts, read from the C1
 * snapshots and C4 series the evaluation already produced. A group whose
 * scope couldn't be resolved is UNAVAILABLE (never an empty member list).
 */
export function groupAnimalFactsOf(outputs: CattleOutputs, herd: HerdVM): Record<string, GroupAnimalFacts> {
  const out: Record<string, GroupAnimalFacts> = {};
  for (const group of listedItems(herd.groups)) {
    if (group.scope.state !== "KNOWN") {
      out[group.groupRef] = { state: "UNAVAILABLE" };
      continue;
    }
    if (group.scope.value.members.state === "UNAVAILABLE") {
      out[group.groupRef] = { state: "UNAVAILABLE" };
      continue;
    }
    const animals = listedItems(group.scope.value.members).map((row): GroupAnimalFact => {
      const snap = outputs.snapshots[row.animalId] ?? null;
      const series = outputs.weights?.series.find((s) => s.animalId === row.animalId) ?? null;
      const latest = latestWeightOf(series);
      return {
        dateOfBirth: snap?.dateOfBirth.state === "KNOWN" ? snap.dateOfBirth.value : null,
        sex: snap?.sex.state === "KNOWN" && (snap.sex.value === "MALE" || snap.sex.value === "FEMALE") ? snap.sex.value : null,
        breedKnown: snap?.breed.state === "KNOWN",
        latestWeightKg: latest.state === "KNOWN" ? latest.kg : null,
        latestWeighedAt: latest.state === "KNOWN" ? latest.observedAt : null,
        weighings: series?.observations.length ?? 0,
      };
    });
    out[group.groupRef] = { state: "KNOWN", animals };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Path coverage
// ---------------------------------------------------------------------------

type Path =
  | { kind: "WEANLING"; adg: number }
  | { kind: "FINISH"; stage: "finishing_steer" | "finishing_heifer"; adg: number; noun: string }
  | { kind: "FINISH_BULL" }
  | { kind: "NOT_COVERED"; reason: string };

const CATEGORY_NOUN: Record<LivestockCategory, string> = {
  suckler_cow: "Suckler cows",
  dairy_cow: "Dairy cows",
  bull: "Bulls",
  calf: "Calves",
  weanling: "Weanlings",
  store: "Stores",
  steer: "Steers",
  heifer: "Heifers",
};

function pathOf(category: LivestockCategory, goal: LivestockGoal | undefined): Path {
  if (category === "weanling" && goal !== "breed") return { kind: "WEANLING", adg: targetADGForAnimalType("weanling") };
  if (category === "steer" && goal === "finish_slaughter") return { kind: "FINISH", stage: "finishing_steer", adg: targetADGForAnimalType("finishing_steer"), noun: "steers" };
  if (category === "heifer" && goal === "finish_slaughter") return { kind: "FINISH", stage: "finishing_heifer", adg: targetADGForAnimalType("finishing_heifer"), noun: "heifers" };
  if (category === "bull" && goal === "finish_slaughter") return { kind: "FINISH_BULL" };
  if (category === "suckler_cow" || category === "dairy_cow" || goal === "breed") {
    return { kind: "NOT_COVERED", reason: "Breeding stock aren't covered by v1 production-path advice, which covers weanlings and cattle being finished." };
  }
  if (category === "steer" || category === "heifer" || category === "bull") {
    return {
      kind: "NOT_COVERED",
      reason: `${CATEGORY_NOUN[category]} are covered when the group goal is Finish to slaughter. Choosing between finishing and selling as stores needs sale-price evidence Farm Return doesn't hold, so it isn't recommended here.`,
    };
  }
  return { kind: "NOT_COVERED", reason: `${CATEGORY_NOUN[category]} aren't covered by v1 production-path advice, which covers weanlings and cattle being finished (Teagasc DairyBeef 500).` };
}

// ---------------------------------------------------------------------------
// Core facts
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function membersOf(input: ProductionAdvisoryInput): readonly GroupAnimalFact[] | "UNAVAILABLE" {
  if (!input.animals) return [];
  return input.animals.state === "KNOWN" ? input.animals.animals : "UNAVAILABLE";
}

function typeItem(input: ProductionAdvisoryInput): AdvisoryItemVM {
  return { code: "ANIMAL_TYPE", label: "Animal type", value: CATEGORY_NOUN[input.category], met: true, action: { kind: "INSTRUCTION", label: "Recorded on the group." } };
}

function ageItem(input: ProductionAdvisoryInput, members: readonly GroupAnimalFact[] | "UNAVAILABLE"): AdvisoryItemVM {
  const base = { code: "AGE", label: "Age" };
  if (members !== "UNAVAILABLE" && members.length > 0) {
    const months = members.map((m) => (m.dateOfBirth ? ageInMonths(m.dateOfBirth, input.asOfDate) : null));
    const known = months.filter((m): m is number => m !== null);
    if (known.length === members.length) {
      const lo = Math.min(...known);
      const hi = Math.max(...known);
      return { ...base, value: `${lo === hi ? formatAge(lo) : `${formatAge(lo)} – ${formatAge(hi)}`} · from ${plural(members.length, "date of birth", "dates of birth")}`, met: true, action: { kind: "INSTRUCTION", label: "From the animal records." } };
    }
    if (input.groupAvgAgeMonths !== undefined) {
      return { ...base, value: `${formatAge(input.groupAvgAgeMonths)} average · group record`, met: true, action: { kind: "INSTRUCTION", label: "From the group record." } };
    }
    return {
      ...base,
      value: `Date of birth recorded for ${known.length} of ${plural(members.length, "animal", "animals")}`,
      met: false,
      action: { kind: "INSTRUCTION", label: "Record each animal's date of birth. Farm Return takes a date of birth when an animal is added; it can't yet be edited on an existing animal." },
    };
  }
  if (input.groupAvgAgeMonths !== undefined) {
    return { ...base, value: `${formatAge(input.groupAvgAgeMonths)} average · group record`, met: true, action: { kind: "INSTRUCTION", label: "From the group record." } };
  }
  if (members === "UNAVAILABLE") {
    return { ...base, value: "Animal records couldn't be read", met: false, action: { kind: "INSTRUCTION", label: "Try again shortly; dates of birth are read from the animal records." } };
  }
  return { ...base, value: "Age isn't held for this group", met: false, action: { kind: "LINK", label: "Add the animals with their dates of birth", href: ADVISORY_ROUTES.addCattle } };
}

function weightItem(input: ProductionAdvisoryInput, members: readonly GroupAnimalFact[] | "UNAVAILABLE"): AdvisoryItemVM {
  const base = { code: "LIVEWEIGHT", label: "Current liveweight" };
  const groupAverage = (): AdvisoryItemVM | null =>
    input.groupAverageWeightKg === undefined
      ? null
      : {
          ...base,
          value: `${formatKgNumber(input.groupAverageWeightKg)} kg average · ${input.groupAverageWeightSource ?? "group record"}`,
          met: true,
          action: { kind: "INSTRUCTION", label: "From the group record." },
        };
  if (members !== "UNAVAILABLE" && members.length > 0) {
    const weighed = members.filter((m) => m.latestWeightKg !== null && m.latestWeighedAt !== null);
    if (weighed.length === members.length) {
      const kgs = weighed.map((m) => m.latestWeightKg as number);
      const lo = Math.min(...kgs);
      const hi = Math.max(...kgs);
      const latestAt = weighed.map((m) => m.latestWeighedAt as string).sort(compareInstants)[weighed.length - 1];
      const range = lo === hi ? `${formatKgNumber(lo)} kg` : `${formatKgNumber(lo)}–${formatKgNumber(hi)} kg`;
      return { ...base, value: `${range} · latest weighings, most recent ${formatDate(latestAt)}`, met: true, action: { kind: "INSTRUCTION", label: "From the animal records." } };
    }
    return (
      groupAverage() ?? {
        ...base,
        value: `${weighed.length} of ${plural(members.length, "animal", "animals")} weighed`,
        met: false,
        action: { kind: "LINK", label: "Weigh the remaining animals", href: ADVISORY_ROUTES.groupAnimals },
      }
    );
  }
  const average = groupAverage();
  if (average) return average;
  if (members === "UNAVAILABLE") {
    return { ...base, value: "Animal records couldn't be read", met: false, action: { kind: "INSTRUCTION", label: "Try again shortly; weights are read from the animal records." } };
  }
  return { ...base, value: "Liveweight isn't held for this group", met: false, action: { kind: "LINK", label: "Add the animals individually to weigh them", href: ADVISORY_ROUTES.addCattle } };
}

function systemItem(input: ProductionAdvisoryInput): AdvisoryItemVM {
  const base = { code: "SYSTEM", label: "Production system" };
  if (input.system === "housed") return { ...base, value: "Housed", met: true, action: { kind: "INSTRUCTION", label: "Recorded on the group." } };
  if (input.system === "grazing") return { ...base, value: "At grass", met: true, action: { kind: "INSTRUCTION", label: "Recorded on the group." } };
  return { ...base, value: "Grazing or housed isn't recorded", met: false, action: { kind: "INSTRUCTION", label: "Record whether the group is grazing or housed on the group record." } };
}

// ---------------------------------------------------------------------------
// Supporting evidence (confidence)
// ---------------------------------------------------------------------------

function categoryImpliesSex(category: LivestockCategory): boolean {
  return category === "steer" || category === "bull" || category === "heifer" || category === "suckler_cow" || category === "dairy_cow";
}

function supportingItems(input: ProductionAdvisoryInput, members: readonly GroupAnimalFact[] | "UNAVAILABLE"): AdvisoryItemVM[] {
  const list = members === "UNAVAILABLE" ? [] : members;
  const items: AdvisoryItemVM[] = [];

  const breedFromAnimals = list.length > 0 && list.every((m) => m.breedKnown);
  const groupBreed = input.groupBreed?.trim() ? input.groupBreed.trim() : null;
  items.push({
    code: "BREED",
    label: "Breed / type",
    value: groupBreed ?? (breedFromAnimals ? "Recorded on every animal" : "Not held"),
    met: groupBreed !== null || breedFromAnimals,
    action: { kind: "INSTRUCTION", label: "Add the breed in Edit group details on this page." },
  });

  if (!categoryImpliesSex(input.category)) {
    const sexes = new Set(list.map((m) => m.sex));
    const fromAnimals = list.length > 0 && !sexes.has(null);
    const value = input.groupSex
      ? input.groupSex === "mixed" ? "Mixed" : input.groupSex === "male" ? "Male" : "Female"
      : fromAnimals ? (sexes.size > 1 ? "Mixed · from the animal records" : sexes.has("MALE") ? "Male · from the animal records" : "Female · from the animal records") : "Not held";
    items.push({
      code: "SEX",
      label: "Sex",
      value,
      met: input.groupSex !== undefined || fromAnimals,
      action: { kind: "INSTRUCTION", label: "Sex is recorded when each animal is added in Add cattle." },
    });
  }

  const withHistory = list.filter((m) => m.weighings >= 2).length;
  items.push({
    code: "WEIGHT_HISTORY",
    label: "Weight history (realised gain)",
    value: list.length === 0 ? "Not held · animals aren't recorded individually" : `${withHistory} of ${plural(list.length, "animal", "animals")} weighed at least twice`,
    met: list.length > 0 && withHistory === list.length,
    action: list.length === 0 ? { kind: "LINK", label: "Add the animals individually", href: ADVISORY_ROUTES.addCattle } : { kind: "LINK", label: "Record weights on each animal", href: ADVISORY_ROUTES.groupAnimals },
  });

  if (input.system === "grazing") {
    items.push({
      code: "GRASS_CONTEXT",
      label: "Grass context",
      value: input.currentFieldRecorded ? "Current field recorded" : "Current field not held",
      met: input.currentFieldRecorded,
      action: { kind: "OPEN_LOCATION", label: "Record a move to a field" },
    });
  } else {
    const basis = input.plan?.silageQualityBasis;
    items.push({
      code: "SILAGE_QUALITY",
      label: "Silage quality",
      value: basis === "lab_analysis" ? "Lab analysis recorded" : basis === "planning_scenario" ? "Planning scenario only · not tested" : "Not tested",
      met: basis === "lab_analysis",
      action: { kind: "OPEN_EDITOR", label: "Add the silage lab analysis" },
    });
  }

  items.push({
    code: "FEEDING_CONFIRMED",
    label: "Feeding situation",
    value: input.plan?.feedingSituation ? "Confirmed by you" : "Not confirmed",
    met: input.plan?.feedingSituation !== undefined,
    action: { kind: "OPEN_EDITOR", label: "Confirm the feeding situation" },
  });

  return items;
}

function confidenceOf(path: Path, input: ProductionAdvisoryInput, supporting: readonly AdvisoryItemVM[]): AdvisoryStatusVM {
  const missing = supporting.filter((i) => !i.met).length;
  let level: ConfidenceLevel = missing === 0 ? "HIGH" : missing <= 2 ? "MODERATE" : "LOW";
  const caps: string[] = [];
  const cap = (to: ConfidenceLevel, why: string) => {
    if (RANK[level] > RANK[to]) level = to;
    caps.push(why);
  };
  if (input.system === "grazing") cap("MODERATE", "Capped at Moderate while at grass: the guideline gain is for a housed grass-silage winter diet.");
  if (path.kind === "FINISH_BULL") cap("LOW", "Capped at Low: no guideline gain is published for finishing bulls.");
  const inPlace = supporting.length - missing;
  return {
    label: `${CONFIDENCE_LABEL[level]} confidence`,
    detail: [`${inPlace} of ${supporting.length} supporting records in place.`, ...caps].join(" "),
    tone: level === "HIGH" ? "good" : level === "MODERATE" ? "info" : "review",
  };
}

// ---------------------------------------------------------------------------
// Economics (separate, never blocking)
// ---------------------------------------------------------------------------

function economicsOf(input: ProductionAdvisoryInput): AdvisoryStatusVM {
  const farmerPrice = typeof input.plan?.concentratePriceEurT === "number" && input.plan.concentratePriceEurT > 0;
  const reference = INPUT_MARKET_CATALOGUE.find((item) => item.id === BEEF_CONCENTRATE_ITEM_ID)?.referencePrice.status === "available";
  if (farmerPrice || reference) {
    return {
      label: "Economics limited",
      detail: `Feed cost can be estimated from ${farmerPrice ? "your concentrate price" : "a reference concentrate price"}, but sale value isn't held, so no margin or return is calculated. This doesn't affect the biological recommendation.`,
      tone: "review",
    };
  }
  return {
    label: "Economics not ready",
    detail: "Feed price and sale value aren't held, so no cost or return is calculated. This doesn't affect the biological recommendation.",
    tone: "unknown",
  };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export const PRODUCTION_ADVISORY_UNAVAILABLE: ProductionAdvisoryVM = {
  state: "UNAVAILABLE",
  title: "Production recommendation unavailable",
  summary: "Operational cattle data couldn't be read, so readiness can't be checked. Nothing is recommended in its place.",
  readiness: { label: "Readiness unknown", detail: "The group's records couldn't be read.", tone: "unknown" },
  confidence: NOT_ASSESSED,
  economics: { label: "Economics not ready", detail: "The group's records couldn't be read.", tone: "unknown" },
  core: details([]),
  required: details([]),
  reasons: details([]),
  improve: details([]),
  alternatives: ALTERNATIVES_NOT_RANKED,
  actionNote: ADVISORY_ONLY,
  limitations: LIMITATIONS,
  evidence: details([]),
};

function pathTitle(path: Exclude<Path, { kind: "NOT_COVERED" }>, system: ProductionAdvisoryInput["system"]): string {
  if (path.kind === "WEANLING") return `Grow on as weanlings at about ${path.adg.toFixed(1)} kg/day${system === "housed" ? " this winter" : ""}`;
  if (path.kind === "FINISH") return `Finish the ${path.noun} at about ${path.adg.toFixed(1)} kg/day`;
  return "Finish as bulls · pace to agree with an advisor";
}

function pathReasons(path: Exclude<Path, { kind: "NOT_COVERED" }>, input: ProductionAdvisoryInput, core: readonly AdvisoryItemVM[]): string[] {
  const reasons: string[] = [];
  if (path.kind === "WEANLING") reasons.push(`Weanlings: the Teagasc DairyBeef 500 guideline gain for weanlings on a grass-silage winter diet is ${path.adg.toFixed(1)} kg/day.`);
  if (path.kind === "FINISH") reasons.push(`The group goal is Finish to slaughter. The Teagasc DairyBeef 500 guideline gain for finishing ${path.noun} is ${path.adg.toFixed(1)} kg/day.`);
  if (path.kind === "FINISH_BULL") reasons.push("The group goal is Finish to slaughter. Teagasc DairyBeef 500 publishes no guideline gain or concentrate rate for finishing bulls, so the pace isn't set here.");
  const age = core.find((i) => i.code === "AGE");
  const weight = core.find((i) => i.code === "LIVEWEIGHT");
  if (age) reasons.push(`Age: ${age.value}.`);
  if (weight) reasons.push(`Liveweight: ${weight.value}.`);
  reasons.push(
    input.system === "housed"
      ? "Housed: the guideline applies to the grass-silage winter diet directly."
      : "At grass: the guideline is for the housed winter diet; Farm Return holds no published grass-season gain for this class.",
  );
  return reasons;
}

export function buildProductionAdvisoryVM(input: ProductionAdvisoryInput): ProductionAdvisoryVM {
  const members = membersOf(input);
  const core = [typeItem(input), ageItem(input, members), weightItem(input, members), systemItem(input)];
  const required = core.filter((item) => !item.met);
  const economics = economicsOf(input);
  const path = pathOf(input.category, input.goal);
  const common = { core: details(core), alternatives: ALTERNATIVES_NOT_RANKED, actionNote: ADVISORY_ONLY, limitations: LIMITATIONS, economics };

  if (path.kind === "NOT_COVERED") {
    return {
      ...common,
      state: "NOT_COVERED",
      title: "Not covered by production advice yet",
      summary: path.reason,
      readiness: { label: "Not covered", detail: "No production path is recommended for this group in v1.", tone: "neutral" },
      confidence: NOT_ASSESSED,
      required: details([]),
      reasons: details([]),
      improve: details([]),
      evidence: details([]),
    };
  }

  if (required.length > 0) {
    return {
      ...common,
      state: "ALMOST_READY",
      title: "Almost ready",
      summary: `Farm Return needs ${plural(required.length, "more core fact", "more core facts")} before it can recommend a production path. Nothing is guessed in the meantime.`,
      readiness: { label: "Almost ready", detail: `${core.length - required.length} of ${core.length} core facts in place.`, tone: "attention" },
      confidence: NOT_ASSESSED,
      required: details(required),
      reasons: details([]),
      improve: details([]),
      evidence: EVIDENCE,
    };
  }

  const supporting = supportingItems(input, members);
  return {
    ...common,
    state: "READY",
    title: pathTitle(path, input.system),
    summary:
      path.kind === "FINISH_BULL"
        ? "A finishing path is supported by the group's records, but no published guideline sets its pace."
        : "Recommended from the group's own records and the published Teagasc class guideline.",
    readiness: { label: "Ready", detail: `All ${core.length} core facts are in place.`, tone: "good" },
    confidence: confidenceOf(path, input, supporting),
    required: details([]),
    reasons: details(pathReasons(path, input, core)),
    improve: details(supporting.filter((item) => !item.met)),
    evidence: EVIDENCE,
  };
}
