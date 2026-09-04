/**
 * Farm Return Next — Supports Intelligence, Support Profile.
 *
 * `SUPPORTS_STRATEGY_CONTRACT.md` §2's absolute rule: "Never ask the
 * farmer for information Farm Return already genuinely knows." This
 * module is the one place that rule is enforced structurally — it reads
 * every fact `scheme-eligibility.ts` might need from the real farm model
 * this app already holds (`Farm`/`Field`/`LivestockGroup`), and only
 * *lists* — never silently assumes — the small number of facts that
 * genuinely don't exist anywhere else yet (`SupportProfileGap[]`).
 *
 * Reuses existing frozen domain calculations rather than recomputing them
 * (`DOMAIN_CONTRACTS.md`'s "never duplicate a calculation" rule):
 * `nutrients.ts`'s `totalLivestockUnits` for the livestock-unit figure
 * `anc`'s stocking-density gate needs.
 */
import type { EnterpriseType, Farm, Field, LivestockGroup } from "./types";
import { totalLivestockUnits } from "./nutrients";
import { localDateKey } from "./weather-forecast";

export const SUPPORT_PROFILE_VERSION = "support-profile-v1";

/**
 * Codex audit HIGH (round 11, 2026-09-04): every caller needing "today"
 * for a regulatory assessment (`assessSchemeEligibility`'s own
 * `assessedAt`, `validateSupportProfileFactValue`'s own "not in the
 * future" gate) was computing `new Date().toISOString()` directly —
 * a UTC instant. During Irish summer time (Europe/Dublin, UTC+1),
 * between 00:00 and 00:59 local time, that UTC instant's own calendar
 * date is still *yesterday* — exactly the window an exact-boundary
 * regulatory check (a birthday, a five-year setup window, a scheme's
 * own opening/closing date) most needs to get right, and exactly the
 * window a farmer entering today's own real date could otherwise be
 * told it's "in the future". Fixed by reusing `weather-forecast.ts`'s
 * own already-tested, DST-aware `localDateKey` (`DOMAIN_CONTRACTS.md`'s
 * "never duplicate a calculation" rule) rather than a second, competing
 * timezone calculation — this returns the real Europe/Dublin calendar
 * date, then anchors it to UTC midnight so every downstream age/window
 * calculation (which parses this as a `Date`) reads the correct day.
 */
export function nowAsSupportProfileAssessedAt(): string {
  return `${localDateKey(new Date().toISOString())}T00:00:00.000Z`;
}

/**
 * Field uses counted as "forage" for the ANC minimum-stocking-density
 * criterion (`scheme-registry.ts`'s `anc-minimum-stocking-density` rule)
 * — grazing and every silage cut are forage; tillage/other are not.
 * `"mixed"` is treated as forage (it always includes some grazing/cut
 * component per `FieldUse`'s own definition) — a real, disclosed
 * simplification (documented on `SupportProfileDerivedFacts.forageAreaHa`
 * below), not a fabricated fact.
 */
const FORAGE_FIELD_USES = new Set(["grazing", "silage_1st_cut", "silage_2nd_cut", "silage_3rd_cut", "mixed"]);

/**
 * The small, closed set of genuine gaps this app's own five seeded
 * schemes (`scheme-registry.ts`) actually need and cannot derive from
 * existing farm data. Adding a fact here — and *only* here — is how a
 * future scheme grows this list; `scheme-eligibility.ts` never invents a
 * farmer-facing question inline.
 */
export type SupportProfileFactKey = "head_of_holding_since" | "agricultural_qualification_level" | "biss_participant_2026" | "date_of_birth" | "declared_area_ha";

export interface SupportProfileFact {
  key: SupportProfileFactKey;
  value: unknown;
  /** Both are the farmer typing an answer into Farm Return — neither is
   * DAFM-verified. Kept as two distinct statuses (rather than one) because
   * `scheme-eligibility.ts` treats them differently: "farmer_confirmed" is
   * an explicit, deliberate answer to Farm Return's own question;
   * "self_declared" is reserved for a future path where a fact might be
   * imported/inferred from another farmer-declared source. Both are
   * genuinely unverified against any DAFM record, which is exactly why no
   * assessment that depends on one can ever reach `ELIGIBLE` — only
   * `LIKELY_ELIGIBLE` (`scheme-eligibility.ts`'s own doc comment). Neither
   * is "estimated": unlike a soil P index, there is no safe Irish-default
   * estimate for "when did you become head of holding" — an absent fact
   * is a real gap, never a guessed one (see `buildSupportProfile`'s gap
   * logic below). */
  status: "farmer_confirmed" | "self_declared";
  source: string;
  updatedAt: string;
}

export interface SupportProfileKnownFact {
  label: string;
  value: string;
  /** Which real farm field this was derived from — lets the UI show
   * "Known from your farm" with a real provenance trail, not just a bare
   * label/value pair. */
  derivedFrom: string;
}

export interface SupportProfileGap {
  key: SupportProfileFactKey;
  label: string;
  reason: string;
  /** Which `SchemeVersion.schemeId`s in the registry actually need this
   * fact — so the UI can say "needed for: Young Farmer Capital Investment
   * Scheme" rather than a generic, unexplained question. */
  requiredBySchemeIds: string[];
}

export interface SupportProfileDerivedFacts {
  countyLocation?: string;
  primaryEnterprises: EnterpriseType[];
  /** Sum of every non-archived field's `areaHa` — real, `Field.areaHa` is
   * always derived from a drawn boundary (never farmer-typed), so this is
   * as reliable as this farm's own mapping is complete. Named
   * `totalMappedAreaHa`, deliberately not "declared" — Codex audit
   * CRITICAL/HIGH (round 1, 2026-09-04): this is real *physical mapped*
   * area, not proof the same land is actually declared under BISS/CAP
   * with DAFM, or how much of it is — see `declared_area_ha` below for
   * the genuinely separate fact that distinction needs.
   * Archived fields are excluded (Codex audit HIGH, round 4,
   * 2026-09-04: `listFieldsForFarm` itself returns every field
   * regardless of `archivedAt` — the same real convention
   * `useFields()`/`farm-store.tsx` already applies for the client store
   * is applied here too, defensively, inside this domain module rather
   * than trusted to every caller). */
  totalMappedAreaHa: number;
  /** Sum of `areaHa` for fields whose `plannedUse` resolves to a forage
   * use (see `FORAGE_FIELD_USES`) — `null`, not `0`, whenever at least
   * one field's `plannedUse` is unresolved, since an unmapped field could
   * turn out to be forage and silently treating it as 0ha would
   * understate the true forage area (`CLAUDE.md`: missing must not become
   * zero). `fieldsWithUnresolvedUse` names exactly how many fields that
   * affects. */
  forageAreaHa: number | null;
  fieldsWithUnresolvedUse: number;
  /** `nutrients.ts`'s own frozen livestock-unit conversion, unmodified. */
  totalLivestockUnits: number;
}

export interface SupportProfile {
  farmId: string;
  version: string;
  derived: SupportProfileDerivedFacts;
  /** "Known from your farm" — UI-facing display list, a human-readable
   * projection of `derived` (plus farm identity facts) with provenance. */
  knownFacts: SupportProfileKnownFact[];
  farmerFacts: Partial<Record<SupportProfileFactKey, SupportProfileFact>>;
  /** "Needs your input" — every genuine gap not already answered. */
  gaps: SupportProfileGap[];
}

const GAP_DEFINITIONS: Record<SupportProfileFactKey, Omit<SupportProfileGap, "key">> = {
  date_of_birth: {
    label: "What is your date of birth?",
    reason: "Young-farmer schemes have an explicit maximum-age condition Farm Return cannot check without this.",
    requiredBySchemeIds: ["tams3-yfcis", "national-reserve-young-farmer"],
  },
  head_of_holding_since: {
    label: "When did you become head of this holding?",
    reason: "Young-farmer schemes only apply within a fixed number of years of first setting up as head of holding.",
    requiredBySchemeIds: ["tams3-yfcis", "national-reserve-young-farmer"],
  },
  agricultural_qualification_level: {
    label: "What is your highest completed agricultural qualification?",
    reason: "Young-farmer schemes require a recognised agricultural qualification at or above a minimum level.",
    requiredBySchemeIds: ["tams3-yfcis", "national-reserve-young-farmer"],
  },
  biss_participant_2026: {
    label: "Are you participating in BISS for 2026?",
    reason: "The National Reserve Young Farmer category requires 2026 BISS participation.",
    requiredBySchemeIds: ["national-reserve-young-farmer"],
  },
  declared_area_ha: {
    label: "How many hectares of your land are currently declared under BISS/CAP with DAFM?",
    reason: "Farm Return can only see your land's real mapped area, not how much of it is actually declared with DAFM — capital-grant and area-based schemes need the real declared figure, not a proxy for it.",
    requiredBySchemeIds: ["tams3-general", "tams3-yfcis"],
  },
};

/**
 * Archived fields are excluded before any area/forage/stocking figure is
 * derived — Codex audit HIGH (round 4, 2026-09-04): `listFieldsForFarm`
 * (the real server caller) returns every field regardless of
 * `Field.archivedAt`, so an earlier version of this module summed
 * archived (no-longer-real) field area into `totalMappedAreaHa`,
 * inflating it and, via `assessLandDeclaredGate`'s previous
 * mapped-area-based logic, could have overstated real eligibility.
 */
function activeFields(fields: Field[]): Field[] {
  return fields.filter((f) => f.archivedAt === undefined);
}

function deriveForageArea(fields: Field[]): { forageAreaHa: number | null; fieldsWithUnresolvedUse: number } {
  let sum = 0;
  let unresolved = 0;
  for (const field of fields) {
    const use = field.plannedUse?.value;
    if (use === undefined) {
      unresolved += 1;
      continue;
    }
    if (FORAGE_FIELD_USES.has(use)) sum += field.areaHa;
  }
  return { forageAreaHa: unresolved > 0 ? null : sum, fieldsWithUnresolvedUse: unresolved };
}

function buildKnownFacts(farm: Farm, derived: SupportProfileDerivedFacts): SupportProfileKnownFact[] {
  const facts: SupportProfileKnownFact[] = [
    { label: "County", value: farm.location.county, derivedFrom: "Farm.location.county" },
    { label: "Primary enterprise", value: derived.primaryEnterprises.join(", ") || "Not set", derivedFrom: "Farm.primaryEnterprises" },
    { label: "Total mapped area", value: `${derived.totalMappedAreaHa.toFixed(2)} ha`, derivedFrom: "sum of Field.areaHa across mapped fields — physical mapped area, not confirmation this land is declared under BISS/CAP" },
    { label: "Total livestock units", value: `${derived.totalLivestockUnits.toFixed(2)} LU`, derivedFrom: "nutrients.ts totalLivestockUnits(LivestockGroup[])" },
  ];
  if (derived.forageAreaHa !== null) {
    facts.push({ label: "Forage area", value: `${derived.forageAreaHa.toFixed(2)} ha`, derivedFrom: "sum of Field.areaHa where Field.plannedUse is a forage use" });
  }
  return facts;
}

/**
 * Builds a real `SupportProfile` from this farm's own existing evidence
 * plus whatever `SupportProfileFact`s the farmer has already answered
 * (`src/lib/farm-data/support-profile.ts` persists these) — never
 * re-asking a fact already present in `farmerFacts`, and never listing a
 * gap no seeded scheme actually needs (`GAP_DEFINITIONS` is the single,
 * closed source of "genuine gap" — see this module's own header
 * comment).
 */
export function buildSupportProfile(farm: Farm, fields: Field[], livestockGroups: LivestockGroup[], farmerFacts: SupportProfileFact[]): SupportProfile {
  const active = activeFields(fields);
  const forage = deriveForageArea(active);
  const derived: SupportProfileDerivedFacts = {
    countyLocation: farm.location.county,
    primaryEnterprises: farm.primaryEnterprises,
    totalMappedAreaHa: active.reduce((sum, f) => sum + f.areaHa, 0),
    forageAreaHa: forage.forageAreaHa,
    fieldsWithUnresolvedUse: forage.fieldsWithUnresolvedUse,
    totalLivestockUnits: totalLivestockUnits(livestockGroups),
  };

  const farmerFactsByKey: Partial<Record<SupportProfileFactKey, SupportProfileFact>> = {};
  for (const fact of farmerFacts) farmerFactsByKey[fact.key] = fact;

  const gaps: SupportProfileGap[] = (Object.keys(GAP_DEFINITIONS) as SupportProfileFactKey[])
    .filter((key) => farmerFactsByKey[key] === undefined)
    .map((key) => ({ key, ...GAP_DEFINITIONS[key] }));

  return {
    farmId: farm.id,
    version: SUPPORT_PROFILE_VERSION,
    derived,
    knownFacts: buildKnownFacts(farm, derived),
    farmerFacts: farmerFactsByKey,
    gaps,
  };
}

/**
 * Strict `YYYY-MM-DD` calendar-date check — Codex audit HIGH (round 1,
 * 2026-09-04): a farmer-typed date carries no compile-time guarantee of
 * being a real calendar date, and `iso-datetime.ts`'s own
 * `isValidIsoUtcDateTime` requires a full `T...Z` datetime, which these
 * date-only facts (a plain HTML `<input type="date">`) never carry —
 * this is the narrower, date-only equivalent this phase needs, shared
 * (not duplicated, `DOMAIN_CONTRACTS.md`) between the write boundary
 * (`validateSupportProfileFactValue` below, used by
 * `upsertSupportProfileFactAction`) and the read boundary
 * (`scheme-eligibility.ts`, for any value written before this validator
 * existed, or by a future non-UI caller). Rejects e.g. `"2026-02-30"` —
 * `new Date(...)` silently rolls that over to March, so the round-trip
 * `toISOString` comparison below catches it where a bare
 * `!Number.isNaN(...)` check would not.
 */
export function isPlausibleIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export interface SupportProfileFactValidation {
  valid: boolean;
  reason?: string;
}

/**
 * The one real write-boundary check for every `SupportProfileFactKey` —
 * Codex audit HIGH (round 1, 2026-09-04): the server action previously
 * accepted and persisted any `unknown` value with no runtime check at
 * all, relying only on the database's own `key` CHECK constraint (which
 * says nothing about the *value*'s shape) — a malformed date, a future
 * date, a fractional/out-of-range qualification level, or a non-boolean
 * BISS answer could all be written and then reach `scheme-eligibility.ts`
 * as if it were a real, considered answer. `todayIso` is passed in
 * (never read from `Date.now()` internally) so this stays a pure,
 * deterministically testable function like every other domain module.
 */
export function validateSupportProfileFactValue(key: SupportProfileFactKey, value: unknown, todayIso: string): SupportProfileFactValidation {
  switch (key) {
    case "date_of_birth":
    case "head_of_holding_since": {
      if (!isPlausibleIsoDate(value)) return { valid: false, reason: "must be a real calendar date (YYYY-MM-DD)." };
      if (value > todayIso.slice(0, 10)) return { valid: false, reason: "cannot be in the future." };
      if (value < "1900-01-01") return { valid: false, reason: "is implausibly far in the past." };
      return { valid: true };
    }
    case "agricultural_qualification_level": {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) {
        return { valid: false, reason: "must be a whole number NFQ level from 0 to 10." };
      }
      return { valid: true };
    }
    case "biss_participant_2026": {
      if (typeof value !== "boolean") return { valid: false, reason: "must be yes or no." };
      return { valid: true };
    }
    case "declared_area_ha": {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return { valid: false, reason: "must be a real, non-negative number of hectares." };
      }
      return { valid: true };
    }
  }
}
