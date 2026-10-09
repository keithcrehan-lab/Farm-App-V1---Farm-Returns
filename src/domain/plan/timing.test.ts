import { describe, expect, it } from "vitest";
import { hardDeadline, isHardDeadlinePassed, recommendedWindow, windowPosition } from "./timing";

describe("timing", () => {
  it("recommended windows and hard deadlines are distinct discriminated types", () => {
    const w = recommendedWindow("2026-10-01T00:00:00Z", "2026-10-31T00:00:00Z", "test basis");
    const d = hardDeadline("2026-10-31T00:00:00Z", { kind: "FARMER_CONFIRMED_COMMITMENT", description: "test" });
    expect(w.ok && w.value.kind).toBe("RECOMMENDED_WINDOW");
    expect(d.ok && d.value.kind).toBe("HARD_DEADLINE");
    expect(w.ok && "authority" in w.value).toBe(false);
  });

  it("rejects malformed or inverted windows and invalid deadlines", () => {
    expect(recommendedWindow("2026-02-30T00:00:00Z", null, "x")).toEqual({ ok: false, error: "INVALID_WINDOW_START" });
    expect(recommendedWindow("2026-10-31T00:00:00Z", "2026-10-01T00:00:00Z", "x")).toEqual({ ok: false, error: "WINDOW_END_BEFORE_START" });
    expect(hardDeadline("soon", { kind: "FARMER_CONFIRMED_COMMITMENT", description: "x" }).ok).toBe(false);
  });

  it("positions now relative to a window", () => {
    const w = recommendedWindow("2026-10-01T00:00:00Z", "2026-10-31T00:00:00Z", "x");
    if (!w.ok) throw new Error();
    expect(windowPosition(null, "2026-10-09T00:00:00Z")).toBe("NO_WINDOW");
    expect(windowPosition(w.value, "2026-09-30T00:00:00Z")).toBe("BEFORE_WINDOW");
    expect(windowPosition(w.value, "2026-10-09T00:00:00Z")).toBe("IN_WINDOW");
    expect(windowPosition(w.value, "2026-11-01T00:00:00Z")).toBe("AFTER_WINDOW");
  });

  it("only a hard deadline can pass", () => {
    const d = hardDeadline("2026-10-01T00:00:00Z", { kind: "CANONICAL_RECORD", recordId: "r1", recordKind: "test" });
    if (!d.ok) throw new Error();
    expect(isHardDeadlinePassed(d.value, "2026-10-09T00:00:00Z")).toBe(true);
    expect(isHardDeadlinePassed(null, "2026-10-09T00:00:00Z")).toBe(false);
  });
});
