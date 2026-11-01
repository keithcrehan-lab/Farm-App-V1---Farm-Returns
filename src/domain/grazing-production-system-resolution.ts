import type { Farm, FarmGrazingProductionSystem } from "./types";
import type { FieldProductionCycle, GrazingProductionSystem } from "./fertiliser-field-evidence";
import type { GrazingFieldSession } from "./grazing-field-pressure";

export interface GrazingProductionSystemResolution {
  value: GrazingProductionSystem | null;
  basis: "FIELD_MOVEMENTS" | "FIELD_OVERRIDE" | "FARM_BASELINE" | "UNRESOLVED";
  source: string;
  limitations: string[];
}

function movementSystem(fieldId: string, season: string, sessions: readonly GrazingFieldSession[]): GrazingProductionSystem | null {
  const fieldSessions = sessions.filter((session) => {
    if (session.fieldId !== fieldId) return false;
    const startsInSeason = session.startedAt.slice(0, 4) === season;
    const endsInSeason = session.endedAt?.slice(0, 4) === season;
    return startsInSeason || endsInSeason;
  });
  if (fieldSessions.length === 0) return null;
  const categories = new Set(fieldSessions.map((session) => session.livestockCategorySnapshot));
  const hasSucklerCow = categories.has("suckler_cow");
  const hasClearRetainedBeef = categories.has("store") || categories.has("steer");
  const hasDrystock = [...categories].some((category) => ["calf", "weanling", "store", "steer", "heifer", "bull"].includes(category));

  if (hasSucklerCow && hasClearRetainedBeef) return "SUCKLER_CALF_TO_BEEF";
  if (!hasSucklerCow && hasDrystock) return "OTHER_DRYSTOCK";
  return null;
}

export function resolveGrazingProductionSystem(args: {
  farm: Farm;
  fieldId: string;
  cycle: FieldProductionCycle;
  sessions: readonly GrazingFieldSession[];
}): GrazingProductionSystemResolution {
  const fromMovements = movementSystem(args.fieldId, args.cycle.season, args.sessions);
  if (fromMovements) {
    return {
      value: fromMovements,
      basis: "FIELD_MOVEMENTS",
      source: "Recorded cattle movements",
      limitations: [],
    };
  }

  const fieldOverride = args.cycle.evidence.grazingProductionSystem;
  if (fieldOverride?.method === "FARMER_DECLARED" && fieldOverride.source.startsWith("Field exception · ")) {
    return {
      value: fieldOverride.value,
      basis: "FIELD_OVERRIDE",
      source: fieldOverride.source,
      limitations: [],
    };
  }

  const baseline = args.farm.grazingProductionSystem?.value as FarmGrazingProductionSystem | undefined;
  if (baseline) {
    return {
      value: baseline,
      basis: "FARM_BASELINE",
      source: args.farm.grazingProductionSystem?.source ?? "Farm grazing system baseline",
      limitations: ["No unambiguous field-movement pattern currently overrides the farm baseline."],
    };
  }

  return {
    value: null,
    basis: "UNRESOLVED",
    source: "Farm grazing system baseline",
    limitations: ["Set the farm grazing system once in Farm Settings, or record enough field movements for Farm Return to resolve the field automatically."],
  };
}
