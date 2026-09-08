import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `getFieldAwarenessAction` itself is a thin pass-through —
 * `src/orchestration/field-awareness/index.test.ts` already covers the
 * real farm-scoping/satellite/activity assembly logic in full. These
 * tests exist only to prove this action's own two real responsibilities:
 * rejecting an empty `fieldId` before ever calling the orchestration
 * layer, and otherwise forwarding to it unchanged.
 */
vi.mock("@/orchestration/field-awareness", () => ({ getFieldAwarenessForCurrentUser: vi.fn() }));

import { getFieldAwarenessForCurrentUser } from "@/orchestration/field-awareness";
import { getFieldAwarenessAction } from "./field-awareness";
import type { FieldAwarenessSnapshot } from "@/domain/field-awareness";

const mockGetFieldAwareness = vi.mocked(getFieldAwarenessForCurrentUser);

afterEach(() => {
  vi.clearAllMocks();
});

describe("getFieldAwarenessAction", () => {
  it("never calls the orchestration layer for an empty fieldId", async () => {
    const result = await getFieldAwarenessAction("");
    expect(result).toBeNull();
    expect(mockGetFieldAwareness).not.toHaveBeenCalled();
  });

  it("forwards a real fieldId to the orchestration layer and returns its result unchanged", async () => {
    const snapshot = { fieldId: "field-1", farmId: "farm-1" } as FieldAwarenessSnapshot;
    mockGetFieldAwareness.mockResolvedValue(snapshot);

    const result = await getFieldAwarenessAction("field-1");

    expect(mockGetFieldAwareness).toHaveBeenCalledWith("field-1");
    expect(result).toBe(snapshot);
  });

  it("returns null when the orchestration layer finds no such field for the current farm", async () => {
    mockGetFieldAwareness.mockResolvedValue(null);
    const result = await getFieldAwarenessAction("not-my-field");
    expect(result).toBeNull();
  });
});
