import { beforeEach, describe, expect, it } from "vitest";
import { createLocalStoragePeerReviewStore } from "./peer-review-local-storage";
import type { PeerReview } from "./audit-trace";

const STORAGE_KEY = "farm-return:peer-review:v1";
const AUDIT_TRACE_STORAGE_KEY = "farm-return:audit-trace:v1";
const FARM_STATE_STORAGE_KEY = "farm-return:v1";

function review(overrides: Partial<PeerReview> = {}): PeerReview {
  return {
    peerReviewId: "PR_1",
    calculationRunId: "RUN_1",
    recommendationId: "REC_1",
    reviewStatus: "VERIFIED",
    reviewedAt: "2026-08-26T10:00:00+01:00",
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("createLocalStoragePeerReviewStore", () => {
  it("defaults to UNREVIEWED for a recommendation with no review recorded (the spec's own default)", () => {
    const store = createLocalStoragePeerReviewStore();
    expect(store.currentStatusForRecommendation("REC_NEVER_REVIEWED")).toBe("UNREVIEWED");
    expect(store.listForRecommendation("REC_NEVER_REVIEWED")).toEqual([]);
  });

  it("add() persists to its own dedicated localStorage key", () => {
    const store = createLocalStoragePeerReviewStore();
    store.add(review());
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).reviews).toHaveLength(1);
  });

  it("currentStatusForRecommendation reflects the MOST RECENT review, not the first", () => {
    const store = createLocalStoragePeerReviewStore();
    store.add(review({ peerReviewId: "PR_1", reviewStatus: "QUESTIONED", reviewedAt: "2026-08-01T00:00:00Z" }));
    store.add(review({ peerReviewId: "PR_2", reviewStatus: "VERIFIED", reviewedAt: "2026-08-26T00:00:00Z" }));
    expect(store.currentStatusForRecommendation("REC_1")).toBe("VERIFIED");
    expect(store.listForRecommendation("REC_1")).toHaveLength(2);
  });

  it("never overwrites a prior review — accumulates history, same as TrackedValue.previous", () => {
    const store = createLocalStoragePeerReviewStore();
    store.add(review({ peerReviewId: "PR_1", reviewStatus: "QUESTIONED" }));
    store.add(review({ peerReviewId: "PR_2", reviewStatus: "VERIFIED" }));
    const history = store.listForRecommendation("REC_1");
    expect(history[0].reviewStatus).toBe("QUESTIONED");
    expect(history[1].reviewStatus).toBe("VERIFIED");
  });

  it("a new store instance reads back what a previous instance persisted", () => {
    const storeA = createLocalStoragePeerReviewStore();
    storeA.add(review());
    const storeB = createLocalStoragePeerReviewStore();
    expect(storeB.currentStatusForRecommendation("REC_1")).toBe("VERIFIED");
  });

  it("GFT165: a REJECTED review is recorded, and the audit-trace localStorage key (the calculation record itself) is never touched by it", () => {
    window.localStorage.setItem(AUDIT_TRACE_STORAGE_KEY, JSON.stringify({ version: 1, runs: [{ marker: "untouched-by-rejection" }] }));
    const store = createLocalStoragePeerReviewStore();
    store.add(review({ reviewStatus: "REJECTED" }));
    expect(store.currentStatusForRecommendation("REC_1")).toBe("REJECTED");
    expect(JSON.parse(window.localStorage.getItem(AUDIT_TRACE_STORAGE_KEY)!).runs[0].marker).toBe("untouched-by-rejection");
  });

  it("never touches the audit-trace or farm-state localStorage keys — fully isolated namespaces", () => {
    window.localStorage.setItem(AUDIT_TRACE_STORAGE_KEY, JSON.stringify({ version: 1, runs: [{ marker: "untouched-trace" }] }));
    window.localStorage.setItem(FARM_STATE_STORAGE_KEY, JSON.stringify({ version: 1, state: { marker: "untouched-farm" } }));
    const store = createLocalStoragePeerReviewStore();
    store.add(review());
    expect(JSON.parse(window.localStorage.getItem(AUDIT_TRACE_STORAGE_KEY)!).runs[0].marker).toBe("untouched-trace");
    expect(JSON.parse(window.localStorage.getItem(FARM_STATE_STORAGE_KEY)!).state.marker).toBe("untouched-farm");
  });

  it("scopes listForRecommendation to only the requested recommendation", () => {
    const store = createLocalStoragePeerReviewStore();
    store.add(review({ recommendationId: "REC_A" }));
    store.add(review({ recommendationId: "REC_B" }));
    expect(store.listForRecommendation("REC_A")).toHaveLength(1);
    expect(store.listForRecommendation("REC_B")).toHaveLength(1);
  });
});
