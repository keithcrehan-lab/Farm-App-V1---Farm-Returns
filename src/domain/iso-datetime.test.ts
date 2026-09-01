import { describe, expect, it } from "vitest";
import { isValidIsoUtcDateTime } from "./iso-datetime";

describe("isValidIsoUtcDateTime", () => {
  it("accepts a real, well-formed UTC ISO datetime, with and without fractional seconds", () => {
    expect(isValidIsoUtcDateTime("2026-06-28T11:54:21Z")).toBe(true);
    expect(isValidIsoUtcDateTime("2026-06-28T11:54:21.024000Z")).toBe(true);
  });

  it("accepts a real leap-day date (2028 is a leap year)", () => {
    expect(isValidIsoUtcDateTime("2028-02-29T00:00:00Z")).toBe(true);
  });

  it("rejects 29 February in a non-leap year", () => {
    expect(isValidIsoUtcDateTime("2026-02-29T00:00:00Z")).toBe(false);
  });

  // The exact real-world cases Codex audit HIGH,
  // docs/farm-return-next/audit-logs/20260901T154550Z.md, demonstrated
  // that new Date(value) alone silently accepts.
  it("rejects '0' (a bare number string, not a real ISO datetime)", () => {
    expect(isValidIsoUtcDateTime("0")).toBe(false);
  });

  it("rejects an impossible calendar date (30 February) rather than letting it silently roll over to March", () => {
    expect(isValidIsoUtcDateTime("2026-02-30T00:00:00Z")).toBe(false);
  });

  it("rejects a string with trailing garbage after a valid-looking prefix", () => {
    expect(isValidIsoUtcDateTime("2026-01-01T00:00:00Zjunk")).toBe(false);
  });

  it("rejects an out-of-range hour/minute/second", () => {
    expect(isValidIsoUtcDateTime("2026-01-01T25:00:00Z")).toBe(false);
    expect(isValidIsoUtcDateTime("2026-01-01T00:60:00Z")).toBe(false);
    expect(isValidIsoUtcDateTime("2026-01-01T00:00:60Z")).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isValidIsoUtcDateTime("2026-13-01T00:00:00Z")).toBe(false);
    expect(isValidIsoUtcDateTime("2026-00-01T00:00:00Z")).toBe(false);
  });

  it("rejects a non-UTC offset -- this app's own convention is always Z", () => {
    expect(isValidIsoUtcDateTime("2026-06-28T11:54:21+01:00")).toBe(false);
  });

  it("rejects a date-only string (no time component)", () => {
    expect(isValidIsoUtcDateTime("2026-06-28")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidIsoUtcDateTime("")).toBe(false);
  });
});
