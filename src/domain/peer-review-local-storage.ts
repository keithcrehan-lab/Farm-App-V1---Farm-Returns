/**
 * Scientific engine V3 — Phase J: real, persistent `PeerReview` storage.
 *
 * `RECOMMENDATION_AUDIT_REPORT_SPEC.md` §4L / §6: "Reviewer judgement
 * must not mutate the historical calculation" — stored entirely
 * separately from `CalculationRun`s, under its own dedicated
 * `localStorage` key, so a peer-review action can never touch, and has no
 * mechanism BY WHICH it could touch, the immutable calculation record it
 * reviews. Mirrors `audit-trace-local-storage.ts`'s exact pattern
 * (separate namespace, fail-silent on storage errors, version-guarded).
 */

import type { PeerReview } from "./audit-trace";

const STORAGE_KEY = "farm-return:peer-review:v1";
const STORAGE_VERSION = 1;

interface PersistedPeerReviewState {
  version: number;
  reviews: PeerReview[];
}

function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadPersistedReviews(): PeerReview[] {
  if (!isBrowserEnvironment()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedPeerReviewState;
    if (parsed.version !== STORAGE_VERSION) return [];
    return parsed.reviews;
  } catch {
    return [];
  }
}

function persistReviews(reviews: PeerReview[]): void {
  if (!isBrowserEnvironment()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, reviews } satisfies PersistedPeerReviewState));
  } catch {
    // Private browsing / storage full / disabled — fail silent, same
    // convention as every other localStorage-backed store in this app.
  }
}

export interface PeerReviewStore {
  /** Appends a new review record. A recommendation can accumulate
   * several review records over time (e.g. `QUESTIONED` then later
   * `VERIFIED` once resolved) — this never overwrites a prior one, same
   * "history, not replacement" principle as `TrackedValue.previous`. */
  add(review: PeerReview): void;
  /** Every review recorded for one recommendation, oldest first. */
  listForRecommendation(recommendationId: string): PeerReview[];
  /** The most recent review status for a recommendation, or
   * `"UNREVIEWED"` if none has ever been recorded — the spec's own
   * default (`required_input_fields.csv`'s `RECOMMENDATION_REVIEW_STATE`
   * row: "Default UNREVIEWED"). */
  currentStatusForRecommendation(recommendationId: string): PeerReview["reviewStatus"];
}

export function createLocalStoragePeerReviewStore(): PeerReviewStore {
  let reviews = loadPersistedReviews();

  return {
    add(review) {
      reviews = [...reviews, review];
      persistReviews(reviews);
    },
    listForRecommendation(recommendationId) {
      return reviews.filter((r) => r.recommendationId === recommendationId);
    },
    currentStatusForRecommendation(recommendationId) {
      const forRec = reviews.filter((r) => r.recommendationId === recommendationId);
      if (forRec.length === 0) return "UNREVIEWED";
      return forRec[forRec.length - 1].reviewStatus;
    },
  };
}
