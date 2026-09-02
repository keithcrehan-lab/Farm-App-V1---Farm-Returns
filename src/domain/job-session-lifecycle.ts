/**
 * Farm Return Next — Job Session lifecycle state machine (Checkpoint 3,
 * GPS Job Session + Confirm Actual contract,
 * `docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`).
 *
 * A pure, dependency-free state machine over `JobSessionStatus` — no
 * database access, no React, no clock reads except where a `nowIso` is
 * explicitly passed in (never `new Date()` inside this module, so every
 * function here is deterministic and trivially testable). Every mutation
 * this module exposes returns a `LifecycleResult`, never throws for an
 * illegal transition — a state machine's job is to say what's legal, not
 * to crash the caller for asking.
 *
 * **Why not `EngineOutcome<T>`** (`src/domain/evidence.ts`): that shape
 * exists for a scientific/regulatory *estimate* with a fail-closed
 * evidence classification (MEASURED/DERIVED/.../INSUFFICIENT) — a state
 * transition is not an estimate, it has no evidence tier to classify, so
 * forcing it through that shape would be a category error, not reuse.
 *
 * The critical product rule this module exists to enforce in code, not
 * just prose (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §2/§4): **Finish Job
 * never produces a confirmed Actual.** `finishJobSession` only ever
 * transitions to `"completed_estimated"` — there is no function in this
 * module, and must never be one, that takes an active/paused session
 * straight to `"confirmed_actual"`. That transition exists only via
 * `src/domain/job-actual.ts`'s `confirmJobSessionActual`, which requires
 * an explicit farmer-confirmed `Actual` payload as its input.
 */

export type JobSessionStatus =
  | "ready"
  | "active"
  | "paused"
  | "completed_estimated"
  | "confirmed_actual"
  | "cancelled";

export type JobSessionOrigin = "prompt" | "plan" | "manual" | "detected";

/** One continuous stretch of active tracking/work, in the session's own
 * clock. `endedAt` absent means still open (the session is currently
 * `"active"` and this is its current interval). Elapsed time is always
 * computed from this list (`computeElapsedSeconds` below), never stored
 * as a separately-maintained running total — one source of truth, no risk
 * of the two drifting apart. */
export interface ActiveInterval {
  startedAt: string;
  endedAt?: string;
}

/** A real, disclosed break in tracking evidence — `GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §10 ("never fabricate GPS positions... preserve a real evidence gap").
 * Distinct from a `paused` interval boundary (a farmer-initiated pause is
 * not an "interruption" — it is a deliberate, known state); this
 * represents tracking stopping for a reason the app did not choose
 * (backgrounding limits, connectivity loss, a force-kill) while the
 * session's own status still says `"active"`. */
export interface InterruptionGap {
  lastConfirmedAt: string;
  interruptedAt: string;
  nextConfirmedAt?: string;
  reason?: "app_backgrounded" | "connectivity_lost" | "app_terminated" | "unknown";
}

export interface JobSessionLifecycleState {
  status: JobSessionStatus;
  activeIntervals: ActiveInterval[];
  interruptionGaps: InterruptionGap[];
  cancelledReason?: string;
}

export type LifecycleResult =
  | { ok: true; state: JobSessionLifecycleState }
  | { ok: false; error: string };

/** The single frozen legal-transition table this whole module enforces —
 * mirrors `notifications_check_valid_transition`'s SQL trigger
 * (`supabase/migrations/20260901020000_notifications.sql`) as the
 * database-level twin of this exact logic (defense in depth: the same
 * legality is enforced both in this pure function, which the UI/
 * orchestration layer calls before ever attempting a write, and again,
 * independently, by a trigger inside Postgres — see
 * `supabase/migrations/20260902000000_job_sessions.sql`). Both tables must
 * be changed together if this ever changes. */
const LEGAL_TRANSITIONS: Record<JobSessionStatus, JobSessionStatus[]> = {
  ready: ["active", "cancelled"],
  active: ["paused", "completed_estimated", "cancelled"],
  paused: ["active", "completed_estimated", "cancelled"],
  completed_estimated: ["confirmed_actual", "cancelled"],
  confirmed_actual: [],
  cancelled: [],
};

export function canTransitionJobSessionStatus(from: JobSessionStatus, to: JobSessionStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

function transitionError(from: JobSessionStatus, to: JobSessionStatus): string {
  return `job-session-lifecycle: illegal transition ${from} -> ${to}`;
}

/**
 * Total elapsed active time across every closed interval, plus (if the
 * session is currently `"active"` and its last interval is still open)
 * the time from that interval's `startedAt` up to `nowIso`. A `"paused"`
 * session's elapsed time is exactly its closed intervals' sum — pausing
 * closes the current interval (see `pauseJobSession` below), so no
 * additional live computation is needed or performed for a paused
 * session, and none should be: passing a `nowIso` far in the future for a
 * paused session must not inflate its reported elapsed time.
 */
export function computeElapsedSeconds(state: Pick<JobSessionLifecycleState, "status" | "activeIntervals">, nowIso: string): number {
  const now = new Date(nowIso).getTime();
  let totalMs = 0;
  for (const interval of state.activeIntervals) {
    const start = new Date(interval.startedAt).getTime();
    const end = interval.endedAt ? new Date(interval.endedAt).getTime() : state.status === "active" ? now : start;
    totalMs += Math.max(0, end - start);
  }
  return Math.round(totalMs / 1000);
}

/** `ready` -> `active`. Opens the first active interval. */
export function startJobSession(state: JobSessionLifecycleState, nowIso: string): LifecycleResult {
  if (!canTransitionJobSessionStatus(state.status, "active")) {
    return { ok: false, error: transitionError(state.status, "active") };
  }
  return {
    ok: true,
    state: {
      ...state,
      status: "active",
      activeIntervals: [...state.activeIntervals, { startedAt: nowIso }],
    },
  };
}

/** `active` -> `paused`. Closes the current open interval — a farmer-
 * initiated pause, not an interruption gap (see `InterruptionGap`'s own
 * doc comment for the distinction). */
export function pauseJobSession(state: JobSessionLifecycleState, nowIso: string): LifecycleResult {
  if (!canTransitionJobSessionStatus(state.status, "paused")) {
    return { ok: false, error: transitionError(state.status, "paused") };
  }
  return {
    ok: true,
    state: {
      ...state,
      status: "paused",
      activeIntervals: closeOpenInterval(state.activeIntervals, nowIso),
    },
  };
}

/** `paused` -> `active`. Opens a new active interval — this session now
 * has multiple intervals, which `computeElapsedSeconds` already sums
 * correctly by construction. */
export function resumeJobSession(state: JobSessionLifecycleState, nowIso: string): LifecycleResult {
  if (!canTransitionJobSessionStatus(state.status, "active")) {
    return { ok: false, error: transitionError(state.status, "active") };
  }
  return {
    ok: true,
    state: {
      ...state,
      status: "active",
      activeIntervals: [...state.activeIntervals, { startedAt: nowIso }],
    },
  };
}

/**
 * `active`/`paused` -> `completed_estimated`. **This is the one function
 * this whole module exists to get right** — see this file's own header
 * comment. It never produces `"confirmed_actual"`, regardless of how
 * confident any caller might be that the job is genuinely finished; that
 * requires a separate, explicit farmer action
 * (`job-actual.ts`'s `confirmJobSessionActual`).
 */
export function finishJobSession(state: JobSessionLifecycleState, nowIso: string): LifecycleResult {
  if (!canTransitionJobSessionStatus(state.status, "completed_estimated")) {
    return { ok: false, error: transitionError(state.status, "completed_estimated") };
  }
  return {
    ok: true,
    state: {
      ...state,
      status: "completed_estimated",
      activeIntervals: closeOpenInterval(state.activeIntervals, nowIso),
    },
  };
}

/**
 * `ready`/`active`/`paused`/`completed_estimated` -> `cancelled`. First-
 * class terminal state for "did not happen" *before* a farmer ever
 * reaches Confirm Actual (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §4) — e.g.
 * started the wrong job, or a job genuinely never went ahead. Distinct
 * from confirming an Actual with `completionType: "did_not_happen"`
 * (`job-actual.ts`), which is for a farmer who *did* reach Confirm Actual
 * and is explicitly recording that nothing happened as the confirmed
 * fact (e.g. weather stopped play after Finish Job was pressed) — both
 * are real, honest end states; which one applies depends on whether the
 * farmer went through Confirm Actual or abandoned the session before it.
 */
export function cancelJobSession(state: JobSessionLifecycleState, nowIso: string, reason?: string): LifecycleResult {
  if (!canTransitionJobSessionStatus(state.status, "cancelled")) {
    return { ok: false, error: transitionError(state.status, "cancelled") };
  }
  return {
    ok: true,
    state: {
      ...state,
      status: "cancelled",
      activeIntervals: closeOpenInterval(state.activeIntervals, nowIso),
      cancelledReason: reason,
    },
  };
}

/**
 * Records a real tracking interruption (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §10) without changing `status` — an interruption is discovered evidence
 * about an already-active session, not a farmer-initiated transition.
 * Legal only while `"active"`: a paused/finished/cancelled session has no
 * live tracking to interrupt. Appends to `interruptionGaps`, never
 * mutates or removes an existing entry — the same append-only, never-
 * silently-lost discipline this whole contract applies everywhere else.
 */
export function recordInterruptionGap(
  state: JobSessionLifecycleState,
  gap: InterruptionGap,
): LifecycleResult {
  if (state.status !== "active") {
    return {
      ok: false,
      error: `job-session-lifecycle: cannot record an interruption gap while status is "${state.status}" (only "active" sessions have live tracking to interrupt)`,
    };
  }
  return { ok: true, state: { ...state, interruptionGaps: [...state.interruptionGaps, gap] } };
}

function closeOpenInterval(intervals: ActiveInterval[], nowIso: string): ActiveInterval[] {
  if (intervals.length === 0) return intervals;
  const last = intervals[intervals.length - 1];
  if (last.endedAt !== undefined) return intervals; // already closed — nothing to do
  return [...intervals.slice(0, -1), { ...last, endedAt: nowIso }];
}

export const JOB_SESSION_LIFECYCLE_VERSION = "job_session_lifecycle_v1.0.0";
