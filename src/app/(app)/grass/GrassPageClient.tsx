"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Crosshair, MapPin, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { GrowthInsights } from "@/components/grass/GrowthInsights";
import { GrassOverview, type OverviewField } from "@/components/grass/GrassOverview";
import { selectGrowthEvidence, type DemandGroup } from "@/domain/grass-wedge-target";
import { MapHero } from "@/components/farm/MapHero";
import type { MapTone } from "@/components/farm/FieldMap";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { captureReadingLocation, isLiveReading } from "@/lib/location/reading-location";
import { useFarm, useFields } from "@/store/farm-store";
import { createWebLocationTrackingProvider } from "@/lib/location/web-location-tracking-provider";
import type { LocationPosition, LocationTrackingProvider } from "@/lib/location/location-tracking-provider";
import { findNearbyField, suggestFieldFromPosition } from "@/domain/near-field";
import { grassWalkProgress, moveGrassWalkTo, recordGrassWalkReading, skipGrassWalkField, startGrassWalk, type GrassWalk } from "@/lib/grass-walk";
import {
  DEFAULT_GRASS_PRESENTATION_TARGETS,
  GRASS_COVER_METHODS,
  activeGrassGrowthForecast,
  buildFarmGrassSummary,
  buildGrassFieldState,
  buildGrassWedge,
  grassPresentationBand,
  latestGrassGrowthObservation,
  latestGrassObservationByField,
  type GrassCoverMethod,
  type GrassDemandWindow,
  type GrassFieldDemandInput,
  type GrassFieldState,
  type GrassPresentationBand,
  type GrassUnresolvedDemandWindow,
} from "@/domain/grass-management";
import {
  getGrassManagementDataAction,
  recordGrassCoverObservationAction,
  recordGrassGrowthObservationAction,
  type GrassManagementData,
  type GrassOpenGrazingSessionView,
} from "@/app/actions/grass-management";

const HORIZONS = [0, 3, 7] as const;
type Horizon = (typeof HORIZONS)[number];

const METHOD_LABEL: Record<GrassCoverMethod, string> = {
  plate_meter: "Plate meter",
  visual_estimate: "Visual estimate",
  cut_and_weigh: "Cut & weigh",
  manual_kg_dm_ha: "Manual kg DM/ha",
};


function toDateTimeLocal(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(localValue: string): string | null {
  const date = new Date(localValue);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function dateLabel(iso: string | undefined): string {
  if (!iso) return "Not recorded";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

function dateTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function rejectionMessage(code: string): string {
  switch (code) {
    case "INVALID_COVER": return "Enter a valid grass cover in kg DM/ha.";
    case "INVALID_GROWTH_RATE": return "Enter a valid grass growth rate in kg DM/ha/day.";
    case "FIELD_NOT_FOUND": return "That field is no longer available on this farm.";
    case "OBSERVED_AT_IN_FUTURE": return "The observation time is in the future. Check the date and time.";
    case "INVALID_OBSERVED_AT": return "Choose a valid observation date and time.";
    case "INVALID_LOCATION": return "The GPS reading could not be saved safely. Try again or save without GPS.";
    case "NO_FARM": return "No signed-in farm is available.";
    default: return "This grass observation could not be saved. Check the details and try again.";
  }
}

function toneForBand(band: GrassPresentationBand): MapTone {
  switch (band) {
    case "surplus": return "good";
    case "target": return "silage";
    case "above_target": return "info";
    case "below_target": return "attention";
    default: return "neutral";
  }
}

function coverForState(state: GrassFieldState | undefined, horizon: Horizon): { cover?: number; basis?: string; band: GrassPresentationBand } {
  if (!state || state.status === "unknown") return { band: "unknown" };
  if (horizon > 0) {
    if (state.projection?.status !== "available") return { band: "unknown" };
    const cover = state.projection.value.coverKgDmHa;
    return { cover, basis: "projected", band: grassPresentationBand(cover) };
  }
  return { cover: state.current.coverKgDmHa, basis: state.current.basis, band: state.band };
}

function grazingDemandLabel(session: GrassOpenGrazingSessionView): string {
  if (session.demand.status === "resolved") {
    const weightEvidence = session.demand.evidence.find((item) => item.key === "avg_weight_kg");
    const weightLabel = typeof weightEvidence?.value === "number"
      ? ` · ${formatNumber(weightEvidence.value, 0)} kg avg liveweight`
      : "";
    return `${formatNumber(session.demand.dailyDemandKgDm, 0)} kg DM/day${weightLabel}`;
  }
  switch (session.demand.reason) {
    case "MISSING_AVG_WEIGHT":
      return "Demand unresolved · add average liveweight in Cattle";
    case "UNSUPPORTED_CATEGORY":
      return "Demand unresolved · no validated beef intake rule for this category";
    case "INVALID_HEADCOUNT":
      return "Demand unresolved · movement headcount is invalid";
    case "GROUP_NOT_FOUND":
      return "Demand unresolved · linked cattle group is unavailable";
    case "NUTRITION_INPUTS_INCOMPLETE":
      return "Demand unresolved · nutrition inputs are incomplete";
  }
}

export function GrassPageClient({ initialFieldId }: { initialFieldId?: string }) {
  const farm = useFarm();
  const storeFields = useFields();
  const [data, setData] = useState<GrassManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(0);
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>();
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  // The detailed records sit below the overview; a link straight to a field's reading opens them.
  const [recordsOpen, setRecordsOpen] = useState(Boolean(initialFieldId));

  const [recordFieldId, setRecordFieldId] = useState(initialFieldId ?? "");
  // Guided walk: `null` is the normal single-reading workflow. Its controls are
  // locked while a reading saves, so a save can only ever advance the walk and
  // field it was started on.
  const [walk, setWalk] = useState<GrassWalk | null>(null);
  const walkStartedGpsRef = useRef(false);
  const [coverInput, setCoverInput] = useState("");
  const [method, setMethod] = useState<GrassCoverMethod>("plate_meter");
  const [coverObservedAt, setCoverObservedAt] = useState(() => toDateTimeLocal());
  /** Set when the farmer changes the reading's time; an untouched time means "now". */
  const [coverTimeEdited, setCoverTimeEdited] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverMessage, setCoverMessage] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [growthInput, setGrowthInput] = useState("");
  const [growthObservedAt, setGrowthObservedAt] = useState(() => toDateTimeLocal());
  const [growthSaving, setGrowthSaving] = useState(false);
  const [growthMessage, setGrowthMessage] = useState<string | null>(null);
  const [growthError, setGrowthError] = useState<string | null>(null);

  const [tracking, setTracking] = useState<"idle" | "starting" | "tracking" | "unsupported" | "denied" | "error">("idle");
  const [livePosition, setLivePosition] = useState<LocationPosition | null>(null);
  const providerRef = useRef<LocationTrackingProvider | null>(null);
  // Invalidate pending capability/start awaits whenever tracking stops or restarts.
  const gpsGenerationRef = useRef(0);
  const [asOf, setAsOf] = useState(() => new Date().toISOString());

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await getGrassManagementDataAction();
      setData(result);
      setAsOf(new Date().toISOString());
    } catch (error) {
      console.error("[Grass] load failed", error);
      setLoadError("Grass data could not be loaded just now. Your existing farm data has not been changed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getGrassManagementDataAction()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError(null);
        setAsOf(new Date().toISOString());
      })
      .catch((error: unknown) => {
        console.error("[Grass] initial load failed", error);
        if (!cancelled) setLoadError("Grass data could not be loaded just now. Your existing farm data has not been changed.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      gpsGenerationRef.current += 1;
      const provider = providerRef.current;
      providerRef.current = null;
      if (provider) void provider.stopActiveTracking();
    };
  }, []);

  const okData = data?.status === "ok" ? data : undefined;
  // A link's field only counts once it's known to be an active field here.
  const selectedRecordFieldId = okData?.fields.some((field) => field.id === recordFieldId) ? recordFieldId : "";
  const linkedFieldReady = !loading && Boolean(initialFieldId && okData?.fields.some((field) => field.id === initialFieldId));
  useEffect(() => {
    if (linkedFieldReady) document.getElementById("record-grass")?.scrollIntoView?.({ block: "start" });
  }, [linkedFieldReady]);
  const activeFieldIds = useMemo(() => new Set(okData?.fields.map((field) => field.id) ?? []), [okData?.fields]);
  const fields = useMemo(() => storeFields.filter((field) => activeFieldIds.has(field.id)), [storeFields, activeFieldIds]);
  const latestByField = useMemo(
    () => latestGrassObservationByField(okData?.coverObservations ?? [], asOf),
    [okData?.coverObservations, asOf],
  );
  // One growth figure for every grass estimate on this screen (Grass V2): your own recent evidence
  // first, otherwise the Teagasc county figure — never a mix. The others stay visible beside it.
  const growthSelection = useMemo(
    // Finished walks save their measured growth as an observation, so walks are read from there (one source).
    () => selectGrowthEvidence({ walks: [], observations: okData?.growthObservations ?? [], asOf }),
    [okData?.growthObservations, asOf],
  );
  const latestGrowth = useMemo(() => {
    const chosen = growthSelection.chosen;
    if (!chosen) return latestGrassGrowthObservation([], asOf);
    return (okData?.growthObservations ?? []).find((o) => o.id === chosen.observationId);
  }, [growthSelection, okData?.growthObservations, asOf]);

  const demandByField = useMemo(() => {
    const byField = new Map<string, {
      demandWindows: GrassDemandWindow[];
      unresolvedDemandWindows: GrassUnresolvedDemandWindow[];
    }>();
    for (const session of okData?.grazingSessions ?? []) {
      const entry = byField.get(session.fieldId) ?? { demandWindows: [], unresolvedDemandWindows: [] };
      if (session.demand.status === "resolved") {
        entry.demandWindows.push({
          id: session.sessionId,
          dailyDemandKgDm: session.demand.dailyDemandKgDm,
          startedAt: session.startedAt,
          ...(session.endedAt ? { endedAt: session.endedAt } : {}),
          source: session.demand.source,
        });
      } else {
        entry.unresolvedDemandWindows.push({
          id: session.sessionId,
          startedAt: session.startedAt,
          ...(session.endedAt ? { endedAt: session.endedAt } : {}),
        });
      }
      byField.set(session.fieldId, entry);
    }
    return byField as ReadonlyMap<string, GrassFieldDemandInput>;
  }, [okData?.grazingSessions]);

  const currentSummary = useMemo(
    () => buildFarmGrassSummary(
      okData?.fields ?? [],
      okData?.coverObservations ?? [],
      latestGrowth ? [latestGrowth] : [],
      asOf,
      DEFAULT_GRASS_PRESENTATION_TARGETS,
      demandByField,
    ),
    [okData?.fields, okData?.coverObservations, latestGrowth, asOf, demandByField],
  );

  const forecastByHorizon = useMemo(() => {
    const map = new Map<Horizon, ReturnType<typeof activeGrassGrowthForecast>>();
    for (const days of HORIZONS) {
      if (days <= 0) continue;
      const targetAt = new Date(Date.parse(asOf) + days * 86_400_000).toISOString();
      map.set(days, activeGrassGrowthForecast(okData?.growthForecasts ?? [], asOf, targetAt));
    }
    return map;
  }, [okData?.growthForecasts, asOf]);
  const activeForecast = horizon > 0 ? forecastByHorizon.get(horizon) : undefined;
  const regionalForecast = forecastByHorizon.get(7) ?? forecastByHorizon.get(3);

  const states = useMemo(() => {
    return (okData?.fields ?? []).map((field) => {
      const demand = demandByField.get(field.id);
      return buildGrassFieldState({
        fieldId: field.id,
        areaHa: field.areaHa,
        observation: latestByField.get(field.id),
        growth: latestGrowth,
        forecastGrowth: activeForecast,
        asOf,
        ...(horizon > 0 ? { horizonDays: horizon } : {}),
        ...(demand ? {
          demandWindows: demand.demandWindows,
          unresolvedDemandWindows: demand.unresolvedDemandWindows,
        } : {}),
      });
    });
  }, [okData?.fields, latestByField, latestGrowth, activeForecast, asOf, horizon, demandByField]);

  const stateByField = useMemo(() => new Map(states.map((state) => [state.fieldId, state])), [states]);
  const wedge = useMemo(() => buildGrassWedge(states), [states]);
  const fieldNameById = useMemo(() => new Map((okData?.fields ?? []).map((field) => [field.id, field.name])), [okData?.fields]);
  const currentGrazingSessions = okData?.openGrazingSessions ?? [];
  const currentResolvedDemandKgDmDay = currentGrazingSessions.reduce(
    (sum, session) => sum + (session.demand.status === "resolved" ? session.demand.dailyDemandKgDm : 0),
    0,
  );
  const currentUnresolvedDemandCount = currentGrazingSessions.filter((session) => session.demand.status === "unresolved").length;

  const gpsSuggestedField = useMemo(() => {
    if (!livePosition) return null;
    return findNearbyField(fields, {
      latitude: livePosition.lat,
      longitude: livePosition.lng,
      accuracyMeters: livePosition.accuracyMeters,
    });
  }, [fields, livePosition]);

  // The walk only trusts a live fix, and one the accuracy can separate from
  // its neighbours. It suggests a field; the farmer still confirms by saving.
  const walkGpsSuggestion = useMemo(() => {
    if (!walk || tracking !== "tracking" || !livePosition) return null;
    return suggestFieldFromPosition(fields, { latitude: livePosition.lat, longitude: livePosition.lng, accuracyMeters: livePosition.accuracyMeters });
  }, [walk, tracking, livePosition, fields]);
  const walkGpsFieldId = walkGpsSuggestion?.status === "suggested" ? walkGpsSuggestion.field.id : null;
  const walkProgress = walk ? grassWalkProgress(walk) : null;
  const walkOfferedFieldId = walk && walkGpsFieldId && walkGpsFieldId !== walk.currentFieldId && walkProgress?.remainingFieldIds.includes(walkGpsFieldId) ? walkGpsFieldId : null;

  const historyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const observation of okData?.coverObservations ?? []) counts.set(observation.fieldId, (counts.get(observation.fieldId) ?? 0) + 1);
    return counts;
  }, [okData?.coverObservations]);

  // Grass V2 overview inputs: each field's cover for the chosen horizon, freshness and cattle.
  const overviewFields: OverviewField[] = useMemo(() => (okData?.fields ?? []).map((field) => {
    const state = stateByField.get(field.id);
    const shown = coverForState(state, horizon);
    const occupants = (okData?.openGrazingSessions ?? [])
      .filter((session) => session.fieldId === field.id)
      .map((session) => `${session.groupLabel} (${formatNumber(session.headCountSnapshot, 0)})`);
    return {
      fieldId: field.id,
      name: field.name,
      areaHa: field.areaHa,
      ...(field.plannedUse ? { use: field.plannedUse } : {}),
      ...(shown.cover !== undefined ? { coverKgDmHa: shown.cover } : {}),
      ...(shown.basis ? { basis: shown.basis } : {}),
      ...(state && state.status !== "unknown" ? { ageDays: state.measured.ageDays, method: METHOD_LABEL[state.measured.method] } : {}),
      occupants,
      historyCount: historyCounts.get(field.id) ?? 0,
    };
  }), [okData?.fields, okData?.openGrazingSessions, stateByField, horizon, historyCounts]);
  // The cattle grazing these fields now, with demand from the Cattle records (never re-derived here).
  const demandGroups: DemandGroup[] = useMemo(() => (okData?.openGrazingSessions ?? [])
    .filter((session) => activeFieldIds.has(session.fieldId))
    .map((session) => ({
      groupId: session.livestockGroupId,
      label: session.groupLabel,
      headCount: session.headCountSnapshot,
      fieldId: session.fieldId,
      ...(session.demand.status === "resolved"
        ? { dailyDemandKgDm: session.demand.dailyDemandKgDm, kgDmPerHeadDay: session.demand.kgDmPerHeadDay, ruleSource: session.demand.source }
        : {
            missingReason: session.demand.reason === "MISSING_AVG_WEIGHT"
              ? "we need their average liveweight before working out their grass demand"
              : session.demand.reason === "UNSUPPORTED_CATEGORY"
                ? "there's no validated grazing intake rule for this kind of animal yet"
                : "their grass demand can't be worked out from the records yet",
          }),
    })), [okData?.openGrazingSessions, activeFieldIds]);

  async function startGps() {
    setCoverError(null);
    const generation = ++gpsGenerationRef.current;
    const previous = providerRef.current;
    providerRef.current = null;
    if (previous) await previous.stopActiveTracking();
    if (generation !== gpsGenerationRef.current) return;
    const provider = createWebLocationTrackingProvider();
    providerRef.current = provider;
    setTracking("starting");
    try {
      const capability = await provider.getCapability();
      if (generation !== gpsGenerationRef.current) {
        await provider.stopActiveTracking();
        return;
      }
      if (!capability.activeTrackingSupported) {
        setTracking(capability.permissionState === "denied" ? "denied" : "unsupported");
        return;
      }
      await provider.startActiveTracking(
        (position) => {
          if (generation !== gpsGenerationRef.current) return;
          setLivePosition(position);
          setTracking("tracking");
        },
        () => { if (generation === gpsGenerationRef.current) setTracking("error"); },
      );
      // stopGps may have run while the adapter was awaiting its start.
      if (generation !== gpsGenerationRef.current) await provider.stopActiveTracking();
    } catch {
      if (generation === gpsGenerationRef.current) setTracking("error");
    } finally {
      if (generation !== gpsGenerationRef.current && providerRef.current === provider) {
        providerRef.current = null;
      }
    }
  }

  async function stopGps() {
    ++gpsGenerationRef.current;
    const provider = providerRef.current;
    providerRef.current = null;
    if (provider) await provider.stopActiveTracking();
    setTracking("idle");
    setLivePosition(null);
  }

  function startWalk() {
    setCoverError(null);
    setCoverMessage(null);
    setWalk(startGrassWalk(okData?.fields.map((field) => field.id) ?? []));
    if (tracking !== "tracking" && tracking !== "starting") {
      walkStartedGpsRef.current = true;
      void startGps();
    }
  }

  function finishWalk() {
    if (walkProgress) setCoverMessage(`Walk finished: ${walkProgress.measured} of ${walkProgress.total} ${walkProgress.total === 1 ? "field" : "fields"} measured.`);
    setCoverError(null);
    setWalk(null);
    if (walkStartedGpsRef.current) void stopGps();
    walkStartedGpsRef.current = false;
  }

  async function saveCover() {
    setCoverError(null);
    setCoverMessage(null);
    // An untouched time means "now" (resolved at Save), so the time and the location match.
    const observedAt = coverTimeEdited ? toIso(coverObservedAt) : new Date().toISOString();
    const cover = Number(coverInput);
    const fieldId = walk ? walk.currentFieldId : selectedRecordFieldId;
    if (!fieldId) { setCoverError("Choose the field this reading belongs to."); return; }
    if (!observedAt) { setCoverError("Choose a valid observation date and time."); return; }
    if (!Number.isFinite(cover) || cover <= 0) { setCoverError("Enter the grass cover in kg DM/ha."); return; }
    setCoverSaving(true);
    try {
      // A reading taken now is pinned where the farmer is standing; one the farmer back-dated gets no location.
      const live = livePosition ? { lat: livePosition.lat, lng: livePosition.lng, accuracyM: livePosition.accuracyMeters ?? null, at: Date.parse(livePosition.recordedAt) } : null;
      const fix = isLiveReading(Date.parse(observedAt), Date.now()) ? await captureReadingLocation(live).catch(() => null) : null;
      const result = await recordGrassCoverObservationAction({
        id: globalThis.crypto.randomUUID(),
        fieldId,
        coverKgDmHa: cover,
        method,
        observedAt,
        ...(fix ? { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM } : {}),
      });
      if (result.status === "rejected") {
        setCoverError(rejectionMessage(result.reasonCode));
        return;
      }
      setCoverMessage(`Recorded ${formatNumber(result.observation.coverKgDmHa, 0)} kg DM/ha for ${fieldNameById.get(result.observation.fieldId) ?? "field"}.`);
      setCoverInput("");
      setCoverObservedAt(toDateTimeLocal());
      setCoverTimeEdited(false);
      setWalk((current) => (current ? recordGrassWalkReading(current, fieldId, walkGpsFieldId) : current));
      await reload();
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "The reading could not be saved.");
    } finally {
      setCoverSaving(false);
    }
  }

  async function saveGrowth() {
    setGrowthError(null);
    setGrowthMessage(null);
    const observedAt = toIso(growthObservedAt);
    const growth = Number(growthInput);
    if (!observedAt) { setGrowthError("Choose a valid observation date and time."); return; }
    if (!Number.isFinite(growth) || growth <= 0) { setGrowthError("Enter a growth rate in kg DM/ha/day."); return; }
    setGrowthSaving(true);
    try {
      const result = await recordGrassGrowthObservationAction({
        id: globalThis.crypto.randomUUID(),
        growthRateKgDmHaDay: growth,
        origin: "farmer_entered",
        observedAt,
      });
      if (result.status === "rejected") {
        setGrowthError(rejectionMessage(result.reasonCode));
        return;
      }
      setGrowthMessage(`Growth rate recorded: ${formatNumber(result.observation.growthRateKgDmHaDay, 0)} kg DM/ha/day.`);
      setGrowthInput("");
      setGrowthObservedAt(toDateTimeLocal());
      await reload();
    } catch (error) {
      setGrowthError(error instanceof Error ? error.message : "The growth rate could not be saved.");
    } finally {
      setGrowthSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Grass" subtitle="Live grass picture, field measurements and planning forecasts." />
        <h1 className="mb-4 font-display text-[34px] text-fr-v2-graphite lg:hidden">Grass</h1>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-fr-v2-muted">Loading grass picture…</p>
      </>
    );
  }

  if (loadError || data?.status === "no_farm" || !okData) {
    return (
      <>
        <PageHeader title="Grass" subtitle="Live grass picture, field measurements and planning forecasts." />
        <h1 className="mb-4 font-display text-[34px] text-fr-v2-graphite lg:hidden">Grass</h1>
        <div className="border-l-[3px] border-fr-v2-harvest bg-fr-v2-cream px-5 py-4 text-sm text-fr-v2-charcoal">
          <p>{loadError ?? "Add a farm before recording grass."}</p>
          {loadError ? (
            <button
              type="button"
              onClick={() => { setLoading(true); void reload(); }}
              className="mt-3 min-h-9 rounded-fr-v2-control border border-fr-v2-forest px-3 text-xs font-semibold text-fr-v2-forest"
            >
              Try again
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div className="pb-12">
      <PageHeader title="Grass" subtitle="Measure the farm, see the wedge and keep forecasts grounded in real field walks." />
      <div className="mb-6 lg:hidden">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Farm Return · Grass</p>
        <h1 className="mt-1 font-display text-[36px] leading-none text-fr-v2-graphite">Grass</h1>
      </div>

      <GrassOverview
        asOf={asOf}
        fields={overviewFields}
        groups={demandGroups}
        growth={growthSelection}
        averageCoverKgDmHa={currentSummary.averageCoverKgDmHa}
        averageBasis={currentSummary.averageCoverBasis}
        latestWalkAt={currentSummary.latestWalkAt}
        horizon={horizon}
        horizons={HORIZONS}
        horizonAvailable={(days) => days === 0 || Boolean(latestGrowth) || Boolean(forecastByHorizon.get(days as Horizon))}
        onHorizon={(days) => setHorizon(days as Horizon)}
        horizonNote={(
          <>
            {!latestGrowth && !forecastByHorizon.get(3) && !forecastByHorizon.get(7) ? (
              <p className="mt-2 text-xs text-fr-v2-muted">Record a farm growth rate below to unlock projections. Farm Return will not assume zero growth, and no valid trusted regional forecast is available for this farm yet.</p>
            ) : activeForecast ? (
              <p className="mt-2 text-xs text-fr-v2-muted">Projection source: <span className="font-semibold text-fr-v2-charcoal">{activeForecast.modelName ?? "Teagasc MoSt regional forecast"}</span>{activeForecast.regionLabel ? ` · ${activeForecast.regionLabel}` : ""} · valid to {dateLabel(activeForecast.validTo)}.</p>
            ) : horizon > 0 && latestGrowth ? (
              <p className="mt-2 text-xs text-fr-v2-muted">Projection source: current farm growth assumption. No valid trusted regional forecast covers this full horizon.</p>
            ) : null}
          </>
        )}
        selectedFieldId={selectedFieldId}
        onSelectField={setSelectedFieldId}
        map={(
            <>
              <MapHero
                fields={fields}
                getTone={(field) => toneForBand(coverForState(stateByField.get(field.id), horizon).band)}
                getStatusLabel={(field) => {
                  const c = coverForState(stateByField.get(field.id), horizon).cover;
                  return c === undefined ? "No cover" : `${formatNumber(c, 0)} kg DM/ha`;
                }}
                selectedFieldId={selectedFieldId}
                onSelectField={(id) => setSelectedFieldId((current) => current === id ? undefined : id)}
                onMapBackgroundClick={() => setSelectedFieldId(undefined)}
                center={farm.location.centroid}
                plain
                flyToSelection={Boolean(selectedFieldId)}
                flyToMaxZoom={18}
                compactNeighbourLabels
                neighbourNameLabels
                neighbourDetailLabels
                markerContentKey={`grass-${horizon}-${okData.coverObservations.length}-${okData.growthObservations.length}`}
                fitPadding={42}
                className="h-[430px] min-h-[360px] lg:h-[520px]"
              />
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fr-v2-muted" aria-label="Map colours">
                <li><span aria-hidden className="mr-1 inline-block size-2.5 rounded-sm bg-fr-good" />{formatNumber(DEFAULT_GRASS_PRESENTATION_TARGETS.surplusFromKgDmHa, 0)}+ kg DM/ha</li>
                <li><span aria-hidden className="mr-1 inline-block size-2.5 rounded-sm bg-fr-info" />{formatNumber(DEFAULT_GRASS_PRESENTATION_TARGETS.targetMaxKgDmHa, 0)}–{formatNumber(DEFAULT_GRASS_PRESENTATION_TARGETS.surplusFromKgDmHa, 0)}</li>
                <li><span aria-hidden className="mr-1 inline-block size-2.5 rounded-sm bg-fr-map-silage" />{formatNumber(DEFAULT_GRASS_PRESENTATION_TARGETS.targetMinKgDmHa, 0)}–{formatNumber(DEFAULT_GRASS_PRESENTATION_TARGETS.targetMaxKgDmHa, 0)}</li>
                <li><span aria-hidden className="mr-1 inline-block size-2.5 rounded-sm bg-fr-attention" />Below {formatNumber(DEFAULT_GRASS_PRESENTATION_TARGETS.targetMinKgDmHa, 0)}</li>
                <li><span aria-hidden className="mr-1 inline-block size-2.5 rounded-sm bg-fr-ink-400" />No cover</li>
                <li className="basis-full">Colour bands are a display guide only, not a grazing target. Your target is the red line on the wedge.</li>
              </ul>
            </>
        )}
      />

      <details className="mt-8 border-t border-fr-v2-cream-rule pt-4" open={recordsOpen} onToggle={(event) => setRecordsOpen((event.currentTarget as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm font-semibold text-fr-v2-forest">Growth, cattle and records</summary>
        <div className="mt-4">
          <GrowthInsights forecasts={okData.growthForecasts} />
          <div className="flex flex-col gap-1 text-xs text-fr-v2-muted sm:flex-row sm:items-center sm:justify-between">
              <p>
            {currentGrazingSessions.length === 0 ? (
              <><span className="font-semibold text-fr-v2-charcoal">Animal demand: No cattle currently recorded in fields.</span> Record a cattle movement and Grass will update automatically.</>
            ) : currentUnresolvedDemandCount === 0 ? (
              <><span className="font-semibold text-fr-v2-charcoal">Animal demand: {formatNumber(currentResolvedDemandKgDmDay, 0)} kg DM/day.</span> Automatically linked from Cattle movements and recorded liveweight using the Teagasc beef-grazing 2% liveweight rule.</>
            ) : currentResolvedDemandKgDmDay > 0 ? (
              <><span className="font-semibold text-fr-v2-charcoal">Animal demand: at least {formatNumber(currentResolvedDemandKgDmDay, 0)} kg DM/day.</span> {currentUnresolvedDemandCount} current {currentUnresolvedDemandCount === 1 ? "group is" : "groups are"} unresolved because a usable liveweight or supported beef intake rule is missing. <Link href="/cattle/manage" className="font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2">Check Cattle →</Link></>
            ) : (
              <><span className="font-semibold text-fr-v2-charcoal">Animal demand: Unresolved.</span> Current cattle movements are linked, but demand cannot be quantified safely until liveweight and a supported intake rule are available. <Link href="/cattle/manage" className="font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2">Check Cattle →</Link></>
            )}
          </p>
            <button type="button" onClick={() => setConfidenceOpen((open) => !open)} className="inline-flex shrink-0 items-center gap-1 font-semibold text-fr-v2-forest">
              Data confidence {confidenceOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>
          {confidenceOpen ? (
            <div className="mt-3 grid gap-2 border-t border-fr-v2-cream-rule pt-3 text-xs sm:grid-cols-5">
              {(["HIGH", "MEDIUM", "LOW", "STALE", "UNKNOWN"] as const).map((level) => (
                <div key={level} className="flex items-baseline justify-between gap-2 sm:block">
                  <span className="font-mono uppercase tracking-[0.1em] text-fr-v2-muted">{level}</span>
                  <span className="ml-2 font-semibold text-fr-v2-charcoal">{currentSummary.counts[level]} fields</span>
                </div>
              ))}
              <p className="sm:col-span-5 text-fr-v2-muted">These labels describe measurement freshness and model exposure, not scientific certainty. A new field walk resets the field to direct ground truth.</p>
            </div>
          ) : null}
      <section className="mt-8 border-t border-fr-v2-cream-rule pt-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Rotation</p>
        <h2 className="mt-1 font-display text-[28px] leading-none text-fr-v2-graphite">Where cattle are now</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-fr-v2-muted">This uses the same recorded cattle movements as the Cattle section. Quantified beef demand is applied automatically to the grass estimate; Farm Return is not turning cover order into a grazing prescription.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {okData.openGrazingSessions.map((session) => <GrazingRow key={session.sessionId} session={session} />)}
          {okData.openGrazingSessions.length === 0 ? <p className="text-sm text-fr-v2-muted">No open grazing field movements are recorded.</p> : null}
        </div>
        {wedge.some((entry) => entry.coverKgDmHa !== undefined) ? (
          <div className="mt-5 border-l-[3px] border-fr-v2-teal bg-fr-v2-cream px-4 py-3">
            <p className="text-xs font-semibold text-fr-v2-charcoal">Cover order — information only, not a grazing recommendation</p>
            <p className="mt-1 text-xs text-fr-v2-muted">{wedge.filter((entry) => entry.coverKgDmHa !== undefined).slice(0, 5).map((entry) => fieldNameById.get(entry.fieldId) ?? "Field").join(" → ")}</p>
          </div>
        ) : null}
      </section>

      <section id="record-grass" className="mt-9 scroll-mt-4 border-t border-fr-v2-cream-rule pt-7">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Field walk</p>
            <h2 className="mt-1 font-display text-[30px] leading-none text-fr-v2-graphite">Record grass</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-fr-v2-muted">A field reading becomes the new ground truth. Farm Return keeps the method, time and GPS evidence separately; it does not average different methods behind your back.</p>

            {walk && walkProgress ? (
              <div className="mt-5 border-l-[3px] border-fr-v2-teal bg-fr-v2-cream px-4 py-4" data-grass-walk aria-label="Guided grass walk">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fr-v2-muted">Guided walk</p>
                  <p className="font-mono text-xs tabular-nums text-fr-v2-charcoal" data-grass-walk-progress aria-live="polite">{walkProgress.measured} of {walkProgress.total} measured · {walkProgress.remaining} remaining</p>
                </div>
                {walkProgress.complete ? (
                  <p className="mt-2 font-display text-[24px] leading-tight text-fr-v2-graphite">Every field measured</p>
                ) : walk.currentFieldId ? (
                  <>
                    <p className="mt-2 text-xs text-fr-v2-muted">Now measuring</p>
                    <p className="font-display text-[24px] leading-tight text-fr-v2-graphite" data-grass-walk-current>{fieldNameById.get(walk.currentFieldId) ?? "Field"}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-fr-v2-charcoal">All remaining fields are skipped. Choose one below or finish the walk.</p>
                )}
                {walkOfferedFieldId ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-fr-v2-cream-rule pt-3">
                    <p className="inline-flex items-center gap-2 text-sm text-fr-v2-charcoal"><MapPin className="size-4 text-fr-v2-teal" /> GPS suggests <strong>{fieldNameById.get(walkOfferedFieldId) ?? "Field"}</strong></p>
                    <button type="button" disabled={coverSaving} onClick={() => setWalk(moveGrassWalkTo(walk, walkOfferedFieldId))} className="min-h-10 text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2 disabled:opacity-50">Measure this field</button>
                  </div>
                ) : null}
                {walkGpsSuggestion?.status === "ambiguous" ? <p className="mt-3 border-t border-fr-v2-cream-rule pt-3 text-xs text-fr-v2-muted">GPS can&apos;t separate {walkGpsSuggestion.candidates.map((candidate) => candidate.name).join(" and ")}. Check the field name before saving.</p> : null}
                {walkProgress.remainingFieldIds.some((id) => id !== walk.currentFieldId) ? (
                  <div className="mt-3 border-t border-fr-v2-cream-rule pt-3">
                    <p className="text-xs text-fr-v2-muted">Still to measure</p>
                    <div className="mt-1 flex flex-wrap gap-x-4">
                      {walkProgress.remainingFieldIds.filter((id) => id !== walk.currentFieldId).map((id) => (
                        <button key={id} type="button" disabled={coverSaving} onClick={() => setWalk(moveGrassWalkTo(walk, id))} className="min-h-10 text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2 disabled:opacity-50">
                          {fieldNameById.get(id) ?? "Field"}{walk.skippedIds.includes(id) ? " (skipped)" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-5 border-t border-fr-v2-cream-rule pt-2">
                  {walk.currentFieldId ? <button type="button" disabled={coverSaving} onClick={() => setWalk(skipGrassWalkField(walk, walkGpsFieldId))} className="min-h-10 text-xs font-semibold text-fr-v2-muted underline underline-offset-2 disabled:opacity-50">Skip this field</button> : null}
                  <button type="button" disabled={coverSaving} onClick={finishWalk} className="min-h-10 text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2 disabled:opacity-50">Finish walk</button>
                </div>
              </div>
            ) : okData.fields.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-fr-v2-cream-rule py-3">
                <p className="max-w-sm text-xs text-fr-v2-muted">Walking several fields? Go field to field without choosing each one from the list.</p>
                <button type="button" disabled={coverSaving} onClick={startWalk} className="min-h-11 rounded-fr-v2-control border border-fr-v2-forest px-4 text-sm font-semibold text-fr-v2-forest disabled:opacity-50">Start guided walk</button>
              </div>
            ) : null}

            <div className="mt-5 rounded-[18px] border border-fr-v2-cream-rule bg-fr-v2-cream p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fr-v2-charcoal">GPS field assistance</p>
                  <p className="mt-1 text-xs text-fr-v2-muted">GPS can suggest the mapped field. You still confirm it before saving.</p>
                </div>
                <button type="button" onClick={() => tracking === "tracking" ? void stopGps() : void startGps()} className="inline-flex min-h-10 items-center gap-2 rounded-fr-v2-control bg-fr-v2-shell px-3 text-xs font-semibold text-white">
                  <Crosshair className="size-4" /> {tracking === "tracking" ? "Stop GPS" : tracking === "starting" ? "Starting…" : "Use live GPS"}
                </button>
              </div>
              <div className="mt-3 text-xs text-fr-v2-muted">
                {tracking === "tracking" && livePosition ? <p>Live fix · accuracy {livePosition.accuracyMeters === undefined ? "not reported" : `${formatNumber(livePosition.accuracyMeters, 0)} m`}</p> : null}
                {tracking === "denied" ? <p>GPS permission was denied. Choose the field manually.</p> : null}
                {tracking === "unsupported" ? <p>Live GPS is not available on this device/browser. Choose the field manually.</p> : null}
                {tracking === "error" ? <p>GPS tracking was interrupted. Choose the field manually or try again.</p> : null}
              </div>
              {walk ? null : gpsSuggestedField ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-fr-v2-cream-rule pt-3">
                  <p className="inline-flex items-center gap-2 text-sm text-fr-v2-charcoal"><MapPin className="size-4 text-fr-v2-teal" /> GPS suggests <strong>{gpsSuggestedField.name}</strong></p>
                  <button type="button" onClick={() => setRecordFieldId(gpsSuggestedField.id)} className="text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2">Use suggested field</button>
                </div>
              ) : tracking === "tracking" ? <p className="mt-3 border-t border-fr-v2-cream-rule pt-3 text-xs text-fr-v2-muted">No mapped field can be suggested confidently from this GPS fix. Choose the field manually.</p> : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {walk ? null : (
                <label className="text-xs font-semibold text-fr-v2-charcoal sm:col-span-2">Field
                  <select value={selectedRecordFieldId} onChange={(event) => setRecordFieldId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 text-sm font-normal">
                    <option value="">Choose field</option>
                    {okData.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-xs font-semibold text-fr-v2-charcoal">Cover (kg DM/ha)
                <input type="number" min="1" max="10000" inputMode="decimal" value={coverInput} onChange={(event) => setCoverInput(event.target.value)} placeholder="e.g. 1450" className="mt-1 block min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 font-mono text-sm font-normal" />
              </label>
              <label className="text-xs font-semibold text-fr-v2-charcoal">Method
                <select value={method} onChange={(event) => setMethod(event.target.value as GrassCoverMethod)} className="mt-1 block min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 text-sm font-normal">
                  {GRASS_COVER_METHODS.map((item) => <option key={item} value={item}>{METHOD_LABEL[item]}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-fr-v2-charcoal sm:col-span-2">Observed at
                <input type="datetime-local" value={coverObservedAt} onChange={(event) => { setCoverObservedAt(event.target.value); setCoverTimeEdited(true); }} className="mt-1 block min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 font-mono text-sm font-normal" />
              </label>
            </div>
            {coverError ? <p className="mt-3 text-xs font-semibold text-fr-red-700">{coverError}</p> : null}
            {coverMessage ? <p className="mt-3 text-xs font-semibold text-fr-v2-forest">{coverMessage}</p> : null}
            <button type="button" disabled={coverSaving || (walk !== null && !walk.currentFieldId)} onClick={() => void saveCover()} className="mt-4 min-h-11 rounded-fr-v2-control bg-fr-v2-forest px-5 text-sm font-semibold text-white disabled:opacity-50">{coverSaving ? "Saving…" : walk?.currentFieldId ? `Save reading for ${fieldNameById.get(walk.currentFieldId) ?? "field"}` : "Record grass reading"}</button>
          </div>

          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Forecast input</p>
            <h2 className="mt-1 font-display text-[30px] leading-none text-fr-v2-graphite">Growth rate</h2>
            <p className="mt-3 text-sm leading-6 text-fr-v2-muted">Farm Return keeps current growth evidence separate from future growth forecasts. A farmer-entered rate can bring a recent grass walk forward to today; a trusted regional forecast is used only for the future period it actually covers.</p>
            <div className="mt-5 rounded-[18px] border border-fr-v2-cream-rule bg-fr-v2-cream p-5">
              <label className="text-xs font-semibold text-fr-v2-charcoal">Growth (kg DM/ha/day)
                <input type="number" min="0.1" max="500" step="0.1" inputMode="decimal" value={growthInput} onChange={(event) => setGrowthInput(event.target.value)} placeholder="e.g. 45" className="mt-1 block min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 font-mono text-sm font-normal" />
              </label>
              <label className="mt-4 block text-xs font-semibold text-fr-v2-charcoal">Observed at
                <input type="datetime-local" value={growthObservedAt} onChange={(event) => setGrowthObservedAt(event.target.value)} className="mt-1 block min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 font-mono text-sm font-normal" />
              </label>
              {growthError ? <p className="mt-3 text-xs font-semibold text-fr-red-700">{growthError}</p> : null}
              {growthMessage ? <p className="mt-3 text-xs font-semibold text-fr-v2-forest">{growthMessage}</p> : null}
              <button type="button" disabled={growthSaving} onClick={() => void saveGrowth()} className="mt-4 min-h-11 rounded-fr-v2-control border border-fr-v2-forest px-4 text-sm font-semibold text-fr-v2-forest disabled:opacity-50">{growthSaving ? "Saving…" : "Record growth rate"}</button>
              {latestGrowth ? <p className="mt-4 border-t border-fr-v2-cream-rule pt-3 text-xs text-fr-v2-muted">Current growth evidence: <span className="font-mono font-semibold text-fr-v2-charcoal">{formatNumber(latestGrowth.growthRateKgDmHaDay, 1)}</span> kg DM/ha/day · {latestGrowth.source} · {dateTimeLabel(latestGrowth.observedAt)}</p> : null}
              {regionalForecast ? (
                <div className="mt-3 border-l-[3px] border-fr-v2-teal bg-white px-3 py-3 text-xs text-fr-v2-muted">
                  <p className="font-semibold text-fr-v2-charcoal">{regionalForecast.modelName ?? "Regional grass growth forecast"} · {formatNumber(regionalForecast.growthRateKgDmHaDay, 1)} kg DM/ha/day</p>
                  <p className="mt-1">{regionalForecast.regionLabel ?? farm.location.county} · valid {dateLabel(regionalForecast.validFrom)} to {dateLabel(regionalForecast.validTo)} · {regionalForecast.source}</p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-fr-v2-muted">Trusted regional forecast: not connected for this farm yet. Farm Return will not scrape forecast images or invent a weather-to-growth figure.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-9 border-t border-fr-v2-cream-rule pt-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Ground truth</p>
            <h2 className="mt-1 font-display text-[28px] leading-none text-fr-v2-graphite">Latest field readings</h2>
          </div>
          <button type="button" onClick={() => void reload()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-fr-v2-forest"><RefreshCw className="size-3.5" /> Refresh</button>
        </div>
        <div className="mt-4 divide-y divide-fr-v2-cream-rule border-y border-fr-v2-cream-rule">
          {okData.fields.map((field) => {
            const observation = latestByField.get(field.id);
            return (
              <div key={field.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5">
                <div><p className="text-sm font-semibold text-fr-v2-charcoal">{field.name}</p><p className="text-xs text-fr-v2-muted">{historyCounts.get(field.id) ?? 0} {(historyCounts.get(field.id) ?? 0) === 1 ? "reading" : "readings"}</p></div>
                <p className="font-mono text-sm tabular-nums text-fr-v2-charcoal">{observation ? `${formatNumber(observation.coverKgDmHa, 0)} kg DM/ha` : "—"}</p>
                <p className="text-xs text-fr-v2-muted sm:text-right">{observation ? `${METHOD_LABEL[observation.method]} · ${dateLabel(observation.observedAt)}` : "No measurement"}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-fr-v2-muted">V1 uses the latest valid reading for each field as its ground truth. Multiple readings with different methods are retained individually and are not silently averaged.</p>
      </section>
        </div>
      </details>
    </div>
  );
}

function GrazingRow({ session }: { session: GrassOpenGrazingSessionView }) {
  return (
    <div className="flex items-start justify-between gap-4 border-l-[3px] border-fr-v2-teal bg-fr-v2-cream px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-fr-v2-charcoal">{session.groupLabel}</p>
        <p className="mt-1 text-xs text-fr-v2-muted">{formatNumber(session.headCountSnapshot, 0)} head · {session.category.replaceAll("_", " ")}</p>
        <p className="mt-1 text-xs text-fr-v2-charcoal">{grazingDemandLabel(session)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-fr-v2-charcoal">{session.fieldName}</p>
        <p className="mt-1 text-xs text-fr-v2-muted">Since {dateLabel(session.startedAt)}</p>
      </div>
    </div>
  );
}
