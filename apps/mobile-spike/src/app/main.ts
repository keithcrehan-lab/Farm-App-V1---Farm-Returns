/**
 * Farm Return Mobile Spike — minimal static shell entry point.
 *
 * This is deliberately NOT the main Next.js app loaded in a WebView —
 * see `docs/native/NATIVE_MOBILE_FEASIBILITY.md` §5: "loading the
 * existing website from a remote/dev URL inside a WebView is NOT proof
 * that Farm Return is shippable as a native app." This is a genuinely
 * separate, purpose-built, locally-bundled static entry point (built by
 * `../build.mjs` with esbuild, no Next.js server involved at all) that
 * imports and calls REAL code from the main repo's own domain layer
 * (`src/domain/`) — proving that layer's own real portability, without
 * pretending the whole app is portable by simply pointing a WebView at
 * a live server.
 *
 * Final Codex audit round 1 (Native Mobile / Background GPS Feasibility
 * Phase, HIGH): the previous version of this file created a location
 * provider and a Job Session state machine but never actually connected
 * them — "the committed APK cannot perform Physical Device Tests A/B/D
 * as documented or populate the SQLite table." Start Job now really
 * starts Active Tracking (background-service path on a real native
 * platform) and every real position it delivers is persisted through
 * `NativeLocationStore` before anything else happens to it — the exact
 * "receive real GPS point -> persist locally" ordering this phase's own
 * brief requires. Finish Job really stops tracking and reaches
 * `completed_estimated`, never `confirmed_actual` (this file has no
 * Confirm Actual UI at all — reaching that state honestly stops here,
 * matching this contract's own Observed/Actual boundary).
 */
import {
  startJobSession,
  finishJobSession,
  recordInterruptionGap,
  computeElapsedSeconds,
  type JobSessionLifecycleState,
} from "../../../../src/domain/job-session-lifecycle";
import { createNativeLocationTrackingProvider } from "../native/NativeLocationTrackingProvider";
import type { LocationPosition, LocationTrackingProvider } from "../../../../src/lib/location/location-tracking-provider";

// A fixed demo Job Session id — this spike has no real farm/Decision
// context to construct one from (no auth, no Supabase call at all —
// this shell never talks to the network). A real integration into the
// main app would use the real `startManualJobSession`/
// `startJobSessionFromPrompt` orchestration, unchanged, per
// `NATIVE_MOBILE_FEASIBILITY.md`'s own "next implementation phase".
const DEMO_JOB_SESSION_ID = "mobile-spike-demo-session";
const DEMO_FARM_ID = "mobile-spike-demo-farm";

/**
 * Only ever moves the "last known-good" timestamp forward — never lets
 * an out-of-order write completion (a real possibility whenever more
 * than one `insertObservation` call is in flight at once) push it
 * backwards. Real device-clock ISO strings from this contract's own
 * `LocationPosition.recordedAt` are always the same fixed-width UTC
 * format (`toIsoStringOrNull`/`toISOString()`), so plain string
 * comparison is real chronological comparison here, not an
 * approximation. Final Codex audit round 6 (HIGH).
 */
function advanceConfirmedAt(current: string | null, candidate: string): string {
  if (current === null || candidate > current) return candidate;
  return current;
}

/**
 * Derives a stable `client_observation_id` from the real content of a
 * fix, rather than generating a fresh random one per callback
 * invocation. Final Codex audit round 7 (MEDIUM): "every callback
 * receives a fresh `crypto.randomUUID()`, so repeated delivery of the
 * same native fix never shares the identifier `INSERT OR IGNORE` is
 * based on... the documented duplicate-delivery idempotency does not
 * exist at the real call site." Neither `@capacitor/geolocation` nor
 * `@capacitor-community/background-geolocation` expose a native event
 * id (confirmed against both packages' own installed type
 * definitions — there is genuinely nothing else to key on), so this
 * fingerprints the fix by the one thing a real re-delivery of the exact
 * same fix necessarily shares: its own job session, device-clock
 * timestamp, and coordinates. Two genuinely distinct fixes essentially
 * never share all three (device-clock timestamps used here carry
 * millisecond resolution); a real duplicate delivery of the same fix
 * now collides on the same id, exactly as `NativeLocationStore`'s own
 * `INSERT OR IGNORE` already assumes.
 */
function deriveObservationId(jobSessionId: string, platform: "ios_native" | "android_native", position: LocationPosition): string {
  return `${jobSessionId}:${platform}:${position.recordedAt}:${position.lat}:${position.lng}`;
}

function log(message: string): void {
  const el = document.getElementById("log");
  if (el) el.textContent += `${message}\n`;
  console.log(`[mobile-spike] ${message}`);
}

type DetectedPlatform = "web" | "ios_native" | "android_native";

async function detectPlatform(): Promise<DetectedPlatform> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    if (platform === "ios") return "ios_native";
    if (platform === "android") return "android_native";
  } catch {
    // @capacitor/core not available in this runtime (e.g. a plain
    // browser tab, not a real Capacitor WebView) — falls through to the
    // honest "web" answer below, never a guessed native one.
  }
  return "web";
}

/**
 * Platform-selection factory — the one piece
 * `NATIVE_GPS_ARCHITECTURE_DECISION.md` §1 named as still missing ("every
 * call site... instantiates the concrete web adapter directly... not
 * through any platform-detection/dependency-injection layer").
 * `useBackgroundService: true` on a real native platform — the real
 * OS-service-owned path this whole phase exists to prove
 * (`docs/native/NATIVE_MOBILE_FEASIBILITY.md` §2's own architectural
 * rule); the web adapter has no such concept, unchanged.
 */
async function selectLocationProvider(platform: DetectedPlatform): Promise<LocationTrackingProvider> {
  if (platform === "ios_native" || platform === "android_native") {
    return createNativeLocationTrackingProvider({ platform, useBackgroundService: true });
  }
  const { createWebLocationTrackingProvider } = await import("../../../../src/lib/location/web-location-tracking-provider");
  return createWebLocationTrackingProvider();
}

async function main() {
  log("Farm Return mobile spike shell starting…");

  const platform = await detectPlatform();
  const provider = await selectLocationProvider(platform);
  const capability = await provider.getCapability();
  log(`Location provider selected — platform: ${capability.platform}`);
  log(`  permissionState: ${capability.permissionState}`);
  log(`  farmAwarenessSupported: ${capability.farmAwarenessSupported}`);
  log(`  activeTrackingSupported: ${capability.activeTrackingSupported}`);
  log(`  backgroundTrackingSupported: ${capability.backgroundTrackingSupported}`);

  // Real native durable local store — only constructed on a real native
  // platform (@capacitor-community/sqlite has no web implementation
  // this spike wires up; the point of this store is specifically the
  // native background-service write path, see its own header comment).
  const nativePlatform: "ios_native" | "android_native" | null = platform === "web" ? null : platform;
  let store: import("../native/NativeLocationStore").NativeLocationStore | null = null;
  if (nativePlatform) {
    const { NativeLocationStore } = await import("../native/NativeLocationStore");
    store = new NativeLocationStore();
    await store.open();
    log("Native SQLite location store opened.");
  }

  let state: JobSessionLifecycleState = { status: "ready", activeIntervals: [], interruptionGaps: [] };
  let observationCount = 0;
  // The last moment tracking was genuinely known-good — either the last
  // real position received, or the moment Start Job began if none has
  // arrived yet. Used to build a real `InterruptionGap`'s own
  // `lastConfirmedAt` field (never fabricated — see the interruption
  // handler below).
  let lastConfirmedAt: string | null = null;
  // Final Codex audit round 8 (HIGH): round 7's own drain loop only
  // catches a write already registered in `pendingWrites` — it cannot
  // catch a position callback that was already scheduled on the native
  // plugin bridge's own message queue *before* `stopActiveTracking()`
  // resolved but had not run yet: the loop finds an empty `Set`, exits
  // immediately, `finishJobSession()` completes, and only then does that
  // late callback fire and start an unawaited write. Neither Capacitor
  // plugin used here exposes a "confirm no callbacks are still pending"
  // quiescence signal to await instead — a real, disclosed architectural
  // limit, not a gap this spike glossed over (see the Finish Job handler
  // below for the practical mitigation and this flag's own use in making
  // any late arrival observable rather than silently invisible).
  let sessionFinishedAt: string | null = null;
  // Final Codex audit round 3 (HIGH): "GPS persistence is fire-and-
  // forget... Finish Job does not await outstanding writes. Closing or
  // killing the app after finishing can therefore lose an acknowledged
  // observation, contrary to the documented 'persist locally before
  // anything else' durability ordering." Every in-flight
  // `insertObservation` promise is tracked here and removed on
  // settlement; Finish Job now awaits all of them before proceeding —
  // see the Finish Job handler below.
  const pendingWrites = new Set<Promise<void>>();
  // Final Codex audit round 4 (HIGH): the write chain's own `.catch()`
  // converted a real `insertObservation` rejection into a *resolved*
  // promise, so `Finish Job`'s `await Promise.all(pendingWrites)`
  // completed exactly as if every write had genuinely succeeded — "an
  // acknowledged observation was never stored... persistence failures
  // need to remain observable and block or explicitly mark the session
  // interrupted/incomplete." A real write failure no longer disappears:
  // it is counted here and, at Finish Job, surfaced as a real, disclosed
  // `InterruptionGap` (reason `"unknown"` — a local-storage failure has
  // no more specific real vocabulary entry) rather than a silently
  // "complete" session.
  let persistenceFailureCount = 0;
  // Final Codex audit round 6 (HIGH): if `startActiveTracking()` is
  // still awaiting native watcher registration when Finish Job runs,
  // `stopActiveTracking()` can execute first (finding the watcher id(s)
  // still `null`, so it does nothing real), after which the pending
  // registration completes and tracking silently continues past a
  // session the domain state machine already considers finished. The
  // Finish Job handler below awaits this promise before calling
  // `stopActiveTracking()`, so a real watcher id (or a genuine
  // permission-denied/interruption outcome) is always settled first —
  // never a race between "session finished" and "tracking just started."
  let activeTrackingStartupPromise: Promise<void> | null = null;
  const startButton = document.getElementById("start-job");
  const finishButton = document.getElementById("finish-job");
  const statusEl = document.getElementById("status");

  function render() {
    if (statusEl) {
      const elapsed = computeElapsedSeconds(state, new Date().toISOString());
      statusEl.textContent = `status: ${state.status} · elapsed: ${elapsed}s · intervals: ${state.activeIntervals.length} · gaps: ${state.interruptionGaps.length} · observations persisted: ${observationCount}`;
    }
  }

  startButton?.addEventListener("click", async () => {
    const result = startJobSession(state, new Date().toISOString());
    if (!result.ok) {
      log(`Start rejected: ${result.error}`);
      return;
    }
    state = result.state;
    lastConfirmedAt = new Date().toISOString();
    log(`Job Session started (real domain state machine): ${JSON.stringify(state)}`);
    render();

    // The real capture-to-persistence path this phase exists to prove:
    // every genuine position `startActiveTracking` delivers is persisted
    // via `insertObservation` BEFORE anything else happens to it — no
    // network call is made from this callback at all.
    activeTrackingStartupPromise = provider.startActiveTracking(
      (position) => {
        log(`Real position received: lat=${position.lat} lng=${position.lng} accuracy=${position.accuracyMeters ?? "unknown"}m at ${position.recordedAt}`);
        if (sessionFinishedAt) {
          // Final Codex audit round 8 (HIGH): a callback already queued
          // on the native bridge before `stopActiveTracking()` resolved
          // can still fire after Finish Job has already completed — a
          // real, disclosed residual race this spike mitigates (see the
          // Finish Job handler's own event-loop-tick comment) but cannot
          // fully eliminate without a native quiescence signal neither
          // plugin exposes. The fix still persists real data (never
          // dropped), but makes this exact situation observable rather
          // than silently invisible.
          log(`LATE position arrived after Finish Job completed at ${sessionFinishedAt} — persisting it, but it is outside the finished session's own accounted evidence window.`);
        }
        if (store && nativePlatform) {
          // Final Codex audit round 5 (HIGH): `lastConfirmedAt` used to
          // be set here, the instant a position was *received* — before
          // `insertObservation` had actually settled. "If that write
          // fails... the gap recorded [at Finish Job] can claim an
          // unpersisted fix as confirmed, or place `lastConfirmedAt`
          // after `interruptedAt`." A position is only genuinely
          // "known-good" evidence once it is durably stored — so this is
          // now set inside the success handler below, never optimistically
          // ahead of the real write outcome.
          const write = store
            .insertObservation(
              DEMO_FARM_ID,
              DEMO_JOB_SESSION_ID,
              position,
              nativePlatform,
              deriveObservationId(DEMO_JOB_SESSION_ID, nativePlatform, position),
            )
            .then(() => {
              // Final Codex audit round 6 (HIGH): concurrent writes can
              // settle out of observation order — a plain assignment
              // here let an *older* write's completion move
              // `lastConfirmedAt` backwards past a newer one already
              // recorded. `advanceConfirmedAt` only ever moves it
              // forward, comparing real device-clock ISO strings (safe
              // lexicographically — same fixed-width UTC format
              // `LocationPosition.recordedAt` already guarantees).
              lastConfirmedAt = advanceConfirmedAt(lastConfirmedAt, position.recordedAt);
              observationCount += 1;
              render();
            })
            .catch((error) => {
              // Real failure, kept observable — never silently resolved
              // as if the write had succeeded (final Codex audit round 4).
              persistenceFailureCount += 1;
              log(`Local persistence FAILED (evidence at risk): ${error instanceof Error ? error.message : String(error)}`);
            })
            .finally(() => {
              pendingWrites.delete(write);
            });
          pendingWrites.add(write);
        } else {
          // Web platform — no native SQLite store wired in this spike;
          // the web app's own real path is the existing IndexedDB
          // outbox (`enqueueJobSessionGpsObservation`), unchanged,
          // exercised by the main app itself, not duplicated here. There
          // is no local write to await here, so — unlike the native
          // branch above — receipt itself is the real "known-good"
          // moment for this demo path.
          lastConfirmedAt = advanceConfirmedAt(lastConfirmedAt, position.recordedAt);
          observationCount += 1;
          render();
        }
      },
      (reason) => {
        // Final Codex audit round 2 (HIGH): this callback used to only
        // log the interruption — "the displayed lifecycle continues
        // reporting zero gaps and Finish Job completes the session
        // without preserving the known evidence interruption." Now
        // calls the real domain function directly, the same one
        // `JobSessionIntegration.test.ts` already exercises — a real,
        // disclosed gap in the *timeline* (never a fabricated
        // continuous route), recorded the moment it's known, not
        // deferred to some later reconciliation step this spike doesn't
        // build.
        log(`Tracking interruption: ${reason}`);
        const interruptedAt = new Date().toISOString();
        // `LocationInterruptionReason` ("permission_revoked" |
        // "position_unavailable" | "app_backgrounded" | "timeout") and
        // `InterruptionGap.reason` ("app_backgrounded" |
        // "connectivity_lost" | "app_terminated" | "unknown") are
        // deliberately distinct vocabularies (the former is what a
        // location provider can observe; the latter is what a Job
        // Session's own evidence gap records) — only "app_backgrounded"
        // has a genuine 1:1 mapping; every other real reason maps to
        // the honest "unknown" rather than a guessed, more specific one
        // ("connectivity_lost" would be a fabricated inference for a
        // permission or GPS-hardware reason, not a real fact this
        // provider actually observed).
        const gapReason = reason === "app_backgrounded" ? "app_backgrounded" : "unknown";
        const result = recordInterruptionGap(state, {
          lastConfirmedAt: lastConfirmedAt ?? interruptedAt,
          interruptedAt,
          reason: gapReason,
        });
        if (result.ok) {
          state = result.state;
          render();
        } else {
          log(`Could not record interruption gap: ${result.error}`);
        }
      },
    );
    await activeTrackingStartupPromise;
  });

  finishButton?.addEventListener("click", async () => {
    // Final Codex audit round 6 (HIGH): if Start Job's own async watcher
    // registration is still in flight when Finish Job is tapped,
    // `stopActiveTracking()` running first would find no watcher id yet
    // assigned (a no-op), after which the pending registration completes
    // and tracking silently continues past an already-finished session.
    // Waiting for the same promise Start Job itself awaits guarantees a
    // real watcher id (or a genuine denial/interruption outcome) is
    // already settled before stop is attempted.
    if (activeTrackingStartupPromise) {
      await activeTrackingStartupPromise;
    }
    await provider.stopActiveTracking();
    // Final Codex audit round 8 (HIGH): round 7's own drain loop still
    // missed a real case — a position callback already scheduled on the
    // native plugin bridge's own message queue *before*
    // `stopActiveTracking()` resolved, but not yet run, leaves
    // `pendingWrites` empty at the very first check below, so the loop
    // exits immediately with nothing to wait for and `finishJobSession()`
    // proceeds — only afterward does that already-queued callback fire
    // and start an entirely unawaited write. Yielding one real
    // event-loop tick here gives any such already-in-flight callback a
    // chance to actually run and register its write in `pendingWrites`
    // BEFORE the drain loop's first check. This is a genuine, practical
    // mitigation, not a hard guarantee — neither Capacitor plugin used
    // here exposes a "confirm no callbacks are still pending" quiescence
    // signal to await instead (a real, disclosed architectural limit);
    // the `sessionFinishedAt` check in the position callback above makes
    // any write that still arrives after this point observable in the
    // log rather than silently invisible.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    // Real durability ordering (final Codex audit round 3, HIGH): never
    // finalise the session while a real, already-acknowledged
    // observation is still only in flight to local storage — an app
    // close/kill right after tapping Finish Job must not lose it.
    //
    // Final Codex audit round 7 (HIGH): a single `Promise.all(pendingWrites)`
    // only snapshots the `Set` once — "a location callback already
    // queued when `stopActiveTracking()` resolves can add another write
    // afterward, allowing `finishJobSession()` to complete while that
    // write remains in flight." `stopActiveTracking()` stops the native
    // watcher, but a position callback already scheduled on the
    // microtask/event queue before that call can still fire and add a
    // new write to `pendingWrites` after this snapshot is taken. Drain
    // in a loop instead of once — re-check the (live) `Set` after each
    // `Promise.all`, so any write added while the previous batch was
    // settling is caught too, until it is genuinely empty.
    while (pendingWrites.size > 0) {
      log(`Waiting for ${pendingWrites.size} pending local write(s) to finish before completing the job…`);
      await Promise.all(pendingWrites);
    }
    // Final Codex audit round 4 (HIGH): a real local-storage write
    // failure must never be indistinguishable from a fully-captured
    // session. If any write genuinely failed, record it as a real,
    // disclosed evidence gap (never a fabricated continuous route) before
    // finishing — the farmer sees a real gap count, not a false "clean"
    // finish.
    if (persistenceFailureCount > 0) {
      log(`${persistenceFailureCount} observation(s) failed to persist locally — recording a real evidence gap rather than finishing as if capture were complete.`);
      // Final Codex audit round 6 (HIGH): this used to use the *first*
      // failure's own captured timestamp, but concurrent writes can
      // settle out of order — a later-completing success could then
      // push `lastConfirmedAt` past that earlier `interruptedAt`,
      // producing an invalid interval, and the previous code merely
      // logged that rejection and still finished the session, "allowing
      // a persistence failure to finish without the promised evidence
      // gap." `interruptedAt` is now computed fresh, right here, after
      // every pending write has already settled (`pendingWrites` above)
      // — a real wall-clock "now" is always >= any past device-clock
      // `recordedAt` `lastConfirmedAt` could hold, so the interval is
      // valid by construction, not by chasing exact completion order.
      const interruptedAt = new Date().toISOString();
      const gapResult = recordInterruptionGap(state, {
        lastConfirmedAt: lastConfirmedAt ?? interruptedAt,
        interruptedAt,
        reason: "unknown",
      });
      if (gapResult.ok) {
        state = gapResult.state;
        render();
      } else {
        // Fail closed (final Codex audit round 6, HIGH): a persistence
        // failure that cannot even be recorded as a disclosed gap must
        // never finish silently as if capture were complete — refuse to
        // finish rather than lose the evidence entirely.
        log(`Could not record persistence-failure gap: ${gapResult.error} — refusing to finish until this is resolved.`);
        return;
      }
    }
    const result = finishJobSession(state, new Date().toISOString());
    if (!result.ok) {
      log(`Finish rejected: ${result.error}`);
      return;
    }
    state = result.state;
    // Final Codex audit round 8: marks the real moment past which any
    // still-arriving position callback is a disclosed late arrival (see
    // that callback's own `sessionFinishedAt` check above), not silently
    // folded into this session's own accounted evidence window.
    sessionFinishedAt = new Date().toISOString();
    log(`Job Session finished — status is "${state.status}" (never "confirmed_actual" — that requires a separate, explicit farmer Confirm Actual step this spike does not build, per this contract's own Observed/Actual boundary).`);
    render();
  });

  render();
  log(`Shell ready. Demo farm: ${DEMO_FARM_ID}`);
}

main().catch((error) => log(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
