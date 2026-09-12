"use client";

/**
 * Fertiliser Vertical V1, Checkpoint 1 — the guided GPS soil sampling
 * screen (`docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`). Field -> SamplingPlan -> pick a zone ->
 * SamplingSession (GPS-guided core recording) -> Confirm -> CompositeSample.
 *
 * Deliberately reuses, not reimplements, the existing Job Session
 * lifecycle actions (pause/resume/finish/confirm — `app/actions/
 * job-sessions.ts`) and the existing `LocationTrackingProvider`/
 * `NetworkStateProvider` abstractions `ActiveJobSessionView.tsx` already
 * established — this is a second UI for a new activity type, not a
 * second GPS/offline architecture (`DOMAIN_CONTRACTS.md`'s reuse
 * boundary).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MapPin, Pause, Play, Square } from "lucide-react";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useFarm, useFields } from "@/store/farm-store";
import { createWebLocationTrackingProvider } from "@/lib/location/web-location-tracking-provider";
import type { LocationPosition, LocationTrackingProvider } from "@/lib/location/location-tracking-provider";
import { createWebNetworkStateProvider } from "@/lib/network/web-network-state-provider";
import type { NetworkStateProvider } from "@/lib/network/network-state-provider";
import {
  getFieldSoilSamplingPlanAction,
  startSoilSamplingSessionAction,
  recordSoilCoreObservationAction,
  confirmSoilSamplingSessionAction,
  getActiveSoilSamplingSessionForFieldAction,
  listFieldCompositeSamplesAction,
  getCompositeSampleForSessionAction,
  listSoilCoreObservationsForSessionAction,
  getSoilSamplingTimingAdvisoryAction,
  type StartSoilSamplingSessionResult,
  type CompositeSampleView,
} from "@/app/actions/soil-sampling";
import { pauseJobSessionAction, resumeJobSessionAction, finishJobSessionAction } from "@/app/actions/job-sessions";
import { enqueueSoilCoreObservation, getPendingSoilCoreObservationCount, flushJobSessionOutbox } from "@/lib/offline/job-session-sync";
import { MIN_CORES_PER_COMPOSITE_SAMPLE, type SamplingPlan, type SamplingZone, type SamplingTimingAssessment } from "@/domain/soil-sampling-plan";
import type { EngineOutcome } from "@/domain/evidence";
import type { JobSessionRecord, SoilCoreObservationRecord } from "@/lib/farm-data/mappers";
import type { CompletionType } from "@/domain/job-actual";

type Phase = "loading" | "blocked" | "pick_zone" | "recording" | "confirming" | "done" | "error";

function describeBlocked(outcome: Exclude<EngineOutcome<SamplingPlan>, { status: "OK" }>): string {
  switch (outcome.status) {
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return `Not enough evidence yet — missing: ${outcome.missingInputs.join(", ")}.`;
    case "AMBIGUOUS":
      return `Unresolved: ${outcome.detail}`;
    case "NOT_APPLICABLE":
      return "Soil sampling is not applicable for this field.";
    case "LEGAL_PROHIBITION":
      return outcome.consequence;
    case "UNKNOWN":
      return "Could not verify whether soil sampling can be planned for this field.";
  }
}

export function SoilSamplePageClient({ fieldId }: { fieldId: string }) {
  const router = useRouter();
  const farm = useFarm();
  const fields = useFields();
  const field = fields.find((f) => f.id === fieldId);

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [plan, setPlan] = useState<SamplingPlan | undefined>(undefined);
  const [nonUniform, setNonUniform] = useState(false);
  const [pastSamples, setPastSamples] = useState<CompositeSampleView[]>([]);
  const [pastSamplesTruncated, setPastSamplesTruncated] = useState(false);
  const [timingAdvisory, setTimingAdvisory] = useState<SamplingTimingAssessment | undefined>(undefined);
  const [timingEvidenceTruncated, setTimingEvidenceTruncated] = useState(false);

  const [session, setSession] = useState<JobSessionRecord | undefined>(undefined);
  const [zone, setZone] = useState<SamplingZone | undefined>(undefined);
  const [cores, setCores] = useState<SoilCoreObservationRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const [livePosition, setLivePosition] = useState<LocationPosition | null>(null);
  const [tracking, setTracking] = useState<"idle" | "tracking" | "unsupported" | "permission_denied" | "interrupted">("idle");

  const [completionType, setCompletionType] = useState<CompletionType>("whole");
  const [note, setNote] = useState("");
  const [sample, setSample] = useState<CompositeSampleView | undefined>(undefined);

  const providerRef = useRef<LocationTrackingProvider | undefined>(undefined);
  if (providerRef.current === undefined) providerRef.current = createWebLocationTrackingProvider();
  const networkProviderRef = useRef<NetworkStateProvider | undefined>(undefined);
  if (networkProviderRef.current === undefined) networkProviderRef.current = createWebNetworkStateProvider();

  const refreshCoreCounts = useCallback(async (jobSessionId: string) => {
    if (!farm) return;
    const [confirmed, pending] = await Promise.all([
      listSoilCoreObservationsForSessionAction(jobSessionId),
      getPendingSoilCoreObservationCount(farm.id, jobSessionId),
    ]);
    setCores(confirmed);
    setPendingCount(pending);
  }, [farm]);

  // Initial load: resume an interrupted session if one exists, else build
  // a fresh plan for this field. Never both — a real, unfinished session
  // always takes priority over offering a new one (campaign "Offline /
  // interruption": restoring local progress).
  useEffect(() => {
    if (!field || !farm) return;
    let cancelled = false;
    (async () => {
      try {
        const active = await getActiveSoilSamplingSessionForFieldAction(field.id);
        if (cancelled) return;
        if (active) {
          setSession(active.session);
          setZone({ zoneId: active.zoneId, label: `Zone ${active.zoneId}`, areaHa: active.zoneAreaHa, minCores: MIN_CORES_PER_COMPOSITE_SAMPLE, reasons: [] });
          setCores(active.cores);
          const pending = await getPendingSoilCoreObservationCount(farm.id, active.session.id);
          if (cancelled) return;
          setPendingCount(pending);
          setPhase(active.session.status === "completed_estimated" ? "confirming" : "recording");
          return;
        }
        const [outcome, pastResult, timing] = await Promise.all([
          getFieldSoilSamplingPlanAction(field.id),
          listFieldCompositeSamplesAction(field.id),
          getSoilSamplingTimingAdvisoryAction(field.id),
        ]);
        if (cancelled) return;
        setPastSamples(pastResult.samples);
        setPastSamplesTruncated(pastResult.truncated);
        setTimingAdvisory(timing.assessment);
        setTimingEvidenceTruncated(timing.evidenceTruncated);
        if (outcome.status !== "OK") {
          setErrorMessage(describeBlocked(outcome));
          setPhase("blocked");
          return;
        }
        setPlan(outcome.value);
        setPhase("pick_zone");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field?.id, farm?.id]);

  // Rebuild the plan when the farmer toggles the non-uniform flag, while
  // still in the pick-zone step.
  useEffect(() => {
    if (phase !== "pick_zone" || !field) return;
    let cancelled = false;
    (async () => {
      const outcome = await getFieldSoilSamplingPlanAction(field.id, nonUniform);
      if (!cancelled && outcome.status === "OK") setPlan(outcome.value);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonUniform]);

  // Continuous GPS tracking while a core-recording session is active —
  // same pattern as ActiveJobSessionView, scoped to this screen's own
  // "recording" phase.
  useEffect(() => {
    if (phase !== "recording" || session?.status !== "active") return;
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
          setLivePosition(position);
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
  }, [phase, session?.status]);

  // Sync the offline outbox whenever we come back online while recording.
  useEffect(() => {
    if (phase !== "recording" || !farm || !session) return;
    const unsubscribe = networkProviderRef.current!.subscribe((online: boolean) => {
      if (!online) return;
      void flushJobSessionOutbox(farm.id).then(() => refreshCoreCounts(session.id));
    });
    return unsubscribe;
  }, [phase, farm, session, refreshCoreCounts]);

  async function handleStartZone(zoneId: string) {
    if (!field || !plan) return;
    setBusy(true);
    setErrorMessage(undefined);
    try {
      const result: StartSoilSamplingSessionResult = await startSoilSamplingSessionAction({ fieldId: field.id, zoneId, manuallyFlaggedNonUniform: nonUniform });
      setSession(result.jobSession);
      setZone(result.zone);
      setCores([]);
      setPendingCount(0);
      setPhase("recording");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordCore() {
    if (!field || !session || !zone || !farm || !livePosition) return;
    setBusy(true);
    const input = {
      id: globalThis.crypto.randomUUID(),
      jobSessionId: session.id,
      fieldId: field.id,
      samplingZoneId: zone.zoneId,
      sequence: cores.length + pendingCount + 1,
      lat: livePosition.lat,
      lng: livePosition.lng,
      accuracyMeters: livePosition.accuracyMeters,
      recordedAt: livePosition.recordedAt,
    };
    try {
      if (networkProviderRef.current!.isOnline()) {
        const { observation } = await recordSoilCoreObservationAction(input);
        setCores((prev) => [...prev, observation]);
      } else {
        throw new Error("offline");
      }
    } catch {
      await enqueueSoilCoreObservation(farm.id, input);
      setPendingCount((p) => p + 1);
    } finally {
      setBusy(false);
    }
  }

  async function handlePause() {
    if (!session) return;
    setBusy(true);
    setErrorMessage(undefined);
    try {
      setSession(await pauseJobSessionAction(session.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    if (!session) return;
    setBusy(true);
    setErrorMessage(undefined);
    try {
      setSession(await resumeJobSessionAction(session.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    if (!session || !farm) return;
    setBusy(true);
    setErrorMessage(undefined);
    try {
      // Codex audit HIGH (round 1 of this checkpoint's own audit,
      // 2026-09-12): finishing while a core is still only locally queued
      // (offline) previously stranded it — `recordSoilCoreObservation`
      // only accepts a session that is still `ready`/`active`, so a core
      // synced *after* Finish would be rejected forever, silently losing
      // real GPS evidence while the summary still claimed it existed.
      // Flush first and re-verify nothing is still pending before
      // allowing the transition; if genuinely still offline, refuse and
      // say so rather than finishing with evidence unaccounted for.
      await flushJobSessionOutbox(farm.id);
      await refreshCoreCounts(session.id);
      const stillPending = await getPendingSoilCoreObservationCount(farm.id, session.id);
      if (stillPending > 0) {
        setErrorMessage(`${stillPending} core(s) recorded on this device are not yet synced — connect to the internet and try again before finishing.`);
        return;
      }
      setSession(await finishJobSessionAction(session.id));
      setPhase("confirming");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!session) return;
    setBusy(true);
    setErrorMessage(undefined);
    try {
      await confirmSoilSamplingSessionAction({
        id: globalThis.crypto.randomUUID(),
        jobSessionId: session.id,
        completionType,
        note: note.trim() || undefined,
      });
      if (completionType !== "did_not_happen" && field) {
        const confirmedSample = await getCompositeSampleForSessionAction(field.id, session.id);
        if (confirmedSample) setSample(confirmedSample);
      }
      setPhase("done");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!field) {
    return (
      <>
        <MobileDetailHeader title="Soil sample" backHref="/soil" />
        <PageHeader title="Soil sample" subtitle="Field not found" />
        <p className="text-sm text-fr-ink-600">This field could not be found on the current farm.</p>
      </>
    );
  }

  return (
    <>
      <MobileDetailHeader title="Soil sampling" backHref="/soil" />
      <PageHeader title="Soil sampling" subtitle={`${field.name}${field.lpisRef ? ` — LPIS ${field.lpisRef}` : ""}`} />

      {phase === "loading" ? <p className="text-sm text-fr-ink-600">Loading…</p> : null}

      {phase === "error" ? <AlertBanner tone="risk" title="Could not load soil sampling" description={errorMessage ?? "An unexpected error occurred."} /> : null}

      {phase === "blocked" ? (
        <AlertBanner tone="attention" title="Cannot plan a soil sample yet" description={errorMessage ?? "Not enough evidence."} />
      ) : null}

      {phase === "pick_zone" && plan ? (
        <div className="flex flex-col gap-4">
          {timingAdvisory && timingAdvisory.status !== "READY" ? (
            <AlertBanner
              tone={timingAdvisory.status === "UNKNOWN" ? "neutral" : "attention"}
              title={timingAdvisory.status === "UNKNOWN" ? "Sampling timing not confirmed" : "Check sampling timing"}
              description={timingAdvisory.detail + (timingEvidenceTruncated ? " (based on this farm's most recent 200 confirmed activities — older history was not checked.)" : "")}
            />
          ) : null}
          <Card className="flex flex-col gap-2 p-4 text-sm text-fr-ink-700">
            <p className="font-semibold text-fr-ink-900">Sampling plan — {plan.totalAreaHa.toFixed(2)} ha</p>
            {plan.reasons.map((r, i) => (
              <p key={i} className="text-xs text-fr-ink-600">{r}</p>
            ))}
            <p className="text-xs text-fr-ink-600">{plan.routeGuidance} {plan.exclusionGuidance}</p>
            <label className="mt-2 flex items-center gap-2 text-xs text-fr-ink-700">
              <input type="checkbox" checked={nonUniform} onChange={(e) => setNonUniform(e.target.checked)} />
              This field has an area that&apos;s clearly different (soil type, past cropping, slope/drainage, or persistently poor yield)
            </label>
          </Card>

          {plan.zones.map((z) => (
            <Card key={z.zoneId} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold text-fr-ink-900">{z.label}</p>
                <p className="text-xs text-fr-ink-600">{z.areaHa.toFixed(2)} ha — minimum {z.minCores} cores</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleStartZone(z.zoneId)}
                className="rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Start
              </button>
            </Card>
          ))}

          {pastSamples.length > 0 ? (
            <Card className="flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold text-fr-ink-900">Previous samples</p>
              {pastSamples.map((s) => (
                <p key={s.jobSessionId} className="text-xs text-fr-ink-600">
                  {s.sampleId} — {s.samplingZoneId}, {s.coreCount} cores, {new Date(s.sampleDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              ))}
              {pastSamplesTruncated ? <p className="text-xs text-fr-attention">Showing this farm&apos;s most recent confirmed activity only — older samples may exist but were not checked.</p> : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      {phase === "recording" && session && zone ? (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center gap-3 p-6">
            <p className="text-sm text-fr-ink-600">{zone.label}</p>
            <p className="font-display text-4xl tabular-nums text-fr-ink-900">
              {cores.length + pendingCount} / {zone.minCores}
            </p>
            <p className="text-xs text-fr-ink-600">Cores recorded (minimum)</p>
            <div className="flex items-center gap-1.5 text-sm text-fr-ink-600">
              <MapPin className="size-4" />
              {tracking === "tracking" && livePosition?.accuracyMeters !== undefined
                ? `GPS accuracy ±${Math.round(livePosition.accuracyMeters)} m`
                : tracking === "tracking"
                  ? "GPS accuracy unavailable"
                  : tracking === "idle"
                    ? "Starting…"
                    : tracking === "unsupported"
                      ? "GPS not available on this device/browser"
                      : tracking === "permission_denied"
                        ? "Location permission needed"
                        : "Tracking interrupted"}
            </div>
            {pendingCount > 0 ? <p className="text-xs text-fr-attention">{pendingCount} core(s) saved on this device, not yet synced</p> : null}
          </Card>

          {errorMessage ? <AlertBanner tone="risk" title="Could not record core" description={errorMessage} /> : null}

          {session.status === "active" ? (
            <button
              type="button"
              disabled={busy || !livePosition}
              onClick={handleRecordCore}
              className="flex items-center justify-center gap-2 rounded-full bg-fr-green-700 px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
            >
              RECORD CORE
            </button>
          ) : null}

          <div className="flex gap-3">
            {session.status === "active" ? (
              <button type="button" disabled={busy} onClick={handlePause} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-fr-border px-4 py-3 text-sm font-medium text-fr-ink-900 disabled:opacity-60">
                <Pause className="size-4" /> Pause
              </button>
            ) : session.status === "paused" ? (
              <button type="button" disabled={busy} onClick={handleResume} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-fr-border px-4 py-3 text-sm font-medium text-fr-ink-900 disabled:opacity-60">
                <Play className="size-4" /> Resume
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={handleFinish} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-fr-border px-4 py-3 text-sm font-medium text-fr-ink-900 disabled:opacity-60">
              <Square className="size-4" /> Finish sampling
            </button>
          </div>
        </div>
      ) : null}

      {phase === "confirming" && zone ? (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-sm font-semibold text-fr-ink-900">Confirm this sample</p>
            <div className="flex gap-2">
              {(["whole", "partial", "did_not_happen"] as CompletionType[]).map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setCompletionType(ct)}
                  className={`flex-1 rounded-fr-control border px-3 py-2 text-xs font-medium ${completionType === ct ? "border-fr-green-700 bg-fr-green-50 text-fr-green-700" : "border-fr-border text-fr-ink-700"}`}
                >
                  {ct === "whole" ? "Completed" : ct === "partial" ? "Partial" : "Did not happen"}
                </button>
              ))}
            </div>
            {completionType === "partial" ? (
              <label className="block">
                <span className="mb-0.5 block text-xs text-fr-ink-600">Why is this partial? (required)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-2.5 py-1.5 text-sm text-fr-ink-900" rows={2} />
              </label>
            ) : null}
            <p className="text-xs text-fr-ink-600">
              {cores.length + pendingCount} cores recorded (minimum {zone.minCores}).
            </p>
          </Card>
          {errorMessage ? <AlertBanner tone="risk" title="Could not confirm sample" description={errorMessage} /> : null}
          <button
            type="button"
            disabled={busy || (completionType === "partial" && note.trim().length === 0)}
            onClick={handleConfirm}
            className="rounded-full bg-fr-green-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Confirm sample
          </button>
        </div>
      ) : null}

      {phase === "done" && !sample ? (
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm text-fr-ink-700">Recorded as &quot;did not happen&quot; — no sample was taken.</p>
          <button type="button" onClick={() => router.push("/soil")} className="mt-2 rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white">
            Done
          </button>
        </Card>
      ) : null}

      {phase === "done" && sample ? (
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <CheckCircle2 className="size-10 text-fr-green-700" />
          <p className="text-lg font-bold text-fr-ink-900">{sample.sampleId}</p>
          <p className="text-sm text-fr-ink-600">
            {field.name}
            {field.lpisRef ? ` — LPIS ${field.lpisRef}` : ""} — {sample.samplingZoneId}
          </p>
          <p className="text-sm text-fr-ink-600">
            {sample.coreCount} cores — {sample.representedAreaHa !== undefined ? `${sample.representedAreaHa.toFixed(2)} ha represented` : "represented area unavailable"}
          </p>
          <p className="text-xs text-fr-ink-600">{new Date(sample.sampleDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })} — {sample.methodology}, {sample.methodologyVersion}</p>
          <p className="text-xs font-medium text-fr-attention">Awaiting laboratory result</p>
          <button type="button" onClick={() => router.push("/soil")} className="mt-2 rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white">
            Done
          </button>
        </Card>
      ) : null}
    </>
  );
}
