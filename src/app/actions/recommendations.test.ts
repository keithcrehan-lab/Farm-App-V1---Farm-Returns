import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/recommendation-states", () => ({
  listRecommendationStates: vi.fn(),
  upsertRecommendationState: vi.fn(),
}));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listRecommendationStates, upsertRecommendationState } from "@/lib/farm-data/recommendation-states";
import { listRecommendationStatesAction, setRecommendationStateAction } from "./recommendations";

const state = { key: "grass:walk:field-1:2026-11", status: "dismissed" as const, fingerprint: "abcdef1234", snoozedUntil: null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getFarmForCurrentUser).mockResolvedValue({ id: "farm-a" } as Awaited<ReturnType<typeof getFarmForCurrentUser>>);
});

describe("recommendation action farm boundary", () => {
  it("rejects unsigned-in writes without touching persistence", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null);
    expect(await setRecommendationStateAction(state)).toEqual({ ok: false, error: "Sign in to save this." });
    expect(upsertRecommendationState).not.toHaveBeenCalled();
  });

  it("rejects malformed keys and invalid snooze dates before a farm lookup", async () => {
    expect((await setRecommendationStateAction({ ...state, key: "../../other" })).ok).toBe(false);
    expect((await setRecommendationStateAction({ ...state, status: "snoozed", snoozedUntil: "tomorrow" })).ok).toBe(false);
    expect(getFarmForCurrentUser).not.toHaveBeenCalled();
  });

  it("uses the authenticated farm ID for writes, not any client-provided farm", async () => {
    expect(await setRecommendationStateAction(state)).toEqual({ ok: true });
    expect(upsertRecommendationState).toHaveBeenCalledWith("farm-a", state);
  });

  it("returns a failure when storage fails, never false success", async () => {
    vi.mocked(upsertRecommendationState).mockRejectedValueOnce(new Error("database unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await setRecommendationStateAction(state)).toEqual({ ok: false, error: "Couldn't save just now. Try again." });
    spy.mockRestore();
  });

  it("isolates reads to the authenticated farm and handles failed reads", async () => {
    vi.mocked(listRecommendationStates).mockResolvedValueOnce([state]);
    expect(await listRecommendationStatesAction()).toEqual({ status: "ok", states: [state] });
    expect(listRecommendationStates).toHaveBeenCalledWith("farm-a");
    vi.mocked(listRecommendationStates).mockRejectedValueOnce(new Error("unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await listRecommendationStatesAction()).toEqual({ status: "unavailable" });
    spy.mockRestore();
  });
});
