"use client";

/**
 * Active GPS Job Mode — the live, interactive part
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §7/§18). Deliberately minimal per that section's own "keep deliberately
 * minimal and mobile-first... do not turn this screen into a form"
 * instruction: activity, field, GPS/tracking state, elapsed duration,
 * sync/offline state, Finish Job, Pause only.
 *
 * **Offline-first**: Pause/Resume/Finish compute their own transition
 * client-side (`src/domain/job-session-lifecycle.ts`'s pure functions)
 * and, when offline (`NetworkStateProvider.isOnline()` —
 * `src/lib/network/network-state-provider.ts`, Phase B 2026-09-03; no
 * raw `navigator.onLine` read directly in this file any more), queue the
 * result via the offline outbox (`src/lib/offline/job-session-sync.ts`)
 * instead of calling the server action directly — the same "device
 * observation -> durable local storage -> sync" path §8 requires. GPS
 * observations are always queued through the outbox first, then
 * opportunistically flushed, never sent as a bare fire-and-forget network
 * call. A genuine online transition (the device regains connectivity
 * mid-session) also triggers a proactive flush — previously only a fresh
 * GPS fix's own opportunistic flush would eventually catch up.
 *
 * **Tracking honesty** (§9): this screen never claims a capability
 * `LocationTrackingProvider` doesn't actually report. If the browser has
 * no geolocation, or permission is denied, this says so plainly rather
 * than silently showing "Tracking".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pause, Play, Square } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { AskAIButton } from "@/components/next/AskAI";
import { Card } from "@/components/ui/Card";
import { useFarm, useFields, useIsRealMode } from "@/store/farm-store";
import type { JobSessionRecord } from "@/lib/farm-data/mappers";
import {
  computeElapsedSeconds,
  finishJobSession as finishJobSessionLifecycle,
  pauseJobSession as pauseJobSessionLifecycle,
  resumeJobSession as resumeJobSessionLifecycle,
  type JobSessionLifecycleState,
} from "@/domain/job-session-lifecycle";
import { finishJobSessionAction, pauseJobSessionAction, resumeJobSessionAction } from "@/app/actions/job-sessions";
import {
  enqueueJobSessionGpsObservation,
  enqueueJobSessionLifecyclePatch,
  flushJobSessionOutbox,
  reclaimStaleOutboxItems,
} from "@/lib/offline/job-session-sync";
import { createWebLocationTrackingProvider } from "@/lib/location/web-location-tracking-provider";
import type { LocationTrackingProvider } from "@/lib/location/location-tracking-provider";
import { createWebNetworkStateProvider } from "@/lib/network/web-network-state-provider";
import type { NetworkStateProvider } from "@/lib/network/network-state-provider";
import { ConfirmActualSheet } from "@/components/next/ConfirmActualSheet";

type TrackingDisplayState = "idle" | "tracking" | "unsupported" | "permission_denied" | "interrupted";

function toLifecycleState(session: JobSessionRecord): JobSessionLifecycleState {
  return {
    status: session.status,
    activeIntervals: session.activeIntervals,
    interruptionGaps: session.interruptionGaps,
    cancelledReason: session.cancelledReason,
  };
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  fertiliser_spreading: "Fertiliser spreading",
  slurry_spreading: "Slurry spreading",
  silage: "Silage",
  field_inspection: "Field inspection",
  livestock_work: "Livestock work",
};

export function ActiveJobSessionView({
  jobSessionId,
  initialSession,
  demoMode,
  unavailable,
}: {
  jobSessionId: string;
  initialSession: JobSessionRecord | null;
  demoMode: boolean;
  unavailable?: boolean;
}) {
  const router = useRouter();
  const farm = useFarm();
  const fields = useFields();
  const isRealMode = useIsRealMode();

  const [session, setSession] = useState<JobSessionRecord | null>(initialSession);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const [tracking, setTracking] = useState<TrackingDisplayState>("idle");
  const [actionError, setActionError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const providerRef = useRef<LocationTrackingProvider | undefined>(undefined);
  if (providerRef.current === undefined) providerRef.current = createWebLocationTrackingProvider();
  // Phase B (native/background GPS readiness, 2026-09-03): one real
  // `NetworkStateProvider` instance replaces every raw `navigator.onLine`
  // check this file previously scattered inline — see that module's own
  // header comment for why (a future native adapter needs one real
  // boundary to implement, not three call sites to find and update).
  const networkProviderRef = useRef<NetworkStateProvider | undefined>(undefined);
  if (networkProviderRef.current === undefined) networkProviderRef.current = createWebNetworkStateProvider();
  // Static initial value, corrected by the effect below immediately after
  // mount — matches `tracking`'s own static `"idle"` default just above
  // rather than reading `networkProviderRef.current` during render itself
  // (refs are only ever read inside an effect/handler in this file, never
  // synchronously during render — `react-hooks/refs`).
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const networkProvider = networkProviderRef.current!;
    setIsOnline(networkProvider.isOnline());
    return networkProvider.subscribe((online) => {
      setIsOnline(online);
      // Real offline-resilience gap closed here (Phase B, 2026-09-03):
      // nothing in this app previously flushed the outbox automatically
      // on regaining connectivity mid-session — a farmer whose signal
      // returned had to wait for the next GPS fix's own opportunistic
      // flush (every real position update already does this) or leave
      // the screen and come back. A genuine `online` transition is
      // exactly the moment `job-session-sync.ts`'s own doc comment names
      // ("call this whenever connectivity is available... an `online`
      // event") as the right time to flush proactively.
      if (online && isRealMode) void flushJobSessionOutbox(farm.id);
    });
  }, [farm.id, isRealMode]);

  // Real offline-resilience gap closed here (Phase B, 2026-09-03):
  // `outbox.ts`'s own `reclaimStale` exists specifically for "a real
  // caller should invoke this explicitly, e.g. once at app startup" (its
  // own doc comment) but had no real caller anywhere in this app — a
  // genuinely abandoned item (this exact screen's own tab closing or
  // crashing mid-sync) would stay stuck in `"syncing"` forever, never
  // retried, since nothing ever reclaimed it back to `"pending"`.
  // Mounting this screen for a real, active-tracking session is exactly
  // the "app startup for this farm's own Job Session work" moment that
  // doc comment names. Runs once per farm/mode, then opportunistically
  // flushes anything reclaimed (or already pending) if online.
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    (async () => {
      const reclaimed = await reclaimStaleOutboxItems(farm.id);
      if (cancelled) return;
      if (reclaimed > 0 && networkProviderRef.current!.isOnline()) void flushJobSessionOutbox(farm.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [farm.id, isRealMode]);

  // Elapsed-time tick — this is the one thing this screen updates purely
  // client-side, every second, with no network call (`computeElapsedSeconds`
  // is a pure function of the session's own already-known intervals).
  useEffect(() => {
    const interval = setInterval(() => setNowIso(new Date().toISOString()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Active GPS tracking — only while the session is genuinely "active".
  useEffect(() => {
    if (!session || session.status !== "active" || !isRealMode) return;
    let cancelled = false;
    const provider = providerRef.current!;
    (async () => {
      const capability = await provider.getCapability();
      if (cancelled) return;
      if (!capability.activeTrackingSupported) {
        setTracking(capability.permissionState === "denied" ? "permission_denied" : "unsupported");
        return;
      }
      await provider.startActiveTracking(
        (position) => {
          if (cancelled) return;
          setTracking("tracking");
          void enqueueJobSessionGpsObservation(farm.id, {
            id: globalThis.crypto.randomUUID(),
            farmId: farm.id,
            source: "phone_gps",
            recordedAt: position.recordedAt,
            payload: { lat: position.lat, lng: position.lng, accuracyM: position.accuracyMeters },
            jobSessionId: session.id,
          }).then(() => {
            if (networkProviderRef.current!.isOnline()) void flushJobSessionOutbox(farm.id);
          });
        },
        () => {
          if (!cancelled) setTracking("interrupted");
        },
      );
    })();
    return () => {
      cancelled = true;
      void provider.stopActiveTracking();
    };
    // Deliberately keyed on session?.status/session?.id, not the whole
    // `session` object — a Pause/Resume tick that leaves status and id
    // unchanged (none do) would otherwise be irrelevant to whether
    // tracking should (re)start; every render creates a fresh `session`
    // object reference (state, not a ref), so depending on it directly
    // would restart tracking on every unrelated re-render (e.g. every
    // elapsed-time tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, session?.id, farm.id, isRealMode]);

  const elapsedSeconds = useMemo(() => (session ? computeElapsedSeconds(session, nowIso) : 0), [session, nowIso]);
  const fieldName = fields.find((f) => f.id === session?.primaryFieldId)?.name;
  const activityLabel = session ? (ACTIVITY_LABELS[session.activityType] ?? session.activityType) : "";

  async function applyTransition(
    pureFn: (state: JobSessionLifecycleState, nowIso: string) => { ok: true; state: JobSessionLifecycleState } | { ok: false; error: string },
    onlineAction: (id: string) => Promise<JobSessionRecord>,
  ) {
    if (!session || !isRealMode) return;
    setActionError(undefined);
    const result = pureFn(toLifecycleState(session), new Date().toISOString());
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setPending(true);
    try {
      if (networkProviderRef.current!.isOnline()) {
        const updated = await onlineAction(session.id);
        setSession(updated);
      } else {
        // Offline-first: apply the already-computed transition locally
        // and queue it — see this file's own header comment.
        await enqueueJobSessionLifecyclePatch(farm.id, session.id, {
          status: result.state.status,
          activeIntervals: result.state.activeIntervals,
        });
        setSession({ ...session, status: result.state.status, activeIntervals: result.state.activeIntervals });
      }
    } catch (error) {
      console.error("[ActiveJobSessionView] transition failed:", error);
      setActionError("Something went wrong — please try again.");
    } finally {
      setPending(false);
    }
  }

  if (demoMode) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Active job" subtitle="Demo mode" />
        <Card className="p-4 text-sm text-fr-ink-600">Demo mode — Job Sessions aren&apos;t available here.</Card>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Active job" />
        <Card className="p-4 text-sm text-fr-ink-600">This job is temporarily unavailable — please try again shortly.</Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Active job" />
        <Card className="p-4 text-sm text-fr-ink-600">No job found with id {jobSessionId}.</Card>
      </div>
    );
  }

  const askAIContext = {
    screen: "GPS Job Mode",
    facts: {
      Activity: activityLabel,
      ...(fieldName ? { Field: fieldName } : {}),
      Status: session.status,
      Elapsed: formatElapsed(elapsedSeconds),
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={activityLabel} subtitle={fieldName} actions={<AskAIButton context={askAIContext} />} />
      <div className="mb-2 flex items-center justify-between lg:hidden">
        <div>
          <h1 className="text-title text-fr-ink-900">{activityLabel}</h1>
          {fieldName ? <p className="text-sm text-fr-ink-600">{fieldName}</p> : null}
        </div>
        <AskAIButton context={askAIContext} />
      </div>

      <Card className="flex flex-col items-center gap-3 p-6">
        <p className="font-display text-4xl tabular-nums text-fr-ink-900">{formatElapsed(elapsedSeconds)}</p>
        <div className="flex items-center gap-1.5 text-sm text-fr-ink-600">
          <MapPin className="size-4" />
          {tracking === "tracking" ? "Tracking" : null}
          {tracking === "idle" ? "Starting…" : null}
          {tracking === "unsupported" ? "GPS not available on this device/browser" : null}
          {tracking === "permission_denied" ? "Location permission needed" : null}
          {tracking === "interrupted" ? "Tracking interrupted" : null}
        </div>
        <p className="text-xs text-fr-ink-400">
          {!isOnline ? "Offline — saved on this device, will sync when connected" : "Synced"}
        </p>
      </Card>

      {actionError ? <div className="rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-sm text-fr-attention">{actionError}</div> : null}

      <div className="flex gap-3">
        {session.status === "active" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => applyTransition(pauseJobSessionLifecycle, pauseJobSessionAction)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-fr-border px-4 py-3 text-sm font-medium text-fr-ink-900 disabled:opacity-60"
          >
            <Pause className="size-4" /> Pause
          </button>
        ) : session.status === "paused" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => applyTransition(resumeJobSessionLifecycle, resumeJobSessionAction)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-fr-border px-4 py-3 text-sm font-medium text-fr-ink-900 disabled:opacity-60"
          >
            <Play className="size-4" /> Resume
          </button>
        ) : null}
        {session.status === "active" || session.status === "paused" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => applyTransition(finishJobSessionLifecycle, finishJobSessionAction)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-fr-green-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Square className="size-4" /> Finish job
          </button>
        ) : null}
      </div>

      {session.status === "completed_estimated" || session.status === "confirmed_actual" ? (
        <ConfirmActualSheet
          open
          onClose={() => router.push("/today")}
          session={session}
          farmId={farm.id}
          fields={fields}
          canRecord={isRealMode}
          onConfirmed={() => router.push("/records")}
        />
      ) : null}
    </div>
  );
}
