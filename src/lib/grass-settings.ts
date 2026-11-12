/**
 * Grass V2 settings kept on this device: the farmer's rotation length and
 * grazing residual (the target line's inputs), the wedge width mode, and whether
 * the first-time grass guide has been seen. Storage can be missing or blocked,
 * so every read and write is guarded; nothing here is farm data of record.
 */
import { useSyncExternalStore } from "react";
import type { GrazingTargets, WedgeWidthMode } from "@/domain/grass-wedge-target";

export const GRASS_SETTINGS_KEY = "farm-return:grass-v2:v1";

export interface GrassSettings {
  targets: GrazingTargets;
  /** When the targets were confirmed. */
  targetsSetAt?: string;
  widthMode: WedgeWidthMode;
  guideDone: boolean;
  /** The farmer reopened the guide this visit. */
  guideOpen: boolean;
}

const EMPTY: GrassSettings = { targets: {}, widthMode: "area", guideDone: false, guideOpen: false };
/** Before the browser's saved state is known (server render): guide hidden, nothing set. */
const SERVER: GrassSettings = { ...EMPTY, guideDone: true };

export function parseGrassSettings(raw: string | null): GrassSettings {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const t = (v.targets ?? {}) as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
    const rotationDays = num(t.rotationDays);
    const residualKgDmHa = num(t.residualKgDmHa);
    return {
      targets: { ...(rotationDays !== undefined ? { rotationDays } : {}), ...(residualKgDmHa !== undefined ? { residualKgDmHa } : {}) },
      ...(typeof v.targetsSetAt === "string" ? { targetsSetAt: v.targetsSetAt } : {}),
      widthMode: v.widthMode === "equal" ? "equal" : "area",
      guideDone: v.guideDone === true,
      guideOpen: false,
    };
  } catch {
    return EMPTY;
  }
}

let state: GrassSettings | null = null;
const listeners = new Set<() => void>();

function load(): GrassSettings {
  if (state) return state;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(GRASS_SETTINGS_KEY); } catch { raw = null; }
  state = parseGrassSettings(raw);
  return state;
}

function save(next: GrassSettings) {
  state = next;
  try {
    const { guideOpen: _open, ...kept } = next;
    void _open;
    window.localStorage.setItem(GRASS_SETTINGS_KEY, JSON.stringify(kept));
  } catch {
    // Blocked storage: the choice holds until the page reloads.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useGrassSettings(): GrassSettings {
  return useSyncExternalStore(subscribe, load, () => SERVER);
}

export function setGrazingTargets(targets: GrazingTargets) {
  save({ ...load(), targets, targetsSetAt: new Date().toISOString() });
}
export function setWedgeWidthMode(widthMode: WedgeWidthMode) {
  save({ ...load(), widthMode });
}
export function finishGrassGuide() {
  save({ ...load(), guideDone: true, guideOpen: false });
}
export function openGrassGuide() {
  save({ ...load(), guideOpen: true });
}

/** Tests only. */
export function resetGrassSettingsForTest() {
  state = null;
  listeners.clear();
}
