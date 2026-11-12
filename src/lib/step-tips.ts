/**
 * Step-by-step tips: one short pop-up per step, shown the first time the farmer
 * reaches it. "Got it" closes that tip for good, "Skip all tips" turns every tip
 * off, and the "?" button on a screen brings its tip back.
 *
 * What has been closed is remembered on this device only (it is a per-person
 * convenience, not farm data). Storage can be missing or blocked, so every read
 * and write is guarded and the tips simply show again if nothing was kept.
 */

export const STEP_TIPS_STORAGE_KEY = "farm-return:step-tips:v1";

export interface StepTipState {
  /** Tips closed with "Got it". */
  dismissed: readonly string[];
  /** "Skip all tips" was chosen. */
  skipAll: boolean;
  /** Tips asked for again with "?" (this visit only). */
  asked: readonly string[];
}

/** Before the browser's saved state is known (server render), nothing shows. */
export const STEP_TIPS_HIDDEN: StepTipState = { dismissed: [], skipAll: true, asked: [] };

export function isStepTipVisible(state: StepTipState, id: string): boolean {
  if (state.asked.includes(id)) return true;
  return !state.skipAll && !state.dismissed.includes(id);
}

export function parseStepTipState(raw: string | null): StepTipState {
  if (!raw) return { dismissed: [], skipAll: false, asked: [] };
  try {
    const value: unknown = JSON.parse(raw);
    const record = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const dismissed = Array.isArray(record.dismissed) ? record.dismissed.filter((id): id is string => typeof id === "string").slice(0, 200) : [];
    return { dismissed, skipAll: record.skipAll === true, asked: [] };
  } catch {
    return { dismissed: [], skipAll: false, asked: [] };
  }
}

let state: StepTipState | null = null;
const listeners = new Set<() => void>();

function load(): StepTipState {
  if (state) return state;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STEP_TIPS_STORAGE_KEY);
  } catch {
    raw = null;
  }
  state = parseStepTipState(raw);
  return state;
}

function save(next: StepTipState) {
  state = next;
  try {
    window.localStorage.setItem(STEP_TIPS_STORAGE_KEY, JSON.stringify({ dismissed: next.dismissed, skipAll: next.skipAll }));
  } catch {
    // Storage is blocked or full: the choice still holds until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeStepTips(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStepTipState(): StepTipState {
  return load();
}

export function getServerStepTipState(): StepTipState {
  return STEP_TIPS_HIDDEN;
}

/** "Got it": close this tip and don't show it again. */
export function dismissStepTip(id: string) {
  const current = load();
  save({
    dismissed: current.dismissed.includes(id) ? current.dismissed : [...current.dismissed, id],
    skipAll: current.skipAll,
    asked: current.asked.filter((asked) => asked !== id),
  });
}

/** "Skip all tips": close every tip, now and on later steps. */
export function skipAllStepTips() {
  const current = load();
  save({ dismissed: current.dismissed, skipAll: true, asked: [] });
}

/** "?": show this step's tip again. */
export function askForStepTip(id: string) {
  const current = load();
  if (current.asked.includes(id)) return;
  save({ dismissed: current.dismissed, skipAll: current.skipAll, asked: [...current.asked, id] });
}

/** Tests only: forget the in-memory copy so the next read comes from storage. */
export function resetStepTipsForTest() {
  state = null;
  listeners.clear();
}
