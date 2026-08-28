"use client";

import { TriangleAlert } from "lucide-react";
import { useSyncStatus } from "@/store/farm-store";

/**
 * Codex remediation Priority 5 — reliable database mutations. A real-mode
 * write that failed used to only log to the console
 * (`persistRemote`'s old doc comment: "leaves local state ahead of the
 * database until the next full reload") while every screen kept behaving
 * exactly as if the save had succeeded — no farmer-visible signal, no way
 * to retry short of a full reload that might not even happen before they
 * navigate away. This banner makes that failure real and actionable:
 * shown fixed at the top of every screen (mounted once in `AppShell`)
 * whenever `useSyncStatus()` reports at least one failure, naming the
 * failed action and offering a real retry (the exact same write, not a
 * generic "reload") or an explicit dismiss.
 */
export function SyncStatusBanner() {
  const { failures, dismiss } = useSyncStatus();
  if (failures.length === 0) return null;

  return (
    <div className="sticky top-0 z-40 flex flex-col gap-1.5 bg-fr-risk-bg px-4 py-2 text-sm text-fr-risk lg:px-10">
      {failures.map((failure) => (
        <div key={failure.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4 shrink-0" />
            Couldn&apos;t save &ldquo;{failure.label}&rdquo; — your change is showing here but hasn&apos;t reached the
            server yet.
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <button type="button" onClick={failure.retry} className="font-semibold underline underline-offset-2">
              Retry
            </button>
            <button type="button" onClick={() => dismiss(failure.id)} className="text-fr-risk/70">
              Dismiss
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
