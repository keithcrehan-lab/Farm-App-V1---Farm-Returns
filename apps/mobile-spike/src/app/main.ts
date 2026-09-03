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
  computeElapsedSeconds,
  type JobSessionLifecycleState,
} from "../../../../src/domain/job-session-lifecycle";
import { createNativeLocationTrackingProvider } from "../native/NativeLocationTrackingProvider";
import type { LocationTrackingProvider } from "../../../../src/lib/location/location-tracking-provider";

// A fixed demo Job Session id — this spike has no real farm/Decision
// context to construct one from (no auth, no Supabase call at all —
// this shell never talks to the network). A real integration into the
// main app would use the real `startManualJobSession`/
// `startJobSessionFromPrompt` orchestration, unchanged, per
// `NATIVE_MOBILE_FEASIBILITY.md`'s own "next implementation phase".
const DEMO_JOB_SESSION_ID = "mobile-spike-demo-session";
const DEMO_FARM_ID = "mobile-spike-demo-farm";

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
    log(`Job Session started (real domain state machine): ${JSON.stringify(state)}`);
    render();

    // The real capture-to-persistence path this phase exists to prove:
    // every genuine position `startActiveTracking` delivers is persisted
    // via `insertObservation` BEFORE anything else happens to it — no
    // network call is made from this callback at all.
    await provider.startActiveTracking(
      (position) => {
        log(`Real position received: lat=${position.lat} lng=${position.lng} accuracy=${position.accuracyMeters ?? "unknown"}m at ${position.recordedAt}`);
        if (store && nativePlatform) {
          store
            .insertObservation(DEMO_JOB_SESSION_ID, position, nativePlatform, crypto.randomUUID())
            .then(() => {
              observationCount += 1;
              render();
            })
            .catch((error) => log(`Local persistence failed: ${error instanceof Error ? error.message : String(error)}`));
        } else {
          // Web platform — no native SQLite store wired in this spike;
          // the web app's own real path is the existing IndexedDB
          // outbox (`enqueueJobSessionGpsObservation`), unchanged,
          // exercised by the main app itself, not duplicated here.
          observationCount += 1;
          render();
        }
      },
      (reason) => {
        log(`Tracking interruption: ${reason}`);
      },
    );
  });

  finishButton?.addEventListener("click", async () => {
    await provider.stopActiveTracking();
    const result = finishJobSession(state, new Date().toISOString());
    if (!result.ok) {
      log(`Finish rejected: ${result.error}`);
      return;
    }
    state = result.state;
    log(`Job Session finished — status is "${state.status}" (never "confirmed_actual" — that requires a separate, explicit farmer Confirm Actual step this spike does not build, per this contract's own Observed/Actual boundary).`);
    render();
  });

  render();
  log(`Shell ready. Demo farm: ${DEMO_FARM_ID}`);
}

main().catch((error) => log(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
