/**
 * Tests for `NativeLocationTrackingProvider` against MOCKED
 * `@capacitor/core`/`@capacitor/geolocation` — there is no real native
 * geolocation bridge available in this Node/vitest environment (no
 * Xcode/Android Studio/device — see
 * `docs/native/NATIVE_MOBILE_FEASIBILITY.md`). These tests verify this
 * adapter's own real logic — most importantly, that it never claims a
 * capability it cannot actually deliver (this whole contract's own
 * central rule) — not real device GPS behaviour, which
 * `docs/native/PHYSICAL_DEVICE_TEST_PLAN.md` exists to verify instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkPermissionsMock, getCurrentPositionMock, watchPositionMock, clearWatchMock, addWatcherMock, removeWatcherMock } = vi.hoisted(() => ({
  checkPermissionsMock: vi.fn(),
  getCurrentPositionMock: vi.fn(),
  watchPositionMock: vi.fn(),
  clearWatchMock: vi.fn(),
  addWatcherMock: vi.fn(),
  removeWatcherMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => ({
    addWatcher: addWatcherMock,
    removeWatcher: removeWatcherMock,
  })),
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    checkPermissions: checkPermissionsMock,
    getCurrentPosition: getCurrentPositionMock,
    watchPosition: watchPositionMock,
    clearWatch: clearWatchMock,
  },
}));

import { createNativeLocationTrackingProvider } from "./NativeLocationTrackingProvider";

describe("NativeLocationTrackingProvider — capability truthfulness", () => {
  beforeEach(() => {
    checkPermissionsMock.mockReset();
    getCurrentPositionMock.mockReset();
    watchPositionMock.mockReset();
    clearWatchMock.mockReset();
    addWatcherMock.mockReset();
    removeWatcherMock.mockReset();
  });

  it("never reports backgroundTrackingSupported: true unless a real physical-device test has verified it, even when configured to use the background service", async () => {
    checkPermissionsMock.mockResolvedValue({ location: "granted" });
    const provider = createNativeLocationTrackingProvider({ platform: "ios_native", useBackgroundService: true });
    const capability = await provider.getCapability();
    // This is the whole point of BACKGROUND_TRACKING_VERIFIED_ON_DEVICE
    // staying false in this environment: no simulator/device was
    // available to confirm it, so this must stay honestly false
    // regardless of configuration.
    expect(capability.backgroundTrackingSupported).toBe(false);
  });

  it("reports the real requested platform, not a hardcoded one", async () => {
    checkPermissionsMock.mockResolvedValue({ location: "granted" });
    const android = await createNativeLocationTrackingProvider({ platform: "android_native" }).getCapability();
    const ios = await createNativeLocationTrackingProvider({ platform: "ios_native" }).getCapability();
    expect(android.platform).toBe("android_native");
    expect(ios.platform).toBe("ios_native");
  });

  it("reports activeTrackingSupported: false when the real permission is denied — never optimistic", async () => {
    checkPermissionsMock.mockResolvedValue({ location: "denied" });
    const capability = await createNativeLocationTrackingProvider().getCapability();
    expect(capability.activeTrackingSupported).toBe(false);
    expect(capability.permissionState).toBe("denied");
  });

  it("reports permissionState: unavailable (never a fabricated 'granted') when checking permissions itself throws", async () => {
    checkPermissionsMock.mockRejectedValue(new Error("no location services"));
    const capability = await createNativeLocationTrackingProvider().getCapability();
    expect(capability.permissionState).toBe("unavailable");
    expect(capability.activeTrackingSupported).toBe(false);
  });

  it("getCurrentPosition resolves null (never a fabricated position) when the native call fails", async () => {
    getCurrentPositionMock.mockRejectedValue(new Error("timeout"));
    const position = await createNativeLocationTrackingProvider().getCurrentPosition();
    expect(position).toBeNull();
  });

  it("getCurrentPosition resolves null (never throws) when the native timestamp is invalid — final Codex audit round 4, HIGH", async () => {
    getCurrentPositionMock.mockResolvedValue({
      timestamp: Number.NaN,
      coords: { latitude: 51.9, longitude: -8.48, accuracy: 8.2 },
    });
    const position = await createNativeLocationTrackingProvider().getCurrentPosition();
    expect(position).toBeNull();
  });

  it("getCurrentPosition preserves the real device timestamp and accuracy, converting timestamp to a real ISO string", async () => {
    getCurrentPositionMock.mockResolvedValue({
      timestamp: Date.UTC(2026, 8, 4, 9, 0, 0),
      coords: { latitude: 51.9, longitude: -8.48, accuracy: 8.2 },
    });
    const position = await createNativeLocationTrackingProvider().getCurrentPosition();
    expect(position).toEqual({
      lat: 51.9,
      lng: -8.48,
      accuracyMeters: 8.2,
      recordedAt: new Date(Date.UTC(2026, 8, 4, 9, 0, 0)).toISOString(),
    });
  });

  it("startActiveTracking reports permission_revoked (not a silent failure) when permission is already denied", async () => {
    checkPermissionsMock.mockResolvedValue({ location: "denied" });
    const provider = createNativeLocationTrackingProvider();
    const onPosition = vi.fn();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(onPosition, onInterruption);
    expect(onInterruption).toHaveBeenCalledWith("permission_revoked");
    expect(onPosition).not.toHaveBeenCalled();
  });

  it("isActivelyTracking is false before startActiveTracking is called and stays false after stopActiveTracking", async () => {
    const provider = createNativeLocationTrackingProvider();
    expect(provider.isActivelyTracking()).toBe(false);
    await provider.stopActiveTracking();
    expect(provider.isActivelyTracking()).toBe(false);
  });

  it("isActivelyTracking becomes true as soon as the watcher is registered — before any real position has arrived (final Codex audit round 3, HIGH)", async () => {
    checkPermissionsMock.mockResolvedValue({ location: "granted" });
    watchPositionMock.mockResolvedValue("watch-id-1");
    const provider = createNativeLocationTrackingProvider();
    await provider.startActiveTracking(vi.fn(), vi.fn());
    // No position callback has fired at all yet — a real watcher can
    // genuinely be registered and running for a while before its first
    // fix arrives (weak signal, cold GPS start); this must already read
    // true, not wait for a fix to say so.
    expect(provider.isActivelyTracking()).toBe(true);
  });

  it("isActivelyTracking becomes false again after the watcher reports a real error — never stuck true past a genuine interruption", async () => {
    checkPermissionsMock.mockResolvedValue({ location: "granted" });
    let deliverError: ((position: null, err: unknown) => void) | undefined;
    watchPositionMock.mockImplementation(async (_options: unknown, callback: (position: null, err: unknown) => void) => {
      deliverError = callback;
      return "watch-id-1";
    });
    const provider = createNativeLocationTrackingProvider();
    await provider.startActiveTracking(vi.fn(), vi.fn());
    expect(provider.isActivelyTracking()).toBe(true);
    deliverError?.(null, { code: 2 });
    expect(provider.isActivelyTracking()).toBe(false);
  });

  it("startActiveTracking calls onInterruption (never fabricates a position) when a foreground fix has an invalid device timestamp — final Codex audit round 4, HIGH", async () => {
    checkPermissionsMock.mockResolvedValue({ location: "granted" });
    let deliverPosition: ((position: unknown, err: unknown) => void) | undefined;
    watchPositionMock.mockImplementation(async (_options: unknown, callback: (position: unknown, err: unknown) => void) => {
      deliverPosition = callback;
      return "watch-id-1";
    });
    const provider = createNativeLocationTrackingProvider();
    const onPosition = vi.fn();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(onPosition, onInterruption);
    deliverPosition?.({ timestamp: Number.NaN, coords: { latitude: 51.9, longitude: -8.48, accuracy: 5 } }, null);
    expect(onPosition).not.toHaveBeenCalled();
    expect(onInterruption).toHaveBeenCalledWith("position_unavailable");
  });

  it("startActiveTracking with useBackgroundService: true calls onInterruption (not a silent drop) when a background fix has no real device-clock time — final Codex audit round 4, HIGH", async () => {
    checkPermissionsMock.mockResolvedValue({ location: "granted" });
    let deliverLocation: ((location: unknown, error: unknown) => void) | undefined;
    addWatcherMock.mockImplementation(async (_options: unknown, callback: (location: unknown, error: unknown) => void) => {
      deliverLocation = callback;
      return "bg-watch-1";
    });
    const provider = createNativeLocationTrackingProvider({ platform: "android_native", useBackgroundService: true });
    const onPosition = vi.fn();
    const onInterruption = vi.fn();
    await provider.startActiveTracking(onPosition, onInterruption);
    deliverLocation?.({ latitude: 51.9, longitude: -8.48, accuracy: 5, time: null }, null);
    expect(onPosition).not.toHaveBeenCalled();
    expect(onInterruption).toHaveBeenCalledWith("position_unavailable");
  });
});
