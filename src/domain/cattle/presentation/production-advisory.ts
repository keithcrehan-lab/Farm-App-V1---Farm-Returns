/**
 * Production advisory v2 — a group's "Production recommendation", in three
 * separate steps:
 *
 *  1. FEASIBLE PATHS — the production paths open to the group's class
 *     (category) in v1 scope, read from records the farm already holds. No
 *     preselected goal is needed to list them.
 *  2. EVIDENCE APPLICABILITY — for each path, whether validated evidence in the
 *     repository covers the group's CURRENT management system. The only pace
 *     evidence is the Teagasc DairyBeef 500 Table 3 class guideline gain
 *     (`targetADGForAnimalType`), which is for HOUSED cattle on a grass-silage
 *     winter diet. It fails closed: a group at grass, or housed on a confirmed
 *     different diet, gets no pace — "current evidence doesn't cover this
 *     system" — never the housed figure with lower confidence.
 *  3. RECOMMENDATION / RANKING — a path is recommended only when it is the one
 *     defensible path in scope (weanlings) or the farmer's own goal selects it,
 *     AND its evidence applies. Where several paths are feasible and choosing
 *     between them needs market or economic evidence (finish vs sell as
 *     stores), they are shown unranked and the ranking is withheld.
 *
 * READINESS blocks only on facts logically required to choose and apply a
 * path: the animal type and the current production system (a location
 * conflict leaves the system unresolved). Age and current liveweight are not
 * used by any v1 rule, so they never block: they are shown as evidence, lower
 * confidence when missing, and are the starting point a future target
 * trajectory would need. No target weight, date, processor spec, price or
 * margin is derived, so v1 is advisory only and saves nothing.
 *
 * Confidence rule (documented, tested; only for a recommended pace): the
 * supporting records (age, current liveweight, breed, sex where the category
 * doesn't imply it, weight history, silage quality, confirmed feeding
 * situation) — none missing → High, one or two → Moderate, three or more → Low.
 */

import { targetADGForAnimalType } from "@/domain/livestock";
import { BEEF_CONCENTRATE_ITEM_ID, INPUT_MARKET_CATALOGUE } from "@/domain/inputs-market";
import { SOURCE_REGISTER } from "@/domain/source-register";
import type { CattleFeedingSituation, SilageQualityBasis } from "@/domain/cattle-group-production-plan";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import type { CattleOutputs } from "./cattle-outputs";
import type { DisplayTone } from "./display-states";
import type { HerdVM } from "./herd-view";
import { listedItems, details, type Details } from "./view-state";
import { ageInMonths, formatAge, formatDate } from "./format";
import { latestWeightOf } from "./weight-view";
import { groupLiveweightWords, type GroupLiveweight } from "./group-liveweight";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One individually recorded member, read from its C1 snapshot and C4 series. `null` = not known. */
export interface GroupAnimalFact {
  animalId: string;
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
  /** The group's current production system; absent when it can't be resolved (unrecorded or a location conflict). */
  system?: "grazing" | "housed";
  /** A field session and a shed are both recorded: the system is unresolved until a move is recorded. */
  locationConflict?: boolean;
  /** Group record facts. */
  groupSex?: "male" | "female" | "mixed";
  groupBreed?: string;
  groupAvgAgeMonths?: number;
  /** The group's current liveweight with coverage (`group-liveweight.ts`). */
  liveweight: GroupLiveweight;
  /** Members recorded individually; absent when the group has none. */
  animals?: GroupAnimalFacts;
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

/** One feasible production path and whether current evidence covers it. */
export interface AdvisoryPathVM {
  code: string;
  label: string;
  /** "Your goal", "Recommended", "Only path in v1 scope" — or `null`. */
  marker: string | null;
  /** The evidence-applicability verdict for the group's current system. */
  status: string;
  detail: string;
  tone: DisplayTone;
}

export type AdvisoryState = "RECOMMENDED" | "OPTIONS" | "EVIDENCE_GAP" | "ALMOST_READY" | "NOT_COVERED" | "UNAVAILABLE";

export interface ProductionAdvisoryVM {
  state: AdvisoryState;
  title: string;
  summary: string;
  readiness: AdvisoryStatusVM;
  confidence: AdvisoryStatusVM;
  economics: AdvisoryStatusVM;
  /** The facts readiness is decided on (met and missing). */
  core: Details<AdvisoryItemVM>;
  /** Required facts still missing — the "needed before Farm Return can recommend" checklist. */
  required: Details<AdvisoryItemVM>;
  /** Feasible paths with their evidence applicability (never ranked unless evidence chooses). */
  paths: Details<AdvisoryPathVM>;
  reasons: Details<string>;
  /** Evidence the farm holds (or not) that informs confidence and later trajectory work — never a blocker. */
  evidenceFacts: Details<AdvisoryItemVM>;
  improveTitle: string;
  /** Next steps that would strengthen or complete the advice. */
  improve: Details<AdvisoryItemVM>;
  /** Why paths are or aren't ranked. */
  alternatives: string;
  /** Why no target weight or date is derived. */
  trajectory: string;
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
  editGroupDetails: "#edit-group-details",
  animalDetails: (animalId: string) => `/cattle/animals/${encodeURIComponent(animalId)}#edit-details`,
} as const;

const CONFIDENCE_LABEL = { HIGH: "High", MODERATE: "Moderate", LOW: "Low" } as const;
type ConfidenceLevel = keyof typeof CONFIDENCE_LABEL;

const notAssessed = (detail: string): AdvisoryStatusVM => ({ label: "Confidence not assessed", detail, tone: "unknown" });

const NOT_RANKED =
  "These paths aren't ranked. Choosing between finishing and selling as stores depends on sale prices, costs and your market, which Farm Return doesn't hold — so it doesn't pick one for you.";
const SINGLE_PATH_NOTE = "Only one production path is in v1 scope for this class, so there is nothing to rank.";
const NONE_IN_SCOPE_NOTE = "No production path is in v1 scope for this group, so nothing is ranked.";
const GOAL_CHOSEN_NOTE = "You chose this path as the group's goal. Other feasible paths are listed for comparison; Farm Return doesn't rank them because that needs sale-price and cost evidence it doesn't hold.";

const ADVISORY_ONLY =
  "Advisory only. Nothing is saved for you and there is no ‘use this plan’ step, because no target weight or date can be derived from validated evidence. Use Override / edit production target to set your own; the feeding plan follows it.";

const TRAJECTORY_NOTE =
  "No target weight or date is derived: Farm Return holds no validated growth-trajectory evidence for this group. Current liveweight and age are shown as the starting point a trajectory would need.";

const DAIRYBEEF = SOURCE_REGISTER.TEAGASC_DAIRYBEEF_DMD;

const EVIDENCE = details([
  {
    title: DAIRYBEEF.title,
    meta: `${DAIRYBEEF.authority}${DAIRYBEEF.publicationDate ? ` · ${formatDate(DAIRYBEEF.publicationDate)}` : ""} · guideline gain by class for housed cattle on grass silage (Table 3)`,
    url: DAIRYBEEF.url ?? "",
  },
]);

const LIMITATIONS = details([
  "v1's only pace evidence is the Teagasc DairyBeef 500 class guideline gain for housed cattle on a grass-silage winter diet. It isn't applied to cattle at grass or on another diet.",
  "Age and liveweight are shown as evidence; v1 applies no age-band or weight-band rule.",
  "Choosing between feasible paths needs market and cost evidence; v1 doesn't rank them.",
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
        animalId: row.animalId,
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
// 1. Feasible paths
// ---------------------------------------------------------------------------

type GuidelineStage = "weanling" | "finishing_steer" | "finishing_heifer";

interface PathDef {
  code: string;
  label: string;
  /** The DairyBeef 500 class row whose guideline gain sets this path's pace, if any. */
  stage: GuidelineStage | null;
  /** Breeding paths are outside v1 production-path advice. */
  breeding: boolean;
}

const PATH = {
  GROW_WEANLING: { code: "GROW_WEANLING", label: "Grow on as weanlings", stage: "weanling", breeding: false },
  FINISH_STEER: { code: "FINISH", label: "Finish to slaughter", stage: "finishing_steer", breeding: false },
  FINISH_HEIFER: { code: "FINISH", label: "Finish to slaughter", stage: "finishing_heifer", breeding: false },
  FINISH_NO_ROW: { code: "FINISH", label: "Finish to slaughter", stage: null, breeding: false },
  SELL_STORE: { code: "SELL_STORE", label: "Grow on and sell as stores", stage: null, breeding: false },
  KEEP_BREEDING: { code: "BREED", label: "Keep for breeding", stage: null, breeding: true },
} as const satisfies Record<string, PathDef>;

type Scope =
  | { kind: "NOT_COVERED"; reason: string }
  /** Exactly one path in v1 scope for the class. */
  | { kind: "SINGLE"; path: PathDef }
  /** Several feasible paths; `chosen` is the farmer's goal where it selects one. */
  | { kind: "OPTIONS"; paths: PathDef[]; chosen: PathDef | null };

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

const BREEDING_NOT_COVERED = "Breeding stock aren't covered by v1 production-path advice, which covers weanlings and cattle being grown on or finished.";

function chosenOf(goal: LivestockGoal | undefined, paths: readonly PathDef[]): PathDef | null {
  if (goal === "finish_slaughter") return paths.find((p) => p.code === "FINISH") ?? null;
  if (goal === "sell_store" || goal === "grow") return paths.find((p) => p.code === "SELL_STORE") ?? null;
  if (goal === "breed") return paths.find((p) => p.code === "BREED") ?? null;
  return null;
}

function scopeOf(category: LivestockCategory, goal: LivestockGoal | undefined): Scope {
  if (category === "suckler_cow" || category === "dairy_cow") return { kind: "NOT_COVERED", reason: BREEDING_NOT_COVERED };
  if (category === "calf") {
    return { kind: "NOT_COVERED", reason: "Calf rearing isn't covered by v1 production-path advice: Farm Return holds no validated pace evidence for calves." };
  }
  if (goal === "breed") return { kind: "NOT_COVERED", reason: BREEDING_NOT_COVERED };
  if (category === "weanling") return { kind: "SINGLE", path: PATH.GROW_WEANLING };
  const paths: PathDef[] =
    category === "steer" ? [PATH.FINISH_STEER, PATH.SELL_STORE]
    : category === "heifer" ? [PATH.FINISH_HEIFER, PATH.SELL_STORE, PATH.KEEP_BREEDING]
    : category === "bull" ? [PATH.FINISH_NO_ROW, PATH.KEEP_BREEDING]
    : [PATH.FINISH_NO_ROW, PATH.SELL_STORE];
  return { kind: "OPTIONS", paths, chosen: chosenOf(goal, paths) };
}

// ---------------------------------------------------------------------------
// 2. Evidence applicability
// ---------------------------------------------------------------------------

type Applicability =
  | { kind: "APPLIES"; adg: number; feedingInferred: boolean }
  | { kind: "SYSTEM_UNKNOWN" }
  | { kind: "NOT_AT_GRASS" }
  | { kind: "NOT_THIS_DIET"; diet: string }
  | { kind: "NO_PACE_EVIDENCE" }
  | { kind: "BREEDING" };

const DIET_LABEL: Record<CattleFeedingSituation, string> = {
  housed_grass_silage: "housed on grass silage",
  at_grass: "at grass",
  other_diet: "on another diet",
};

function applicabilityOf(path: PathDef, input: ProductionAdvisoryInput): Applicability {
  if (path.breeding) return { kind: "BREEDING" };
  if (path.stage === null) return { kind: "NO_PACE_EVIDENCE" };
  if (input.system === undefined) return { kind: "SYSTEM_UNKNOWN" };
  if (input.system === "grazing") return { kind: "NOT_AT_GRASS" };
  const feeding = input.plan?.feedingSituation;
  if (feeding !== undefined && feeding !== "housed_grass_silage") return { kind: "NOT_THIS_DIET", diet: DIET_LABEL[feeding] };
  return { kind: "APPLIES", adg: targetADGForAnimalType(path.stage), feedingInferred: feeding === undefined };
}

function pathVM(path: PathDef, a: Applicability, marker: string | null): AdvisoryPathVM {
  const base = { code: path.code, label: path.label, marker };
  switch (a.kind) {
    case "APPLIES":
      return {
        ...base,
        status: `Guideline pace about ${a.adg.toFixed(1)} kg/day`,
        detail: `Teagasc DairyBeef 500 class guideline for housed cattle on grass silage${a.feedingInferred ? " · grass-silage diet assumed from housing, not confirmed" : ""}.`,
        tone: "good",
      };
    case "SYSTEM_UNKNOWN":
      return { ...base, status: "Evidence check waiting", detail: "Whether the published guideline applies depends on whether the group is housed or at grass, which isn't resolved.", tone: "unknown" };
    case "NOT_AT_GRASS":
      return { ...base, status: "Current evidence doesn't cover cattle at grass", detail: "The only published pace for this class is for housed cattle on a grass-silage winter diet, so no pace is given at grass.", tone: "review" };
    case "NOT_THIS_DIET":
      return { ...base, status: "Current evidence doesn't cover this diet", detail: `The published pace is for housed cattle on grass silage; the feeding situation is recorded as ${a.diet}.`, tone: "review" };
    case "NO_PACE_EVIDENCE":
      return { ...base, status: "No published pace in v1", detail: "Farm Return holds no validated guideline gain for this path, so no pace is given.", tone: "neutral" };
    case "BREEDING":
      return { ...base, status: "Not covered by v1 advice", detail: BREEDING_NOT_COVERED, tone: "neutral" };
  }
}

// ---------------------------------------------------------------------------
// Required facts (readiness)
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function membersOf(input: ProductionAdvisoryInput): readonly GroupAnimalFact[] | "UNAVAILABLE" {
  if (!input.animals) return [];
  return input.animals.state === "KNOWN" ? input.animals.animals : "UNAVAILABLE";
}

function typeItem(input: ProductionAdvisoryInput): AdvisoryItemVM {
  return {
    code: "ANIMAL_TYPE",
    label: "Animal type",
    value: CATEGORY_NOUN[input.category],
    met: true,
    action: { kind: "INSTRUCTION", label: "Recorded on the group. Category is fixed once set; Edit group details explains how to replace a wrong one." },
  };
}

function systemItem(input: ProductionAdvisoryInput): AdvisoryItemVM {
  const base = { code: "SYSTEM", label: "Production system" };
  if (input.locationConflict) {
    return { ...base, value: "A field and a shed are both recorded", met: false, action: { kind: "OPEN_LOCATION", label: "Record where the group is now" } };
  }
  if (input.system === "housed") return { ...base, value: "Housed", met: true, action: { kind: "OPEN_LOCATION", label: "Change location" } };
  if (input.system === "grazing") return { ...base, value: "At grass", met: true, action: { kind: "OPEN_LOCATION", label: "Change location" } };
  return { ...base, value: "Grazing or housed isn't recorded", met: false, action: { kind: "OPEN_LOCATION", label: "Record a move to a field or a shed" } };
}

// ---------------------------------------------------------------------------
// Evidence facts (confidence, trajectory) — never blockers
// ---------------------------------------------------------------------------

function categoryImpliesSex(category: LivestockCategory): boolean {
  return category === "steer" || category === "bull" || category === "heifer" || category === "suckler_cow" || category === "dairy_cow";
}

function ageItem(input: ProductionAdvisoryInput, members: readonly GroupAnimalFact[] | "UNAVAILABLE"): AdvisoryItemVM {
  const base = { code: "AGE", label: "Age" };
  if (members !== "UNAVAILABLE" && members.length > 0) {
    const missing = members.filter((m) => m.dateOfBirth === null);
    const known = members.flatMap((m) => {
      const months = m.dateOfBirth ? ageInMonths(m.dateOfBirth, input.asOfDate) : null;
      return months === null ? [] : [months];
    });
    if (missing.length === 0 && known.length === members.length) {
      const lo = Math.min(...known);
      const hi = Math.max(...known);
      return { ...base, value: `${lo === hi ? formatAge(lo) : `${formatAge(lo)} – ${formatAge(hi)}`} · from ${plural(members.length, "date of birth", "dates of birth")}`, met: true, action: { kind: "INSTRUCTION", label: "From the animal records." } };
    }
    return {
      ...base,
      value: `Date of birth recorded for ${known.length} of ${plural(members.length, "animal", "animals")}`,
      met: false,
      // first-item: the link opens the first animal (group member order) missing a date of birth; the label states how many are missing.
      action: { kind: "LINK", label: missing.length === 1 ? "Add the missing date of birth" : `Add the ${missing.length} missing dates of birth`, href: ADVISORY_ROUTES.animalDetails(missing[0].animalId) },
    };
  }
  if (members === "UNAVAILABLE") {
    return { ...base, value: "Animal records couldn't be read", met: false, action: { kind: "INSTRUCTION", label: "Try again shortly; dates of birth are read from the animal records." } };
  }
  if (input.groupAvgAgeMonths !== undefined) {
    return { ...base, value: `${formatAge(input.groupAvgAgeMonths)} average · group record`, met: true, action: { kind: "INSTRUCTION", label: "From the group record." } };
  }
  return { ...base, value: "Age isn't held for this group", met: false, action: { kind: "LINK", label: "Add the animals with their dates of birth", href: ADVISORY_ROUTES.addCattle } };
}

function weightItem(input: ProductionAdvisoryInput): AdvisoryItemVM {
  const lw = input.liveweight;
  const words = groupLiveweightWords(lw);
  const base = { code: "LIVEWEIGHT", label: "Current liveweight" };
  const value = words.value !== null ? `${words.value} kg · ${words.detail}` : `${words.stateLabel} · ${words.detail}`;
  if (lw.state === "INDIVIDUAL_FULL") return { ...base, value, met: true, action: { kind: "INSTRUCTION", label: "From the animal records." } };
  if (lw.state === "GROUP_RECORD") return { ...base, value, met: true, action: { kind: "INSTRUCTION", label: "From the group record." } };
  if (lw.state === "INDIVIDUAL_PARTIAL" || lw.state === "INDIVIDUAL_NONE") return { ...base, value, met: false, action: { kind: "LINK", label: "Weigh the remaining animals", href: ADVISORY_ROUTES.groupAnimals } };
  if (lw.state === "INDIVIDUAL_UNAVAILABLE") return { ...base, value, met: false, action: { kind: "INSTRUCTION", label: "Try again shortly; weights are read from the animal records." } };
  return { ...base, value, met: false, action: { kind: "LINK", label: "Add the animals individually to weigh them", href: ADVISORY_ROUTES.addCattle } };
}

function evidenceItems(input: ProductionAdvisoryInput, members: readonly GroupAnimalFact[] | "UNAVAILABLE"): AdvisoryItemVM[] {
  const list = members === "UNAVAILABLE" ? [] : members;
  const items: AdvisoryItemVM[] = [ageItem(input, members), weightItem(input)];

  const breedMissing = list.filter((m) => !m.breedKnown);
  const breedFromAnimals = list.length > 0 && breedMissing.length === 0;
  const groupBreed = input.groupBreed?.trim() ? input.groupBreed.trim() : null;
  items.push({
    code: "BREED",
    label: "Breed / type",
    value: groupBreed ?? (breedFromAnimals ? "Recorded on every animal" : "Not held"),
    met: groupBreed !== null || breedFromAnimals,
    action: { kind: "LINK", label: "Add the breed in Edit group details", href: ADVISORY_ROUTES.editGroupDetails },
  });

  if (!categoryImpliesSex(input.category)) {
    const sexMissing = list.filter((m) => m.sex === null);
    const sexes = new Set(list.map((m) => m.sex));
    const fromAnimals = list.length > 0 && sexMissing.length === 0;
    const value = input.groupSex
      ? input.groupSex === "mixed" ? "Mixed" : input.groupSex === "male" ? "Male" : "Female"
      : fromAnimals ? (sexes.size > 1 ? "Mixed · from the animal records" : sexes.has("MALE") ? "Male · from the animal records" : "Female · from the animal records")
      : list.length > 0 ? `Sex recorded for ${list.length - sexMissing.length} of ${plural(list.length, "animal", "animals")}` : "Not held";
    items.push({
      code: "SEX",
      label: "Sex",
      value,
      met: input.groupSex !== undefined || fromAnimals,
      action: sexMissing.length > 0
        ? // first-item: the link opens the first animal (group member order) missing its sex; the label states how many.
          { kind: "LINK", label: sexMissing.length === 1 ? "Add the missing sex" : `Add sex on ${sexMissing.length} animals`, href: ADVISORY_ROUTES.animalDetails(sexMissing[0].animalId) }
        : { kind: "LINK", label: "Add the animals individually with their sex", href: ADVISORY_ROUTES.addCattle },
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

  if (input.system === "housed") {
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
    value: input.plan?.feedingSituation ? `Confirmed by you · ${DIET_LABEL[input.plan.feedingSituation]}` : input.system === "housed" ? "Not confirmed · grass silage assumed from housing" : "Not confirmed",
    met: input.plan?.feedingSituation !== undefined,
    action: { kind: "OPEN_EDITOR", label: "Confirm the feeding situation" },
  });

  return items;
}

function confidenceOf(supporting: readonly AdvisoryItemVM[]): AdvisoryStatusVM {
  const missing = supporting.filter((i) => !i.met).length;
  const level: ConfidenceLevel = missing === 0 ? "HIGH" : missing <= 2 ? "MODERATE" : "LOW";
  return {
    label: `${CONFIDENCE_LABEL[level]} confidence`,
    detail: `${supporting.length - missing} of ${supporting.length} supporting records in place.`,
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
      detail: `Feed cost can be estimated from ${farmerPrice ? "your concentrate price" : "a reference concentrate price"}, but sale value isn't held, so no margin or return is calculated and paths aren't compared on economics.`,
      tone: "review",
    };
  }
  return {
    label: "Economics not ready",
    detail: "Feed price and sale value aren't held, so no cost or return is calculated and paths aren't compared on economics.",
    tone: "unknown",
  };
}

// ---------------------------------------------------------------------------
// 3. Recommendation / ranking — builder
// ---------------------------------------------------------------------------

export const PRODUCTION_ADVISORY_UNAVAILABLE: ProductionAdvisoryVM = {
  state: "UNAVAILABLE",
  title: "Production recommendation unavailable",
  summary: "Operational cattle data couldn't be read, so readiness can't be checked. Nothing is recommended in its place.",
  readiness: { label: "Readiness unknown", detail: "The group's records couldn't be read.", tone: "unknown" },
  confidence: notAssessed("The group's records couldn't be read."),
  economics: { label: "Economics not ready", detail: "The group's records couldn't be read.", tone: "unknown" },
  core: details([]),
  required: details([]),
  paths: details([]),
  reasons: details([]),
  evidenceFacts: details([]),
  improveTitle: "What would help",
  improve: details([]),
  alternatives: NOT_RANKED,
  trajectory: TRAJECTORY_NOTE,
  actionNote: ADVISORY_ONLY,
  limitations: LIMITATIONS,
  evidence: details([]),
};

const GOAL_ITEM: AdvisoryItemVM = {
  code: "GOAL",
  label: "Group goal",
  value: "Not chosen · the feasible paths aren't ranked",
  met: false,
  action: { kind: "OPEN_EDITOR", label: "Choose the group's goal" },
};

function pacedTitle(path: PathDef, adg: number, category: LivestockCategory): string {
  if (path.code === "GROW_WEANLING") return `Grow on as weanlings at about ${adg.toFixed(1)} kg/day this winter`;
  return `Finish the ${CATEGORY_NOUN[category].toLowerCase()} at about ${adg.toFixed(1)} kg/day`;
}

function gapSummary(a: Applicability, noun: string): string {
  if (a.kind === "NOT_AT_GRASS") return `These ${noun} are at grass. The only published pace for this class is for housed cattle on a grass-silage winter diet, which current evidence doesn't extend to grazing — so no pace is recommended.`;
  if (a.kind === "NOT_THIS_DIET") return `These ${noun} are recorded as housed with the feeding situation ${a.diet}. The only published pace is for housed cattle on grass silage, which current evidence doesn't extend to this diet — so no pace is recommended.`;
  return `Farm Return holds no validated pace for this path for ${noun}, so no pace is recommended.`;
}

export function buildProductionAdvisoryVM(input: ProductionAdvisoryInput): ProductionAdvisoryVM {
  const members = membersOf(input);
  const core = [typeItem(input), systemItem(input)];
  const required = core.filter((item) => !item.met);
  const evidenceFacts = evidenceItems(input, members);
  const economics = economicsOf(input);
  const scope = scopeOf(input.category, input.goal);
  const noun = CATEGORY_NOUN[input.category].toLowerCase();
  const common = {
    core: details(core),
    evidenceFacts: details(evidenceFacts),
    trajectory: TRAJECTORY_NOTE,
    actionNote: ADVISORY_ONLY,
    limitations: LIMITATIONS,
    economics,
  };

  if (scope.kind === "NOT_COVERED") {
    return {
      ...common,
      state: "NOT_COVERED",
      title: "Not covered by production advice yet",
      summary: scope.reason,
      readiness: { label: "Not covered", detail: "No production path is recommended for this group in v1.", tone: "neutral" },
      confidence: notAssessed("No path is in v1 scope for this group."),
      required: details([]),
      paths: details([]),
      reasons: details([]),
      improveTitle: "What would help",
      improve: details([]),
      alternatives: NONE_IN_SCOPE_NOTE,
      evidence: details([]),
    };
  }

  const candidates = scope.kind === "SINGLE" ? [scope.path] : scope.paths;
  const chosen = scope.kind === "SINGLE" ? scope.path : scope.chosen;
  const marker = (p: PathDef): string | null => (chosen !== p ? null : scope.kind === "SINGLE" ? "Only path in v1 scope" : "Your goal");
  const paths = details(candidates.map((p) => pathVM(p, applicabilityOf(p, input), marker(p))));
  const usesGuideline = candidates.some((p) => p.stage !== null);
  const alternatives = scope.kind === "SINGLE" ? SINGLE_PATH_NOTE : chosen ? GOAL_CHOSEN_NOTE : NOT_RANKED;
  const evidence = usesGuideline ? EVIDENCE : details([]);
  const readyStatus: AdvisoryStatusVM = { label: "Ready", detail: `All ${core.length} required facts are in place (animal type, production system).`, tone: "good" };

  if (required.length > 0) {
    return {
      ...common,
      state: "ALMOST_READY",
      title: "Almost ready",
      summary: `Farm Return needs the group's current production system before it can check which evidence applies. Nothing is guessed in the meantime.`,
      readiness: { label: "Almost ready", detail: `${core.length - required.length} of ${core.length} required facts in place.`, tone: "attention" },
      confidence: notAssessed("Confidence is assessed once the required facts are in place."),
      required: details(required),
      paths,
      reasons: details([]),
      improveTitle: "Also useful",
      improve: details(evidenceFacts.filter((i) => !i.met)),
      alternatives,
      evidence,
    };
  }

  if (chosen === null) {
    return {
      ...common,
      state: "OPTIONS",
      title: `${candidates.length} feasible paths · not ranked`,
      summary: `From the group's records, these ${noun} have ${candidates.length} feasible production paths. Choosing between them depends on prices and costs Farm Return doesn't hold, so none is recommended over another.`,
      readiness: readyStatus,
      confidence: notAssessed("No single path is recommended, so confidence isn't assessed."),
      required: details([]),
      paths,
      reasons: details([]),
      improveTitle: "What would help",
      improve: details([GOAL_ITEM, ...evidenceFacts.filter((i) => !i.met)]),
      alternatives,
      evidence,
    };
  }

  const a = applicabilityOf(chosen, input);
  if (chosen.breeding) {
    return {
      ...common,
      state: "NOT_COVERED",
      title: "Not covered by production advice yet",
      summary: BREEDING_NOT_COVERED,
      readiness: { label: "Not covered", detail: "No production path is recommended for this group in v1.", tone: "neutral" },
      confidence: notAssessed("No path is in v1 scope for this group."),
      required: details([]),
      paths,
      reasons: details([]),
      improveTitle: "What would help",
      improve: details([]),
      alternatives: NONE_IN_SCOPE_NOTE,
      evidence: details([]),
    };
  }

  const age = evidenceFacts.find((i) => i.code === "AGE");
  const weight = evidenceFacts.find((i) => i.code === "LIVEWEIGHT");
  const contextReasons = [
    ...(age ? [`Age (evidence, not used by a v1 rule): ${age.value}.`] : []),
    ...(weight ? [`Current liveweight (evidence, not used by a v1 rule): ${weight.value}.`] : []),
  ];
  const pathReason =
    scope.kind === "SINGLE"
      ? `Weanlings: growing on through the winter is the only production path in v1 scope.`
      : `Your group goal (${input.goal === "finish_slaughter" ? "Finish to slaughter" : input.goal === "sell_store" ? "Sell as store" : "Grow"}) selects this path.`;

  if (a.kind === "APPLIES") {
    const supportingMissing = evidenceFacts.filter((i) => !i.met);
    return {
      ...common,
      state: "RECOMMENDED",
      title: pacedTitle(chosen, a.adg, input.category),
      summary:
        scope.kind === "SINGLE"
          ? "Recommended from the group's own records and the published Teagasc guideline for housed weanlings on grass silage."
          : "The pace for your chosen path, from the published Teagasc guideline for housed cattle on grass silage.",
      readiness: readyStatus,
      confidence: confidenceOf(evidenceFacts),
      required: details([]),
      paths,
      reasons: details([
        pathReason,
        `Housed${a.feedingInferred ? " (grass-silage diet assumed from housing — confirm the feeding situation)" : " on grass silage"}: the Teagasc DairyBeef 500 guideline gain for this class is ${a.adg.toFixed(1)} kg/day, and it applies to this system.`,
        ...contextReasons,
      ]),
      improveTitle: "What would raise confidence",
      improve: details(supportingMissing),
      alternatives,
      evidence,
    };
  }

  return {
    ...common,
    state: "EVIDENCE_GAP",
    title: `${chosen.code === "GROW_WEANLING" ? "Grow on as weanlings" : chosen.label} · pace not covered`,
    summary: gapSummary(a, noun),
    readiness: readyStatus,
    confidence: notAssessed("No pace is recommended, so confidence isn't assessed."),
    required: details([]),
    paths,
    reasons: details([pathReason, ...contextReasons]),
    improveTitle: "What would help",
    improve: details(evidenceFacts.filter((i) => !i.met)),
    alternatives,
    evidence,
  };
}
