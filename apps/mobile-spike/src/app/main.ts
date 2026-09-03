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
 */
import { startJobSession, computeElapsedSeconds, type JobSessionLifecycleState } from "../../../../src/domain/job-session-lifecycle";
import { createNativeLocationTrackingProvider } from "../native/NativeLocationTrackingProvider";
import type { LocationTrackingProvider } from "../../../../src/lib/location/location-tracking-provider";

function log(message: string): void {
  const el = document.getElementById("log");
  if (el) el.textContent += `${message}\n`;
  console.log(`[mobile-spike] ${message}`);
}

/**
 * Platform-selection factory — the one piece
 * `NATIVE_GPS_ARCHITECTURE_DECISION.md` §1 named as still missing ("every
 * call site... instantiates the concrete web adapter directly... not
 * through any platform-detection/dependency-injection layer"). A real
 * native build (this shell, once wrapped by `npx cap add
 * ios`/`android`) reports through Capacitor's own `Capacitor.getPlatform()`
 * — checked via a dynamic import so this file still runs (falling back
 * to reporting "web", honestly) in a plain browser tab during
 * `build.mjs`'s own local smoke-test, without requiring the native
 * runtime to be present.
 */
async function selectLocationProvider(): Promise<LocationTrackingProvider> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    if (platform === "ios") return createNativeLocationTrackingProvider({ platform: "ios_native" });
    if (platform === "android") return createNativeLocationTrackingProvider({ platform: "android_native" });
  } catch {
    // @capacitor/core not available in this runtime (e.g. a plain
    // browser tab, not a real Capacitor WebView) — falls through to the
    // honest "web" answer below, never a guessed native one.
  }
  const { createWebLocationTrackingProvider } = await import("../../../../src/lib/location/web-location-tracking-provider");
  return createWebLocationTrackingProvider();
}

async function main() {
  log("Farm Return mobile spike shell starting…");

  const provider = await selectLocationProvider();
  const capability = await provider.getCapability();
  log(`Location provider selected — platform: ${capability.platform}`);
  log(`  permissionState: ${capability.permissionState}`);
  log(`  farmAwarenessSupported: ${capability.farmAwarenessSupported}`);
  log(`  activeTrackingSupported: ${capability.activeTrackingSupported}`);
  log(`  backgroundTrackingSupported: ${capability.backgroundTrackingSupported}`);

  // Real domain-layer reuse, running inside this bundled shell.
  let state: JobSessionLifecycleState = { status: "ready", activeIntervals: [], interruptionGaps: [] };
  const startButton = document.getElementById("start-job");
  const statusEl = document.getElementById("status");

  function render() {
    if (statusEl) {
      const elapsed = computeElapsedSeconds(state, new Date().toISOString());
      statusEl.textContent = `status: ${state.status} · elapsed: ${elapsed}s · intervals: ${state.activeIntervals.length} · gaps: ${state.interruptionGaps.length}`;
    }
  }

  startButton?.addEventListener("click", () => {
    const result = startJobSession(state, new Date().toISOString());
    if (result.ok) {
      state = result.state;
      log(`Job Session started (real domain state machine): ${JSON.stringify(state)}`);
      render();
    } else {
      log(`Start rejected: ${result.error}`);
    }
  });

  render();
  log("Shell ready.");
}

main().catch((error) => log(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
