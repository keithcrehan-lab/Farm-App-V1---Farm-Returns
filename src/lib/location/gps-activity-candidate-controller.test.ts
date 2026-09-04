import { describe, expect, it, vi } from "vitest";
import { createGpsActivityCandidateController } from "./gps-activity-candidate-controller";
import type { GpsActivityFieldRef } from "@/domain/gps-activity-detection";
import type { LocationCapability, LocationPosition, LocationTrackingProvider } from "./location-tracking-provider";

const HOME_FIELD: GpsActivityFieldRef = {
  id: "field-home",
  name: "Home Field",
  polygon: {
    type: "Polygon",
    coordinates: [
      [
        [-8.001, 53.399],
        [-7.999, 53.399],
        [-7.999, 53.401],
        [-8.001, 53.401],
        [-8.001, 53.399],
      ],
    ],
  },
};

function fakeProvider(capability: Partial<LocationCapability> = {}): {
  provider: LocationTrackingProvider;
  emit: (position: LocationPosition) => void;
  farmAwarenessStarted: boolean;
  farmAwarenessStopped: boolean;
} {
  let emit: (position: LocationPosition) => void = () => {};
  const state = { farmAwarenessStarted: false, farmAwarenessStopped: false };
  const provider: LocationTrackingProvider = {
    async getCapability(): Promise<LocationCapability> {
      return { permissionState: "granted", farmAwarenessSupported: true, activeTrackingSupported: true, backgroundTrackingSupported: false, platform: "web", ...capability };
    },
    async getCurrentPosition() {
      return null;
    },
    async startFarmAwareness(onPosition) {
      state.farmAwarenessStarted = true;
      emit = onPosition;
    },
    async stopFarmAwareness() {
      state.farmAwarenessStopped = true;
    },
    async startActiveTracking() {},
    async stopActiveTracking() {},
    isActivelyTracking() {
      return false;
    },
  };
  return { provider, emit: (p) => emit(p), get farmAwarenessStarted() { return state.farmAwarenessStarted; }, get farmAwarenessStopped() { return state.farmAwarenessStopped; } };
}

const T0 = new Date("2026-06-15T10:00:00.000Z").getTime();
function position(offsetSeconds: number, lat: number, lng: number, accuracyMeters = 10): LocationPosition {
  return { lat, lng, accuracyMeters, recordedAt: new Date(T0 + offsetSeconds * 1000).toISOString() };
}

describe("createGpsActivityCandidateController", () => {
  it("starts Farm Awareness and feeds real positions into the pure detector, notifying on every state change", async () => {
    const { provider, emit } = fakeProvider();
    const onStateChange = vi.fn();
    const controller = createGpsActivityCandidateController(provider, () => [HOME_FIELD], onStateChange);

    await controller.start();
    emit(position(0, 53.4, -8.0));
    emit(position(60, 53.4, -8.0));

    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(controller.getState().observations).toHaveLength(2);
  });

  it("Codex audit round 3: automatically recovers after a genuinely ambiguous cycle expires — never permanently disables detection", async () => {
    const { provider, emit } = fakeProvider();
    const controller = createGpsActivityCandidateController(provider, () => [HOME_FIELD], vi.fn());
    await controller.start();

    // A long, genuinely ambiguous drive-around, far from any mapped
    // field — the pure detector's own `candidateExpirySeconds` (900s)
    // is reached with no stable field ever established.
    emit(position(0, 53.42, -8.05));
    emit(position(950, 53.42, -8.05));
    // Exposed state is "observing" (a fresh cycle), never "expired" —
    // an "expired" cycle is not itself a farmer-facing concept.
    expect(controller.getState().status).toBe("observing");
    expect(controller.getState().observations).toHaveLength(0);

    // A genuine, later dwelling sequence in Home Field still reaches a
    // real candidate_start — detection was never permanently disabled.
    for (const t of [1000, 1060, 1120, 1180, 1240]) emit(position(t, 53.4, -8.0));
    expect(controller.getState().status).toBe("candidate_start");
    expect(controller.getState().candidateFieldId).toBe("field-home");
  });

  it("never starts Farm Awareness when the platform genuinely doesn't support it — honest, not silently pretending", async () => {
    const { provider, farmAwarenessStarted } = fakeProvider({ farmAwarenessSupported: false });
    const controller = createGpsActivityCandidateController(provider, () => [HOME_FIELD], vi.fn());
    await controller.start();
    expect(farmAwarenessStarted).toBe(false);
  });

  it("start() is idempotent — calling it twice does not double-subscribe", async () => {
    let startCount = 0;
    const { provider, emit } = fakeProvider();
    const wrapped: LocationTrackingProvider = {
      ...provider,
      async startFarmAwareness(onPosition) {
        startCount += 1;
        await provider.startFarmAwareness(onPosition);
      },
    };
    const controller = createGpsActivityCandidateController(wrapped, () => [HOME_FIELD], vi.fn());
    await controller.start();
    await controller.start();
    expect(startCount).toBe(1);
    emit(position(0, 53.4, -8.0));
    expect(controller.getState().observations).toHaveLength(1);
  });

  it("reset() returns to idle without stopping Farm Awareness — a fresh detection cycle can begin immediately", async () => {
    const fake = fakeProvider();
    const onStateChange = vi.fn();
    const controller = createGpsActivityCandidateController(fake.provider, () => [HOME_FIELD], onStateChange);
    await controller.start();
    fake.emit(position(0, 53.4, -8.0));
    expect(controller.getState().observations).toHaveLength(1);

    controller.reset();
    expect(controller.getState().observations).toHaveLength(0);
    expect(controller.getState().status).toBe("observing");
    expect(fake.farmAwarenessStopped).toBe(false);
  });

  it("stop() stops Farm Awareness and a subsequent start() resubscribes", async () => {
    const fake = fakeProvider();
    const controller = createGpsActivityCandidateController(fake.provider, () => [HOME_FIELD], vi.fn());
    await controller.start();
    await controller.stop();
    expect(fake.farmAwarenessStopped).toBe(true);
  });
});
