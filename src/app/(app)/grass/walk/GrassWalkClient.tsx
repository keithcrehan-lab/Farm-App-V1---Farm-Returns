"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Bike, Check, Footprints, MapPin, Minus, Plus, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useFields } from "@/store/farm-store";
import { suggestFieldFromPosition } from "@/domain/near-field";
import { GRASS_COVER_METHODS, type GrassCoverMethod } from "@/domain/grass-management";
import { haversineM, MAX_TRACK_ACCURACY_M, type SurveyTrackPoint } from "@/domain/grass-survey";
import { getGrassManagementDataAction, recordGrassCoverObservationAction, type GrassManagementData } from "@/app/actions/grass-management";
import {
  appendGrassSurveyTrackAction,
  finishGrassSurveyAction,
  getActiveGrassSurveyAction,
  markGrassSurveyFieldAction,
  startGrassSurveyAction,
} from "@/app/actions/grass-surveys";
import type { GrassSurveyRecord } from "@/lib/farm-data/grass-surveys";

const METHOD_LABEL: Record<GrassCoverMethod, string> = {
  plate_meter: "Plate meter",
  visual_estimate: "Visual estimate",
  cut_and_weigh: "Cut & weigh",
  manual_kg_dm_ha: "Manual kg DM/ha",
};
const METHOD_KEY = "fr-walk-method";
const pendingKey = (id: string) => `fr-walk-pending-${id}`;

const REJECTION: Record<string, string> = {
  INVALID_COVER: "Cover must be between 1 and 10,000 kg DM/ha.",
  FIELD_NOT_FOUND: "That field isn't on this farm any more.",
  NO_FARM: "Sign in to record grass.",
  OBSERVED_AT_IN_FUTURE: "Check your phone's date and time.",
};

interface Position { lat: number; lng: number; accuracyM: number | null }

function safeStorage<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function elapsedLabel(fromIso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60_000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export function GrassWalkClient() {
  const router = useRouter();
  const storeFields = useFields();
  const [data, setData] = useState<GrassManagementData | null>(null);
  const [survey, setSurvey] = useState<GrassSurveyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"walk" | "quad">("walk");
  const [method, setMethod] = useState<GrassCoverMethod>(() =>
    safeStorage(() => {
      const saved = window.localStorage.getItem(METHOD_KEY);
      return (GRASS_COVER_METHODS as readonly string[]).includes(saved ?? "") ? (saved as GrassCoverMethod) : "plate_meter";
    }, "plate_meter"));
  const [currentFieldId, setCurrentFieldId] = useState<string | null>(null);
  const [fromGps, setFromGps] = useState(false);
  const [cover, setCover] = useState("");
  const [measured, setMeasured] = useState<Map<string, number>>(new Map());
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsState, setGpsState] = useState<"off" | "on" | "denied">("off");
  const [distanceM, setDistanceM] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);

  const pending = useRef<SurveyTrackPoint[]>([]);
  const lastGood = useRef<Position | null>(null);
  const autoSelect = useRef<(p: Position) => void>(() => undefined);
  const surveyId = survey?.id ?? null;
  const active = survey?.status === "in_progress";

  // Load farm grass data and any walk left in progress.
  useEffect(() => {
    let live = true;
    void Promise.all([getGrassManagementDataAction(), getActiveGrassSurveyAction()]).then(([d, s]) => {
      if (!live) return;
      setData(d);
      if (s) {
        setSurvey(s);
        setMode(s.mode === "quad" ? "quad" : "walk");
        if (d.status === "ok") {
          const done = new Map<string, number>();
          for (const o of d.coverObservations) if (o.observedAt >= s.startedAt) done.set(o.fieldId, o.coverKgDmHa);
          setMeasured(done);
        }
      }
      setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const okData = data?.status === "ok" ? data : null;
  const fields = useMemo(() => {
    const ids = new Set(okData?.fields.map((f) => f.id) ?? []);
    return storeFields.filter((f) => ids.has(f.id));
  }, [storeFields, okData]);
  const fieldName = useMemo(() => new Map((okData?.fields ?? []).map((f) => [f.id, f.name])), [okData]);

  const latestByField = useMemo(() => {
    const map = new Map<string, { cover: number; observedAt: string }>();
    for (const o of okData?.coverObservations ?? []) {
      const prev = map.get(o.fieldId);
      if (!prev || o.observedAt > prev.observedAt) map.set(o.fieldId, { cover: o.coverKgDmHa, observedAt: o.observedAt });
    }
    return map;
  }, [okData]);

  const farmAverage = useMemo(() => {
    const values = [...latestByField.values()].map((v) => v.cover);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length / 10) * 10 : null;
  }, [latestByField]);

  const marked = useMemo(() => new Set([...(survey?.markedGrazedFieldIds ?? []), ...(survey?.skippedFieldIds ?? [])]), [survey]);
  const remaining = useMemo(() => (okData?.fields ?? []).filter((f) => !measured.has(f.id) && !marked.has(f.id)), [okData, measured, marked]);

  const selectField = useCallback((id: string | null, gps = false) => {
    setCurrentFieldId(id);
    setFromGps(gps);
    setChoosing(false);
    setError("");
    const last = id ? latestByField.get(id) : undefined;
    setCover(last ? String(Math.round(last.cover)) : farmAverage !== null ? String(farmAverage) : "");
  }, [latestByField, farmAverage]);

  const pickNext = useCallback((exclude: string) => {
    const candidates = remaining.filter((f) => f.id !== exclude);
    if (!candidates.length) return null;
    if (!position) return candidates[0].id;
    let best = candidates[0].id;
    let bestD = Infinity;
    for (const c of candidates) {
      const field = fields.find((f) => f.id === c.id);
      if (!field) continue;
      const d = haversineM(position.lat, position.lng, field.centroid[1], field.centroid[0]);
      if (d < bestD) { bestD = d; best = c.id; }
    }
    return best;
  }, [remaining, position, fields]);

  // Clock tick for the elapsed timer.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [active]);

  // Keep the screen awake during a walk so GPS keeps recording.
  useEffect(() => {
    if (!active) return;
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } };
    const acquire = () => { if (document.visibilityState === "visible") void nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => undefined); };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => { document.removeEventListener("visibilitychange", acquire); void lock?.release().catch(() => undefined); };
  }, [active]);

  // GPS trail.
  useEffect(() => {
    if (!active || !surveyId) return;
    if (!("geolocation" in navigator)) return;
    pending.current = safeStorage(() => JSON.parse(window.localStorage.getItem(pendingKey(surveyId)) ?? "[]") as SurveyTrackPoint[], []);
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const p: Position = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null };
        setGpsState("on");
        setPosition(p);
        autoSelect.current(p);
        pending.current.push({ recordedAt: new Date(pos.timestamp || Date.now()).toISOString(), ...p });
        if (p.accuracyM === null || p.accuracyM <= MAX_TRACK_ACCURACY_M) {
          const prev = lastGood.current;
          const d = prev ? haversineM(prev.lat, prev.lng, p.lat, p.lng) : 0;
          if (!prev || d >= 3) {
            if (prev) setDistanceM((m) => m + d);
            lastGood.current = p;
          }
        }
      },
      (err) => setGpsState(err.code === err.PERMISSION_DENIED ? "denied" : "off"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [active, surveyId]);

  const flush = useCallback(async () => {
    if (!surveyId || !pending.current.length) return;
    const batch = pending.current.slice(0, 500);
    const res = await appendGrassSurveyTrackAction(surveyId, batch).catch(() => ({ ok: false }));
    if (res.ok) pending.current = pending.current.slice(batch.length);
    safeStorage(() => window.localStorage.setItem(pendingKey(surveyId), JSON.stringify(pending.current)), undefined);
  }, [surveyId]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void flush(), 20_000);
    return () => clearInterval(t);
  }, [active, flush]);

  // Put the field the farmer is standing in on screen (called from the GPS callback).
  useEffect(() => {
    autoSelect.current = (p: Position) => {
      if (busy) return;
      const s = suggestFieldFromPosition(fields, { latitude: p.lat, longitude: p.lng, accuracyMeters: p.accuracyM ?? 25 });
      if (s.status !== "suggested") return;
      const id = s.field.id;
      if (id === currentFieldId || measured.has(id) || marked.has(id)) return;
      selectField(id, true);
    };
  }, [fields, currentFieldId, measured, marked, busy, selectField]);

  async function start() {
    setBusy(true);
    setError("");
    safeStorage(() => window.localStorage.setItem(METHOD_KEY, method), undefined);
    const res = await startGrassSurveyAction({ id: crypto.randomUUID(), mode, startedAt: new Date().toISOString(), device: navigator.userAgent });
    setBusy(false);
    if (res.ok) { setSurvey(res.survey); setDistanceM(0); lastGood.current = null; selectField(pickNext("")); }
    else setError(res.error);
  }

  async function save() {
    if (!surveyId || !currentFieldId) return;
    const value = Number(cover);
    if (!Number.isFinite(value) || value <= 0) { setError("Enter the cover first."); return; }
    setBusy(true);
    setError("");
    safeStorage(() => window.localStorage.setItem(METHOD_KEY, method), undefined);
    const res = await recordGrassCoverObservationAction({
      id: crypto.randomUUID(),
      fieldId: currentFieldId,
      coverKgDmHa: Math.round(value),
      method,
      observedAt: new Date().toISOString(),
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      accuracyM: position?.accuracyM ?? null,
      surveyId,
    }).catch(() => null);
    setBusy(false);
    if (!res) { setError("No signal. Try Save again in a moment."); return; }
    if (res.status !== "saved") { setError(REJECTION[res.reasonCode] ?? "That reading wasn't saved. Try again."); return; }
    const done = new Map(measured).set(currentFieldId, res.observation.coverKgDmHa);
    setMeasured(done);
    const next = (okData?.fields ?? []).filter((f) => !done.has(f.id) && !marked.has(f.id));
    selectField(next.length ? pickNext(currentFieldId) : null);
  }

  async function mark(kind: "grazed" | "skipped") {
    if (!surveyId || !currentFieldId) return;
    setBusy(true);
    const res = await markGrassSurveyFieldAction(surveyId, currentFieldId, kind).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) { setError(res && !res.ok ? res.error : "No signal. Try again."); return; }
    setSurvey(res.survey);
    selectField(pickNext(currentFieldId));
  }

  async function finish() {
    if (!surveyId) return;
    setBusy(true);
    setError("");
    await flush();
    const res = await finishGrassSurveyAction(surveyId).catch(() => null);
    setBusy(false);
    if (res && res.ok) {
      safeStorage(() => window.localStorage.removeItem(pendingKey(surveyId)), undefined);
      router.push(`/grass/walks/${surveyId}`);
    } else setError(res && !res.ok ? res.error : "No signal. Your readings are saved; try Finish again.");
  }

  const nudge = (delta: number) => setCover((c) => String(Math.max(0, Math.min(10_000, (Number(c) || farmAverage || 0) + delta))));
  const current = currentFieldId ? latestByField.get(currentFieldId) : undefined;
  const total = okData?.fields.length ?? 0;

  if (loading) return <p className="py-10 text-center text-sm text-fr-v2-muted" role="status">Loading your fields…</p>;
  if (!okData) return <p className="py-10 text-center text-sm text-fr-v2-muted">Sign in and add a farm to record a grass walk.</p>;
  if (!total) return <p className="py-10 text-center text-sm text-fr-v2-muted">Map your fields first, then come back to walk them.</p>;

  if (!active) {
    return (
      <div className="mx-auto max-w-xl space-y-6 pb-10 text-fr-v2-graphite">
        <header>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Grass · Survey</p>
          <h1 className="mt-1 font-display text-[34px] leading-none">Grass walk</h1>
          <p className="mt-3 text-sm text-fr-v2-muted">Your route, readings and the weather are saved as one record. Growth since your last walk is worked out for you.</p>
        </header>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How are you getting around?">
          {([["walk", "On foot", Footprints], ["quad", "Quad or bike", Bike]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
              className={cn("flex min-h-14 items-center justify-center gap-2 rounded-[14px] border text-sm font-semibold", mode === value ? "border-fr-v2-forest bg-fr-v2-forest/10 text-fr-v2-forest" : "border-fr-v2-cream-rule bg-fr-v2-cream text-fr-v2-charcoal")}>
              <Icon className="size-5" aria-hidden />{label}
            </button>
          ))}
        </div>
        <label className="block text-xs font-semibold text-fr-v2-charcoal">Measuring with
          <select value={method} onChange={(e) => setMethod(e.target.value as GrassCoverMethod)} className="mt-1 block min-h-12 w-full rounded-[12px] border border-fr-v2-cream-rule bg-white px-3 text-base">
            {GRASS_COVER_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </label>
        {error ? <p role="alert" className="flex gap-2 text-sm text-fr-red-700"><AlertCircle className="size-4 shrink-0" aria-hidden />{error}</p> : null}
        <button type="button" onClick={() => void start()} disabled={busy} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-[16px] bg-fr-v2-forest text-lg font-semibold text-white disabled:opacity-60">
          <Footprints className="size-6" aria-hidden />{busy ? "Starting…" : "Start grass walk"}
        </button>
        <p className="text-center text-xs text-fr-v2-muted">Keep this screen open while you walk. Closing the app pauses the route until you come back.</p>
        <Link href="/grass/walks" className="block text-center text-sm font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2">Past walks</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-32 text-fr-v2-graphite">
      <div className="grid grid-cols-3 gap-2 rounded-[16px] bg-fr-v2-forest-deep px-4 py-3 text-white" aria-live="polite">
        <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/60">Time</p><p className="font-mono text-lg tabular-nums">{elapsedLabel(survey!.startedAt, now)}</p></div>
        <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/60">Distance</p><p className="font-mono text-lg tabular-nums">{(distanceM / 1000).toFixed(2)} km</p></div>
        <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/60">Fields</p><p className="font-mono text-lg tabular-nums">{measured.size} / {total}</p></div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-fr-v2-muted">
        <MapPin className="size-3.5" aria-hidden />
        {gpsState === "on" ? `GPS on${position?.accuracyM != null ? ` · ±${formatNumber(position.accuracyM, 0)} m` : ""}` : gpsState === "denied" ? "Location is blocked, so choose fields yourself. Allow location to record the route." : "Finding GPS…"}
      </p>

      {currentFieldId && !choosing ? (
        <section className="space-y-4 rounded-[20px] border border-fr-v2-cream-rule bg-fr-v2-cream p-5" aria-label="Current field">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-fr-v2-muted">{fromGps ? "You're in" : "Next field"}</p>
              <h1 className="font-display text-[30px] leading-tight">{fieldName.get(currentFieldId) ?? "Field"}</h1>
              <p className="mt-1 text-xs text-fr-v2-muted">{current ? `Last reading ${formatNumber(current.cover, 0)} kg DM/ha · ${new Date(current.observedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}` : "No reading yet. Starting from the farm average."}</p>
            </div>
            <button type="button" onClick={() => setChoosing(true)} className="shrink-0 text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2">Change</button>
          </div>
          <div>
            <label htmlFor="walk-cover" className="text-xs font-semibold text-fr-v2-charcoal">Cover (kg DM/ha) · {METHOD_LABEL[method]}</label>
            <input id="walk-cover" inputMode="numeric" value={cover} onChange={(e) => setCover(e.target.value.replace(/[^0-9]/g, ""))}
              className="mt-1 block w-full rounded-[14px] border border-fr-v2-cream-rule bg-white py-3 text-center font-mono text-[40px] font-semibold tabular-nums" />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[-100, -50, 50, 100].map((d) => (
                <button key={d} type="button" onClick={() => nudge(d)} className="flex min-h-12 items-center justify-center gap-1 rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold tabular-nums text-fr-v2-charcoal">
                  {d < 0 ? <Minus className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}{Math.abs(d)}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => void save()} disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-fr-v2-forest text-base font-semibold text-white disabled:opacity-60">
            <Check className="size-5" aria-hidden />{busy ? "Saving…" : "Save and next field"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void mark("grazed")} disabled={busy} className="min-h-11 rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-v2-charcoal">Just grazed</button>
            <button type="button" onClick={() => void mark("skipped")} disabled={busy} className="min-h-11 rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-v2-charcoal">Skip field</button>
          </div>
        </section>
      ) : (
        <section className="space-y-2 rounded-[20px] border border-fr-v2-cream-rule bg-fr-v2-cream p-5">
          <p className="text-sm font-semibold">{remaining.length ? "Choose a field" : "Every field done"}</p>
          {remaining.length ? (
            <div className="grid grid-cols-2 gap-2">
              {remaining.map((f) => (
                <button key={f.id} type="button" onClick={() => selectField(f.id)} className="min-h-12 rounded-[12px] border border-fr-v2-cream-rule bg-white px-3 text-left text-sm font-semibold text-fr-v2-charcoal">{f.name}</button>
              ))}
            </div>
          ) : <p className="text-sm text-fr-v2-muted">Tap Finish walk to see your summary.</p>}
        </section>
      )}

      {error ? <p role="alert" className="flex gap-2 text-sm text-fr-red-700"><AlertCircle className="size-4 shrink-0" aria-hidden />{error}</p> : null}

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 px-4 lg:static lg:px-0">
        <button type="button" onClick={() => void finish()} disabled={busy} className="mx-auto flex min-h-12 w-full max-w-xl items-center justify-center gap-2 rounded-[14px] border border-fr-v2-forest bg-white text-sm font-semibold text-fr-v2-forest shadow-[0_8px_24px_rgba(0,0,0,0.15)] disabled:opacity-60">
          <Square className="size-4" aria-hidden />Finish walk
        </button>
      </div>
    </div>
  );
}
