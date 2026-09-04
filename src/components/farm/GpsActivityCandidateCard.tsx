"use client";

/**
 * Farm Return Next — GPS Job Mode campaign, Phase 4/5: the "Before /
 * Start" moment (`docs/farm-return-next/IMPLEMENTATION_LOG.md`'s own GPS
 * Job Mode implementation note). Farm Awareness runs continuously (via
 * `gps-activity-candidate-controller.ts`, wiring the pure
 * `advanceStartDetection` reducer from `src/domain/gps-activity-detection.ts`
 * to a real `LocationTrackingProvider`); this card renders only once
 * that detector has real, conservative, sustained-dwelling evidence
 * (`status === "candidate_start"`) — never on a mere "near a field" one-
 * shot fix, which is `NearbyFieldCard`'s own separate, lighter, already-
 * shipped feature.
 *
 * **Real mode only** — the same discipline every other real-write
 * feature in this app already follows: demo/mock mode never starts Farm
 * Awareness at all (there is no real farm to attribute a detected
 * session to), and confirming a candidate always creates a real
 * `job_sessions` row via the existing, already-audited
 * `startManualJobSessionAction`.
 *
 * **Fertiliser spreading only, this campaign** — GPS evidence can say
 * *where* and *for how long*, never *what*. Per the campaign brief's own
 * "ship the first useful vertical" instruction, this card assumes the
 * one activity type this campaign actually wires an end-to-end Confirm
 * Actual flow for (`job-actual.ts`'s real `FertiliserSpreadingActual`
 * validator) — offering a menu of other activity types here would be a
 * real UI dead end for every one of them, since no other vertical has a
 * complete flow behind it yet. A farmer working a genuinely different
 * activity simply dismisses this card and starts it manually
 * (`/fields`' own existing "Start job" action, unchanged).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { useIsRealMode } from "@/store/farm-store";
import { createGpsActivityCandidateController, type GpsActivityCandidateController } from "@/lib/location/gps-activity-candidate-controller";
import { createWebLocationTrackingProvider } from "@/lib/location/web-location-tracking-provider";
import { startManualJobSessionAction } from "@/app/actions/job-sessions";
import type { GpsActivityFieldRef, GpsActivityStartState } from "@/domain/gps-activity-detection";
import { IDLE_GPS_ACTIVITY_START_STATE } from "@/domain/gps-activity-detection";
import type { Field } from "@/domain/types";

const ASSUMED_ACTIVITY_TYPE = "fertiliser_spreading";
const ASSUMED_ACTIVITY_LABEL = "fertiliser spreading";

export function GpsActivityCandidateCard({ fields }: { fields: Field[] }) {
  const router = useRouter();
  const isRealMode = useIsRealMode();

  const [state, setState] = useState<GpsActivityStartState>(IDLE_GPS_ACTIVITY_START_STATE);
  // Codex audit MEDIUM (round 1, 2026-09-04): a plain `dismissed`
  // boolean suppressed every future candidate for this component's
  // whole lifetime, not just the one the farmer actually dismissed — a
  // genuinely new, later candidate (a different field, a different
  // detection cycle) stayed hidden too. `state.firstObservedAt` changes
  // every time a fresh detection cycle begins (it's `null` again right
  // after `controller.reset()`, then set fresh on the next accepted
  // sample) — a real, already-existing per-cycle identity, reused here
  // rather than inventing a new one. Suppression compares against the
  // cycle that was actually dismissed, not a blanket flag.
  const [dismissedCycleKey, setDismissedCycleKey] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const fieldRefs: GpsActivityFieldRef[] = useMemo(() => fields.map((f) => ({ id: f.id, name: f.name, polygon: f.polygon })), [fields]);
  // Read via a ref inside the controller's own callback so a field list
  // refresh (Today re-fetches on navigation) never needs to restart Farm
  // Awareness — the same "don't restart tracking for an unrelated
  // re-render" discipline `ActiveJobSessionView.tsx` already applies to
  // Active Tracking. Updated in its own effect, never during render
  // (writing a ref during render is unsafe — React may re-run a render
  // without committing it).
  const fieldRefsRef = useRef(fieldRefs);
  useEffect(() => {
    fieldRefsRef.current = fieldRefs;
  }, [fieldRefs]);

  const controllerRef = useRef<GpsActivityCandidateController | undefined>(undefined);
  // Scenario E (campaign brief): "GPS permission denied — app fails
  // safely and provides useful recovery UX." The controller itself
  // already fails safely (never starts Farm Awareness without real
  // support — see its own doc comment); this is the honest, dismissible
  // recovery note a farmer can actually act on, read from the same real
  // capability check, independent of whether detection itself ever
  // starts.
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionNoteDismissed, setPermissionNoteDismissed] = useState(false);

  // Deliberately keyed on isRealMode/fields.length only, not the whole
  // `fields` array reference — a fresh field list is picked up via
  // `fieldRefsRef` above without needing Farm Awareness restarted.
  useEffect(() => {
    if (!isRealMode || fields.length === 0) return;
    let cancelled = false;
    const provider = createWebLocationTrackingProvider();
    const controller = createGpsActivityCandidateController(provider, () => fieldRefsRef.current, setState);
    controllerRef.current = controller;

    // Codex audit MEDIUM (round 1, 2026-09-04): a one-time check at
    // mount only ever catches a permission *already* denied before Farm
    // Awareness starts. A first-time farmer whose initial permission
    // state is genuinely `"prompt"` and who then denies the browser's
    // own native dialog never re-triggers this check — the web
    // adapter's own `watchPosition` error callback is deliberately
    // silent for Farm Awareness (`web-location-tracking-provider.ts`'s
    // own "best-effort, not job-critical" design, unchanged here) — so
    // the promised Scenario E recovery note never appeared. Fixed with a
    // real, periodic re-check instead of a native push signal (which
    // would mean widening `LocationTrackingProvider`'s own frozen
    // interface for every adapter, a materially bigger change than this
    // one card's own recovery-copy need justifies).
    const checkPermission = () => {
      void provider.getCapability().then((capability) => {
        if (!cancelled) setPermissionDenied(capability.permissionState === "denied");
      });
    };
    checkPermission();
    const permissionPollId = globalThis.setInterval(checkPermission, 15_000);

    void controller.start();
    return () => {
      cancelled = true;
      globalThis.clearInterval(permissionPollId);
      void controller.stop();
      controllerRef.current = undefined;
    };
  }, [isRealMode, fields.length]);

  const candidateField = fields.find((f) => f.id === state.candidateFieldId);

  if (!isRealMode) return null;

  if (state.status !== "candidate_start" || !candidateField || state.firstObservedAt === dismissedCycleKey) {
    if (permissionDenied && !permissionNoteDismissed) {
      return (
        <div className="flex items-center gap-3 rounded-fr-card border border-white/15 bg-fr-green-900/55 p-3 pr-2 text-white backdrop-blur-md">
          <MapPin className="size-5 shrink-0 text-white/80" />
          <p className="min-w-0 flex-1 text-xs text-white/80">
            Turn on location for Farm Return to notice field work automatically — you can still start jobs manually either way.
          </p>
          <button
            type="button"
            onClick={() => setPermissionNoteDismissed(true)}
            className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80"
          >
            Dismiss
          </button>
        </div>
      );
    }
    return null;
  }

  async function confirm() {
    if (!candidateField) return;
    setError(undefined);
    setPending(true);
    try {
      const jobSessionId = globalThis.crypto.randomUUID();
      await startManualJobSessionAction({
        activityType: ASSUMED_ACTIVITY_TYPE,
        jobSessionId,
        primaryFieldId: candidateField.id,
        origin: "detected",
        // Real, disclosed detection evidence — never an authoritative
        // fact, purely contextual (`job-session-provenance.ts`'s own
        // "per-value provenance, never one flattened generic 'confirmed'
        // state" discipline extends naturally to this new origin).
        deviceMetadata: {
          detectionSource: "gps_activity_candidate",
          confidence: state.confidence,
          sampleCount: state.observations.length,
          firstObservedAt: state.firstObservedAt,
        },
      });
      controllerRef.current?.reset();
      router.push(`/job/${jobSessionId}`);
    } catch {
      setError("Couldn't start this job — please try again, or start it manually from the field.");
      setPending(false);
    }
  }

  function dismiss() {
    // Records exactly which detection cycle was dismissed (see
    // `dismissedCycleKey`'s own doc comment above) — `firstObservedAt`
    // is real (non-null) here, since this is only reachable while
    // `state.status === "candidate_start"`.
    setDismissedCycleKey(state.firstObservedAt ?? undefined);
    controllerRef.current?.reset();
  }

  return (
    <div className="flex flex-col gap-2 rounded-fr-card border border-white/15 bg-fr-green-900/55 p-3 text-white backdrop-blur-md">
      <div className="flex items-center gap-3">
        <MapPin className="size-5 shrink-0 text-white/80" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="block text-xs text-white/70">Looks like you&apos;re starting work in</span>
          <span className="font-semibold">{candidateField.name}</span>
        </p>
      </div>
      <p className="text-xs text-white/70">
        Farm Return will record this as {ASSUMED_ACTIVITY_LABEL} — not this job? Dismiss and start the real one manually from {candidateField.name}.
      </p>
      {error ? <p className="text-xs text-fr-risk">{error}</p> : null}
      <div className="flex gap-2 pr-2">
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="flex-1 rounded-full bg-fr-green-100 px-3 py-1.5 text-xs font-semibold text-fr-green-900 disabled:opacity-60"
        >
          {pending ? "Starting…" : "Confirm — start job"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={dismiss}
          className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 disabled:opacity-60"
        >
          Not this job
        </button>
      </div>
    </div>
  );
}
