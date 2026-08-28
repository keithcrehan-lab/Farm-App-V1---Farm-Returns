"use client";

/**
 * Phase 2 — central farm data model (mock persistence).
 *
 * A Context + useState store, deliberately dependency-light (no Zustand/
 * Redux) — see CLAUDE.md "enter once, use everywhere". Holds only the
 * entities a farmer directly enters or edits: Farm, Fields, Livestock
 * groups, Housing, Slurry allocations. Everything else in
 * `@/data/mock-farm` (nutrient plans, silage plans, spreading scores,
 * finance lines, market prices, alerts, timeline, ...) represents
 * domain-engine or external outputs — a Phase 3+ concern — and stays a
 * static import until those engines exist.
 *
 * Persistence is `localStorage`, hydrated in a client-only effect so the
 * server render and the first client paint both show the same seed data
 * (avoiding a hydration mismatch), then a farmer's saved edits replace it
 * post-mount.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  mockFarm,
  mockFields,
  mockHousing,
  mockLivestockGroups,
  mockSlurryAllocations,
} from "@/data/mock-farm";
import { tracked } from "@/domain/types";
import type {
  Farm,
  Field,
  FieldUse,
  Housing,
  LivestockCategory,
  LivestockGoal,
  LivestockGroup,
  SlurryAllocation,
  SoilTest,
} from "@/domain/types";
import { farmerAdjust, verify } from "@/domain/provenance";
import {
  cropGroupForFieldUse,
  kIndexFromMgL,
  pIndexFromMgL,
  resolvePIndexConservatively,
  soilMaterialForOrganicCarbonStatus,
} from "@/domain/nutrients";
import { computeBoundaryGeometry } from "@/domain/field-boundary";

const STORAGE_KEY = "farm-return:v1";
const STORAGE_VERSION = 1;

interface FarmState {
  farm: Farm;
  fields: Field[];
  livestockGroups: LivestockGroup[];
  housing: Housing[];
  slurryAllocations: SlurryAllocation[];
}

function seedState(): FarmState {
  return {
    farm: mockFarm,
    fields: mockFields,
    livestockGroups: mockLivestockGroups,
    housing: mockHousing,
    slurryAllocations: mockSlurryAllocations,
  };
}

function loadPersisted(): FarmState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: number; state: FarmState };
    if (parsed.version !== STORAGE_VERSION) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

function persist(state: FarmState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state }));
  } catch {
    // Private browsing / storage full / disabled — mock persistence is a
    // convenience here, not a source of truth, so fail silently.
  }
}

function newId(prefix: string, label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix}-${slug || "new"}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Action inputs
// ---------------------------------------------------------------------------

export interface AddFieldInput {
  name: string;
  areaHa: number;
  plannedUse: FieldUse;
}

export type AddSoilTestInput = Omit<SoilTest, "reportFileUrl">;

export interface AddLivestockGroupInput {
  label: string;
  category: LivestockCategory;
  count: number;
  avgWeightKg?: number;
  system: "grazing" | "housed";
  goal?: LivestockGoal;
  housingId?: string;
}

interface FarmActions {
  updateFarmProfile: (patch: { name?: string; ownerName?: string; county?: string }) => void;
  addField: (input: AddFieldInput) => Field;
  /** Saves a real, farmer-drawn field boundary — recomputes `centroid`/
   * `areaHa` from it (never keeps the old placeholder/typed values once
   * real geometry exists). Throws if `polygon` isn't valid geometry
   * (`isValidBoundaryPolygon`) — callers (the map draw UI) must validate
   * before calling this, same as every other "never silently accept bad
   * data" rule in this app. */
  setFieldBoundary: (fieldId: string, polygon: GeoJSON.Polygon) => void;
  updateFieldIndex: (
    fieldId: string,
    key: "pIndex" | "kIndex",
    value: 1 | 2 | 3 | 4,
    farmerName: string,
  ) => void;
  addLivestockGroup: (input: AddLivestockGroupInput) => LivestockGroup;
  addSoilTest: (fieldId: string, input: AddSoilTestInput) => void;
  /** V3 closure pass — `required_input_fields.csv` "FIELD_COMMONAGE_STATUS".
   * Until this action existed, `field.commonageStatus` could never be set by
   * a real farmer workflow — `checkCommonageFertiliserGate` always fell
   * back to `BLOCKED_INSUFFICIENT_EVIDENCE` (safe, but inert) rather than
   * ever reaching a real `LEGAL_PROHIBITION`/`NOT_APPLICABLE` determination.
   * `farmer_adjusted` provenance, matching `updateFieldIndex`'s pattern. */
  updateFieldCommonageStatus: (
    fieldId: string,
    status: "commonage" | "not_commonage" | "unknown",
    farmerName: string,
  ) => void;
  /** V3 closure pass — `required_input_fields.csv` "LOCAL_WATER_BUFFER_OVERRIDE".
   * Same gap as commonage status above: `checkNationalBufferDistance`/
   * `checkLocalBufferOverride` are real and wired into
   * `calculateNutrientPlan`, but had no farmer-facing way to ever receive
   * `field.waterBufferContext`, so they only ever fired the fail-closed
   * default. */
  updateFieldWaterBufferContext: (
    fieldId: string,
    context: NonNullable<Field["waterBufferContext"]>["value"],
    farmerName: string,
  ) => void;
  /** V3 closure pass — `required_input_fields.csv` "SLURRY_APPLICATION_METHOD".
   * Same gap: `SlurryAllocation.applicationMethod` existed as a type field
   * (Phase C) and `requireSlurryApplicationMethod`/`checkLessMethodGate`
   * are real and wired, but no action ever let a farmer actually record the
   * method used for a season's field allocation. */
  updateSlurryApplicationMethod: (
    fieldId: string,
    housingId: string,
    method: "LESS" | "splashplate" | "incorporate_24h" | "other",
    farmerName: string,
  ) => void;
}

export interface FarmStore extends FarmState, FarmActions {
  hydrated: boolean;
}

const FarmContext = createContext<FarmStore | null>(null);

/**
 * Indicative liveweight price per kg used only to give a newly-created
 * livestock group a placeholder estimated value until the Phase 4 finance
 * engine prices it for real — same "estimated / Farm Return assumption"
 * provenance pattern already used throughout mock-farm.ts, never presented
 * as a verified figure.
 */
const INDICATIVE_LIVEWEIGHT_EUR_PER_KG = 2.5;

export function FarmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FarmState>(seedState);
  const [hydrated, setHydrated] = useState(false);

  // Client-only rehydration from localStorage, post-mount — never runs
  // during SSR or the first client render, so hydration always matches.
  // The setState-in-effect lint rule generally guards against effects that
  // should be plain event handlers or derived state; reading an external
  // store (localStorage) once after mount to seed React state is exactly
  // the "synchronize with an external system" case the rule allows for —
  // hence the explicit opt-out below.
  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount rehydration from localStorage, the sanctioned SSR-safe pattern documented above.
      setState(persisted);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persist(state);
  }, [state, hydrated]);

  const actions = useMemo<FarmActions>(
    () => ({
      updateFarmProfile(patch) {
        setState((s) => ({
          ...s,
          farm: {
            ...s.farm,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.ownerName !== undefined ? { ownerName: patch.ownerName } : {}),
            ...(patch.county !== undefined
              ? { location: { ...s.farm.location, county: patch.county } }
              : {}),
          },
        }));
      },

      addField(input) {
        const field: Field = {
          id: newId("field", input.name),
          farmId: state.farm.id,
          name: input.name,
          areaHa: input.areaHa,
          // No live geocoding/mapping engine yet (Phase 3+) — placed at the
          // farm centroid rather than inventing a boundary. FieldMap has no
          // shape lookup for unknown field ids and already renders that
          // gracefully (no pin), matching "automatic first, refinement
          // second": the field exists and is usable everywhere else
          // immediately, its map shape arrives with real mapping.
          centroid: state.farm.location.centroid,
          plannedUse: tracked(input.plannedUse, "farmer_adjusted", state.farm.ownerName),
          mappedSoil: {
            soilAssociation: "Pending mapping",
            dominantSeries: "Pending mapping",
            texture: "Unknown",
            drainage: "moderately_drained",
            coveragePct: 0,
            datasetVersion: "Not yet mapped",
            source: "Awaiting automatic mapping",
          },
          fertility: {
            pIndex: tracked(2, "estimated", "Farm Return assumption"),
            kIndex: tracked(2, "estimated", "Farm Return assumption"),
          },
          history: [],
        };
        setState((s) => ({ ...s, fields: [...s.fields, field] }));
        return field;
      },

      setFieldBoundary(fieldId, polygon) {
        const { centroid, areaHa } = computeBoundaryGeometry(polygon);
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) =>
            f.id === fieldId
              ? {
                  ...f,
                  polygon,
                  polygonSource: "farmer_drawn",
                  polygonCapturedAt: new Date().toISOString(),
                  // Real geometry now exists — these stop being the
                  // placeholder-at-farm-centroid/typed-by-hand values
                  // addField seeded and become the derived-from-polygon
                  // figures docs/data-model.md always specified.
                  centroid,
                  areaHa,
                }
              : f,
          ),
        }));
      },

      updateFieldIndex(fieldId, key, value, farmerName) {
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) =>
            f.id === fieldId
              ? {
                  ...f,
                  fertility: {
                    ...f.fertility,
                    [key]: farmerAdjust(f.fertility[key], value, farmerName),
                  },
                }
              : f,
          ),
        }));
      },

      updateFieldCommonageStatus(fieldId, status, farmerName) {
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) =>
            f.id === fieldId
              ? {
                  ...f,
                  commonageStatus: farmerAdjust(
                    f.commonageStatus ?? tracked("unknown", "estimated", "Farm Return assumption"),
                    status,
                    farmerName,
                  ),
                }
              : f,
          ),
        }));
      },

      updateFieldWaterBufferContext(fieldId, context, farmerName) {
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) =>
            f.id === fieldId
              ? {
                  ...f,
                  waterBufferContext: farmerAdjust(
                    f.waterBufferContext ??
                      tracked({ localOverrideStatus: "unknown" as const }, "estimated", "Farm Return assumption"),
                    context,
                    farmerName,
                  ),
                }
              : f,
          ),
        }));
      },

      updateSlurryApplicationMethod(fieldId, housingId, method, farmerName) {
        setState((s) => ({
          ...s,
          slurryAllocations: s.slurryAllocations.map((a) =>
            a.fieldId === fieldId && a.housingId === housingId
              ? {
                  ...a,
                  applicationMethod: farmerAdjust(
                    a.applicationMethod ?? tracked("other", "estimated", "Farm Return assumption"),
                    method,
                    farmerName,
                  ),
                }
              : a,
          ),
        }));
      },

      addSoilTest(fieldId, input) {
        const source = `${input.laboratory} soil test`;
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) => {
            if (f.id !== fieldId) return f;
            // V3 fix (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.1,
            // conflict #3): a raw lab value in the literal statutory
            // (8.00, 8.01]/(10.00, 10.01] micro-gap must not be silently
            // stored as an indistinguishable Index 4 — the conservative
            // treatment is applied explicitly here and recorded in the
            // TrackedValue's own `source` text (spec B1: "explicitly
            // recording that this is a conservative handling of source
            // ambiguity, not a fabricated literal classification").
            const pIndexOutcome = pIndexFromMgL(input.p, cropGroupForFieldUse(f.plannedUse.value));
            const { index: pIndex, conservativeTreatment } = resolvePIndexConservatively(pIndexOutcome);
            const pIndexSource = conservativeTreatment
              ? `${source} — AMBIGUOUS_STATUTORY_BOUNDARY: raw ${input.p} mg/L falls in the literal statutory source gap; conservative P4 allowance treatment applied, not a literal classification (S.I. 588/2025)`
              : source;
            const kIndex = kIndexFromMgL(input.k, soilMaterialForOrganicCarbonStatus(f.mappedSoil.organicCarbonStatus));
            return {
              ...f,
              fertility: {
                pIndex: verify(f.fertility.pIndex, pIndex, pIndexSource, { sourceDate: input.sampleDate }),
                kIndex: verify(f.fertility.kIndex, kIndex, source, { sourceDate: input.sampleDate }),
                pH: f.fertility.pH
                  ? verify(f.fertility.pH, input.pH, source, { sourceDate: input.sampleDate })
                  : tracked(input.pH, "verified", source, { sourceDate: input.sampleDate }),
                verifiedTest: input,
              },
            };
          }),
        }));
      },

      addLivestockGroup(input) {
        const avgWeightKg = input.avgWeightKg;
        const estValue = Math.round((avgWeightKg ?? 0) * input.count * INDICATIVE_LIVEWEIGHT_EUR_PER_KG);
        const group: LivestockGroup = {
          id: newId("lg", input.label),
          farmId: state.farm.id,
          category: input.category,
          label: input.label,
          count: tracked(input.count, "verified", state.farm.ownerName),
          ...(avgWeightKg !== undefined
            ? { avgWeightKg: tracked(avgWeightKg, "estimated", "Farm Return assumption") }
            : {}),
          system: input.system,
          ...(input.housingId ? { housingId: input.housingId } : {}),
          ...(input.goal ? { goal: input.goal } : {}),
          value: tracked(estValue, "estimated", "Farm Return assumption"),
          statusLabel: "On Track",
        };
        setState((s) => ({
          ...s,
          livestockGroups: [...s.livestockGroups, group],
          housing:
            input.housingId != null
              ? s.housing.map((h) =>
                  h.id === input.housingId
                    ? { ...h, linkedGroupIds: [...h.linkedGroupIds, group.id] }
                    : h,
                )
              : s.housing,
        }));
        return group;
      },
    }),
    [state.farm.id, state.farm.ownerName, state.farm.location.centroid],
  );

  const value = useMemo<FarmStore>(() => ({ ...state, ...actions, hydrated }), [state, actions, hydrated]);

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

function useFarmStore(): FarmStore {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error("useFarmStore must be used within a FarmProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export function useFarm(): Farm {
  return useFarmStore().farm;
}

export function useFields(): Field[] {
  return useFarmStore().fields;
}

export function useFieldById(id: string | undefined): Field | undefined {
  const fields = useFields();
  return id ? fields.find((f) => f.id === id) : undefined;
}

export function useLivestockGroups(): LivestockGroup[] {
  return useFarmStore().livestockGroups;
}

export function useHousingList(): Housing[] {
  return useFarmStore().housing;
}

export function useSlurryAllocations(): SlurryAllocation[] {
  return useFarmStore().slurryAllocations;
}

export function useLivestockTotals() {
  const groups = useLivestockGroups();
  return useMemo(() => {
    const totalLivestockCount = groups.reduce((sum, g) => sum + g.count.value, 0);
    const totalLivestockValue = groups.reduce((sum, g) => sum + g.value.value, 0);
    const totalLiveWeightKg = groups.reduce(
      (sum, g) => sum + g.count.value * (g.avgWeightKg?.value ?? 0),
      0,
    );
    const avgLiveWeightKg = totalLivestockCount > 0 ? Math.round(totalLiveWeightKg / totalLivestockCount) : 0;
    return { totalLivestockCount, totalLivestockValue, totalLiveWeightKg, avgLiveWeightKg };
  }, [groups]);
}

// ---------------------------------------------------------------------------
// Action hooks
// ---------------------------------------------------------------------------

export function useFarmActions(): FarmActions {
  const {
    updateFarmProfile,
    addField,
    setFieldBoundary,
    updateFieldIndex,
    addLivestockGroup,
    addSoilTest,
    updateFieldCommonageStatus,
    updateFieldWaterBufferContext,
    updateSlurryApplicationMethod,
  } = useFarmStore();
  return {
    updateFarmProfile,
    addField,
    setFieldBoundary,
    updateFieldIndex,
    addLivestockGroup,
    addSoilTest,
    updateFieldCommonageStatus,
    updateFieldWaterBufferContext,
    updateSlurryApplicationMethod,
  };
}
