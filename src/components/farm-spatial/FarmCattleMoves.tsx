"use client";

/**
 * Cattle groups on the Farm map, and moving them between fields.
 *
 * Each group grazing a mapped field sits on that field as a marker; groups
 * housed or not on a mapped field wait in a strip under the map caption.
 * Moving is easy but never accidental:
 *   1. press and hold a group (about half a second) to pick it up — a quick
 *      swipe over it just moves the map;
 *   2. let go over the new field, then confirm (the time defaults to now and
 *      can be set earlier);
 *   3. the move is held for a few seconds with an Undo button before it is
 *      saved, so a mistake never reaches the farm's records.
 * Tapping a group instead offers "Move to…" with a list of fields.
 *
 * Moves are saved by the existing `moveLivestockGroupToFieldAction` (the
 * dated grazing record the Grass engine reads). Nothing here calculates.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type mapboxgl from "mapbox-gl";
import { ArrowRight } from "lucide-react";
import { CowIcon } from "@/components/shell/CowIcon";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import {
  listGrazingMovementGroupsAction,
  moveLivestockGroupToFieldAction,
} from "@/app/actions/grazing-field-movements";
import {
  cattleGroupWhereabouts,
  fieldAtPoint,
  fromLocalDateTimeInput,
  mappedFields,
  moveRefusedMessage,
  moveTimeProblem,
  placeCattleGroups,
  toLocalDateTimeInput,
  type CattleMapGroup,
} from "@/lib/farm-cattle-map";
import type { Field } from "@/domain/types";

/** How long a press must be held to pick a group up. */
const HOLD_MS = 450;
/** Movement (px) before the hold fires that makes the touch a map pan instead. */
const PAN_SLOP_PX = 8;
/** How long a confirmed move waits, with Undo, before it is saved. */
const UNDO_MS = 8000;
const DROP_SRC = "fr-cattle-drop-target";

type Pending = { group: CattleMapGroup; toFieldId: string; toFieldName: string; movedAt: string };
type Drag = { group: CattleMapGroup; x: number; y: number; targetFieldId?: string; targetFieldName?: string };
type Toast = { kind: "pending" | "saving" | "error" | "saved"; text: string };

function groupChipText(group: CattleMapGroup) {
  return `${group.label} · ${formatNumber(group.headCount, 0)}`;
}

/** Press-and-hold gesture for one group (map marker or strip chip). */
function usePressAndHold(handlers: {
  onTap: (group: CattleMapGroup) => void;
  onLift: (group: CattleMapGroup, x: number, y: number) => void;
  onDrag: (x: number, y: number) => void;
  onDrop: (x: number, y: number) => void;
  onCancel: () => void;
}) {
  const live = useRef(handlers);
  useEffect(() => { live.current = handlers; });
  const gesture = useRef<{ id: number; group: CattleMapGroup; el: HTMLElement; x0: number; y0: number; x: number; y: number; timer: number | null; lifted: boolean; panned: boolean } | null>(null);

  useEffect(() => () => {
    if (gesture.current?.timer) window.clearTimeout(gesture.current.timer);
  }, []);

  /** Ends the gesture without a drop (lost pointer, element removed): the map is handed back. */
  const abandon = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (g.timer) window.clearTimeout(g.timer);
    if (g.lifted) live.current.onCancel();
  }, []);

  // If the group is redrawn under the finger, the browser reports the lost pointer to the document, not the chip.
  useEffect(() => {
    const onDocumentLost = (e: PointerEvent) => {
      const g = gesture.current;
      if (g && g.id === e.pointerId && !g.el.isConnected) abandon();
    };
    document.addEventListener("lostpointercapture", onDocumentLost, true);
    document.addEventListener("pointerup", onDocumentLost, true);
    document.addEventListener("pointercancel", onDocumentLost, true);
    return () => {
      document.removeEventListener("lostpointercapture", onDocumentLost, true);
      document.removeEventListener("pointerup", onDocumentLost, true);
      document.removeEventListener("pointercancel", onDocumentLost, true);
    };
  }, [abandon]);

  return useCallback((group: CattleMapGroup) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (gesture.current || (e.pointerType === "mouse" && e.button !== 0)) return;
      const el = e.currentTarget;
      // Captured at once, so the release is always seen here, even off the chip.
      try { el.setPointerCapture(e.pointerId); } catch { /* not supported for this pointer */ }
      const g = { id: e.pointerId, group, el, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, timer: null as number | null, lifted: false, panned: false };
      g.timer = window.setTimeout(() => {
        g.timer = null;
        if (gesture.current !== g || g.panned) return;
        if (!g.el.isConnected) { gesture.current = null; return; } // the group was redrawn under the finger
        g.lifted = true;
        try { navigator.vibrate?.(25); } catch { /* not supported */ }
        live.current.onLift(group, g.x, g.y);
      }, HOLD_MS);
      gesture.current = g;
    },
    onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => {
      if (gesture.current?.id === e.pointerId) abandon();
    },
    // Keyboard and screen readers press the button without pointer events: offer Move to… then.
    // (Capture phase: map markers stop the click bubbling so it doesn't count as a tap on open ground.)
    onClickCapture: (e: React.MouseEvent) => {
      if (e.detail === 0) live.current.onTap(group);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      g.x = e.clientX;
      g.y = e.clientY;
      if (g.lifted) { live.current.onDrag(g.x, g.y); return; }
      if (!g.panned && Math.hypot(g.x - g.x0, g.y - g.y0) > PAN_SLOP_PX) {
        g.panned = true; // a swipe: the map moves, the group doesn't
        if (g.timer) { window.clearTimeout(g.timer); g.timer = null; }
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      if (g.timer) window.clearTimeout(g.timer);
      if (g.lifted) live.current.onDrop(e.clientX, e.clientY);
      else if (!g.panned) live.current.onTap(g.group);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      if (g.timer) window.clearTimeout(g.timer);
      if (g.lifted) live.current.onCancel();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }), [abandon]);
}

export function FarmCattleMoves({ map, fields, enabled, onMoved }: {
  map: mapboxgl.Map | null;
  fields: readonly Field[];
  /** Real signed-in farms only: demo data is never moved. */
  enabled: boolean;
  /** Called after a move is saved, so the page can refresh grass figures. */
  onMoved?: () => void;
}) {
  const [groups, setGroups] = useState<CattleMapGroup[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ group: CattleMapGroup; toFieldId: string; toFieldName: string } | null>(null);
  const [when, setWhen] = useState("");
  const [whenProblem, setWhenProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [markerEls, setMarkerEls] = useState<Array<{ key: string; group: CattleMapGroup; el: HTMLElement }>>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- portals to document.body only after mount

  const reload = useCallback(async () => {
    try {
      setGroups(await listGrazingMovementGroupsAction());
    } catch {
      // The map simply shows no groups; nothing is assumed.
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listGrazingMovementGroupsAction()
      .then((loaded) => { if (!cancelled) setGroups(loaded); })
      .catch(() => { /* the map simply shows no groups; nothing is assumed */ });
    return () => { cancelled = true; };
  }, [enabled]);

  // Where each group shows: a move waiting for Undo already shows at its new field.
  const shownGroups = useMemo(() => groups.map((group) => {
    if (!pending || pending.group.id !== group.id) return group;
    return { ...group, system: "grazing" as const, currentFieldId: pending.toFieldId, currentFieldName: pending.toFieldName, currentSince: pending.movedAt };
  }), [groups, pending]);
  const placement = useMemo(() => placeCattleGroups(shownGroups, fields), [shownGroups, fields]);
  // The store hands over a new fields array on every render; markers follow only real changes to the mapped fields.
  const fieldsKey = mappedFields(fields).map((field) => `${field.id}:${field.centroid.join(",")}:${field.name}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the mapped fields themselves change (fieldsKey)
  const fieldsOnMap = useMemo(() => mappedFields(fields), [fieldsKey]);

  // --- Saving, with a short Undo window -------------------------------------------------------
  const pendingRef = useRef<Pending | null>(null);
  const timerRef = useRef<number | null>(null);
  const onMovedRef = useRef(onMoved);
  useEffect(() => { onMovedRef.current = onMoved; });

  const save = useCallback(async (move: Pending) => {
    try {
      const result = await moveLivestockGroupToFieldAction({ livestockGroupId: move.group.id, fieldId: move.toFieldId, movedAt: move.movedAt });
      // A newer move waiting for Undo keeps its own note (and Undo button) on screen.
      // A failure is still said, alongside it.
      const note = (next: Toast) => setToast((current) => {
        if (current?.kind !== "pending") return next;
        return next.kind === "error" ? { kind: "pending", text: `${current.text}. Earlier move not saved: ${next.text}` } : current;
      });
      if (result.status === "saved") {
        window.dispatchEvent(new Event("farm-return:grazing-moved"));
        note({ kind: "saved", text: `${move.group.label} moved to ${move.toFieldName}.` });
        onMovedRef.current?.();
      } else {
        note({ kind: "error", text: moveRefusedMessage(result.reasonCode) });
      }
    } catch {
      const failed = "The move couldn't be saved just now. Nothing was changed.";
      setToast((current) => (current?.kind === "pending" ? { kind: "pending", text: `${current.text}. Earlier move not saved: ${failed}` } : { kind: "error", text: failed }));
    } finally {
      await reload();
      setPending((current) => (current === move ? null : current));
    }
  }, [reload]);

  /** Saves a waiting move now (the Undo window is cut short). */
  const flush = useCallback(() => {
    const move = pendingRef.current;
    if (!move) return;
    pendingRef.current = null;
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    // From here the move is being saved: Undo is no longer offered.
    setToast({ kind: "saving", text: `Saving: ${move.group.label} to ${move.toFieldName}…` });
    void save(move);
  }, [save]);

  const startPending = useCallback((move: Pending) => {
    flush(); // only one move waits at a time
    pendingRef.current = move;
    setPending(move);
    setToast({ kind: "pending", text: `Moving ${move.group.label} to ${move.toFieldName}` });
    timerRef.current = window.setTimeout(flush, UNDO_MS);
  }, [flush]);

  const undo = useCallback(() => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    pendingRef.current = null;
    setPending(null);
    setToast(null);
  }, []);

  // Leaving the page or the app saves a waiting move rather than losing it.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  // Saved and error notes clear themselves.
  useEffect(() => {
    if (!toast || toast.kind === "pending" || toast.kind === "saving") return;
    const t = window.setTimeout(() => setToast((current) => (current === toast ? null : current)), toast.kind === "error" ? 7000 : 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // --- Asking before a move --------------------------------------------------------------------
  const askToMove = useCallback((group: CattleMapGroup, toFieldId: string) => {
    const target = fieldsOnMap.find((field) => field.id === toFieldId);
    if (!target || group.currentFieldId === toFieldId) return;
    setMenuGroupId(null);
    setWhen(toLocalDateTimeInput(new Date()));
    setWhenProblem(null);
    setConfirm({ group, toFieldId, toFieldName: target.name });
  }, [fieldsOnMap]);

  function confirmMove() {
    if (!confirm) return;
    const at = fromLocalDateTimeInput(when);
    const problem = moveTimeProblem(at, confirm.group, new Date());
    if (problem || !at) { setWhenProblem(problem ?? "Pick the date and time of the move."); return; }
    setConfirm(null);
    startPending({ group: confirm.group, toFieldId: confirm.toFieldId, toFieldName: confirm.toFieldName, movedAt: at.toISOString() });
  }

  // --- Dragging ----------------------------------------------------------------------------------
  const targetAt = useCallback((x: number, y: number) => {
    if (!map) return undefined;
    const rect = map.getContainer().getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return undefined;
    // Over a control floating on the map (the view switch, the strip, a caption) is not over a field.
    const hit = typeof document.elementFromPoint === "function" ? document.elementFromPoint(x, y) : null;
    if (hit && !map.getCanvasContainer().contains(hit)) return undefined;
    const ll = map.unproject([x - rect.left, y - rect.top]);
    return fieldAtPoint(fields, ll);
  }, [map, fields]);

  const press = usePressAndHold({
    onTap: (group) => setMenuGroupId(group.id),
    onLift: (group, x, y) => {
      map?.dragPan.disable();
      map?.touchZoomRotate.disable();
      const target = targetAt(x, y);
      setDrag({ group, x, y, targetFieldId: target?.id, targetFieldName: target?.name });
    },
    onDrag: (x, y) => {
      const target = targetAt(x, y);
      setDrag((d) => (d ? { ...d, x, y, targetFieldId: target?.id, targetFieldName: target?.name } : d));
    },
    onDrop: (x, y) => {
      map?.dragPan.enable();
      map?.touchZoomRotate.enable();
      const target = targetAt(x, y);
      const dropped = drag?.group;
      setDrag(null);
      // Let go between fields, off the map, or back on the same field: nothing happens.
      if (dropped && target && target.id !== dropped.currentFieldId) askToMove(dropped, target.id);
    },
    onCancel: () => {
      map?.dragPan.enable();
      map?.touchZoomRotate.enable();
      setDrag(null);
    },
  });

  // Leaving mid-drag hands the map's own dragging and zooming back.
  const draggingRef = useRef(false);
  useEffect(() => { draggingRef.current = Boolean(drag); }, [drag]);
  useEffect(() => () => {
    if (draggingRef.current && map) { map.dragPan.enable(); map.touchZoomRotate.enable(); }
  }, [map]);

  // The field under a dragged group is outlined on the map.
  useEffect(() => {
    if (!map) return;
    const ensure = () => {
      if (map.getSource(DROP_SRC)) return;
      map.addSource(DROP_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: `${DROP_SRC}-line`, type: "line", source: DROP_SRC, paint: { "line-color": "#e3c77e", "line-width": 4 } });
    };
    try { ensure(); } catch { return; }
    const target = drag?.targetFieldId ? fieldsOnMap.find((field) => field.id === drag.targetFieldId) : undefined;
    const ok = target && target.id !== drag?.group.currentFieldId;
    (map.getSource(DROP_SRC) as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: target && ok ? [{ type: "Feature", properties: {}, geometry: target.polygon }] : [],
    });
  }, [map, drag?.targetFieldId, drag?.group.currentFieldId, fieldsOnMap]);

  // --- Markers on the map ------------------------------------------------------------------------
  const markerKey = useMemo(() => [...placement.byField.entries()].map(([fieldId, row]) => `${fieldId}:${row.map((g) => g.id).join(",")}`).join("|"), [placement]);
  useEffect(() => {
    if (!map || !enabled) {
      setMarkerEls([]); // eslint-disable-line react-hooks/set-state-in-effect -- markers follow the map's lifetime
      return;
    }
    let cancelled = false;
    const markers: mapboxgl.Marker[] = [];
    // Loaded on demand: the library is already on the page with the map, and tests never need it.
    void import("mapbox-gl").then(({ default: mapbox }) => {
      if (cancelled) return;
      const made: Array<{ key: string; group: CattleMapGroup; el: HTMLElement }> = [];
      for (const field of fieldsOnMap) {
        const row = placement.byField.get(field.id) ?? [];
        row.forEach((group, index) => {
          const el = document.createElement("div");
          // A tap on a group must not count as a tap on open ground (which closes the field panel).
          el.addEventListener("click", (event) => event.stopPropagation());
          markers.push(new mapbox.Marker({ element: el, anchor: "top", offset: [0, 16 + index * 34] }).setLngLat(field.centroid).addTo(map));
          made.push({ key: `${field.id}:${group.id}`, group, el });
        });
      }
      setMarkerEls(made);
    });
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when which group is on which field changes (markerKey)
  }, [map, enabled, markerKey, fieldsOnMap]);

  if (!enabled) return null;

  const menuGroup = menuGroupId ? shownGroups.find((group) => group.id === menuGroupId) : undefined;
  const chip = (group: CattleMapGroup, onMap: boolean) => {
    // The handlers read refs only when the farmer touches the group, never while rendering.
    const handlers = press(group);
    return (
    <button
      type="button"
      {...handlers}
      aria-label={`${group.label}, ${formatNumber(group.headCount, 0)} head, ${cattleGroupWhereabouts(group)}. Tap for Move to, or press and hold to drag.`}
      className={cn(
        "flex min-h-9 select-none items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.35)] [-webkit-touch-callout:none] [touch-action:none]",
        onMap ? "border-white/70 bg-fr-v2-forest-deep/90 text-white" : "border-white/25 bg-black/45 text-white/90 backdrop-blur",
        drag?.group.id === group.id && "opacity-40",
        pending?.group.id === group.id && "border-fr-v2-straw",
      )}
    >
      <CowIcon className="size-4 shrink-0" aria-hidden />
      {groupChipText(group)}
    </button>
    );
  };

  return (
    <>
      {markerEls.map(({ key, group, el }) => createPortal(chip(group, true), el, key))}

      {placement.elsewhere.length > 0 ? (
        <div className="flex max-w-full flex-col gap-1.5" data-cattle-elsewhere>
          <p className="text-[11px] font-medium text-white/75 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">Not on a field · hold and drag onto one</p>
          <div className="flex flex-wrap gap-2 pb-1">
            {placement.elsewhere.map((group) => <span key={group.id}>{chip(group, false)}</span>)}
          </div>
        </div>
      ) : null}

      {mounted && drag ? createPortal(
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-[130%]" style={{ left: drag.x, top: drag.y }} aria-hidden>
          <div className="flex flex-col items-center gap-1">
            <span className="flex items-center gap-1.5 rounded-full border border-fr-v2-straw bg-fr-v2-forest-deep px-3 py-1.5 text-[13px] font-semibold text-white shadow-xl">
              <CowIcon className="size-4" /> {groupChipText(drag.group)}
            </span>
            <span className="rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
              {drag.targetFieldId && drag.targetFieldId !== drag.group.currentFieldId
                ? `→ ${drag.targetFieldName}`
                : drag.targetFieldId ? "Already here" : "Let go over a field"}
            </span>
          </div>
        </div>,
        document.body,
      ) : null}

      {mounted ? createPortal(<>
      <Sheet open={Boolean(menuGroup)} onClose={() => setMenuGroupId(null)} title={menuGroup ? `${menuGroup.label} · ${formatNumber(menuGroup.headCount, 0)} head` : "Group"}>
        {menuGroup ? (
          <div className="space-y-3">
            <p className="text-sm text-fr-v2-muted">
              Now {cattleGroupWhereabouts(menuGroup)}
              {menuGroup.currentSince ? ` since ${new Date(menuGroup.currentSince).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.
            </p>
            <p className="text-sm font-semibold text-fr-v2-graphite">Move to…</p>
            <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto">
              {fieldsOnMap.filter((field) => field.id !== menuGroup.currentFieldId).map((field) => (
                <li key={field.id}>
                  <button type="button" onClick={() => askToMove(menuGroup, field.id)} className="flex min-h-11 w-full items-center justify-between border border-fr-v2-cream-rule bg-white px-3 text-left text-sm font-semibold text-fr-v2-graphite hover:border-fr-v2-forest">
                    {field.name}
                    <ArrowRight className="size-4 text-fr-v2-muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm ? `Move ${confirm.group.label}?` : "Move group?"}>
        {confirm ? (
          <div className="space-y-4">
            <p className="text-sm text-fr-v2-graphite">
              {formatNumber(confirm.group.headCount, 0)} head from <strong>{confirm.group.currentFieldName ?? (confirm.group.system === "housed" ? "housing" : "no field")}</strong> to <strong>{confirm.toFieldName}</strong>.
            </p>
            <label className="block text-sm font-semibold text-fr-v2-graphite">
              When
              <input
                type="datetime-local"
                value={when}
                max={toLocalDateTimeInput(new Date())}
                onChange={(e) => { setWhen(e.target.value); setWhenProblem(null); }}
                className="mt-1 min-h-11 w-full border border-fr-v2-cream-rule bg-white px-3 text-base font-normal text-fr-v2-graphite"
              />
            </label>
            {whenProblem ? <p role="alert" className="text-sm text-fr-risk">{whenProblem}</p> : null}
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="min-h-11 flex-1 border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-v2-graphite">Cancel</button>
              <button type="button" onClick={confirmMove} className="min-h-11 flex-1 bg-fr-v2-forest text-sm font-semibold text-white">Move</button>
            </div>
          </div>
        ) : null}
      </Sheet>
      </>, document.body) : null}

      {mounted && toast ? createPortal(
        <div role="status" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-[75] mx-auto flex max-w-md items-center justify-between gap-3 bg-fr-v2-forest-deep px-4 py-3 text-sm text-white shadow-2xl lg:bottom-6">
          <span className={cn(toast.kind === "error" && "text-fr-v2-clay-tint")}>{toast.text}</span>
          {toast.kind === "pending" ? (
            <button type="button" onClick={undo} className="min-h-10 shrink-0 bg-fr-v2-straw px-4 text-sm font-semibold text-fr-v2-forest-deep">Undo</button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
