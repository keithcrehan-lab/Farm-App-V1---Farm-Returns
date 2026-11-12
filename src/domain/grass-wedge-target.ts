/**
 * Grass V2 — the grass wedge's target (demand) line, the farm's grass position
 * against it, supply vs demand, growth-evidence selection, silage/rotation
 * scenarios and the "What should I do?" insights. Pure, deterministic and
 * versioned; every figure carries its inputs so the screen can show the working.
 *
 * Sources (see `docs/evidence-register.md`, "Grass V2"):
 * - Target line — Teagasc manual Pasture Wedge sheet: "Stocking rate × Allocation/cow
 *   × Rotation + Residual = Target pre-grazing yield"; "Mark an x in the first column
 *   at the target pre-grazing yield, mark another x in the last column at the target
 *   residual, join the two x's with a straight line." Stocking rate × allocation per
 *   head is the farm's grazing demand per hectare per day, so here
 *   target pre-grazing = (total grazing demand ÷ grazing area) × rotation length + residual.
 * - Demand — the existing grazing-demand providers (`grass-grazing-demand.ts`,
 *   Teagasc beef guidance: about 2% of liveweight per head per day), never re-derived here.
 * - Rotation length and residual are the farmer's own targets (Teagasc beef guidance is
 *   shown beside them: 18–21 days mid-season; graze to about 4 cm ≈ 150 kg DM/ha).
 *
 * Fail closed: no line without a confirmed rotation and residual, grazing cattle,
 * a complete demand and a positive grazing area. Unknown covers are never zero.
 */

export const GRASS_WEDGE_TARGET_VERSION = "grass_wedge_target_v1.0.0";
export const GRASS_WEDGE_TARGET_SOURCE =
  "Teagasc manual Pasture Wedge: stocking rate × allocation × rotation + residual = target pre-grazing yield; straight line to the residual";

/** Own growth evidence older than this gives way to the regional figure (the server's own stand-in rule). */
export const OWN_GROWTH_MAX_AGE_DAYS = 21;
/** Fields not measured for longer than this are "stale" (matches `GRASS_FRESHNESS_THRESHOLDS_DAYS.low`). */
export const STALE_AFTER_DAYS = 14;

const DAY_MS = 86_400_000;

export interface CalcLine {
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------------------------
// Growth evidence
// ---------------------------------------------------------------------------------------------

export type GrowthEvidenceKind = "walks" | "farmer_entered" | "sensor" | "regional";

export interface GrowthEvidence {
  kind: GrowthEvidenceKind;
  /** The saved observation this came from (not set for walk-measured growth). */
  observationId?: string;
  rateKgDmHaDay: number;
  at: string;
  label: string;
  source: string;
}

export interface GrowthSelection {
  chosen?: GrowthEvidence;
  /** Every other figure on record, so a different number is never hidden. */
  others: GrowthEvidence[];
  reason: string;
}

const KIND_LABEL: Record<GrowthEvidenceKind, string> = {
  walks: "Measured on your walks",
  farmer_entered: "Entered by you",
  sensor: "Farm sensor",
  regional: "Teagasc county prediction",
};

/**
 * One growth figure for the farm, with the others shown beside it: the newest of
 * your own evidence (repeated walks, a rate you entered, a sensor) from the last
 * 21 days; otherwise the regional (Teagasc county) figure. Different kinds are
 * never averaged.
 */
export function selectGrowthEvidence(input: {
  walks: ReadonlyArray<{ at: string; rateKgDmHaDay: number; fieldCount: number }>;
  observations: ReadonlyArray<{ id: string; growthRateKgDmHaDay: number; origin: string; observedAt: string; source: string }>;
  asOf: string;
}): GrowthSelection {
  const asOfMs = Date.parse(input.asOf);
  const all: GrowthEvidence[] = [];
  for (const walk of input.walks) {
    if (!Number.isFinite(walk.rateKgDmHaDay) || Date.parse(walk.at) > asOfMs) continue;
    all.push({
      kind: "walks",
      rateKgDmHaDay: walk.rateKgDmHaDay,
      at: walk.at,
      label: KIND_LABEL.walks,
      source: `Growth between your two most recent walks of the same ${walk.fieldCount === 1 ? "field" : `${walk.fieldCount} fields`}`,
    });
  }
  for (const o of input.observations) {
    if (!Number.isFinite(o.growthRateKgDmHaDay) || Date.parse(o.observedAt) > asOfMs) continue;
    const kind: GrowthEvidenceKind = o.origin === "regional_estimate" ? "regional" : o.origin === "sensor" ? "sensor" : o.origin === "farmer_entered" ? "farmer_entered" : "regional";
    all.push({ kind, observationId: o.id, rateKgDmHaDay: o.growthRateKgDmHaDay, at: o.observedAt, label: KIND_LABEL[kind], source: o.source });
  }
  const newestFirst = [...all].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const own = newestFirst.find((e) => e.kind !== "regional" && asOfMs - Date.parse(e.at) <= OWN_GROWTH_MAX_AGE_DAYS * DAY_MS);
  const regional = newestFirst.find((e) => e.kind === "regional");
  const chosen = own ?? regional;
  const others: GrowthEvidence[] = [];
  const seen = new Set<GrowthEvidenceKind>();
  for (const e of newestFirst) {
    if (e === chosen || seen.has(e.kind)) continue;
    seen.add(e.kind);
    others.push(e);
  }
  const reason = own
    ? "Your own figure from the last 21 days is used; regional figures are shown for comparison only."
    : regional
      ? "No growth of your own from the last 21 days, so the Teagasc county figure is used until your next walks."
      : "No growth figure yet: two walks of the same fields will measure it.";
  return { ...(chosen ? { chosen } : {}), others, reason };
}

// ---------------------------------------------------------------------------------------------
// Demand line
// ---------------------------------------------------------------------------------------------

export interface GrazingTargets {
  rotationDays?: number;
  residualKgDmHa?: number;
}

export interface DemandGroup {
  groupId: string;
  label: string;
  headCount: number;
  fieldId: string;
  /** Resolved daily grass demand (kg DM/day) from the grazing-demand provider, or undefined. */
  dailyDemandKgDm?: number;
  kgDmPerHeadDay?: number;
  ruleSource?: string;
  missingReason?: string;
}

export type DemandLineBlock =
  | { code: "TARGETS_NOT_SET"; message: string }
  | { code: "NO_GRAZING_CATTLE"; message: string }
  | { code: "DEMAND_INCOMPLETE"; message: string; groups: DemandGroup[] }
  | { code: "NO_GRAZING_AREA"; message: string };

export interface DemandLine {
  version: typeof GRASS_WEDGE_TARGET_VERSION;
  demandKgDmDay: number;
  grazingAreaHa: number;
  demandKgDmHaDay: number;
  rotationDays: number;
  residualKgDmHa: number;
  targetPreGrazingKgDmHa: number;
  /** Farm Return's reading of the straight line: the mid-point, i.e. the average cover the line implies. */
  targetAverageCoverKgDmHa: number;
  working: CalcLine[];
  source: string;
}

export type DemandLineOutcome = { status: "OK"; line: DemandLine } | { status: "BLOCKED"; block: DemandLineBlock };

export function validTargets(targets: GrazingTargets): targets is Required<GrazingTargets> {
  const r = targets.rotationDays;
  const res = targets.residualKgDmHa;
  return r !== undefined && Number.isFinite(r) && r >= 5 && r <= 120 && res !== undefined && Number.isFinite(res) && res >= 0 && res <= 1500;
}

const kg = (n: number) => Math.round(n).toLocaleString("en-IE");

export function buildDemandLine(input: { groups: readonly DemandGroup[]; grazingAreaHa: number; targets: GrazingTargets }): DemandLineOutcome {
  if (!validTargets(input.targets)) {
    return { status: "BLOCKED", block: { code: "TARGETS_NOT_SET", message: "Set your rotation length and grazing residual to draw the target line." } };
  }
  if (input.groups.length === 0) {
    return { status: "BLOCKED", block: { code: "NO_GRAZING_CATTLE", message: "No cattle are recorded on these fields, so there is no grazing demand to plan against." } };
  }
  const missing = input.groups.filter((g) => g.dailyDemandKgDm === undefined);
  if (missing.length > 0) {
    return {
      status: "BLOCKED",
      block: { code: "DEMAND_INCOMPLETE", message: "Some grazing groups can't be counted yet, so the line would understate demand.", groups: missing },
    };
  }
  if (!(input.grazingAreaHa > 0)) {
    return { status: "BLOCKED", block: { code: "NO_GRAZING_AREA", message: "No grazing area with a mapped boundary." } };
  }
  const { rotationDays, residualKgDmHa } = input.targets;
  const demandKgDmDay = input.groups.reduce((sum, g) => sum + (g.dailyDemandKgDm ?? 0), 0);
  const demandKgDmHaDay = demandKgDmDay / input.grazingAreaHa;
  const targetPreGrazingKgDmHa = demandKgDmHaDay * rotationDays + residualKgDmHa;
  return {
    status: "OK",
    line: {
      version: GRASS_WEDGE_TARGET_VERSION,
      demandKgDmDay,
      grazingAreaHa: input.grazingAreaHa,
      demandKgDmHaDay,
      rotationDays,
      residualKgDmHa,
      targetPreGrazingKgDmHa,
      targetAverageCoverKgDmHa: (targetPreGrazingKgDmHa + residualKgDmHa) / 2,
      working: [
        ...input.groups.map((g) => ({
          label: `${g.label} (${g.headCount} head)`,
          value: `${kg(g.dailyDemandKgDm ?? 0)} kg DM/day${g.kgDmPerHeadDay !== undefined ? ` (${g.kgDmPerHeadDay.toFixed(1)} kg/head)` : ""}`,
        })),
        { label: "Grazing demand", value: `${kg(demandKgDmDay)} kg DM/day` },
        { label: "Grazing area", value: `${input.grazingAreaHa.toFixed(2)} ha` },
        { label: "Demand per hectare", value: `${kg(demandKgDmDay)} ÷ ${input.grazingAreaHa.toFixed(2)} = ${demandKgDmHaDay.toFixed(1)} kg DM/ha/day` },
        { label: "Target pre-grazing cover", value: `${demandKgDmHaDay.toFixed(1)} × ${rotationDays} days + ${kg(residualKgDmHa)} residual = ${kg(targetPreGrazingKgDmHa)} kg DM/ha` },
        { label: "Line", value: `straight from ${kg(targetPreGrazingKgDmHa)} at the highest field to ${kg(residualKgDmHa)} at the lowest` },
      ],
      source: GRASS_WEDGE_TARGET_SOURCE,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Wedge layout and comparison
// ---------------------------------------------------------------------------------------------

export type WedgeWidthMode = "area" | "equal";

export interface WedgeField {
  fieldId: string;
  name: string;
  areaHa: number;
  /** Undefined when the field has no cover evidence — never zero. */
  coverKgDmHa?: number;
}

export interface WedgeBar extends WedgeField {
  /** Left edge and width as fractions of the chart (0–1). */
  x: number;
  width: number;
  /** Where the line is read for this field (bar centre, 0–1). */
  centre: number;
  /** Target line at this field, kg DM/ha (when a line exists). */
  targetKgDmHa?: number;
  /** (cover − target) × area, kg DM (when both are known). */
  differenceKgDm?: number;
  /** (cover − residual) × area, kg DM: grass standing above the residual today. */
  aboveResidualKgDm?: number;
}

/** Smallest bar width on the area wedge, as a fraction, so small fields stay tappable. */
export const MIN_AREA_BAR_FRACTION = 0.04;

/**
 * Bars ordered by cover (highest first, unknown last), each as wide as its area
 * (area mode, with a minimum so small fields stay tappable) or equally wide. The
 * line runs from the first bar's centre to the last bar's centre, as on the
 * Teagasc sheet (first column → last column).
 */
export function layoutWedge(fields: readonly WedgeField[], mode: WedgeWidthMode, line?: DemandLine): WedgeBar[] {
  const ordered = [...fields].sort((a, b) => {
    const ak = a.coverKgDmHa !== undefined;
    const bk = b.coverKgDmHa !== undefined;
    if (ak !== bk) return ak ? -1 : 1;
    if (ak && bk && a.coverKgDmHa !== b.coverKgDmHa) return b.coverKgDmHa! - a.coverKgDmHa!;
    return a.name.localeCompare(b.name) || a.fieldId.localeCompare(b.fieldId);
  });
  const n = ordered.length;
  if (n === 0) return [];
  let raw = ordered.map((f) => (mode === "equal" ? 1 : Math.max(0, f.areaHa)));
  const total = raw.reduce((s, w) => s + w, 0);
  if (!(total > 0)) raw = ordered.map(() => 1);
  // Lift tiny bars to the minimum, taking the space proportionally from the rest.
  let widths = raw.map((w) => w / raw.reduce((s, x) => s + x, 0));
  if (mode === "area" && n > 1) {
    const min = Math.min(MIN_AREA_BAR_FRACTION, 1 / n);
    const small = widths.map((w) => w < min);
    const lifted = small.filter(Boolean).length * min;
    const restTotal = widths.reduce((s, w, i) => s + (small[i] ? 0 : w), 0);
    widths = widths.map((w, i) => (small[i] ? min : (w / restTotal) * (1 - lifted)));
  }
  let x = 0;
  const bars = ordered.map((f, i) => {
    const bar = { ...f, x, width: widths[i], centre: x + widths[i] / 2 };
    x += widths[i];
    return bar;
  });
  const first = bars[0].centre;
  const last = bars[n - 1].centre;
  return bars.map((bar) => {
    if (!line) return bar;
    const t = n === 1 || last === first ? 0 : (bar.centre - first) / (last - first);
    const targetKgDmHa = line.targetPreGrazingKgDmHa + (line.residualKgDmHa - line.targetPreGrazingKgDmHa) * t;
    return {
      ...bar,
      targetKgDmHa,
      ...(bar.coverKgDmHa !== undefined
        ? {
            differenceKgDm: (bar.coverKgDmHa - targetKgDmHa) * bar.areaHa,
            aboveResidualKgDm: Math.max(0, bar.coverKgDmHa - line.residualKgDmHa) * bar.areaHa,
          }
        : {}),
    };
  });
}

export interface WedgePosition {
  /** Σ (cover − target) × area over measured fields, kg DM. Positive = above the line. */
  differenceKgDm: number;
  /** The difference in days of the farm's grazing demand. */
  days: number;
  measuredAreaHa: number;
  unmeasuredAreaHa: number;
  working: CalcLine[];
}

/** The farm against its target line — read on the equal-width wedge, as the Teagasc sheet draws it. */
export function wedgePosition(fields: readonly WedgeField[], line: DemandLine): WedgePosition | undefined {
  const bars = layoutWedge(fields, "equal", line);
  const known = bars.filter((b) => b.differenceKgDm !== undefined);
  if (known.length === 0) return undefined;
  const differenceKgDm = known.reduce((s, b) => s + (b.differenceKgDm ?? 0), 0);
  const measuredAreaHa = known.reduce((s, b) => s + b.areaHa, 0);
  return {
    differenceKgDm,
    days: differenceKgDm / line.demandKgDmDay,
    measuredAreaHa,
    unmeasuredAreaHa: bars.filter((b) => b.differenceKgDm === undefined).reduce((s, b) => s + b.areaHa, 0),
    working: [
      ...known.map((b) => ({ label: b.name, value: `(${kg(b.coverKgDmHa!)} − ${kg(b.targetKgDmHa!)}) × ${b.areaHa.toFixed(2)} ha = ${kg(b.differenceKgDm!)} kg DM` })),
      { label: "Total against the line", value: `${kg(differenceKgDm)} kg DM` },
      { label: "In days of grazing demand", value: `${kg(differenceKgDm)} ÷ ${kg(line.demandKgDmDay)} kg DM/day = ${(differenceKgDm / line.demandKgDmDay).toFixed(1)} days` },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Supply vs demand
// ---------------------------------------------------------------------------------------------

export interface SupplyDemand {
  growthKgDmDay: number;
  demandKgDmDay: number;
  balanceKgDmDay: number;
  /** Change in average farm cover per day if nothing else changes, kg DM/ha/day. */
  coverChangeKgDmHaDay: number;
  working: CalcLine[];
}

export function supplyDemand(input: { growthKgDmHaDay?: number; grazingAreaHa: number; demandKgDmDay?: number }): SupplyDemand | undefined {
  const { growthKgDmHaDay: g, grazingAreaHa: a, demandKgDmDay: d } = input;
  if (g === undefined || d === undefined || !(a > 0)) return undefined;
  const growthKgDmDay = g * a;
  const balance = growthKgDmDay - d;
  return {
    growthKgDmDay,
    demandKgDmDay: d,
    balanceKgDmDay: balance,
    coverChangeKgDmHaDay: balance / a,
    working: [
      { label: "Grass grown", value: `${g.toFixed(1)} kg DM/ha/day × ${a.toFixed(2)} ha = ${kg(growthKgDmDay)} kg DM/day` },
      { label: "Grass eaten", value: `${kg(d)} kg DM/day` },
      { label: "Balance", value: `${kg(balance)} kg DM/day (${(balance / a).toFixed(1)} kg DM/ha/day on average cover)` },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Insights — "What should I do?"
// ---------------------------------------------------------------------------------------------

export type InsightAction =
  | { kind: "add_liveweight"; groupId: string }
  | { kind: "set_targets" }
  | { kind: "start_walk" }
  | { kind: "explore_silage"; fieldIds: string[] }
  | { kind: "select_field"; fieldId: string };

export interface GrassInsight {
  id: string;
  tone: "action" | "surplus" | "shortage" | "info";
  title: string;
  why: string;
  figures: string[];
  confidence: "measured" | "mixed" | "low";
  actionLabel: string;
  action: InsightAction;
  working: CalcLine[];
  source?: string;
}

export interface InsightInput {
  fields: readonly (WedgeField & { ageDays?: number; occupied: boolean })[];
  line: DemandLineOutcome;
  supply?: SupplyDemand;
}

export function grassInsights(input: InsightInput): GrassInsight[] {
  const out: GrassInsight[] = [];
  const { line } = input;

  if (line.status === "BLOCKED" && line.block.code === "DEMAND_INCOMPLETE") {
    for (const g of line.block.groups) {
      out.push({
        id: `demand-${g.groupId}`,
        tone: "action",
        title: "Complete your grazing demand",
        why: `Your ${g.headCount} ${g.label} are recorded on grass, but ${g.missingReason ?? "their average liveweight is missing"}. Without it the target line would understate what they eat.`,
        figures: [],
        confidence: "low",
        actionLabel: "Add cattle liveweight",
        action: { kind: "add_liveweight", groupId: g.groupId },
        working: [],
      });
    }
  }
  if (line.status === "BLOCKED" && line.block.code === "TARGETS_NOT_SET") {
    out.push({
      id: "targets",
      tone: "action",
      title: "Set your rotation length",
      why: "The red target line needs how many days your rotation takes and the cover you graze down to.",
      figures: ["Teagasc beef guide: 18–21 days mid-season; graze to about 4 cm (≈150 kg DM/ha)"],
      confidence: "low",
      actionLabel: "Set rotation length",
      action: { kind: "set_targets" },
      working: [],
    });
  }

  const stale = input.fields.filter((f) => f.coverKgDmHa === undefined || (f.ageDays ?? Infinity) > STALE_AFTER_DAYS);
  if (stale.length > 0) {
    out.push({
      id: "stale",
      tone: "action",
      title: stale.length === input.fields.length ? "Walk the farm to see your grass" : `${stale.length} ${stale.length === 1 ? "field needs" : "fields need"} measuring`,
      why: `No reading in the last ${STALE_AFTER_DAYS} days for ${stale.map((f) => f.name).slice(0, 4).join(", ")}${stale.length > 4 ? "…" : ""}. Older covers make every figure here less reliable.`,
      figures: [],
      confidence: "low",
      actionLabel: "Start grass walk",
      action: { kind: "start_walk" },
      working: [],
    });
  }

  if (line.status === "OK") {
    const position = wedgePosition(input.fields, line.line);
    if (position) {
      const fresh = input.fields.filter((f) => f.coverKgDmHa !== undefined && (f.ageDays ?? Infinity) <= 7).length;
      const measured = input.fields.filter((f) => f.coverKgDmHa !== undefined).length;
      const confidence: GrassInsight["confidence"] = fresh === measured && position.unmeasuredAreaHa === 0 ? "measured" : fresh > 0 ? "mixed" : "low";
      const bars = layoutWedge(input.fields, "equal", line.line).filter((b) => (b.differenceKgDm ?? 0) > 0).sort((a, b) => (b.differenceKgDm ?? 0) - (a.differenceKgDm ?? 0));
      const tonnes = (n: number) => (Math.abs(n) / 1000).toFixed(1);
      if (position.days >= 1) {
        out.push({
          id: "surplus",
          tone: "surplus",
          title: "More grass than your cattle need",
          why: `Your covers are about ${tonnes(position.differenceKgDm)} t DM above the target line, roughly ${position.days.toFixed(0)} days of grazing ahead. Teagasc advice is to take a lasting surplus out as baled silage so the rest of the farm stays leafy, but confirm it on your next walk first, and weigh season, quality and weather.`,
          figures: [`${tonnes(position.differenceKgDm)} t DM above the line`, `≈ ${position.days.toFixed(0)} days ahead`, ...bars.slice(0, 2).map((b) => `${b.name}: ${kg(b.coverKgDmHa!)} vs ${kg(b.targetKgDmHa!)} on the line`)],
          confidence,
          actionLabel: bars.length > 0 ? `See the effect of taking out ${bars[0].name}` : "Review the wedge",
          action: bars.length > 0 ? { kind: "explore_silage", fieldIds: [bars[0].fieldId] } : { kind: "start_walk" },
          working: position.working,
          source: GRASS_WEDGE_TARGET_SOURCE,
        });
      } else if (position.days <= -1) {
        out.push({
          id: "shortage",
          tone: "shortage",
          title: "Grass is behind your cattle's needs",
          why: `Your covers are about ${tonnes(position.differenceKgDm)} t DM below the target line, roughly ${Math.abs(position.days).toFixed(0)} days of grazing. Teagasc options are to add grazing area, reduce demand or feed extra, and to keep grazing out to the residual.`,
          figures: [`${tonnes(position.differenceKgDm)} t DM below the line`, `≈ ${Math.abs(position.days).toFixed(0)} days behind`],
          confidence,
          actionLabel: "Start grass walk",
          action: { kind: "start_walk" },
          working: position.working,
          source: GRASS_WEDGE_TARGET_SOURCE,
        });
      }
    }
  }

  if (input.supply && line.status === "OK") {
    const s = input.supply;
    if (Math.abs(s.coverChangeKgDmHaDay) >= 1) {
      out.push({
        id: "growth",
        tone: s.balanceKgDmDay >= 0 ? "info" : "shortage",
        title: s.balanceKgDmDay >= 0 ? "Growth is ahead of demand" : "Cattle are eating more than is growing",
        why: s.balanceKgDmDay >= 0
          ? `Grass is growing about ${kg(s.balanceKgDmDay)} kg DM a day more than your cattle eat, so average cover should rise by about ${s.coverChangeKgDmHaDay.toFixed(0)} kg DM/ha a day.`
          : `Your cattle eat about ${kg(-s.balanceKgDmDay)} kg DM a day more than is growing, so average cover will fall by about ${(-s.coverChangeKgDmHaDay).toFixed(0)} kg DM/ha a day.`,
        figures: [`Growing ${kg(s.growthKgDmDay)} kg DM/day`, `Eating ${kg(s.demandKgDmDay)} kg DM/day`],
        confidence: "mixed",
        actionLabel: "Start grass walk",
        action: { kind: "start_walk" },
        working: s.working,
      });
    }
  }

  if (line.status === "OK") {
    const next = [...input.fields]
      .filter((f) => f.coverKgDmHa !== undefined && !f.occupied && (f.ageDays ?? Infinity) <= STALE_AFTER_DAYS)
      .sort((a, b) => b.coverKgDmHa! - a.coverKgDmHa!)[0];
    if (next) {
      const pre = line.line.targetPreGrazingKgDmHa;
      out.push({
        id: "next",
        tone: "info",
        title: `Next on the wedge: ${next.name}`,
        why: `${next.name} has the highest cover of the fields not being grazed: ${kg(next.coverKgDmHa!)} kg DM/ha against your target pre-grazing cover of ${kg(pre)}. The wedge is grazed from the top down; check it suits the stock, ground and weather.`,
        figures: [`${kg(next.coverKgDmHa!)} kg DM/ha`, `${next.areaHa.toFixed(2)} ha`],
        confidence: (next.ageDays ?? Infinity) <= 7 ? "measured" : "mixed",
        actionLabel: `Show ${next.name}`,
        action: { kind: "select_field", fieldId: next.fieldId },
        working: [{ label: "Target pre-grazing cover", value: `${kg(pre)} kg DM/ha` }, { label: next.name, value: `${kg(next.coverKgDmHa!)} kg DM/ha` }],
        source: GRASS_WEDGE_TARGET_SOURCE,
      });
    }
  }

  const rank: Record<GrassInsight["tone"], number> = { action: 0, shortage: 1, surplus: 2, info: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 4);
}

// ---------------------------------------------------------------------------------------------
// Scenarios (preview only — nothing is saved)
// ---------------------------------------------------------------------------------------------

export interface ScenarioInput {
  fields: readonly WedgeField[];
  groups: readonly DemandGroup[];
  targets: GrazingTargets;
  removedFieldIds: readonly string[];
  rotationDays?: number;
}

export interface ScenarioResult {
  line: DemandLineOutcome;
  remainingAreaHa: number;
  position?: WedgePosition;
  /** Grass standing above the residual today on the fields taken out, kg DM — not a silage yield. */
  removedAboveResidualKgDm?: number;
  removedUnmeasured: number;
}

export function previewScenario(input: ScenarioInput): ScenarioResult {
  const removed = new Set(input.removedFieldIds);
  const remaining = input.fields.filter((f) => !removed.has(f.fieldId));
  const taken = input.fields.filter((f) => removed.has(f.fieldId));
  const remainingAreaHa = remaining.reduce((s, f) => s + f.areaHa, 0);
  const targets = { ...input.targets, ...(input.rotationDays !== undefined ? { rotationDays: input.rotationDays } : {}) };
  const line = buildDemandLine({ groups: input.groups, grazingAreaHa: remainingAreaHa, targets });
  const residual = validTargets(targets) ? targets.residualKgDmHa : undefined;
  const measuredTaken = taken.filter((f) => f.coverKgDmHa !== undefined);
  return {
    line,
    remainingAreaHa,
    ...(line.status === "OK" ? { position: wedgePosition(remaining, line.line) } : {}),
    ...(residual !== undefined && measuredTaken.length > 0
      ? { removedAboveResidualKgDm: measuredTaken.reduce((s, f) => s + Math.max(0, f.coverKgDmHa! - residual) * f.areaHa, 0) }
      : {}),
    removedUnmeasured: taken.length - measuredTaken.length,
  };
}
