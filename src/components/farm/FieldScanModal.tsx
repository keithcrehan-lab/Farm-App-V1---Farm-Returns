"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { LocateFixed, ScanLine, Search, TriangleAlert, X } from "lucide-react";
import { scanCurrentFarmFieldsAction } from "@/app/actions/field-scan";
import { lookupExactEircodeStep } from "@/app/actions/onboarding";
import {
  fieldScanBounds,
  fieldScanCentre,
  type FieldScanCandidate,
  type FieldScanExistingField,
  type FieldScanOutcome,
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

function featureCollection(candidates: readonly FieldScanCandidate[], selected: ReadonlySet<string>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: candidates.map((candidate) => ({
      type: "Feature",
      id: candidate.id,
      properties: { candidateId: candidate.id, selected: selected.has(candidate.id) ? 1 : 0 },
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
  onAddSelected: (candidates: FieldScanCandidate[]) => Promise<void>;
  onDrawInstead: (centre: [number, number]) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const candidatesRef = useRef<FieldScanCandidate[]>([]);
  const selectedRef = useRef<Set<string>>(new Set());
  const existingRef = useRef<FieldScanExistingField[]>(existingFields);

  const existingPolygons = useMemo(() => existingFields.map((field) => field.polygon), [existingFields]);
  const initialCentre = useMemo(() => fieldScanCentre(existingPolygons, centre), [existingPolygons, centre]);
  const initialBounds = useMemo(() => fieldScanBounds(existingPolygons), [existingPolygons]);

  const [outcome, setOutcome] = useState<FieldScanOutcome | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentCentre, setCurrentCentre] = useState<[number, number]>(initialCentre);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const candidates = useMemo(() => (outcome?.status === "READY" ? outcome.candidates : []), [outcome]);
  const selectedCandidates = useMemo(() => candidates.filter((candidate) => selectedIds.has(candidate.id)), [candidates, selectedIds]);
  const selectedAreaHa = selectedCandidates.reduce((sum, candidate) => sum + candidate.areaHa, 0);

  const scanAt = useCallback(async (target: [number, number]) => {
    setCurrentCentre(target);
    setOutcome(null);
    setSelectedIds(new Set());
    setSaveError(null);
    try {
      setOutcome(await scanCurrentFarmFieldsAction(target));
    } catch {
      setOutcome({ status: "UNAVAILABLE", reason: "Public field boundaries could not be loaded just now. You can still draw a field manually." });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    scanCurrentFarmFieldsAction(initialCentre)
      .then((result) => {
        if (alive) setOutcome(result);
      })
      .catch(() => {
        if (alive) setOutcome({ status: "UNAVAILABLE", reason: "Public field boundaries could not be loaded just now. You can still draw a field manually." });
      });
    return () => {
      alive = false;
    };
  }, [initialCentre]);

  useEffect(() => {
    candidatesRef.current = candidates;
    selectedRef.current = selectedIds;
    existingRef.current = existingFields;
    const source = mapRef.current?.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(featureCollection(candidates, selectedIds));
    const existingSource = mapRef.current?.getSource(EXISTING_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    existingSource?.setData(existingFeatureCollection(existingFields));
  }, [candidates, existingFields, selectedIds]);

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
        map.addSource(SOURCE, { type: "geojson", data: featureCollection(candidatesRef.current, selectedRef.current) });
        map.addLayer({
          id: FILL,
          type: "fill",
          source: SOURCE,
          paint: {
            "fill-color": ["case", ["==", ["get", "selected"], 1], "#e3c77e", "#f4f0e7"],
            "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.42, 0.12],
          },
        });
        map.addLayer({
          id: LINE,
          type: "line",
          source: SOURCE,
          paint: {
            "line-color": ["case", ["==", ["get", "selected"], 1], "#f5df9f", "#ffffff"],
            "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.72],
            "line-width": ["case", ["==", ["get", "selected"], 1], 3, 1.4],
          },
        });
        map.on("click", FILL, (event) => {
          const id = event.features?.[0]?.properties?.candidateId;
          if (typeof id !== "string") return;
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

  async function addSelected() {
    if (selectedCandidates.length === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onAddSelected(selectedCandidates);
    } catch (error) {
      console.error("[field-scan] add selected fields failed", error);
      setSaveError("Some fields could not be added. Please try again.");
      setSaving(false);
    }
  }

  const unavailable = !mapboxConfigured || outcome?.status === "UNAVAILABLE";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/55" role="dialog" aria-modal="true" aria-label="Scan fields">
      <header className="flex items-center justify-between border-b border-white/10 bg-fr-v2-forest-deep px-4 py-3 text-white sm:px-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fr-v2-straw">Field setup · {farmName}</p>
          <h2 className="mt-0.5 font-display text-xl leading-none">Scan fields</h2>
        </div>
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-full text-white/75 hover:bg-white/10 hover:text-white" aria-label="Close field scan">
          <X className="size-5" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 bg-[#1a2e1e]">
        {mapboxConfigured ? <div ref={containerRef} className="h-full w-full" /> : null}

        <div className="absolute left-3 right-16 top-3 z-20 max-w-[460px] sm:left-5 sm:top-5">
          <form onSubmit={searchEircode} className="flex min-h-11 overflow-hidden border border-white/20 bg-fr-v2-forest-deep/95 text-white shadow-xl backdrop-blur">
            <label htmlFor="field-scan-eircode" className="sr-only">Search Eircode</label>
            <Search className="ml-3 mt-3 size-4 shrink-0 text-fr-v2-straw" />
            <input
              id="field-scan-eircode"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
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

        <aside className="absolute left-3 top-[74px] z-10 w-[min(380px,calc(100%-1.5rem))] border-l-[3px] border-fr-v2-straw bg-fr-v2-forest-deep/95 px-4 py-3 text-white shadow-xl backdrop-blur sm:left-5 sm:top-[82px]">
          {outcome === null ? (
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

          {existingFields.length > 0 ? (
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
            {selectedCandidates.length > 0 ? (
              <p className="text-sm font-semibold text-fr-v2-graphite">
                {selectedCandidates.length} {selectedCandidates.length === 1 ? "field" : "fields"} selected
                <span className="ml-2 font-mono text-xs font-normal text-fr-v2-muted">· {formatHa(selectedAreaHa)}</span>
              </p>
            ) : (
              <p className="text-sm text-fr-v2-muted">{unavailable ? "Search another Eircode or draw the field manually." : "Tap field boundaries on the map to select them."}</p>
            )}
            {saveError ? <p className="mt-1 text-xs text-fr-risk">{saveError}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onDrawInstead(currentCentre)} className="min-h-11 border border-fr-v2-forest-deep/25 px-4 text-sm font-semibold text-fr-v2-forest-deep hover:bg-white/50">
              Draw field instead
            </button>
            <button
              type="button"
              disabled={selectedCandidates.length === 0 || saving || unavailable}
              onClick={addSelected}
              className="flex min-h-11 items-center gap-2 border-l-[3px] border-fr-v2-straw bg-fr-v2-forest-deep px-5 text-sm font-semibold text-white hover:bg-fr-v2-forest disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ScanLine className="size-4" />
              {saving ? "Adding fields…" : "Add selected fields"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
