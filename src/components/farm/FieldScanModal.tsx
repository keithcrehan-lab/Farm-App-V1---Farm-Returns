"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowLeft, Check, LocateFixed, ScanLine, Search, TriangleAlert, X } from "lucide-react";
import { scanCurrentFarmFieldsAction } from "@/app/actions/field-scan";
import { lookupExactEircodeStep } from "@/app/actions/onboarding";
import {
  fieldScanBounds,
  fieldScanCentre,
  type FieldScanCandidate,
  type FieldScanExistingField,
  type FieldScanOutcome,
  type NamedFieldScanSelection,
} from "@/domain/field-scan";
import { formatHa } from "@/lib/format";
import { MAPBOX_PLAIN_SATELLITE_STYLE, MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";
import { normaliseEircode } from "@/lib/onboarding-geocoding";

const SOURCE = "field-scan-candidates";
const FILL = "field-scan-candidates-fill";
const LINE = "field-scan-candidates-line";
const EXISTING_SOURCE = "field-scan-existing";
const EXISTING_FILL = "field-scan-existing-fill";
const EXISTING_LINE = "field-scan-existing-line";

function featureCollection(
  candidates: readonly FieldScanCandidate[],
  selected: ReadonlySet<string>,
  activeId?: string | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: candidates.map((candidate) => ({
      type: "Feature",
      id: candidate.id,
      properties: {
        candidateId: candidate.id,
        selected: selected.has(candidate.id) ? 1 : 0,
        active: candidate.id === activeId ? 1 : 0,
      },
      geometry: candidate.polygon,
    })),
  };
}

function existingFeatureCollection(fields: readonly FieldScanExistingField[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fields.map((field) => ({
      type: "Feature",
      id: field.id,
      properties: { fieldName: field.name },
      geometry: field.polygon,
    })),
  };
}

export function FieldScanModal({
  farmName,
  centre,
  existingFields = [],
  onAddSelected,
  onDrawInstead,
  onClose,
}: {
  farmName: string;
  centre: [number, number];
  existingFields?: FieldScanExistingField[];
  onAddSelected: (selections: NamedFieldScanSelection[]) => Promise<void>;
  onDrawInstead: (centre: [number, number]) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const candidatesRef = useRef<FieldScanCandidate[]>([]);
  const selectedRef = useRef<Set<string>>(new Set());
  const activeNamingRef = useRef<string | null>(null);
  const stageRef = useRef<"select" | "name">("select");
  const existingRef = useRef<FieldScanExistingField[]>(existingFields);

  const existingPolygons = useMemo(() => existingFields.map((field) => field.polygon), [existingFields]);
  const initialCentre = useMemo(() => fieldScanCentre(existingPolygons, centre), [existingPolygons, centre]);
  const initialBounds = useMemo(() => fieldScanBounds(existingPolygons), [existingPolygons]);

  const [outcome, setOutcome] = useState<FieldScanOutcome | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<"select" | "name">("select");
  const [fieldNames, setFieldNames] = useState<Record<string, string>>({});
  const [activeNamingId, setActiveNamingId] = useState<string | null>(null);
  const [currentCentre, setCurrentCentre] = useState<[number, number]>(initialCentre);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanRequestRef = useRef(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const candidates = useMemo(() => (outcome?.status === "READY" ? outcome.candidates : []), [outcome]);
  const selectedCandidates = useMemo(() => candidates.filter((candidate) => selectedIds.has(candidate.id)), [candidates, selectedIds]);
  const selectedAreaHa = selectedCandidates.reduce((sum, candidate) => sum + candidate.areaHa, 0);
  const namedCount = selectedCandidates.filter((candidate) => (fieldNames[candidate.id] ?? "").trim().length > 0).length;
  const existingNameKeys = useMemo(
    () => new Set(existingFields.map((field) => field.name.trim().toLocaleLowerCase())),
    [existingFields],
  );
  const namingIssue = useMemo(() => {
    if (stage !== "name") return null;
    const seen = new Set<string>();
    for (const candidate of selectedCandidates) {
      const name = (fieldNames[candidate.id] ?? "").trim();
      if (!name) continue;
      if (name.length > 80) return "Keep field names under 80 characters.";
      const key = name.toLocaleLowerCase();
      if (existingNameKeys.has(key)) return `“${name}” is already used by another field.`;
      if (seen.has(key)) return `“${name}” is entered more than once.`;
      seen.add(key);
    }
    return null;
  }, [existingNameKeys, fieldNames, selectedCandidates, stage]);

  const scanAt = useCallback(async (target: [number, number]) => {
    const request = ++scanRequestRef.current;
    setScanning(true);
    setCurrentCentre(target);
    setOutcome(null);
    setSelectedIds(new Set());
    setStage("select");
    stageRef.current = "select";
    setFieldNames({});
    setActiveNamingId(null);
    activeNamingRef.current = null;
    setSaveError(null);
    setSearchError(null);
    try {
      const result = await scanCurrentFarmFieldsAction(target);
      if (request === scanRequestRef.current) setOutcome(result);
    } catch {
      if (request === scanRequestRef.current) {
        setOutcome({ status: "UNAVAILABLE", reason: "Public field boundaries could not be loaded just now. You can still draw a field manually." });
      }
    } finally {
      if (request === scanRequestRef.current) setScanning(false);
    }
  }, []);

  useEffect(() => {
    void scanAt(initialCentre);
    return () => { scanRequestRef.current += 1; };
  }, [initialCentre, scanAt]);

  useEffect(() => {
    candidatesRef.current = candidates;
    selectedRef.current = selectedIds;
    activeNamingRef.current = activeNamingId;
    stageRef.current = stage;
    existingRef.current = existingFields;
    const source = mapRef.current?.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(featureCollection(candidates, selectedIds, activeNamingId));
    const existingSource = mapRef.current?.getSource(EXISTING_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    existingSource?.setData(existingFeatureCollection(existingFields));
  }, [activeNamingId, candidates, existingFields, selectedIds, stage]);

  useEffect(() => {
    if (!mapboxConfigured || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_PLAIN_SATELLITE_STYLE,
      center: initialCentre,
      zoom: 15,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const addLayers = () => {
      if (!map.getSource(EXISTING_SOURCE)) {
        map.addSource(EXISTING_SOURCE, { type: "geojson", data: existingFeatureCollection(existingRef.current) });
        map.addLayer({
          id: EXISTING_FILL,
          type: "fill",
          source: EXISTING_SOURCE,
          paint: { "fill-color": "#e3c77e", "fill-opacity": 0.08 },
        });
        map.addLayer({
          id: EXISTING_LINE,
          type: "line",
          source: EXISTING_SOURCE,
          paint: { "line-color": "#f5df9f", "line-opacity": 0.95, "line-width": 2.5 },
        });
      }

      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, { type: "geojson", data: featureCollection(candidatesRef.current, selectedRef.current, activeNamingRef.current) });
        map.addLayer({
          id: FILL,
          type: "fill",
          source: SOURCE,
          paint: {
            "fill-color": ["case", ["==", ["get", "active"], 1], "#f5df9f", ["==", ["get", "selected"], 1], "#e3c77e", "#f4f0e7"],
            "fill-opacity": ["case", ["==", ["get", "active"], 1], 0.58, ["==", ["get", "selected"], 1], 0.42, 0.12],
          },
        });
        map.addLayer({
          id: LINE,
          type: "line",
          source: SOURCE,
          paint: {
            "line-color": ["case", ["==", ["get", "active"], 1], "#fff3c6", ["==", ["get", "selected"], 1], "#f5df9f", "#ffffff"],
            "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.72],
            "line-width": ["case", ["==", ["get", "active"], 1], 4, ["==", ["get", "selected"], 1], 3, 1.4],
          },
        });
        map.on("click", FILL, (event) => {
          const id = event.features?.[0]?.properties?.candidateId;
          if (typeof id !== "string") return;
          if (stageRef.current === "name") {
            if (selectedRef.current.has(id)) setActiveNamingId(id);
            return;
          }
          setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        });
        map.on("mouseenter", FILL, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", FILL, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      if (initialBounds) {
        map.fitBounds(
          [
            [initialBounds[0], initialBounds[1]],
            [initialBounds[2], initialBounds[3]],
          ],
          { padding: 72, maxZoom: 16.4, duration: 0 },
        );
      }
    };

    map.on("load", addLayers);
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [initialBounds, initialCentre]);

  async function searchEircode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const eircode = normaliseEircode(searchQuery);
    if (!eircode) {
      setSearchError("Enter a full Eircode, for example V95 TY07.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const result = await lookupExactEircodeStep(eircode);
      if (!result.ok) {
        setSearchError(result.error);
        return;
      }
      setSearchQuery(result.value.eircode);
      mapRef.current?.flyTo({ center: result.value.center, zoom: 15.3, duration: 450 });
      await scanAt(result.value.center);
    } catch {
      setSearchError("Eircode lookup is temporarily unavailable. Try again or move the map and scan this area.");
    } finally {
      setSearching(false);
    }
  }

  async function backToMappedFields() {
    setSearchError(null);
    if (initialBounds && mapRef.current) {
      mapRef.current.fitBounds(
        [
          [initialBounds[0], initialBounds[1]],
          [initialBounds[2], initialBounds[3]],
        ],
        { padding: 72, maxZoom: 16.4, duration: 450 },
      );
    } else {
      mapRef.current?.flyTo({ center: initialCentre, zoom: 15, duration: 450 });
    }
    await scanAt(initialCentre);
  }

  function focusNamingCandidate(candidate: FieldScanCandidate) {
    setActiveNamingId(candidate.id);
    activeNamingRef.current = candidate.id;
    const bounds = fieldScanBounds([candidate.polygon]);
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 120, maxZoom: 17, duration: 350 },
      );
    }
  }

  function startNaming() {
    if (selectedCandidates.length === 0) return;
    setStage("name");
    stageRef.current = "name";
    setFieldNames((current) => {
      const next = { ...current };
      for (const candidate of selectedCandidates) {
        if (!(candidate.id in next)) next[candidate.id] = "";
      }
      return next;
    });
    focusNamingCandidate(selectedCandidates[0]);
  }

  function backToSelection() {
    setStage("select");
    stageRef.current = "select";
    setActiveNamingId(null);
    activeNamingRef.current = null;
    setSaveError(null);
  }

  async function saveNamedFields() {
    if (selectedCandidates.length === 0 || namedCount !== selectedCandidates.length || saving || namingIssue) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onAddSelected(
        selectedCandidates.map((candidate) => ({
          candidate,
          name: (fieldNames[candidate.id] ?? "").trim(),
        })),
      );
    } catch (error) {
      console.error("[field-scan] add selected fields failed", error);
      setSaveError(error instanceof Error ? error.message : "Some fields could not be added. Please try again.");
      setSaving(false);
    }
  }

  const unavailable = !mapboxConfigured || outcome?.status === "UNAVAILABLE";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/55" role="dialog" aria-modal="true" aria-label="Scan fields">
      <header className="flex items-center justify-between border-b border-white/10 bg-fr-v2-forest-deep px-4 py-3 text-white sm:px-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fr-v2-straw">Field setup · {farmName}</p>
          <h2 className="mt-0.5 font-display text-xl leading-none">{stage === "name" ? "Name fields" : "Scan fields"}</h2>
        </div>
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-full text-white/75 hover:bg-white/10 hover:text-white" aria-label="Close field scan">
          <X className="size-5" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 bg-[#1a2e1e]">
        {mapboxConfigured ? <div ref={containerRef} className="h-full w-full" /> : null}

        {stage === "select" ? (
          <div className="absolute left-3 right-16 top-3 z-20 max-w-[460px] sm:left-5 sm:top-5">
            <form onSubmit={searchEircode} className="flex min-h-11 overflow-hidden border border-white/20 bg-fr-v2-forest-deep/95 text-white shadow-xl backdrop-blur">
              <label htmlFor="field-scan-eircode" className="sr-only">Search Eircode</label>
              <Search className="ml-3 mt-3 size-4 shrink-0 text-fr-v2-straw" />
              <input
                id="field-scan-eircode"
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setSearchError(null); }}
                placeholder="Search Eircode"
                autoComplete="postal-code"
                className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-white outline-none placeholder:text-white/55"
              />
              <button type="submit" disabled={searching} className="min-w-16 border-l border-white/15 px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50">
                {searching ? "Finding…" : "Find"}
              </button>
            </form>
            {searchError ? <p className="mt-1.5 bg-fr-v2-forest-deep/95 px-3 py-2 text-xs text-white/80 shadow-lg">{searchError}</p> : null}
          </div>
        ) : null}

        <aside className={`absolute left-3 z-10 w-[min(400px,calc(100%-1.5rem))] border-l-[3px] border-fr-v2-straw bg-fr-v2-forest-deep/95 px-4 py-3 text-white shadow-xl backdrop-blur sm:left-5 ${stage === "name" ? "top-3 max-h-[calc(100%-1.5rem)] overflow-y-auto sm:top-5" : "top-[74px] sm:top-[82px]"}`}>
          {stage === "name" ? (
            <>
              <button type="button" onClick={backToSelection} className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white">
                <ArrowLeft className="size-3.5" /> Back to field selection
              </button>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fr-v2-straw">Name selected fields</p>
              <p className="mt-1 font-display text-xl leading-tight">Use the names you use on the farm</p>
              <p className="mt-1.5 text-[13px] leading-snug text-white/70">Click a row to focus that boundary on the map, then give it a name before saving.</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{namedCount} of {selectedCandidates.length} named</p>
              <div className="mt-4 space-y-3">
                {selectedCandidates.map((candidate, index) => (
                  <label
                    key={candidate.id}
                    className={`block border px-3 py-2.5 transition-colors ${activeNamingId === candidate.id ? "border-fr-v2-straw bg-white/[0.08]" : "border-white/15 bg-black/10"}`}
                    onClick={() => focusNamingCandidate(candidate)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">Selected field {index + 1}</span>
                      <span className="font-mono text-[10px] tabular-nums text-fr-v2-straw">{formatHa(candidate.areaHa)}</span>
                    </span>
                    <input
                      aria-label={`Name selected field ${index + 1}`}
                      value={fieldNames[candidate.id] ?? ""}
                      onFocus={() => focusNamingCandidate(candidate)}
                      onChange={(event) => setFieldNames((current) => ({ ...current, [candidate.id]: event.target.value }))}
                      maxLength={80}
                      autoComplete="off"
                      placeholder="e.g. House Field"
                      className="mt-2 min-h-11 w-full border border-white/20 bg-white/[0.06] px-3 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-fr-v2-straw"
                    />
                  </label>
                ))}
              </div>
              {namingIssue ? <p className="mt-3 text-xs leading-snug text-fr-v2-clay-tint">{namingIssue}</p> : null}
            </>
          ) : outcome === null ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fr-v2-straw">Scanning this area</p>
              <p className="mt-1 text-sm text-white/75">Finding public agricultural parcel boundaries…</p>
            </>
          ) : unavailable ? (
            <>
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fr-v2-straw"><TriangleAlert className="size-3.5" /> Scan unavailable</p>
              <p className="mt-2 text-sm leading-snug text-white/75">{mapboxConfigured && outcome.status === "UNAVAILABLE" ? outcome.reason : "Satellite mapping is not configured in this deployment."}</p>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fr-v2-straw">Tap your fields</p>
              <p className="mt-1 font-display text-lg leading-tight">{candidates.length} nearby boundaries found</p>
              <p className="mt-1.5 text-[13px] leading-snug text-white/72">Select only fields you farm. Public parcel boundaries do not prove ownership.</p>
              <p className="mt-2 font-mono text-[10px] text-white/50">{outcome.sourceLabel} · {outcome.sourceYear}{outcome.coverageAtFarm ? "" : " · partial local coverage"}</p>
            </>
          )}

          {stage === "select" ? (
            <button
              type="button"
              disabled={scanning || searching || !mapboxConfigured}
              onClick={() => {
                const map = mapRef.current;
                if (!map) return;
                const point = map.getCenter();
                void scanAt([point.lng, point.lat]);
              }}
              className="mt-3 inline-flex min-h-11 items-center gap-2 border border-fr-v2-straw/60 bg-fr-v2-straw px-4 text-sm font-semibold text-fr-v2-forest-deep hover:bg-white disabled:cursor-wait disabled:opacity-60"
            >
              <ScanLine className="size-4" /> {scanning ? "Scanning…" : "Scan this area"}
            </button>
          ) : null}

          {stage === "select" && existingFields.length > 0 ? (
            <div className="mt-3 border-t border-white/10 pt-2.5">
              <p className="text-[11px] leading-snug text-white/60">{existingFields.length} already-mapped {existingFields.length === 1 ? "field is" : "fields are"} outlined in gold.</p>
              <button type="button" onClick={() => void backToMappedFields()} className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-fr-v2-straw hover:text-white">
                <LocateFixed className="size-3.5" /> Back to mapped fields
              </button>
            </div>
          ) : null}
        </aside>
      </div>

      <footer className="border-t border-black/10 bg-[#f4f0e7] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-fr-v2-graphite">
              {selectedCandidates.length > 0
                ? `${selectedCandidates.length} ${selectedCandidates.length === 1 ? "field" : "fields"} selected`
                : unavailable
                  ? "No selectable boundaries in this area"
                  : "Select fields on the map"}
              {selectedCandidates.length > 0 ? <span className="ml-2 font-mono text-xs font-normal text-fr-v2-muted">· {formatHa(selectedAreaHa)}</span> : null}
            </p>
            <p className="mt-1 text-xs text-fr-v2-muted">
              {stage === "name"
                ? "Names are saved with the selected boundaries."
                : unavailable
                  ? "Search another Eircode or draw the field manually."
                  : selectedCandidates.length > 0
                    ? "Next: name the fields before they are added."
                    : "Tap each field boundary you want to add."}
            </p>
            {saveError ? <p className="mt-1 text-xs text-fr-risk">{saveError}</p> : null}
          </div>
          {stage === "name" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={backToSelection} disabled={saving} className="flex min-h-11 items-center gap-1.5 border border-fr-v2-forest-deep/25 px-4 text-sm font-semibold text-fr-v2-forest-deep hover:bg-white/50 disabled:opacity-50">
                <ArrowLeft className="size-4" /> Back
              </button>
              <button
                type="button"
                disabled={namedCount !== selectedCandidates.length || Boolean(namingIssue) || saving}
                onClick={saveNamedFields}
                className="flex min-h-11 items-center gap-2 border-l-[3px] border-fr-v2-straw bg-fr-v2-forest-deep px-5 text-sm font-semibold text-white hover:bg-fr-v2-forest disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Check className="size-4" />
                {saving ? "Saving fields…" : `Save ${selectedCandidates.length} ${selectedCandidates.length === 1 ? "field" : "fields"}`}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { const point = mapRef.current?.getCenter(); onDrawInstead(point ? [point.lng, point.lat] : currentCentre); }} className="min-h-11 border border-fr-v2-forest-deep/25 px-4 text-sm font-semibold text-fr-v2-forest-deep hover:bg-white/50">
                Draw field instead
              </button>
              <button
                type="button"
                disabled={selectedCandidates.length === 0 || unavailable}
                onClick={startNaming}
                className="flex min-h-11 items-center gap-2 border-l-[3px] border-fr-v2-straw bg-fr-v2-forest-deep px-5 text-sm font-semibold text-white hover:bg-fr-v2-forest disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ScanLine className="size-4" />
                Name selected fields
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
