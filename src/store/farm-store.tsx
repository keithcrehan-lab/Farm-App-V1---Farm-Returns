"use client";

/**
 * Phase 2 — central farm data model. Real Farm V1 Phase 6 — two
 * persistence modes.
 *
 * A Context + useState store, deliberately dependency-light (no Zustand/
 * Redux) — see CLAUDE.md "enter once, use everywhere". Holds only the
 * entities a farmer directly enters or edits: Farm, Fields, Livestock
 * groups, Housing, Slurry allocations. Everything else in
 * `@/data/mock-farm` (nutrient plans, silage plans, spreading scores,
 * finance lines, market prices, alerts, timeline, ...) represents
 * domain-engine or external outputs and stays a static import until those
 * engines have a real farm-scoped input to compute from.
 *
 * **Mock mode** (`remote` unset — every existing screen/test today):
 * seeded from `@/data/mock-farm`, persisted to `localStorage`, hydrated in
 * a client-only effect so the server render and first client paint match
 * (avoiding a hydration mismatch), then a farmer's saved edits replace it
 * post-mount.
 *
 * **Real mode** (`remote` + `initialState` passed by `(app)/layout.tsx`
 * once Supabase is configured and the signed-in user has a real farm):
 * seeded from the real Postgres rows fetched server-side; every mutation
 * still updates local state synchronously (identical logic to mock mode,
 * so the UI responds immediately) and additionally fires the matching
 * `src/app/actions/farm.ts` Server Action to persist the change — see
 * `persistRemote` below for the fire-and-forget tradeoff this makes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  MappedSoil,
  SlurryAllocation,
  SoilTest,
} from "@/domain/types";
import type { NeatSlurryEvidenceRecord, SpreadableAreaRecord } from "@/domain/regulatory-evidence-records";
import { farmerAdjust, verify } from "@/domain/provenance";
import {
  cropGroupForFieldUse,
  kIndexFromMgL,
  pIndexFromMgL,
  resolvePIndexConservatively,
  soilMaterialForOrganicCarbonStatus,
} from "@/domain/nutrients";
import { resolveSoilTestChain } from "@/domain/soil-test-history";
import { computeBoundaryGeometry } from "@/domain/field-boundary";
import { resolveSoilForFieldPolygon } from "@/domain/soil-resolution";
import type { NewSlurryCompositionInput, SlurryComposition } from "@/domain/slurry-composition";
import {
  addFieldAction,
  addHousingAction,
  addLivestockGroupAction,
  addSlurryCompositionRecordAction,
  addSoilTestAction,
  archiveFieldAction,
  restoreFieldAction,
  setFieldBoundaryAction,
  updateFarmProfileAction,
  updateFieldCommonageStatusAction,
  updateFieldDetailsAction,
  updateFieldIndexAction,
  updateFieldWaterBufferContextAction,
  updateHousingAction,
  updateLivestockGroupAction,
  updateSlurryApplicationDateAction,
  updateSlurryApplicationMethodAction,
  createSlurryAllocationAction,
} from "@/app/actions/farm";
import { validateNewSlurryAllocationPlan, SlurryAllocationPlanRejectedError, type NewSlurryAllocationPlanInput } from "@/domain/slurry-allocation-plan";
import {
  dublinDate,
  isActiveReservation,
  validateSlurryAllocationCompletion,
  validateSlurryAllocationEdit,
  type SlurryAllocationCompletionInput,
  type SlurryAllocationEditInput,
  type SlurryAllocationRecord,
} from "@/domain/slurry-allocation-lifecycle";
import {
  applyLocalSlurryCancel,
  applyLocalSlurryCompletion,
  applyLocalSlurryEdit,
  withLocalStoreWithdrawals,
  type LocalSlurryLifecycleResult,
} from "@/domain/slurry-plan-lifecycle-view";
import {
  cancelPlannedSlurryAllocationAction,
  completePlannedSlurryAllocationAction,
  loadSlurryPlanStateAction,
  updatePlannedSlurryAllocationAction,
  type SlurryAllocationLifecycleActionResult,
} from "@/app/actions/slurry-allocation-lifecycle";

/** Phase 1B.1 — whether the slurry plan on screen is known to match the
 * canonical server state. `stale` after any failed re-read: the displayed
 * records are only the last ones loaded, not a statement of current
 * lifecycle state. Display freshness only — never lifecycle truth. */
export type SlurryPlanFreshness = "current" | "stale";
export type SlurryPlanRefreshResult = { status: "refreshed" } | { status: "failed" };
/** A lifecycle action's outcome (the server's decision) and the outcome of
 * the re-read that follows it, kept separate: a `saved` mutation whose
 * re-read failed is still saved, but its plan is `stale`. */
export type SlurryLifecycleOutcome = SlurryAllocationLifecycleActionResult<SlurryAllocationRecord> & { plan: SlurryPlanFreshness };

const STORAGE_KEY = "farm-return:v1";
const STORAGE_VERSION = 1;

interface FarmState {
  farm: Farm;
  fields: Field[];
  livestockGroups: LivestockGroup[];
  housing: Housing[];
  slurryAllocations: SlurryAllocation[];
  /** Slurry Evidence & Composition V1 — every real, persisted slurry
   * composition/evidence record across every shed/tank (append-only —
   * see `src/domain/slurry-composition.ts`'s own header). Empty `[]` in
   * mock mode: the Phase 1 demo farm deliberately shows the honest
   * "Estimated" default rather than a fabricated example lab result. */
  slurryCompositionRecords: SlurryComposition[];
  /** Phase 1B — every slurry allocation with its lifecycle (planned,
   * completed, cancelled; `listSlurryAllocationRecordsForFarm`). Its
   * planned records are the same plans as `slurryAllocations`, which stays
   * the active-only list every planning reader consumes. Optional: a
   * state seeded without it (older tests/localStorage) has no history. */
  slurryAllocationRecords?: SlurryAllocationRecord[];
  /** Campaign B — every persisted regulatory neat-slurry and spreadable-area
   * record (`loadRegulatoryEvidenceRecordsForFarm`), raw: the current one
   * is selected only by `buildSlurryRegulatoryContextFromRecords`. Absent
   * (mock mode, older state) = no record, so nothing is established. */
  neatSlurryEvidenceRecords?: NeatSlurryEvidenceRecord[];
  spreadableAreaRecords?: SpreadableAreaRecord[];
}

/** Phase 1B — the demo farm's allocations as lifecycle records (stable ids,
 * all planned: the demo invents no completion or cancellation history). */
function mockSlurryAllocationRecords(farmId: string, allocations: readonly SlurryAllocation[]): SlurryAllocationRecord[] {
  return allocations.map((a) => ({
    ...a,
    id: `slurry-alloc-${a.fieldId}-${a.housingId}`,
    farmId,
    status: "planned",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

/** Replaces the lifecycle records and keeps `slurryAllocations` equal to
 * their active (planned) subset. */
function withSlurryRecords(s: FarmState, records: SlurryAllocationRecord[], housing: Housing[] = s.housing): FarmState {
  return { ...s, housing, slurryAllocationRecords: records, slurryAllocations: records.filter(isActiveReservation) };
}

/** Codex remediation Priority 5 — one real-mode database write that failed
 * and has not yet been retried. `retry()` re-attempts the exact same
 * write (same `work` closure `persistRemote` was originally called
 * with), not a generic "reload the page" fallback. */
export interface SyncFailure {
  id: string;
  /** The action name (e.g. "updateFieldIndex") — matches persistRemote's
   * own `label`, so a fresh failure for the same action replaces a stale
   * one rather than stacking duplicates. */
  label: string;
  message: string;
  retry: () => void;
}

function seedState(): FarmState {
  return {
    farm: mockFarm,
    fields: mockFields,
    livestockGroups: mockLivestockGroups,
    housing: mockHousing,
    slurryAllocations: mockSlurryAllocations,
    slurryCompositionRecords: [],
    slurryAllocationRecords: mockSlurryAllocationRecords(mockFarm.id, mockSlurryAllocations),
  };
}

function loadPersisted(): FarmState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: number; state: FarmState };
    if (parsed.version !== STORAGE_VERSION) return null;
    // Saved before Phase 1B: its plans become records, all still planned.
    if (!parsed.state.slurryAllocationRecords) {
      return { ...parsed.state, slurryAllocationRecords: mockSlurryAllocationRecords(parsed.state.farm.id, parsed.state.slurryAllocations) };
    }
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

/** Codex remediation Priority 8 — real spatial soil resolution attempt,
 * run every time a field's real boundary is known (creation and every
 * later boundary edit — "recalculation after boundary edits" per the
 * remediation brief). Returns `{}` (no `mappedSoil` patch) today, always
 * — see `soil-resolution.ts`'s own header for the exact blocker — but the
 * call site is real, not dead code: the moment a real dataset/resolver
 * exists, this starts actually populating `mappedSoil` with no caller
 * change needed. */
function mappedSoilPatchFromResolution(fieldId: string, polygon: GeoJSON.Polygon, areaHa: number): { mappedSoil?: MappedSoil } {
  const outcome = resolveSoilForFieldPolygon({ fieldId, fieldPolygon: polygon, fieldAreaHa: areaHa });
  return outcome.status === "OK" ? { mappedSoil: outcome.value.dominant } : {};
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

/** Codex remediation Priority 6 — boundary-first: a field is created from
 * a real drawn `polygon`, never a manually-typed area or an upfront
 * planned use. */
export interface AddFieldInput {
  name: string;
  polygon: GeoJSON.Polygon;
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

export interface AddHousingInput {
  shedName: string;
  shedType: "slatted" | "straw_bedded" | "other";
  housingPeriod: { start: string; end: string };
  storageCapacityM3: number;
  storageFillPct: number;
  /** Codex audit CRITICAL (Fertiliser Overview and Stock Visuals
   * campaign, round 1) — see `NewHousingInput.storageFillStatus`'s own
   * doc comment (`src/lib/farm-data/housing.ts`): the caller (the real
   * Housing form) must say whether the farmer actually typed a fill
   * value this submission, never inferred from the number alone.
   * Defaults to `"estimated"` when omitted — the safe default. */
  storageFillStatus?: "estimated" | "farmer_recorded";
}

/** Slurry Evidence & Composition V1 — re-exported so callers (the new
 * Housing "Add slurry result" sheet) never import the raw domain input
 * type from two different places. */
export type AddSlurryCompositionInput = NewSlurryCompositionInput;

interface FarmActions {
  updateFarmProfile: (patch: { name?: string; ownerName?: string; county?: string }) => void;
  /** Returns a Promise — in real mode (`FarmProvider remote`) the field's
   * id comes from Postgres, not a client-generated placeholder, so callers
   * that need the new field's real id (e.g. selecting it immediately
   * after adding) must await this rather than assume a synchronous
   * return. Mock mode resolves immediately with the same locally-built
   * `Field` it always constructed. */
  addField: (input: AddFieldInput) => Promise<Field>;
  /** Saves a real, farmer-drawn field boundary — recomputes `centroid`/
   * `areaHa` from it (never keeps the old placeholder/typed values once
   * real geometry exists). Throws if `polygon` isn't valid geometry
   * (`isValidBoundaryPolygon`) — callers (the map draw UI) must validate
   * before calling this, same as every other "never silently accept bad
   * data" rule in this app. */
  setFieldBoundary: (fieldId: string, polygon: GeoJSON.Polygon) => void;
  /** Real Farm V1 Phase 7 — rename and/or change planned use. `areaHa` may
   * only be patched for a field with no mapped `polygon` yet — once real
   * geometry exists, area comes from it, never a manual override
   * (`setFieldBoundary`'s own comment). */
  updateFieldDetails: (
    fieldId: string,
    patch: { name?: string; plannedUse?: FieldUse; areaHa?: number },
    farmerName: string,
  ) => void;
  /** Real Farm V1 Phase 7 — soft delete; see `Field.archivedAt`'s comment. */
  archiveField: (fieldId: string) => void;
  restoreField: (fieldId: string) => void;
  updateFieldIndex: (
    fieldId: string,
    key: "pIndex" | "kIndex",
    value: 1 | 2 | 3 | 4,
    farmerName: string,
  ) => void;
  /** Same real-id caveat as `addField` — await this in remote mode. */
  addLivestockGroup: (input: AddLivestockGroupInput) => Promise<LivestockGroup>;
  /** Real Mode Completion Phase 26 — editability; a farmer correcting a
   * group's count/weight/label/system/goal/housing after creation. */
  updateLivestockGroup: (
    groupId: string,
    patch: {
      label?: string;
      count?: number;
      avgWeightKg?: number;
      breed?: string;
      system?: "grazing" | "housed";
      goal?: LivestockGoal;
      housingId?: string | null;
    },
    farmerName: string,
  ) => void;
  /** Real Farm V1 Phase 11 — until this action existed, Housing was
   * entirely `mock-farm.ts` seed data with no way for a real farmer to
   * ever add a shed. Same real-id caveat as `addField`/`addLivestockGroup`. */
  addHousing: (input: AddHousingInput) => Promise<Housing>;
  /** Real Mode Completion Phase 26 — editability; rename/correct a shed
   * after creation. */
  updateHousing: (
    housingId: string,
    patch: {
      shedName?: string;
      shedType?: "slatted" | "straw_bedded" | "other";
      housingPeriod?: { start: string; end: string };
      storageCapacityM3?: number;
      storageFillPct?: number;
      /** Same real, caller-decided meaning as `AddHousingInput.storageFillStatus`
       * above. */
      storageFillStatus?: "estimated" | "farmer_recorded";
    },
  ) => void;
  /** Slurry Evidence & Composition V1 — records one dated composition
   * result (farmer-provided or a real laboratory analysis) for a shed/
   * tank; never edits/replaces a previous record (see
   * `src/domain/slurry-composition.ts`'s own header). Same real-id
   * caveat as `addField`/`addHousing` — await this in remote mode. */
  addSlurryComposition: (input: AddSlurryCompositionInput) => Promise<SlurryComposition>;
  addSoilTest: (fieldId: string, input: AddSoilTestInput) => void;
  /** Slurry planning entry — creates one farmer-planned field slurry
   * allocation (store, field, volume, method, date), validated by
   * `validateNewSlurryAllocationPlan`; rejects with the farmer-facing
   * reason (`SlurryAllocationPlanRejectedError`, including the database's
   * atomic re-check in remote mode) rather than saving an invalid plan. Same real-id caveat as
   * `addHousing` — await this in remote mode. */
  createSlurryAllocation: (input: NewSlurryAllocationPlanInput, farmerName: string) => Promise<SlurryAllocation>;
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
  /** Slurry Application Context V1 — same gap/pattern as
   * `updateSlurryApplicationMethod` above, for the new
   * `SlurryAllocation.applicationDate` field: real and wired into
   * `resolveAvailableSlurryNutrients` (`src/domain/nutrients.ts`) for
   * disclosure, but previously no action ever let a farmer actually
   * record it. */
  updateSlurryApplicationDate: (fieldId: string, housingId: string, isoDate: string, farmerName: string) => void;
  /** Phase 1B — slurry plan lifecycle. Never optimistic: the result is the
   * server's (remote) or the Phase 1A mirror's (demo) decision, and in
   * remote mode the canonical stores and records are re-read after every
   * attempt — saved, refused or failed — so a stale screen is corrected.
   * `plan` reports whether that re-read succeeded (see
   * `SlurryLifecycleOutcome`). An unexpected failure rejects the promise. */
  editPlannedSlurryAllocation: (input: SlurryAllocationEditInput) => Promise<SlurryLifecycleOutcome>;
  cancelPlannedSlurryAllocation: (allocationId: string) => Promise<SlurryLifecycleOutcome>;
  completePlannedSlurryAllocation: (input: SlurryAllocationCompletionInput) => Promise<SlurryLifecycleOutcome>;
  /** Re-reads the canonical stores and allocation records (remote mode;
   * always `refreshed` for the demo farm, whose local state is canonical).
   * Never throws: a failure marks the plan `stale` and is reported in the
   * result; a success clears it. */
  refreshSlurryPlan: () => Promise<SlurryPlanRefreshResult>;
}

export interface FarmStore extends FarmState, FarmActions {
  hydrated: boolean;
  /** Codex remediation Priority 3 — true when this is a real, authenticated
   * farm account (`FarmProvider remote`), false for the Phase 1 mock/demo
   * dataset. Screens use this to decide whether a Phase 1 placeholder
   * figure (mock revenue/cost/margin, a demo timeline, an illustrative
   * market-price row, ...) is safe to show at all — never for a real
   * account, which must see an honest empty/setup state instead (see
   * `useIsRealMode()` below). */
  isRemote: boolean;
  /** Codex remediation Priority 5 — >0 while at least one real-mode write
   * is in flight to Postgres. */
  pendingSyncCount: number;
  /** Monotonic count of real-mode writes that completed successfully
   * (retries included) this session — lets a screen that reads persisted
   * data (e.g. Today's What Matters evaluation) re-read it after a save
   * actually lands, without re-reading after a failure. */
  syncedWriteCount: number;
  /** Codex remediation Priority 5 — real-mode writes that failed and have
   * not yet succeeded on retry; empty in mock mode (nothing to sync). */
  syncFailures: SyncFailure[];
  /** Removes one entry from `syncFailures` without retrying it — a
   * farmer explicitly dismissing a failure they don't want to retry right
   * now. Does not affect local state (which is already ahead of the
   * database) or the database itself. */
  dismissSyncFailure: (id: string) => void;
  /** Phase 1B.1 — see `SlurryPlanFreshness`. */
  slurryPlanFreshness: SlurryPlanFreshness;
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

export function FarmProvider({
  children,
  remote = false,
  initialState,
}: {
  children: ReactNode;
  /** Real Farm V1 Phase 6 — set by `(app)/layout.tsx` when Supabase is
   * configured and the signed-in user has a real farm. Every mutation
   * then also writes through to Postgres (`src/app/actions/farm.ts`)
   * instead of `localStorage`; `initialState` (fetched server-side from
   * the real farm/fields/livestock/housing/slurry rows) replaces the
   * Phase 1 mock seed. `false`/omitted (today's default, and every
   * existing test's `<FarmProvider>`) is unchanged mock-mode behaviour. */
  remote?: boolean;
  initialState?: FarmState;
}) {
  const [state, setState] = useState<FarmState>(() => initialState ?? seedState());
  // Real mode already has its real data server-side — no client-only
  // rehydration step to wait for.
  const [hydrated, setHydrated] = useState(remote);

  // Client-only rehydration from localStorage, post-mount — never runs
  // during SSR or the first client render, so hydration always matches.
  // The setState-in-effect lint rule generally guards against effects that
  // should be plain event handlers or derived state; reading an external
  // store (localStorage) once after mount to seed React state is exactly
  // the "synchronize with an external system" case the rule allows for —
  // hence the explicit opt-out below. Skipped entirely in remote mode —
  // there is nothing in localStorage for a real farm to rehydrate from.
  useEffect(() => {
    if (remote) return;
    const persisted = loadPersisted();
    if (persisted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount rehydration from localStorage, the sanctioned SSR-safe pattern documented above.
      setState(persisted);
    }
    setHydrated(true);
  }, [remote]);

  useEffect(() => {
    if (remote || !hydrated) return;
    persist(state);
  }, [state, hydrated, remote]);

  // Codex remediation Priority 5 — real-mode background persistence gains
  // an explicit mutation-state strategy: a failed write no longer just
  // logs to the console while local state silently claims success
  // everywhere else in the UI. `pendingCount`/`syncFailures` are exposed
  // via `useSyncStatus()` below so the app shell can show a real
  // "Saving…"/"N changes failed to save — Retry" banner. Still
  // fire-and-forget, not awaited by the caller — every action below
  // already updates local state synchronously (identically to mock mode)
  // so the UI responds immediately — but a failure is now a real, visible,
  // retryable state, not just a console.error.
  const [pendingCount, setPendingCount] = useState(0);
  const [syncedWriteCount, setSyncedWriteCount] = useState(0);
  const [syncFailures, setSyncFailures] = useState<SyncFailure[]>([]);
  const [slurryPlanFreshness, setSlurryPlanFreshness] = useState<SlurryPlanFreshness>("current");
  // A `retry()` closure needs to call `persistRemote` again, but
  // `persistRemote` can't reference its own `const` binding inside the
  // `useCallback` that defines it (react-hooks/immutability) — a ref holds
  // the current function instead, updated every render, exactly the
  // pattern React's own docs use for "call the latest version of this
  // callback from inside itself".
  const persistRemoteRef = useRef<(label: string, work: () => Promise<unknown>) => void>(() => {});

  const persistRemote = useCallback(
    <T,>(label: string, work: () => Promise<T>) => {
      if (!remote) return;
      setPendingCount((c) => c + 1);
      work()
        .then(() => {
          setSyncedWriteCount((c) => c + 1);
          setSyncFailures((fails) => fails.filter((f) => f.label !== label));
        })
        .catch((error: unknown) => {
          console.error(`[farm-store] real-mode write failed (${label}):`, error);
          const message = error instanceof Error ? error.message : String(error);
          setSyncFailures((fails) => [
            ...fails.filter((f) => f.label !== label),
            { id: `${label}-${Date.now()}`, label, message, retry: () => persistRemoteRef.current(label, work) },
          ]);
        })
        .finally(() => setPendingCount((c) => Math.max(0, c - 1)));
    },
    [remote],
  );
  // Updates the ref after render (an effect, not a render-time write —
  // react-hooks/refs forbids mutating a ref's `.current` during render
  // itself), so `retry()` closures created on an earlier render still call
  // the current `persistRemote`.
  useEffect(() => {
    persistRemoteRef.current = persistRemote;
  });
  // Same after-render ref pattern: lets `createSlurryAllocation`'s mock
  // branch validate against current fields/allocations without making
  // every consumer's `actions` object change on each field/allocation edit.
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
  });

  // Phase 1B — slurry plan lifecycle plumbing (see `FarmActions`).
  const refreshSlurryPlan = useCallback(async (): Promise<SlurryPlanRefreshResult> => {
    if (!remote) return { status: "refreshed" };
    try {
      const { housing, records } = await loadSlurryPlanStateAction();
      setState((s) => withSlurryRecords(s, records, housing));
      setSlurryPlanFreshness("current");
      return { status: "refreshed" };
    } catch (error: unknown) {
      console.error("[farm-store] slurry plan refresh failed:", error);
      setSlurryPlanFreshness("stale");
      return { status: "failed" };
    }
  }, [remote]);

  const runRemoteLifecycle = useCallback(
    async (work: () => Promise<SlurryAllocationLifecycleActionResult<SlurryAllocationRecord>>): Promise<SlurryLifecycleOutcome> => {
      let result: SlurryAllocationLifecycleActionResult<SlurryAllocationRecord>;
      try {
        result = await work();
      } catch (error: unknown) {
        // Server state wins, whatever the outcome.
        await refreshSlurryPlan();
        throw error;
      }
      if (result.status === "saved") setSyncedWriteCount((c) => c + 1);
      const refresh = await refreshSlurryPlan();
      return { ...result, plan: refresh.status === "refreshed" ? "current" : "stale" };
    },
    [refreshSlurryPlan],
  );

  const applyLocal = useCallback((result: LocalSlurryLifecycleResult): SlurryLifecycleOutcome => {
    if (result.status === "rejected") return { ...result, plan: "current" };
    setState((s) => withSlurryRecords(s, result.records, withLocalStoreWithdrawals(s.housing, result.records)));
    return { status: "saved", value: result.record, plan: "current" };
  }, []);

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
        persistRemote("updateFarmProfile", () => updateFarmProfileAction(state.farm.id, patch));
      },

      // Codex remediation Priority 6 — boundary-first: `input.polygon` is a
      // real drawn boundary (`FieldBoundaryMapModal`), not a manually-typed
      // area. `areaHa`/`centroid` are always derived from it
      // (`computeBoundaryGeometry`), matching `setFieldBoundary` below —
      // one geometry computation, not two. No `plannedUse` at creation
      // (set afterward in Field Detail) and no fabricated `mappedSoil`/P-K
      // Index default (Priority 2) — `fertility` starts empty.
      async addField(input) {
        const { centroid, areaHa } = computeBoundaryGeometry(input.polygon);

        if (remote) {
          const field = await addFieldAction(state.farm.id, {
            name: input.name,
            polygon: input.polygon,
          });
          setState((s) => ({ ...s, fields: [...s.fields, field] }));
          return field;
        }

        const fieldId = newId("field", input.name);
        const field: Field = {
          id: fieldId,
          farmId: state.farm.id,
          name: input.name,
          areaHa,
          centroid,
          polygon: input.polygon,
          polygonSource: "farmer_drawn",
          polygonCapturedAt: new Date().toISOString(),
          ...mappedSoilPatchFromResolution(fieldId, input.polygon, areaHa),
          fertility: {},
          history: [],
        };
        setState((s) => ({ ...s, fields: [...s.fields, field] }));
        return field;
      },

      setFieldBoundary(fieldId, polygon) {
        const { centroid, areaHa } = computeBoundaryGeometry(polygon);
        const mappedSoilPatch = mappedSoilPatchFromResolution(fieldId, polygon, areaHa);
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) =>
            f.id === fieldId
              ? {
                  ...f,
                  polygon,
                  polygonSource: "farmer_drawn",
                  ...mappedSoilPatch,
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
        persistRemote("setFieldBoundary", () => setFieldBoundaryAction(fieldId, polygon, areaHa, centroid));
      },

      updateFieldDetails(fieldId, patch, farmerName) {
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) => {
            if (f.id !== fieldId) return f;
            if (patch.areaHa !== undefined && f.polygon) {
              // Same "geometry wins" rule setFieldBoundary already
              // enforces — a manual area can never silently contradict a
              // real mapped boundary, so a caller asking to change area
              // on an already-mapped field is a bug, not a valid edit.
              throw new Error("Field area is derived from its mapped boundary and can't be edited manually once mapped.");
            }
            return {
              ...f,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.plannedUse !== undefined
                ? { plannedUse: farmerAdjust(f.plannedUse, patch.plannedUse, farmerName) }
                : {}),
              ...(patch.areaHa !== undefined ? { areaHa: patch.areaHa } : {}),
            };
          }),
        }));
        persistRemote("updateFieldDetails", () => updateFieldDetailsAction(fieldId, patch, farmerName));
      },

      archiveField(fieldId) {
        const archivedAt = new Date().toISOString();
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) => (f.id === fieldId ? { ...f, archivedAt } : f)),
        }));
        persistRemote("archiveField", () => archiveFieldAction(fieldId));
      },

      restoreField(fieldId) {
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) => {
            if (f.id !== fieldId) return f;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring off `archivedAt` is the removal, `rest` is the field without it.
            const { archivedAt, ...rest } = f;
            return rest;
          }),
        }));
        persistRemote("restoreField", () => restoreFieldAction(fieldId));
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
        persistRemote("updateFieldIndex", () => updateFieldIndexAction(fieldId, key, value, farmerName));
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
        persistRemote("updateFieldCommonageStatus", () => updateFieldCommonageStatusAction(fieldId, status, farmerName));
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
        persistRemote("updateFieldWaterBufferContext", () => updateFieldWaterBufferContextAction(fieldId, context, farmerName));
      },

      updateSlurryApplicationMethod(fieldId, housingId, method, farmerName) {
        const adjust = <A extends SlurryAllocation>(a: A): A => ({
          ...a,
          applicationMethod: farmerAdjust(a.applicationMethod ?? tracked("other", "estimated", "Farm Return assumption"), method, farmerName),
        });
        setState((s) => ({
          ...s,
          slurryAllocations: s.slurryAllocations.map((a) => (a.fieldId === fieldId && a.housingId === housingId ? adjust(a) : a)),
          ...(s.slurryAllocationRecords
            ? {
                slurryAllocationRecords: s.slurryAllocationRecords.map((r) =>
                  isActiveReservation(r) && r.fieldId === fieldId && r.housingId === housingId ? adjust(r) : r,
                ),
              }
            : {}),
        }));
        persistRemote("updateSlurryApplicationMethod", () =>
          updateSlurryApplicationMethodAction(fieldId, housingId, method, farmerName),
        );
      },

      updateSlurryApplicationDate(fieldId, housingId, isoDate, farmerName) {
        const adjust = <A extends SlurryAllocation>(a: A): A => ({
          ...a,
          applicationDate: farmerAdjust(a.applicationDate ?? tracked(isoDate, "estimated", "Farm Return assumption"), isoDate, farmerName),
        });
        setState((s) => ({
          ...s,
          slurryAllocations: s.slurryAllocations.map((a) => (a.fieldId === fieldId && a.housingId === housingId ? adjust(a) : a)),
          ...(s.slurryAllocationRecords
            ? {
                slurryAllocationRecords: s.slurryAllocationRecords.map((r) =>
                  isActiveReservation(r) && r.fieldId === fieldId && r.housingId === housingId ? adjust(r) : r,
                ),
              }
            : {}),
        }));
        persistRemote("updateSlurryApplicationDate", () =>
          updateSlurryApplicationDateAction(fieldId, housingId, isoDate, farmerName),
        );
      },

      addSoilTest(fieldId, input) {
        const source = `${input.laboratory} soil test`;
        setState((s) => ({
          ...s,
          fields: s.fields.map((f) => {
            if (f.id !== fieldId) return f;
            // Grassland Fertiliser Pilot Completion, Checkpoint B (audit
            // finding F4; Codex audit round 1 HIGH) — real chronological
            // ordering, never entry order: mirrors
            // `addSoilTestToField`'s own identical real-mode fix
            // (`src/lib/farm-data/soil.ts`) via the same shared pure
            // function, so mock and real mode never diverge on this.
            const { head: verifiedTest, inputBecameActive } = resolveSoilTestChain(f.fertility.verifiedTest, input);
            if (!inputBecameActive) {
              // `input` was a backfilled OLDER real result, inserted
              // into history — the field's real current pIndex/kIndex/pH
              // must keep reflecting the genuinely newer test already on
              // file, untouched.
              return { ...f, fertility: { ...f.fertility, verifiedTest } };
            }
            // V3 fix (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.1,
            // conflict #3): a raw lab value in the literal statutory
            // (8.00, 8.01]/(10.00, 10.01] micro-gap must not be silently
            // stored as an indistinguishable Index 4 — the conservative
            // treatment is applied explicitly here and recorded in the
            // TrackedValue's own `source` text (spec B1: "explicitly
            // recording that this is a conservative handling of source
            // ambiguity, not a fabricated literal classification").
            const pIndexOutcome = pIndexFromMgL(input.p, f.plannedUse ? cropGroupForFieldUse(f.plannedUse.value) : undefined);
            const { index: pIndex, conservativeTreatment } = resolvePIndexConservatively(pIndexOutcome);
            const pIndexSource = conservativeTreatment
              ? `${source} — AMBIGUOUS_STATUTORY_BOUNDARY: raw ${input.p} mg/L falls in the literal statutory source gap; conservative P4 allowance treatment applied, not a literal classification (S.I. 588/2025)`
              : source;
            const kIndex = kIndexFromMgL(input.k, soilMaterialForOrganicCarbonStatus(f.mappedSoil?.organicCarbonStatus));
            return {
              ...f,
              fertility: {
                pIndex: verify(f.fertility.pIndex, pIndex, pIndexSource, { sourceDate: input.sampleDate }),
                kIndex: verify(f.fertility.kIndex, kIndex, source, { sourceDate: input.sampleDate }),
                pH: f.fertility.pH
                  ? verify(f.fertility.pH, input.pH, source, { sourceDate: input.sampleDate })
                  : tracked(input.pH, "verified", source, { sourceDate: input.sampleDate }),
                verifiedTest,
              },
            };
          }),
        }));
        persistRemote("addSoilTest", () => addSoilTestAction(fieldId, input));
      },

      async addLivestockGroup(input) {
        if (remote) {
          const group = await addLivestockGroupAction(state.farm.id, { ...input, farmerName: state.farm.ownerName });
          setState((s) => ({
            ...s,
            livestockGroups: [...s.livestockGroups, group],
            housing:
              input.housingId != null
                ? s.housing.map((h) =>
                    h.id === input.housingId ? { ...h, linkedGroupIds: [...h.linkedGroupIds, group.id] } : h,
                  )
                : s.housing,
          }));
          return group;
        }

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
          // Real Farm V1 Phase 5 — no rule anywhere computes a real group
          // status; "On Track" was a fabricated label with no basis
          // (mock-farm.ts's own demo groups still show it — allowed
          // there, per CLAUDE.md, since demo data isn't a real farmer's
          // farm). LivestockGroupCard already renders the status pill
          // conditionally, so omitting this shows no pill rather than an
          // invented one.
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

      updateLivestockGroup(groupId, patch, farmerName) {
        setState((s) => ({
          ...s,
          livestockGroups: s.livestockGroups.map((g) => {
            if (g.id !== groupId) return g;
            return {
              ...g,
              ...(patch.label !== undefined ? { label: patch.label } : {}),
              ...(patch.count !== undefined ? { count: tracked(patch.count, "verified", farmerName) } : {}),
              ...(patch.avgWeightKg !== undefined ? { avgWeightKg: tracked(patch.avgWeightKg, "farmer_adjusted", farmerName) } : {}),
              ...(patch.breed !== undefined ? { breed: patch.breed } : {}),
              ...(patch.system !== undefined ? { system: patch.system } : {}),
              ...(patch.goal !== undefined ? { goal: patch.goal } : {}),
              ...(patch.housingId !== undefined ? { housingId: patch.housingId ?? undefined } : {}),
            };
          }),
        }));
        persistRemote("updateLivestockGroup", () => updateLivestockGroupAction(groupId, { ...patch, farmerName }));
      },

      async addHousing(input) {
        if (remote) {
          const housing = await addHousingAction(state.farm.id, input);
          setState((s) => ({ ...s, housing: [...s.housing, housing] }));
          return housing;
        }

        const housing: Housing = {
          id: newId("housing", input.shedName),
          farmId: state.farm.id,
          shedName: input.shedName,
          shedType: input.shedType,
          linkedGroupIds: [],
          housingPeriod: input.housingPeriod,
          // Same explicitly mock-tagged placeholder src/lib/farm-data/
          // housing.ts's real-mode createHousing uses — the real S.I.
          // 588/2025 excretion-rate coefficient this needs is a
          // documented, still-open blocker (docs/evidence-register.md),
          // not something either code path may guess at.
          slurryEstimate: {
            volumeM3: tracked(0, "estimated", "slurry_engine_v1.0.0 (mock)"),
            availableN: tracked(0, "estimated", "slurry_engine_v1.0.0 (mock)"),
            availableP: tracked(0, "estimated", "slurry_engine_v1.0.0 (mock)"),
            availableK: tracked(0, "estimated", "slurry_engine_v1.0.0 (mock)"),
            ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
          },
          storageCapacityM3: input.storageCapacityM3,
          storageFillPct: input.storageFillPct,
          // Mirrors real-mode `createHousing`'s own stamping
          // (`src/lib/farm-data/housing.ts`) — the caller (the real
          // Housing form) says whether the farmer actually typed a fill
          // value this submission; never assumed from the number alone
          // (Codex audit CRITICAL, round 1).
          storageFillStatus: input.storageFillStatus ?? "estimated",
          ...(input.storageFillStatus === "farmer_recorded" ? { storageFillRecordedAt: new Date().toISOString() } : {}),
        };
        setState((s) => ({ ...s, housing: [...s.housing, housing] }));
        return housing;
      },

      updateHousing(housingId, patch) {
        setState((s) => ({
          ...s,
          housing: s.housing.map((h) => {
            if (h.id !== housingId) return h;
            return {
              ...h,
              ...(patch.shedName !== undefined ? { shedName: patch.shedName } : {}),
              ...(patch.shedType !== undefined ? { shedType: patch.shedType } : {}),
              ...(patch.housingPeriod !== undefined ? { housingPeriod: patch.housingPeriod } : {}),
              ...(patch.storageCapacityM3 !== undefined ? { storageCapacityM3: patch.storageCapacityM3 } : {}),
              // Mirrors real-mode `updateHousing`'s own stamping
              // (`src/lib/farm-data/housing.ts`) — see `addHousing`'s
              // identical comment above.
              ...(patch.storageFillPct !== undefined
                ? {
                    storageFillPct: patch.storageFillPct,
                    storageFillStatus: patch.storageFillStatus ?? "estimated",
                    ...(patch.storageFillStatus === "farmer_recorded" ? { storageFillRecordedAt: new Date().toISOString() } : { storageFillRecordedAt: undefined }),
                  }
                : {}),
            };
          }),
        }));
        const linkedGroupIds = state.housing.find((h) => h.id === housingId)?.linkedGroupIds ?? [];
        persistRemote("updateHousing", () => updateHousingAction(housingId, patch, linkedGroupIds));
      },

      async createSlurryAllocation(input, farmerName) {
        if (remote) {
          const result = await createSlurryAllocationAction(input, farmerName);
          if (result.status === "rejected") throw new SlurryAllocationPlanRejectedError(result.issues);
          const allocation = result.allocation;
          setState((s) => ({ ...s, slurryAllocations: [...s.slurryAllocations, allocation] }));
          // The new plan's lifecycle record (its id) comes from the server.
          await refreshSlurryPlan();
          return allocation;
        }

        const current = latestStateRef.current;
        const validation = validateNewSlurryAllocationPlan(input, { fields: current.fields, housingList: current.housing, allocations: current.slurryAllocations });
        if (validation.status !== "OK") throw new SlurryAllocationPlanRejectedError(validation.issues);
        const plan = validation.value;
        const allocation: SlurryAllocation = {
          fieldId: plan.fieldId,
          housingId: plan.housingId,
          volumeM3: plan.volumeM3,
          applicationMethod: farmerAdjust(undefined, plan.applicationMethod, farmerName),
          applicationDate: farmerAdjust(undefined, plan.applicationDate, farmerName),
        };
        const now = new Date().toISOString();
        setState((s) =>
          s.slurryAllocationRecords
            ? withSlurryRecords(s, [
                ...s.slurryAllocationRecords,
                { ...allocation, id: newId("slurry-alloc", `${plan.fieldId}-${plan.housingId}`), farmId: s.farm.id, status: "planned", createdAt: now, updatedAt: now },
              ])
            : { ...s, slurryAllocations: [...s.slurryAllocations, allocation] },
        );
        return allocation;
      },

      refreshSlurryPlan,

      async editPlannedSlurryAllocation(input) {
        if (remote) return runRemoteLifecycle(() => updatePlannedSlurryAllocationAction(input));
        const validation = validateSlurryAllocationEdit(input);
        if (validation.status !== "OK") return { status: "rejected", issues: validation.issues, plan: "current" };
        const current = latestStateRef.current;
        return applyLocal(
          applyLocalSlurryEdit(
            current.housing,
            current.fields.filter((f) => !f.archivedAt).map((f) => f.id),
            current.slurryAllocationRecords ?? [],
            validation.value,
            new Date().toISOString(),
          ),
        );
      },

      async cancelPlannedSlurryAllocation(allocationId) {
        if (remote) return runRemoteLifecycle(() => cancelPlannedSlurryAllocationAction(allocationId));
        const current = latestStateRef.current;
        return applyLocal(applyLocalSlurryCancel(current.slurryAllocationRecords ?? [], allocationId, new Date().toISOString(), current.farm.ownerName));
      },

      async completePlannedSlurryAllocation(input) {
        if (remote) return runRemoteLifecycle(() => completePlannedSlurryAllocationAction(input));
        const validation = validateSlurryAllocationCompletion(input, dublinDate(new Date()));
        if (validation.status !== "OK") return { status: "rejected", issues: validation.issues, plan: "current" };
        const current = latestStateRef.current;
        return applyLocal(
          applyLocalSlurryCompletion(current.housing, current.slurryAllocationRecords ?? [], validation.value, new Date().toISOString(), current.farm.ownerName),
        );
      },

      async addSlurryComposition(input) {
        if (remote) {
          const record = await addSlurryCompositionRecordAction(state.farm.id, input);
          setState((s) => ({ ...s, slurryCompositionRecords: [...s.slurryCompositionRecords, record] }));
          return record;
        }

        const record: SlurryComposition = {
          id: newId("slurrycomp", input.housingId),
          farmId: state.farm.id,
          housingId: input.housingId,
          slurryType: input.slurryType,
          status: input.status,
          dmPct: input.dmPct,
          ...(input.nPerM3 !== undefined ? { nPerM3: input.nPerM3 } : {}),
          ...(input.pPerM3 !== undefined ? { pPerM3: input.pPerM3 } : {}),
          ...(input.kPerM3 !== undefined ? { kPerM3: input.kPerM3 } : {}),
          sampleDate: input.sampleDate,
          source: input.source,
          ...(input.laboratory !== undefined ? { laboratory: input.laboratory } : {}),
          ...(input.sampleRef !== undefined ? { sampleRef: input.sampleRef } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          recordedAt: new Date().toISOString(),
        };
        setState((s) => ({ ...s, slurryCompositionRecords: [...s.slurryCompositionRecords, record] }));
        return record;
      },
    }),
    [state.farm.id, state.farm.ownerName, state.housing, remote, persistRemote, refreshSlurryPlan, runRemoteLifecycle, applyLocal],
  );

  const dismissSyncFailure = useCallback((id: string) => {
    setSyncFailures((fails) => fails.filter((f) => f.id !== id));
  }, []);

  const value = useMemo<FarmStore>(
    () => ({ ...state, ...actions, hydrated, isRemote: remote, pendingSyncCount: pendingCount, syncedWriteCount, syncFailures, dismissSyncFailure, slurryPlanFreshness }),
    [state, actions, hydrated, remote, pendingCount, syncedWriteCount, syncFailures, dismissSyncFailure, slurryPlanFreshness],
  );

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

/** Codex remediation Priority 3 — see `FarmStore.isRemote`'s doc comment. */
export function useIsRealMode(): boolean {
  return useFarmStore().isRemote;
}

/** Real Farm V1 Phase 7 — every consumer except the Fields screen's own
 * archive-management UI wants active fields only (Dashboard hectare
 * counts, Nutrients' field selector, Soil, Silage, ...); archived fields
 * stay in the store (their history/soil tests/slurry allocations are
 * never deleted — `Field.archivedAt`'s comment) but are filtered out of
 * this default selector. */
export function useFields(): Field[] {
  return useFarmStore().fields.filter((f) => !f.archivedAt);
}

/** Unfiltered — the Fields screen's "Archived fields" section is the one
 * legitimate place a `Field` with `archivedAt` set should still be
 * addressable in the UI (so it can be inspected/restored). */
export function useAllFieldsIncludingArchived(): Field[] {
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

/** Slurry Evidence & Composition V1 — every real, persisted slurry
 * composition/evidence record (append-only, every shed/tank, every
 * result on file). Callers wanting the current/effective one per shed
 * should pass this through `currentSlurryCompositionByHousing`
 * (`src/domain/slurry-composition.ts`), never re-derive "latest" here. */
/** Phase 1B — every slurry allocation with its lifecycle (planned,
 * completed, cancelled). Empty when the store was seeded without them. */
export function useSlurryAllocationRecords(): SlurryAllocationRecord[] {
  return useFarmStore().slurryAllocationRecords ?? EMPTY_RECORDS;
}
const EMPTY_RECORDS: SlurryAllocationRecord[] = [];

/** Campaign B — persisted neat-slurry / spreadable-area records, raw. Pass
 * through `buildSlurryRegulatoryContextFromRecords`; never pick a "latest"
 * record here. */
export function useNeatSlurryEvidenceRecords(): NeatSlurryEvidenceRecord[] {
  return useFarmStore().neatSlurryEvidenceRecords ?? EMPTY_NEAT_RECORDS;
}
const EMPTY_NEAT_RECORDS: NeatSlurryEvidenceRecord[] = [];

export function useSpreadableAreaRecords(): SpreadableAreaRecord[] {
  return useFarmStore().spreadableAreaRecords ?? EMPTY_AREA_RECORDS;
}
const EMPTY_AREA_RECORDS: SpreadableAreaRecord[] = [];

/** Phase 1B.1 — whether the slurry plan on screen is known to be current
 * (see `SlurryPlanFreshness`). */
export function useSlurryPlanFreshness(): SlurryPlanFreshness {
  return useFarmStore().slurryPlanFreshness;
}

export function useSlurryCompositionRecords(): SlurryComposition[] {
  return useFarmStore().slurryCompositionRecords;
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

/** Codex remediation Priority 5 — real database mutation state, for the
 * app shell's sync-status banner. `pendingCount`/`syncedCount` are 0 and
 * `failures` is always `[]` in mock mode (no remote writes to track). */
export function useSyncStatus(): { pendingCount: number; syncedCount: number; failures: SyncFailure[]; dismiss: (id: string) => void } {
  const store = useFarmStore();
  return { pendingCount: store.pendingSyncCount, syncedCount: store.syncedWriteCount, failures: store.syncFailures, dismiss: store.dismissSyncFailure };
}

// ---------------------------------------------------------------------------
// Action hooks
// ---------------------------------------------------------------------------

export function useFarmActions(): FarmActions {
  const {
    updateFarmProfile,
    addField,
    setFieldBoundary,
    updateFieldDetails,
    archiveField,
    restoreField,
    updateFieldIndex,
    addLivestockGroup,
    updateLivestockGroup,
    addHousing,
    updateHousing,
    addSlurryComposition,
    createSlurryAllocation,
    addSoilTest,
    updateFieldCommonageStatus,
    updateFieldWaterBufferContext,
    updateSlurryApplicationMethod,
    updateSlurryApplicationDate,
    editPlannedSlurryAllocation,
    cancelPlannedSlurryAllocation,
    completePlannedSlurryAllocation,
    refreshSlurryPlan,
  } = useFarmStore();
  return {
    editPlannedSlurryAllocation,
    cancelPlannedSlurryAllocation,
    completePlannedSlurryAllocation,
    refreshSlurryPlan,
    updateFarmProfile,
    addField,
    setFieldBoundary,
    updateFieldDetails,
    archiveField,
    restoreField,
    updateFieldIndex,
    addLivestockGroup,
    updateLivestockGroup,
    addHousing,
    updateHousing,
    addSlurryComposition,
    createSlurryAllocation,
    addSoilTest,
    updateFieldCommonageStatus,
    updateFieldWaterBufferContext,
    updateSlurryApplicationMethod,
    updateSlurryApplicationDate,
  };
}
