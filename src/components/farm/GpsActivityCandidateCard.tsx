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
import { getMatchablePlanForFieldAction, startJobSessionFromPlanAction, type MatchablePlanResult } from "@/app/actions/fertiliser-plan";
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
      void provider.getCapability().then(
        (capability) => {
          if (!cancelled) setPermissionDenied(capability.permissionState === "denied");
        },
        (error) => {
          // Codex audit MEDIUM (round 8, 2026-09-04): `getCapability()`
          // is, by this same interface's own contract, allowed to
          // reject — the controller elsewhere already treats it as
          // fallible. An unhandled rejection every 15s for as long as
          // this card stays mounted is never acceptable; logged, and
          // deliberately leaves `permissionDenied` exactly as it was —
          // a genuine "can't tell right now" is not itself evidence of
          // a denied permission, so this must never claim one.
          if (!cancelled) console.error("[GpsActivityCandidateCard] permission check failed:", error);
        },
      );
    };
    checkPermission();
    const permissionPollId = globalThis.setInterval(checkPermission, 15_000);

    // A genuine `startFarmAwareness` rejection now rethrows (Codex audit
    // MEDIUM, round 4, 2026-09-04) — logged, never left as an unhandled
    // rejection; the permission-poll above still gives an honest reason
    // if the underlying cause was a denied permission.
    controller.start().catch((error) => {
      console.error("[GpsActivityCandidateCard] Farm Awareness could not be started:", error);
    });
    return () => {
      cancelled = true;
      globalThis.clearInterval(permissionPollId);
      // Codex audit MEDIUM (round 14, 2026-09-04): `stop()` can now
      // genuinely reject (it rethrows a real `stopFarmAwareness`
      // failure instead of masking it — see the controller's own doc
      // comment) — a bare `void` here would leave that as an unhandled
      // rejection on unmount.
      controller.stop().catch((error) => {
        console.error("[GpsActivityCandidateCard] Farm Awareness could not be stopped:", error);
      });
      controllerRef.current = undefined;
    };
  }, [isRealMode, fields.length]);

  const candidateField = fields.find((f) => f.id === state.candidateFieldId);

  // Fertiliser Vertical campaign, item 10/11 — before offering to link
  // this detected candidate to a real, already-planned fertiliser
  // application, look up whether one genuinely, unambiguously exists for
  // this field. Deliberately re-checked every time the candidate field
  // itself changes (not once at mount) — a farmer can walk between
  // fields across one Farm Awareness session. "Ambiguous" and "none"
  // both fall back to today's existing unlinked-manual-start behaviour
  // (`confirm()` below) — never an auto-selected guess among multiple
  // plans (a false link is worse than no link).
  const [matchablePlan, setMatchablePlan] = useState<MatchablePlanResult | undefined>(undefined);
  // Codex audit HIGH (round 13): `matchablePlan === undefined` conflated
  // two different real states — "no lookup running" and "a real lookup
  // is still in flight" — and the Confirm button below was never
  // disabled for either, so a quick tap during the async lookup could
  // silently create an unlinked "detected" session even when a real,
  // unambiguous plan exists (the exact GPS-to-plan link campaign item
  // 10 exists to make). Tracked separately so Confirm is only disabled
  // while a real answer is genuinely still pending — never
  // indefinitely: a lookup failure still resolves to "no match" (falls
  // back to the same, already-existing manual-start path), unchanged.
  const [matchablePlanLoading, setMatchablePlanLoading] = useState(false);
  useEffect(() => {
    if (!isRealMode || state.status !== "candidate_start" || !state.candidateFieldId) {
      // Resets the plan-match UI for a real, external trigger — the
      // detector leaving `candidate_start` or switching to a different
      // field — not on every render; the same sanctioned "synchronise
      // from an external change" pattern `FieldAwarenessCard.tsx`'s own
      // identical field-change reset already establishes.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the plan match for a real detector-state/candidateFieldId change, not every render.
      setMatchablePlan(undefined);
      setMatchablePlanLoading(false);
      return;
    }
    let cancelled = false;
    setMatchablePlanLoading(true);
    getMatchablePlanForFieldAction(state.candidateFieldId).then(
      (result) => {
        if (!cancelled) {
          setMatchablePlan(result);
          setMatchablePlanLoading(false);
        }
      },
      (error: unknown) => {
        console.error("[GpsActivityCandidateCard] getMatchablePlanForFieldAction failed:", error);
        if (!cancelled) {
          setMatchablePlan(undefined);
          setMatchablePlanLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isRealMode, state.status, state.candidateFieldId]);

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
      // Codex audit MEDIUM (round 14): round 13 only ever prevented
      // confirming while the *initial* lookup was still in flight —
      // once it settled to `"none"`/`"ambiguous"`, that result was kept
      // for the whole candidate cycle with no revalidation. If a plan
      // was saved, unlinked, or otherwise changed after that lookup
      // settled but before this tap, `confirm()` would still act on the
      // stale result and silently create an unlinked manual session even
      // though a real, unambiguous plan had since become available. The
      // authoritative match is therefore re-resolved right here, at
      // confirmation time, rather than trusted from state.
      //
      // Codex audit MEDIUM (round 20): a failed re-check here used to
      // fall back to a synthesised `{status: "none"}` — treating "the
      // lookup could not be determined" as if it were the real, positive
      // fact "no plan exists". Unlike the initial (display-only) lookup
      // above, this one gates a genuine, consequential fork: link vs.
      // start unlinked. A rejected lookup establishes no such fact, and
      // silently taking the unlinked branch could create a real,
      // orphaned manual session while the farmer's actual planned
      // application goes uncounted and unlinked. Nothing has been
      // committed yet at this point (no session/Decision created), so
      // it's safe to let this failure propagate to the same outer
      // catch every other real failure in this function already uses —
      // the farmer sees the existing "Couldn't start this job" message
      // and can simply tap Confirm again, rather than this tap silently
      // choosing the less-safe branch on their behalf.
      const currentMatch: MatchablePlanResult = await getMatchablePlanForFieldAction(candidateField.id);
      // Fertiliser Vertical campaign, item 10 — if a real, unambiguous
      // planned fertiliser application exists for this field, link the
      // new job session to it rather than starting an unlinked one.
      // `currentMatch.status === "matched"` is the only branch that
      // links — `"ambiguous"`/`"none"` both fall back to the existing
      // unlinked "detected" origin below, exactly as before this
      // campaign (never a guessed link).
      if (currentMatch.status === "matched") {
        await startJobSessionFromPlanAction({
          planDecisionId: currentMatch.plan.id,
          fieldId: candidateField.id,
          activityType: ASSUMED_ACTIVITY_TYPE,
          jobSessionId,
        });
      } else {
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
            // Codex audit HIGH (round 4, 2026-09-04): `state.observations`/
            // `state.firstObservedAt` describe the *whole* detection
            // window, which can include travel time and, after a field
            // switch, an entirely different candidate's own earlier
            // samples — not the evidence that actually produced *this*
            // candidate. `candidateFieldSampleCount`/`candidateFieldEnteredAt`
            // are scoped to observations since the current candidate field
            // was itself established, matching exactly what
            // `advanceStartDetection`'s own qualification check used.
            sampleCount: state.candidateFieldSampleCount,
            firstObservedAt: state.candidateFieldEnteredAt,
          },
        });
      }
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
        {matchablePlanLoading
          ? "Checking for a planned application for this field…"
          : matchablePlan?.status === "matched"
            ? `This matches your planned fertiliser application for ${candidateField.name} — confirming will link this job to that plan.`
            : `Farm Return will record this as ${ASSUMED_ACTIVITY_LABEL} — not this job? Dismiss and start the real one manually from ${candidateField.name}.`}
      </p>
      {error ? <p className="text-xs text-fr-risk">{error}</p> : null}
      <div className="flex gap-2 pr-2">
        <button
          type="button"
          disabled={pending || matchablePlanLoading}
          onClick={confirm}
          className="flex-1 rounded-full bg-fr-green-100 px-3 py-1.5 text-xs font-semibold text-fr-green-900 disabled:opacity-60"
        >
          {pending ? "Starting…" : matchablePlanLoading ? "Checking…" : "Confirm — start job"}
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
