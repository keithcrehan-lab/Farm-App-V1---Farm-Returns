import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebNetworkStateProvider } from "./web-network-state-provider";

function setOnLine(value: boolean): void {
  Object.defineProperty(globalThis.navigator, "onLine", { value, configurable: true });
}

afterEach(() => {
  setOnLine(true);
  vi.restoreAllMocks();
});

describe("web network state provider — capability honesty", () => {
  it("always reports reachabilityVerified: false", () => {
    const provider = createWebNetworkStateProvider();
    const capability = provider.getCapability();
    expect(capability.reachabilityVerified).toBe(false);
    expect(capability.platform).toBe("web");
    expect(capability.supported).toBe(true);
  });
});

describe("web network state provider — isOnline", () => {
  it("reflects navigator.onLine when true", () => {
    setOnLine(true);
    const provider = createWebNetworkStateProvider();
    expect(provider.isOnline()).toBe(true);
  });

  it("reflects navigator.onLine when false", () => {
    setOnLine(false);
    const provider = createWebNetworkStateProvider();
    expect(provider.isOnline()).toBe(false);
  });
});

describe("web network state provider — subscribe", () => {
  it("fires onChange(false) on a genuine offline event", () => {
    setOnLine(true);
    const provider = createWebNetworkStateProvider();
    const onChange = vi.fn();
    provider.subscribe(onChange);

    setOnLine(false);
    window.dispatchEvent(new Event("offline"));

    expect(onChange).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("fires onChange(true) on a genuine online event", () => {
    setOnLine(false);
    const provider = createWebNetworkStateProvider();
    const onChange = vi.fn();
    provider.subscribe(onChange);

    setOnLine(true);
    window.dispatchEvent(new Event("online"));

    expect(onChange).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not fire a duplicate transition for the same state twice in a row", () => {
    setOnLine(true);
    const provider = createWebNetworkStateProvider();
    const onChange = vi.fn();
    provider.subscribe(onChange);

    // Two offline events in a row -- only the first is a genuine
    // transition; the second must not re-fire.
    setOnLine(false);
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("offline"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops further notifications", () => {
    setOnLine(true);
    const provider = createWebNetworkStateProvider();
    const onChange = vi.fn();
    const unsubscribe = provider.subscribe(onChange);
    unsubscribe();

    setOnLine(false);
    window.dispatchEvent(new Event("offline"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
