import { describe, expect, it } from "vitest";
import { notificationFromPrompt } from "./index";
import type { Prompt } from "@/orchestration/prompt";

function basePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: "prompt-1",
    farmId: "farm-1",
    kind: "spreading_window",
    title: "Good spreading window tomorrow",
    description: "Good spreading window tomorrow — Fields 3, 4 and 6.",
    basis: { status: "OK", value: { window: "2026-09-02" }, evidenceState: "MEASURED" },
    createdAt: "2026-09-01T09:00:00Z",
    ...overrides,
  };
}

describe("notificationFromPrompt", () => {
  it("copies title/body verbatim from an OK-status Prompt's own title/description", () => {
    const prompt = basePrompt();

    const input = notificationFromPrompt(prompt, "field-3-2026-09-02");

    expect(input).toEqual({
      farmId: "farm-1",
      kind: "spreading_window",
      dedupeKey: "field-3-2026-09-02",
      title: "Good spreading window tomorrow",
      body: "Good spreading window tomorrow — Fields 3, 4 and 6.",
    });
  });

  it("carries fieldId through when the Prompt has one", () => {
    const prompt = basePrompt({ fieldId: "field-3" });

    const input = notificationFromPrompt(prompt, "field-3-2026-09-02");

    expect(input.fieldId).toBe("field-3");
  });

  it("omits fieldId when the Prompt doesn't have one (not a field-scoped Prompt kind)", () => {
    const prompt = basePrompt();

    const input = notificationFromPrompt(prompt, "some-key");

    expect(input.fieldId).toBeUndefined();
  });

  it("throws for a BLOCKED_INSUFFICIENT_EVIDENCE Prompt -- never notifies about something not actionable", () => {
    const prompt = basePrompt({
      basis: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_TEST", missingInputs: ["pIndex"] },
    });

    expect(() => notificationFromPrompt(prompt, "key")).toThrow(/basis\.status "BLOCKED_INSUFFICIENT_EVIDENCE"/);
  });

  it("throws for an AMBIGUOUS Prompt", () => {
    const prompt = basePrompt({ basis: { status: "AMBIGUOUS", reasonCode: "CONFLICTING_READINGS", detail: "conflicting readings" } });

    expect(() => notificationFromPrompt(prompt, "key")).toThrow(/basis\.status "AMBIGUOUS"/);
  });

  it("throws for a NOT_APPLICABLE Prompt", () => {
    const prompt = basePrompt({ basis: { status: "NOT_APPLICABLE", reasonCode: "OUT_OF_SEASON" } });

    expect(() => notificationFromPrompt(prompt, "key")).toThrow(/basis\.status "NOT_APPLICABLE"/);
  });

  it("throws for a LEGAL_PROHIBITION Prompt", () => {
    const prompt = basePrompt({ basis: { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD", consequence: "no spreading" } });

    expect(() => notificationFromPrompt(prompt, "key")).toThrow(/basis\.status "LEGAL_PROHIBITION"/);
  });

  it("throws for an UNKNOWN Prompt", () => {
    const prompt = basePrompt({ basis: { status: "UNKNOWN", reasonCode: "SYSTEM_ERROR" } });

    expect(() => notificationFromPrompt(prompt, "key")).toThrow(/basis\.status "UNKNOWN"/);
  });
});
