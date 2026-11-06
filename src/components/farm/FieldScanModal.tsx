"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ScanLine, TriangleAlert, X } from "lucide-react";
import { scanCurrentFarmFieldsAction } from "@/app/actions/field-scan";
import type { FieldScanCandidate, FieldScanOutcome } from "@/domain/field-scan";
import { formatHa } from "@/lib/format";
import { MAPBOX_PLAIN_SATELLITE_STYLE, MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";

const SOURCE = "field-scan-candidates";
const FILL = "field-scan-candidates-fill";
const LINE = "field-scan-candidates-line";

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

export function FieldScanModal({
  farmName,
  centre,
  onAddSelected,
  onDrawInstead,
  onClose,
}: {
  farmName: string;
  centre: [number, number];
  onAddSelected: (candidates: FieldScanCandidate[]) => Promise<void>;
  onDrawInstead: () => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const candidatesRef = useRef<FieldScanCandidate[]>([]);
  const selectedRef = useRef<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<FieldScanOutcome | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const candidates = useMemo(() => (outcome?.status === "READY" ? outcome.candidates : []), [outcome]);
  const selectedCandidates = useMemo(() => candidates.filter((candidate) => selectedIds.has(candidate.id)), [candidates, selectedIds]);
  const selectedAreaHa = selectedCandidates.reduce((sum, candidate) => sum + candidate.areaHa, 0);

  useEffect(() => {
    let alive = true;
    scanCurrentFarmFieldsAction()
      .then((result) => {
        if (alive) setOutcome(result);
      })
      .catch(() => {
        if (alive) setOutcome({ status: "UNAVAILABLE", reason: "Public field boundaries could not be loaded just now. You can still draw a field manually." });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    candidatesRef.current = candidates;
    selectedRef.current = selectedIds;
    const source = mapRef.current?.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(featureCollection(candidates, selectedIds));
  }, [candidates, selectedIds]);

  useEffect(() => {
    if (!mapboxConfigured || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_PLAIN_SATELLITE_STYLE,
      center: centre,
      zoom: 15,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const addScanLayers = () => {
      if (map.getSource(SOURCE)) return;
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
    };

    map.on("load", addScanLayers);
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [centre]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || candidates.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    for (const candidate of candidates) {
      for (const [lng, lat] of candidate.polygon.coordinates[0] ?? []) bounds.extend([lng, lat]);
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 56, maxZoom: 16.5, duration: 500 });
  }, [candidates]);

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

        <aside className="absolute left-3 top-3 z-10 w-[min(360px,calc(100%-1.5rem))] border-l-[3px] border-fr-v2-straw bg-fr-v2-forest-deep/95 px-4 py-3 text-white shadow-xl backdrop-blur sm:left-5 sm:top-5">
          {outcome === null ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fr-v2-straw">Scanning nearby fields</p>
              <p className="mt-1 text-sm text-white/75">Finding public agricultural parcel boundaries around your farm…</p>
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
              <p className="mt-1.5 text-[13px] leading-snug text-white/72">Select only fields you farm. These are public agricultural boundaries, not proof of ownership.</p>
              <p className="mt-2 font-mono text-[10px] text-white/50">{outcome.sourceLabel} · {outcome.sourceYear}{outcome.coverageAtFarm ? "" : " · partial local coverage"}</p>
            </>
          )}
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
              <p className="text-sm text-fr-v2-muted">{unavailable ? "You can still map a field manually." : "Tap field boundaries on the map to select them."}</p>
            )}
            {saveError ? <p className="mt-1 text-xs text-fr-risk">{saveError}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onDrawInstead} className="min-h-11 border border-fr-v2-forest-deep/25 px-4 text-sm font-semibold text-fr-v2-forest-deep hover:bg-white/50">
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
