"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  adoptSlurryForecastScenarioAction,
  getAdoptedSlurryForecastAction,
  getAutomaticSlurryPlanAction,
  getSlurryStorageForecastAction,
  previewSlurryFirstFertiliserPlanAction,
  withdrawSlurryForecastAdoptionAction,
  type AdoptedSlurryForecastSummary,
  type SlurryFirstFertiliserPlanResult,
  type SlurryFirstPreviewInput,
} from "@/app/actions/fertiliser-plan";

interface PlanningField {
  fieldId: string;
  fieldName: string;
}

interface PlanningStore {
  housingId: string;
  shedName: string;
  capacityM3: number;
}

interface CandidateDraft {
  key: number;
  fieldId: string;
  housingId: string;
  volumeM3: string;
  applicationMethod: "" | "LESS" | "splashplate" | "incorporate_24h" | "other";
  applicationDate: string;
}

const ISSUE_COPY: Record<string, string> = {
  PLANNING_DATE_INVALID: "Choose a valid planning date.",
  PLANNING_DATE_OUTSIDE_PLANNING_SEASON: "Choose a planning date in the season being planned.",
  EXPECTED_AVAILABLE_VOLUME_INVALID: "Enter the slurry volume you expect to have available.",
  DUPLICATE_FIELD_STORE_CANDIDATE: "The same field and slurry store cannot be added twice.",
  MULTIPLE_CANDIDATES_FOR_FIELD_UNSUPPORTED: "Use one slurry proposal per field in this planning preview.",
  CANDIDATE_IDENTITY_INVALID: "Choose a field and slurry store for every proposal.",
  CANDIDATE_VOLUME_INVALID: "Enter a positive slurry volume for every proposal.",
  CANDIDATE_METHOD_INVALID: "Choose how the slurry will be spread for every proposal.",
  CANDIDATE_APPLICATION_DATE_INVALID: "Choose a spreading date for every proposal.",
  CANDIDATE_APPLICATION_DATE_OUTSIDE_PLANNING_SEASON: "Every spreading date must fall in the planning season — slurry spread in another season does not reduce this season's fertiliser.",
  FORECAST_VOLUME_EXCEEDED: "The proposed slurry applications exceed the forecast volume available.",
  FIELD_NOT_FOUND: "One selected field is no longer available.",
  STORE_NOT_FOUND: "One selected slurry store is no longer available.",
  STORE_CAPACITY_EXCEEDED: "A slurry store is allocated more than its recorded physical capacity.",
  FORECAST_ADOPTION_REQUIRES_FUTURE_SEASON: "Only a future season's forecast can be adopted. Plan this season's slurry from the store as a live allocation.",
};

const METHOD_LABELS: Record<string, string> = {
  LESS: "LESS",
  splashplate: "Splashplate",
  incorporate_24h: "Incorporated within 24 h",
  other: "Other method",
};

/** A future season starts from its late-January forecast date (the
 * end of the typical closed period); the current season from today. */
function defaultPlanningDate(planningSeason: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return planningSeason > today.slice(0, 4) ? `${planningSeason}-01-30` : today;
}

type PreviewDemand = Extract<SlurryFirstFertiliserPlanResult, { status: "ready" }>["baseline"];

function tonnesLines(result: PreviewDemand) {
  return result.purchaseRequirementTonnes.filter((line) => line.remainingTotalKg > 0);
}

export function SlurryFirstPlanningPanel({
  planningSeason,
  fields,
  stores,
  currentUnallocatedM3,
  onAdoptionChange,
}: {
  /** The season the fertiliser plan is quoting. Every proposal is dated in
   * it, because only that season's slurry credits its chemical need. */
  planningSeason: string;
  fields: PlanningField[];
  stores: PlanningStore[];
  currentUnallocatedM3: number;
  /** Called after a forecast is adopted or withdrawn, so the season's plan
   * and quote figures are re-read. */
  onAdoptionChange?: () => void;
}) {
  const futureSeason = planningSeason > String(new Date().getUTCFullYear());
  const seasonStart = `${planningSeason}-01-01`;
  const seasonEnd = `${planningSeason}-12-31`;
  const [open, setOpen] = useState(false);
  const [planningDate, setPlanningDate] = useState(() => defaultPlanningDate(planningSeason));
  const [expectedAvailableM3, setExpectedAvailableM3] = useState("");
  const [calculatedForecastM3, setCalculatedForecastM3] = useState<number | null>(null);
  const [forecastMessage, setForecastMessage] = useState("Calculating from livestock and tank records…");
  const [forecastSource, setForecastSource] = useState<"SYSTEM_FORECAST" | "FARMER_FORECAST">("SYSTEM_FORECAST");
  const [carryForwardCurrent, setCarryForwardCurrent] = useState(true);
  const [candidates, setCandidates] = useState<CandidateDraft[]>([]);
  const [result, setResult] = useState<SlurryFirstFertiliserPlanResult | null>(null);
  const [autoPlanMessage, setAutoPlanMessage] = useState<string | null>(null);
  const [previewedInput, setPreviewedInput] = useState<SlurryFirstPreviewInput | null>(null);
  const [adopted, setAdopted] = useState<AdoptedSlurryForecastSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!futureSeason) return;
    let cancelled = false;
    void getAdoptedSlurryForecastAction(planningSeason)
      .then((summary) => {
        if (!cancelled) setAdopted(summary);
      })
      .catch(() => {
        if (!cancelled) setAdopted(null);
      });
    return () => { cancelled = true; };
  }, [futureSeason, planningSeason]);

  const allocatedDraftM3 = useMemo(
    () => candidates.reduce((sum, candidate) => sum + (Number(candidate.volumeM3) > 0 ? Number(candidate.volumeM3) : 0), 0),
    [candidates],
  );
  useEffect(() => {
    let cancelled = false;
    void getSlurryStorageForecastAction(planningDate)
      .then((response) => {
        if (cancelled) return;
        if (response.status === "ready") {
          const volume = response.forecast.projectedAvailableForNewPlanM3;
          setCalculatedForecastM3(volume);
          setExpectedAvailableM3(String(Math.round(volume * 100) / 100));
          const fullDates = response.forecast.stores
            .filter((store) => store.status === "READY" && store.projectedCapacityDate)
            .map((store) => store.status === "READY" ? `${store.shedName}: ${store.projectedCapacityDate}` : "")
            .filter(Boolean);
          setForecastMessage(fullDates.length > 0
            ? `${volume.toFixed(0)} m³ forecast available for a new plan. Recorded capacity projected: ${fullDates.join(" · ")}.`
            : `${volume.toFixed(0)} m³ forecast available for a new plan on ${planningDate}.`);
        } else {
          setExpectedAvailableM3("");
          setForecastMessage(response.message);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setExpectedAvailableM3("");
        setForecastMessage("Future slurry volume could not be calculated from the current records.");
      });
    return () => { cancelled = true; };
  }, [planningDate]);


  const addCandidate = () => {
    setCandidates((current) => [
      ...current,
      {
        key: current.reduce((max, candidate) => Math.max(max, candidate.key), 0) + 1,
        fieldId: "",
        housingId: "",
        volumeM3: "",
        applicationMethod: "",
        applicationDate: "",
      },
    ]);
  };

  const useRecommendedAllocation = () => {
    setAutoPlanMessage("Calculating recommended field allocation…");
    startTransition(async () => {
      const plan = await getAutomaticSlurryPlanAction(planningDate);
      if (plan.status !== "ready") {
        setAutoPlanMessage(plan.message);
        return;
      }
      setExpectedAvailableM3(String(Math.round(plan.expectedAvailableM3 * 100) / 100));
      setForecastSource("SYSTEM_FORECAST");
      setCandidates(plan.recommendations.map((r, index) => ({
        key: index + 1, fieldId: r.fieldId, housingId: r.housingId, volumeM3: String(Math.round(r.volumeM3 * 100) / 100),
        applicationMethod: r.applicationMethod, applicationDate: r.applicationDate,
      })));
      setAutoPlanMessage(`${plan.recommendations.length} field recommendation${plan.recommendations.length === 1 ? "" : "s"} · ${plan.allocatedM3.toFixed(0)} m³ allocated · estimated from P3 chemical-purchase reduction.`);
    });
  };

  const runPreview = () => {
    if (planningDate.slice(0, 4) !== planningSeason) {
      setResult({ status: "validation_error", issues: ["PLANNING_DATE_OUTSIDE_PLANNING_SEASON"] });
      return;
    }
    setResult(null);
    setPreviewedInput(null);
    startTransition(async () => {
      const expected = Number(expectedAvailableM3);
      const input: SlurryFirstPreviewInput = {
        planningDate,
        expectedAvailableM3: expected,
        source: forecastSource,
        productionBasis: futureSeason && carryForwardCurrent ? "CARRY_FORWARD_CURRENT_SETTINGS" : "TARGET_SEASON_SAVED",
        candidates: candidates.map((candidate) => ({
          fieldId: candidate.fieldId,
          housingId: candidate.housingId,
          volumeM3: Number(candidate.volumeM3),
          applicationMethod: candidate.applicationMethod,
          applicationDate: candidate.applicationDate,
        })),
      };
      const response = await previewSlurryFirstFertiliserPlanAction(input);
      setResult(response);
      if (response.status === "ready") setPreviewedInput(input);
    });
  };

  // Adopts exactly the scenario that was previewed; the server re-validates
  // it by the same contract before storing it as forecast intent.
  const adoptPreview = () => {
    if (!previewedInput) return;
    startTransition(async () => {
      const response = await adoptSlurryForecastScenarioAction(previewedInput);
      if (response.status === "adopted") {
        setAdopted(response.adoption);
        onAdoptionChange?.();
      } else {
        setResult(response);
        setPreviewedInput(null);
      }
    });
  };

  const withdrawAdoption = () => {
    startTransition(async () => {
      await withdrawSlurryForecastAdoptionAction(planningSeason);
      setAdopted(null);
      onAdoptionChange?.();
    });
  };

  const ready = result?.status === "ready" ? result : null;
  const baseline = ready ? tonnesLines(ready.baseline) : [];
  const withSlurry = ready ? tonnesLines(ready.withPlannedSlurry) : [];

  return (
    <section className="border-y border-fr-v2-rule" aria-label="Slurry-first fertiliser planning">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-fr-v2-graphite">Plan {planningSeason} slurry before fertiliser</span>
          <span className="mt-0.5 block text-xs text-fr-v2-muted">Assign forecast slurry to fields for {planningSeason}, then recalculate that season&apos;s chemical basket.</span>
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-forest">{open ? "Hide" : "Open"}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-5 pb-5 pt-2">
          {adopted ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-l-[3px] border-fr-v2-forest pl-3 text-sm" aria-label={`Adopted ${planningSeason} slurry forecast`}>
              <p className="text-fr-v2-graphite">
                <span className="font-semibold">Used for {planningSeason} quotes</span>
                <span className="text-fr-v2-muted">
                  {" "}· {adopted.intents.filter((intent) => intent.countsInPlan).length} field{adopted.intents.filter((intent) => intent.countsInPlan).length === 1 ? "" : "s"} · {adopted.intents.reduce((sum, intent) => sum + intent.volumeM3, 0).toFixed(0)} m³ forecast slurry ({adopted.forecastSource === "FARMER_FORECAST" ? "farmer forecast" : "livestock/store forecast"} for {adopted.planningDate}). Tank levels and live slurry plans are unchanged.
                </span>
              </p>
              <button type="button" disabled={isPending} onClick={withdrawAdoption} className="text-xs font-semibold text-fr-v2-muted underline underline-offset-2">Stop using</button>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-fr-v2-muted">
              Planning date
              <input
                type="date"
                min={seasonStart}
                max={seasonEnd}
                value={planningDate}
                onChange={(event) => {
                  setPlanningDate(event.target.value);
                  setForecastMessage("Calculating from livestock and tank records…");
                  setCalculatedForecastM3(null);
                  setExpectedAvailableM3("");
                  setForecastSource("SYSTEM_FORECAST");
                }}
                className="mt-1 min-h-11 w-full rounded-[6px] border border-fr-v2-rule bg-white px-3 text-sm font-normal text-fr-v2-graphite"
              />
            </label>
            <label className="text-xs font-semibold text-fr-v2-muted">
              Forecast slurry available (m³)
              <input
                inputMode="decimal"
                value={expectedAvailableM3}
                onChange={(event) => { setExpectedAvailableM3(event.target.value); setForecastSource("FARMER_FORECAST"); }}
                placeholder="Calculated from farm records"
                className="mt-1 min-h-11 w-full rounded-[6px] border border-fr-v2-rule bg-white px-3 text-sm font-normal text-fr-v2-graphite"
              />
              <span className="mt-1.5 block font-normal leading-relaxed text-fr-v2-muted">{forecastMessage}</span>
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-normal">
                {calculatedForecastM3 !== null && forecastSource === "FARMER_FORECAST" ? (
                  <button type="button" onClick={() => { setExpectedAvailableM3(String(Math.round(calculatedForecastM3 * 100) / 100)); setForecastSource("SYSTEM_FORECAST"); }} className="text-fr-v2-forest underline underline-offset-2">Use calculated forecast ({calculatedForecastM3.toFixed(0)} m³)</button>
                ) : null}
                <button type="button" onClick={() => { setExpectedAvailableM3(String(Math.round(currentUnallocatedM3 * 100) / 100)); setForecastSource("FARMER_FORECAST"); }} className="text-fr-v2-forest underline underline-offset-2">Override with current unallocated ({currentUnallocatedM3.toFixed(0)} m³)</button>
              </span>
            </label>
          </div>

          {futureSeason ? (
            <label className="flex items-start gap-3 border-l-[3px] border-fr-v2-gold pl-3 text-sm text-fr-v2-graphite">
              <input type="checkbox" checked={carryForwardCurrent} onChange={(event) => setCarryForwardCurrent(event.target.checked)} className="mt-1" />
              <span>
                <span className="font-semibold">Use current crop and production settings as the future-season starting assumption</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-fr-v2-muted">Fields with no saved {planningSeason} field use carry their current settings into {planningSeason} in memory, with chemical fertiliser applied reset to zero. This does not overwrite field records and should be reviewed if next year&apos;s crop or target will change.</span>
              </span>
            </label>
          ) : null}

          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fr-v2-graphite">Field slurry proposals · {planningSeason}</p>
              <p className="text-xs text-fr-v2-muted">Spreading dates fall in {planningSeason}. Planning assumptions only — these do not change today&apos;s tank volume or create live spreading jobs.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button type="button" onClick={useRecommendedAllocation} className="text-sm font-semibold text-fr-v2-forest">Use Farm Return recommendation</button>
              <button type="button" onClick={addCandidate} className="text-sm font-semibold text-fr-v2-forest">Add field</button>
            </div>
          </div>

          {autoPlanMessage ? <p className="border-l-[3px] border-fr-v2-gold pl-3 text-xs leading-relaxed text-fr-v2-muted">{autoPlanMessage}</p> : null}

          {candidates.length === 0 ? (
            <p className="border-l-[3px] border-fr-v2-gold pl-3 text-sm text-fr-v2-muted">Add the fields you are considering for slurry. Farm Return will recalculate chemical fertiliser from those planned credits.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {candidates.map((candidate, index) => (
                <div key={candidate.key} className="grid gap-2 border-t border-fr-v2-rule pt-3 sm:grid-cols-5">
                  <select
                    aria-label={`Slurry proposal ${index + 1} field`}
                    value={candidate.fieldId}
                    onChange={(event) => setCandidates((current) => current.map((item) => item.key === candidate.key ? { ...item, fieldId: event.target.value } : item))}
                    className="min-h-11 rounded-[6px] border border-fr-v2-rule bg-white px-2 text-sm"
                  >
                    <option value="">Field</option>
                    {fields.map((field) => <option key={field.fieldId} value={field.fieldId}>{field.fieldName}</option>)}
                  </select>
                  <select
                    aria-label={`Slurry proposal ${index + 1} store`}
                    value={candidate.housingId}
                    onChange={(event) => setCandidates((current) => current.map((item) => item.key === candidate.key ? { ...item, housingId: event.target.value } : item))}
                    className="min-h-11 rounded-[6px] border border-fr-v2-rule bg-white px-2 text-sm"
                  >
                    <option value="">Store</option>
                    {stores.map((store) => <option key={store.housingId} value={store.housingId}>{store.shedName}</option>)}
                  </select>
                  <input
                    aria-label={`Slurry proposal ${index + 1} volume`}
                    inputMode="decimal"
                    value={candidate.volumeM3}
                    placeholder="m³"
                    onChange={(event) => setCandidates((current) => current.map((item) => item.key === candidate.key ? { ...item, volumeM3: event.target.value } : item))}
                    className="min-h-11 rounded-[6px] border border-fr-v2-rule bg-white px-2 text-sm"
                  />
                  <select
                    aria-label={`Slurry proposal ${index + 1} method`}
                    value={candidate.applicationMethod}
                    onChange={(event) => setCandidates((current) => current.map((item) => item.key === candidate.key ? { ...item, applicationMethod: event.target.value as CandidateDraft["applicationMethod"] } : item))}
                    className="min-h-11 rounded-[6px] border border-fr-v2-rule bg-white px-2 text-sm"
                  >
                    <option value="">Method</option>
                    <option value="LESS">LESS</option>
                    <option value="splashplate">Splashplate</option>
                    <option value="incorporate_24h">Incorporate within 24 h</option>
                    <option value="other">Other</option>
                  </select>
                  <div className="flex gap-2">
                    <input
                      aria-label={`Slurry proposal ${index + 1} date`}
                      type="date"
                      min={seasonStart}
                      max={seasonEnd}
                      value={candidate.applicationDate}
                      onChange={(event) => setCandidates((current) => current.map((item) => item.key === candidate.key ? { ...item, applicationDate: event.target.value } : item))}
                      className="min-h-11 min-w-0 flex-1 rounded-[6px] border border-fr-v2-rule bg-white px-2 text-sm"
                    />
                    <button type="button" onClick={() => setCandidates((current) => current.filter((item) => item.key !== candidate.key))} className="px-2 text-xs font-semibold text-fr-v2-muted">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-fr-v2-rule pt-3">
            <p className="text-xs text-fr-v2-muted">Draft allocated: {allocatedDraftM3.toFixed(0)} m³</p>
            <button
              type="button"
              disabled={isPending}
              onClick={runPreview}
              className="rounded-full bg-fr-v2-forest-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "Calculating…" : "Preview fertiliser after slurry"}
            </button>
          </div>

          {result?.status === "validation_error" ? (
            <div className="border-l-[3px] border-fr-v2-clay pl-3 text-sm text-fr-v2-muted">
              {result.issues.map((issue) => <p key={issue}>{ISSUE_COPY[issue] ?? issue}</p>)}
            </div>
          ) : null}
          {result?.status === "blocked" ? (
            <div className="border-l-[3px] border-fr-v2-gold pl-3 text-sm text-fr-v2-muted">
              <p className="font-semibold text-fr-v2-graphite">More planning evidence is needed</p>
              <p>{result.message}</p>
            </div>
          ) : null}

          {ready ? (
            <div className="flex flex-col gap-4 border-t border-fr-v2-rule pt-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span><strong>{ready.scenario.allocatedM3.toFixed(0)} m³</strong> allocated</span>
                <span><strong>{ready.scenario.unallocatedM3.toFixed(0)} m³</strong> unallocated</span>
                <span className="text-fr-v2-muted">{ready.scenario.source === "SYSTEM_FORECAST" ? "Livestock/store forecast" : "Farmer forecast"} for {ready.scenario.planningDate}</span>
                {ready.scenario.carriedForwardFromSeason ? <span className="text-fr-v2-muted">Production settings carried forward from {ready.scenario.carriedForwardFromSeason}</span> : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ProcurementPreview title="Without planned slurry" lines={baseline} unresolvedFieldCount={ready.baseline.aggregation.counts.unresolved} />
                <ProcurementPreview title="After planned slurry" lines={withSlurry} unresolvedFieldCount={ready.withPlannedSlurry.aggregation.counts.unresolved} />
              </div>

              {futureSeason && previewedInput ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-fr-v2-rule pt-3">
                  <p className="text-xs leading-relaxed text-fr-v2-muted">Use this forecast as the {planningSeason} slurry plan for the fertiliser requirement and supplier quotes. It stays a forecast: today&apos;s tank and live slurry plans do not change, and a live slurry plan for a field replaces its forecast.</p>
                  <button type="button" disabled={isPending} onClick={adoptPreview} className="text-sm font-semibold text-fr-v2-forest">
                    Use for {planningSeason} quotes
                  </button>
                </div>
              ) : null}

              {ready.allocations.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fr-v2-muted">{planningSeason} slurry by field</p>
                  <dl className="mt-2 divide-y divide-fr-v2-rule" aria-label={`${planningSeason} slurry by field`}>
                    {ready.allocations.map((allocation) => (
                      <div key={`${allocation.fieldId}:${allocation.housingId}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
                        <dt className="font-semibold text-fr-v2-graphite">{allocation.fieldName}</dt>
                        <dd className="tabular-nums text-fr-v2-muted">
                          {allocation.volumeM3.toFixed(0)} m³ from {allocation.storeName} · {METHOD_LABELS[allocation.applicationMethod] ?? allocation.applicationMethod} · {allocation.applicationDate}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProcurementPreview({
  title,
  lines,
  unresolvedFieldCount,
}: {
  title: string;
  lines: { product: string; npkAnalysis: string; remainingTotalTonnes: number; remainingTotalKg: number }[];
  /** Fields the canonical aggregation could not resolve. Their need is
   * unknown, never zero, so the preview must not read as complete. */
  unresolvedFieldCount: number;
}) {
  const unresolvedLabel =
    unresolvedFieldCount === 1 ? "1 field still needs" : `${unresolvedFieldCount} fields still need`;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fr-v2-muted">{title}</p>
      {unresolvedFieldCount > 0 ? (
        <p className="mt-2 text-sm text-fr-v2-muted">
          {lines.length === 0
            ? `Requirement not available yet — ${unresolvedLabel} evidence.`
            : `Partial — ${unresolvedLabel} evidence and ${unresolvedFieldCount === 1 ? "is" : "are"} not included below.`}
        </p>
      ) : null}
      {lines.length === 0 ? (
        unresolvedFieldCount > 0 ? null : <p className="mt-2 text-sm text-fr-v2-muted">No chemical fertiliser remaining in this preview.</p>
      ) : (
        <dl className="mt-2 divide-y divide-fr-v2-rule">
          {lines.map((line) => (
            <div key={line.product} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <dt>
                <span className="font-semibold text-fr-v2-graphite">{line.product}</span>
                <span className="ml-1 text-xs text-fr-v2-muted">{line.npkAnalysis}</span>
              </dt>
              <dd className="font-display text-lg tabular-nums text-fr-v2-graphite">{line.remainingTotalTonnes.toFixed(2)} t</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
