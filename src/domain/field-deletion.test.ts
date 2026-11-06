import { describe, expect, it } from "vitest";
import { FIELD_RESTORE_WINDOW_DAYS, canRestoreDeletedField, fieldRestoreWindow } from "./field-deletion";

describe("field deletion restore window", () => {
  it("allows restoration for exactly the 30-day safety period", () => {
    const deletedAt = "2026-11-01T12:00:00.000Z";
    const within = new Date("2026-11-30T11:59:59.000Z");
    const expired = new Date("2026-12-01T12:00:00.000Z");

    expect(FIELD_RESTORE_WINDOW_DAYS).toBe(30);
    expect(canRestoreDeletedField(deletedAt, within)).toBe(true);
    expect(canRestoreDeletedField(deletedAt, expired)).toBe(false);
  });

  it("shows whole days remaining conservatively for the farmer", () => {
    const result = fieldRestoreWindow(
      "2026-11-01T12:00:00.000Z",
      new Date("2026-11-02T12:00:01.000Z"),
    );
    expect(result.restorable).toBe(true);
    expect(result.daysRemaining).toBe(29);
    expect(result.restoreUntil).toBe("2026-12-01T12:00:00.000Z");
  });

  it("fails closed for an invalid deletion timestamp", () => {
    expect(fieldRestoreWindow("not-a-date", new Date("2026-11-06T12:00:00.000Z")).restorable).toBe(false);
  });
});
