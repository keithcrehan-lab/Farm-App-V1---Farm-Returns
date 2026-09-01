import { describe, expect, it } from "vitest";
import { selectPrimaryPrompt, selectSecondaryPrompts } from "./select-primary";
import type { Prompt } from "./index";
import type { EngineOutcome } from "@/domain/evidence";

function prompt(id: string, status: EngineOutcome<unknown>["status"], createdAt: string): Prompt {
  const basis: EngineOutcome<unknown> =
    status === "OK"
      ? { status: "OK", value: {}, evidenceState: "IRISH_MODEL" }
      : status === "LEGAL_PROHIBITION"
        ? { status: "LEGAL_PROHIBITION", reasonCode: "R", consequence: "blocked" }
        : status === "BLOCKED_INSUFFICIENT_EVIDENCE"
          ? { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "R", missingInputs: [] }
          : status === "AMBIGUOUS"
            ? { status: "AMBIGUOUS", reasonCode: "R", detail: "d" }
            : status === "NOT_APPLICABLE"
              ? { status: "NOT_APPLICABLE", reasonCode: "R" }
              : { status: "UNKNOWN", reasonCode: "R" };
  return {
    id,
    farmId: "farm-1",
    kind: "test_kind",
    title: `Prompt ${id}`,
    description: "d",
    basis,
    createdAt,
  };
}

describe("selectPrimaryPrompt", () => {
  it("returns undefined for an empty list", () => {
    expect(selectPrimaryPrompt([])).toBeUndefined();
  });

  it("ranks LEGAL_PROHIBITION ahead of an OK prompt", () => {
    const ok = prompt("a", "OK", "2026-09-01T09:00:00.000Z");
    const blocked = prompt("b", "LEGAL_PROHIBITION", "2026-09-01T10:00:00.000Z");
    expect(selectPrimaryPrompt([ok, blocked])?.id).toBe("b");
  });

  it("ranks OK ahead of BLOCKED_INSUFFICIENT_EVIDENCE", () => {
    const ok = prompt("a", "OK", "2026-09-01T09:00:00.000Z");
    const insufficient = prompt("b", "BLOCKED_INSUFFICIENT_EVIDENCE", "2026-09-01T08:00:00.000Z");
    expect(selectPrimaryPrompt([insufficient, ok])?.id).toBe("a");
  });

  it("ranks AMBIGUOUS/UNKNOWN between OK and BLOCKED_INSUFFICIENT_EVIDENCE/NOT_APPLICABLE", () => {
    const ambiguous = prompt("a", "AMBIGUOUS", "2026-09-01T09:00:00.000Z");
    const insufficient = prompt("b", "BLOCKED_INSUFFICIENT_EVIDENCE", "2026-09-01T08:00:00.000Z");
    expect(selectPrimaryPrompt([insufficient, ambiguous])?.id).toBe("a");
  });

  it("breaks a same-rank tie by earliest createdAt", () => {
    const later = prompt("a", "OK", "2026-09-01T10:00:00.000Z");
    const earlier = prompt("b", "OK", "2026-09-01T09:00:00.000Z");
    expect(selectPrimaryPrompt([later, earlier])?.id).toBe("b");
  });

  it("never mutates the input array's order", () => {
    const list = [prompt("a", "OK", "2026-09-01T10:00:00.000Z"), prompt("b", "LEGAL_PROHIBITION", "2026-09-01T09:00:00.000Z")];
    const copy = [...list];
    selectPrimaryPrompt(list);
    expect(list).toEqual(copy);
  });
});

describe("selectSecondaryPrompts", () => {
  it("excludes the primary prompt and keeps the same rank order for the rest", () => {
    const prohibited = prompt("a", "LEGAL_PROHIBITION", "2026-09-01T09:00:00.000Z");
    const ok = prompt("b", "OK", "2026-09-01T09:00:00.000Z");
    const insufficient = prompt("c", "BLOCKED_INSUFFICIENT_EVIDENCE", "2026-09-01T09:00:00.000Z");
    const result = selectSecondaryPrompts([insufficient, ok, prohibited]);
    expect(result.map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("returns an empty array for an empty list", () => {
    expect(selectSecondaryPrompts([])).toEqual([]);
  });

  it("returns an empty array when there is exactly one prompt", () => {
    expect(selectSecondaryPrompts([prompt("a", "OK", "2026-09-01T09:00:00.000Z")])).toEqual([]);
  });
});
