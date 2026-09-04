/**
 * Farm Return Next — GPS Job Mode campaign, Phase 2/5 bridge: wires the
 * pure `src/domain/gps-activity-detection.ts` start detector to a real
 * `LocationTrackingProvider`'s Farm Awareness stream
 * (`startFarmAwareness` has existed since Checkpoint 3 but had no real
 * caller anywhere in this app until this module).
 *
 * Deliberately NOT domain logic — this is the thin, stateful, browser-
 * facing wiring layer `job-session-lifecycle.ts`'s own header comment
 * describes the boundary for: every real detection decision still lives
 * in the pure `advanceStartDetection` reducer; this module's only job is
 * to feed it real Farm Awareness samples and hold the resulting state
 * for a React consumer, exactly the same "provider in, pure reducer,
 * state out" shape `ActiveJobSessionView.tsx` already uses for Active
 * Tracking.
 *
 * **Never persists anything** — see `gps-activity-detection.ts`'s own
 * header comment and `docs/farm-return-next/IMPLEMENTATION_LOG.md`'s GPS
 * Job Mode implementation note for the disclosed reasoning: a candidate
 * lives only in memory until a farmer actually confirms it, at which
 * point a real `job_sessions` row begins and this controller's own job
 * for that activity is finished.
 */
import {
  advanceStartDetection,
  IDLE_GPS_ACTIVITY_START_STATE,
  type GpsActivityDetectionConfig,
  type GpsActivityFieldRef,
  type GpsActivityStartState,
} from "@/domain/gps-activity-detection";
import type { LocationTrackingProvider, LocationPosition } from "./location-tracking-provider";

export interface GpsActivityCandidateController {
  /** Starts Farm Awareness (a no-op if already running, or if the
   * platform genuinely can't support it — mirrors
   * `LocationTrackingProvider.startFarmAwareness`'s own honesty
   * contract: never claims a capability the adapter doesn't report). */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Returns detection to `IDLE_GPS_ACTIVITY_START_STATE` — the real
   * caller-driven "start a fresh detection cycle" action, needed after a
   * farmer dismisses a candidate or confirms one (a new job session now
   * owns that field/time). A genuinely `"expired"` cycle (an ambiguous
   * drive-past that never settled) is already reset automatically,
   * internally, by this controller's own position handling — see its
   * own doc comment; a caller never needs to detect or react to
   * `"expired"` itself. Does not stop/restart Farm Awareness itself. */
  reset(): void;
  getState(): GpsActivityStartState;
}

export function createGpsActivityCandidateController(
  provider: LocationTrackingProvider,
  getFields: () => readonly GpsActivityFieldRef[],
  onStateChange: (state: GpsActivityStartState) => void,
  config?: GpsActivityDetectionConfig,
): GpsActivityCandidateController {
  let state: GpsActivityStartState = IDLE_GPS_ACTIVITY_START_STATE;
  let started = false;

  function setState(next: GpsActivityStartState): void {
    state = next;
    onStateChange(state);
  }

  function onPosition(position: LocationPosition): void {
    const sample = { lat: position.lat, lng: position.lng, accuracyMeters: position.accuracyMeters, recordedAt: position.recordedAt };
    const next = advanceStartDetection(state, sample, getFields(), config);
    // Codex audit HIGH (round 3, 2026-09-04): `"expired"` is a real,
    // intentionally terminal state for the *pure detector itself* — see
    // `advanceStartDetection`'s own doc comment — but nothing consuming
    // this controller ever called `reset()` on reaching it (only
    // confirm/dismiss did), so one ordinary ambiguous drive-past
    // permanently disabled automatic detection for the rest of the
    // session, not just that one cycle. `"expired"` has no farmer-facing
    // meaning of its own (`GpsActivityCandidateCard.tsx` only ever
    // renders on `"candidate_start"`) — auto-resetting here, invisibly,
    // is the correct behaviour for every real consumer, not a
    // per-caller responsibility to remember.
    setState(next.status === "expired" ? IDLE_GPS_ACTIVITY_START_STATE : next);
  }

  return {
    async start() {
      if (started) return;
      const capability = await provider.getCapability();
      if (!capability.farmAwarenessSupported) return;
      // Codex audit MEDIUM (round 4, 2026-09-04): `started` was set
      // before `startFarmAwareness` had actually succeeded — if the
      // provider genuinely rejects or throws (a real possibility this
      // interface's own contract doesn't rule out), every later
      // `start()` call became a permanent no-op (`started` already
      // `true`) with no way to recover short of `stop()`, which nothing
      // calling `start()` with `void` (no rejection handler) would ever
      // know to call. Fixed: `started` is only set once the real
      // subscription has genuinely succeeded, and reset on failure so a
      // later `start()` can genuinely retry.
      try {
        await provider.startFarmAwareness(onPosition);
        started = true;
      } catch (error) {
        started = false;
        throw error;
      }
    },
    async stop() {
      if (!started) return;
      started = false;
      await provider.stopFarmAwareness();
    },
    reset() {
      setState(IDLE_GPS_ACTIVITY_START_STATE);
    },
    getState() {
      return state;
    },
  };
}
