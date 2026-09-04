import { describe, expect, it, vi } from "vitest";
import JobSessionPage from "./page";

// Codex audit MEDIUM (round 7, 2026-09-04, GPS Job Mode campaign):
// `ActiveJobSessionView` seeds its `session`/`finishDetection`/`tracking`
// state from props exactly once, at mount — nothing inside it re-syncs
// state to a later `jobSessionId`/`initialSession` prop change. Without a
// real, differing `key`, the App Router could reuse the same mounted
// instance across two different job sessions (navigating directly from
// one active job to another), leaving stale session data — not just a
// stale GPS finish-detection suggestion — on screen under the new URL.
// This test asserts the actual mechanism the fix relies on directly:
// `page.tsx` gives each distinct job session id its own real React `key`,
// which is what guarantees React treats them as separate instances
// rather than a single instance to reconcile props onto.
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => false }));

describe("JobSessionPage — component identity across different job sessions", () => {
  it("keys ActiveJobSessionView by the job session id, so two different sessions are never reconciled onto the same instance", async () => {
    const elementA = await JobSessionPage({ params: Promise.resolve({ id: "session-1" }) });
    const elementB = await JobSessionPage({ params: Promise.resolve({ id: "session-2" }) });
    const elementARepeat = await JobSessionPage({ params: Promise.resolve({ id: "session-1" }) });

    expect(elementA.key).toBe("session-1");
    expect(elementB.key).toBe("session-2");
    expect(elementA.key).not.toBe(elementB.key);
    // The same id genuinely produces the same key — this isn't just a
    // random/unique value per render, it's the id itself.
    expect(elementARepeat.key).toBe(elementA.key);
  });
});
