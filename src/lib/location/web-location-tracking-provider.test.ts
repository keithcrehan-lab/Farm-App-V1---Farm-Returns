import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebLocationTrackingProvider } from "./web-location-tracking-provider";

function mockGeolocation(overrides: Partial<Geolocation> = {}): Geolocation {
  const mock: Geolocation = {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(() => 1),
    clearWatch: vi.fn(),
    ...overrides,
  } as unknown as Geolocation;
  Object.defineProperty(globalThis.navigator, "geolocation", { value: mock, configurable: true });
  return mock;
}

function removeGeolocation(): void {
  // `delete`, not `value: undefined` -- `isGeolocationAvailable`'s real
  // production check is `"geolocation" in navigator`, which stays true
  // for a defined-but-undefined property; only actually removing the key
  // reproduces a browser that never defines `navigator.geolocation`.
  delete (globalThis.navigator as { geolocation?: Geolocation }).geolocation;
}

afterEach(() => {
  removeGeolocation();
  delete (globalThis.navigator as { permissions?: Permissions }).permissions;
  vi.restoreAllMocks();
});

describe("web location tracking provider — capability honesty", () => {
  it("always reports backgroundTrackingSupported: false", async () => {
    mockGeolocation();
    const provider = createWebLocationTrackingProvider();
    const capability = await provider.getCapability();
    expect(capability.backgroundTrackingSupported).toBe(false);
    expect(capability.platform).toBe("web");
  });

  it("reports unavailable when navigator.geolocation does not exist, never a fabricated 'granted'", async () => {
    removeGeolocation();
    const provider = createWebLocationTrackingProvider();
    const capability = await provider.getCapability();
    expect(capability.permissionState).toBe("unavailable");
    expect(capability.farmAwarenessSupported).toBe(false);
    expect(capability.activeTrackingSupported).toBe(false);
  });

  it("reports denied honestly via the Permissions API when available", async () => {
    mockGeolocation();
    Object.defineProperty(globalThis.navigator, "permissions", {
      value: { query: vi.fn().mockResolvedValue({ state: "denied" }) },
      configurable: true,
    });
    const provider = createWebLocationTrackingProvider();
    const capability = await provider.getCapability();
    expect(capability.permissionState).toBe("denied");
    expect(capability.activeTrackingSupported).toBe(false);
  });

  it("reports 'unknown', not 'granted', when the Permissions API itself is unavailable", async () => {
    mockGeolocation();
    const provider = createWebLocationTrackingProvider();
    const capability = await provider.getCapability();
    expect(capability.permissionState).toBe("unknown");
  });
});

describe("web location tracking provider — getCurrentPosition", () => {
  it("resolves null, never a fabricated position, when geolocation is unavailable", async () => {
    removeGeolocation();
    const provider = createWebLocationTrackingProvider();
    await expect(provider.getCurrentPosition()).resolves.toBeNull();
  });

  it("resolves a real position from a successful callback", async () => {
    mockGeolocation({
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({
          coords: { latitude: 52.1, longitude: -7.6, accuracy: 12 },
          timestamp: Date.parse("2026-09-02T09:00:00Z"),
        } as GeolocationPosition);
      }) as unknown as Geolocation["getCurrentPosition"],
    });
    const provider = createWebLocationTrackingProvider();
    const position = await provider.getCurrentPosition();
    expect(position).toEqual({ lat: 52.1, lng: -7.6, accuracyMeters: 12, recordedAt: "2026-09-02T09:00:00.000Z" });
  });

  it("resolves null on a real geolocation error, never a fabricated position", async () => {
    mockGeolocation({
      getCurrentPosition: vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1, message: "denied" } as GeolocationPositionError);
      }) as unknown as Geolocation["getCurrentPosition"],
    });
    const provider = createWebLocationTrackingProvider();
    await expect(provider.getCurrentPosition()).resolves.toBeNull();
  });
});

describe("web location tracking provider — active tracking", () => {
  it("reports position_unavailable via onInterruption when geolocation is unavailable, rather than pretending to track", async () => {
    removeGeolocation();
    const provider = createWebLocationTrackingProvider();
    const onPosition = vi.fn();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(onPosition, onInterruption);
    expect(onInterruption).toHaveBeenCalledWith("position_unavailable");
    expect(provider.isActivelyTracking()).toBe(false);
  });

  it("tracks isActivelyTracking() true/false across start/stop", async () => {
    mockGeolocation();
    const provider = createWebLocationTrackingProvider();
    expect(provider.isActivelyTracking()).toBe(false);
    await provider.startActiveTracking(vi.fn(), vi.fn());
    expect(provider.isActivelyTracking()).toBe(true);
    await provider.stopActiveTracking();
    expect(provider.isActivelyTracking()).toBe(false);
  });

  it("forwards permission_revoked distinctly from a generic position_unavailable error", async () => {
    let errorCallback: PositionErrorCallback | undefined;
    mockGeolocation({
      watchPosition: vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
        errorCallback = error;
        return 1;
      }) as unknown as Geolocation["watchPosition"],
    });
    const provider = createWebLocationTrackingProvider();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(vi.fn(), onInterruption);
    errorCallback?.({ code: 1, PERMISSION_DENIED: 1, message: "denied" } as unknown as GeolocationPositionError);
    expect(onInterruption).toHaveBeenCalledWith("permission_revoked");
  });
});

describe("web location tracking provider — farm awareness", () => {
  it("starts and stops without throwing when geolocation is available", async () => {
    mockGeolocation();
    const provider = createWebLocationTrackingProvider();
    await expect(provider.startFarmAwareness(vi.fn())).resolves.toBeUndefined();
    await expect(provider.stopFarmAwareness()).resolves.toBeUndefined();
  });

  it("is a no-op, not a throw, when geolocation is unavailable", async () => {
    removeGeolocation();
    const provider = createWebLocationTrackingProvider();
    await expect(provider.startFarmAwareness(vi.fn())).resolves.toBeUndefined();
  });
});

describe("web location tracking provider — background interruption", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires app_backgrounded after the page stays hidden past the threshold while actively tracking", async () => {
    mockGeolocation();
    const provider = createWebLocationTrackingProvider();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(vi.fn(), onInterruption);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onInterruption).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_001);
    expect(onInterruption).toHaveBeenCalledWith("app_backgrounded");

    await provider.stopActiveTracking();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("does not fire app_backgrounded if the page becomes visible again before the threshold", async () => {
    mockGeolocation();
    const provider = createWebLocationTrackingProvider();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(vi.fn(), onInterruption);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(10_000);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(30_000);

    expect(onInterruption).not.toHaveBeenCalled();
    await provider.stopActiveTracking();
  });

  it("fires app_backgrounded on resume even when the timer itself never ran (a genuinely suspended tab) — Codex audit MEDIUM, round 1", async () => {
    // Simulates a tab whose JS was suspended entirely while hidden: real
    // wall-clock time passes (vi.setSystemTime moves Date.now() without
    // firing any scheduled timer, unlike vi.advanceTimersByTime), so the
    // backgroundTimer set in onVisibilityChange never gets a chance to
    // run — only the resume-time wall-clock comparison can catch this.
    mockGeolocation();
    const provider = createWebLocationTrackingProvider();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(vi.fn(), onInterruption);

    const start = new Date();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    vi.setSystemTime(new Date(start.getTime() + 45_000));

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onInterruption).toHaveBeenCalledWith("app_backgrounded");
    await provider.stopActiveTracking();
  });

  it("fires app_backgrounded only once for one real gap — not once from the timer and again on resume (Codex audit MEDIUM, round 2)", async () => {
    mockGeolocation();
    const provider = createWebLocationTrackingProvider();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(vi.fn(), onInterruption);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // The timer fires first, while still hidden (a real browser tab that
    // keeps running JS in the background, unlike the suspended-tab test
    // above).
    vi.advanceTimersByTime(30_001);
    expect(onInterruption).toHaveBeenCalledTimes(1);

    // Now the page becomes visible — must not report the same gap again.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onInterruption).toHaveBeenCalledTimes(1);
    await provider.stopActiveTracking();
  });
});
