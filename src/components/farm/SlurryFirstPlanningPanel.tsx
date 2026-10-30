"use client";

import { useMemo, useState, useTransition } from "react";
import {
  previewSlurryFirstFertiliserPlanAction,
  type SlurryFirstFertiliserPlanResult,
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
  EXPECTED_AVAILABLE_VOLUME_INVALID: "Enter the slurry volume you expect to have available.",
  DUPLICATE_FIELD_STORE_CANDIDATE: "The same field and slurry store cannot be added twice.",
  MULTIPLE_CANDIDATES_FOR_FIELD_UNSUPPORTED: "Use one slurry proposal per field in this planning preview.",
  CANDIDATE_IDENTITY_INVALID: "Choose a field and slurry store for every proposal.",
  CANDIDATE_VOLUME_INVALID: "Enter a positive slurry volume for every proposal.",
  CANDIDATE_METHOD_INVALID: "Choose how the slurry will be spread for every proposal.",
  CANDIDATE_APPLICATION_DATE_INVALID: "Choose a spreading date for every proposal.",
  FORECAST_VOLUME_EXCEEDED: "The proposed slurry applications exceed the forecast volume available.",
  FIELD_NOT_FOUND: "One selected field is no longer available.",
  STORE_NOT_FOUND: "One selected slurry store is no longer available.",
  STORE_CAPACITY_EXCEEDED: "A slurry store is allocated more than its recorded physical capacity.",
};

function nextJanuaryDate(): string {
  const year = new Date().getUTCFullYear() + 1;
  return `${year}-01-30`;
}

function tonnesLines(result: Extract<SlurryFirstFertiliserPlanResult, { status: "ready" }>["baseline"]) {
  return result.purchaseRequirementTonnes.filter((line) => line.remainingTotalKg > 0);
}

export function SlurryFirstPlanningPanel({ fields, stores, currentUnallocatedM3 }: { fields: PlanningField[]; stores: PlanningStore[]; currentUnallocatedM3: number }) {
  const [open, setOpen] = useState(false);
  const [planningDate, setPlanningDate] = useState(nextJanuaryDate);
  const [expectedAvailableM3, setExpectedAvailableM3] = useState("");
  const [carryForwardCurrent, setCarryForwardCurrent] = useState(true);
  const [candidates, setCandidates] = useState<CandidateDraft[]>([]);
  const [result, setResult] = useState<SlurryFirstFertiliserPlanResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const allocatedDraftM3 = useMemo(
    () => candidates.reduce((sum, candidate) => sum + (Number(candidate.volumeM3) > 0 ? Number(candidate.volumeM3) : 0), 0),
    [candidates],
  );

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

  const runPreview = () => {
    setResult(null);
    startTransition(async () => {
      const expected = Number(expectedAvailableM3);
      const response = await previewSlurryFirstFertiliserPlanAction({
        planningDate,
        expectedAvailableM3: expected,
        source: "FARMER_FORECAST",
        productionBasis: carryForwardCurrent ? "CARRY_FORWARD_CURRENT_SETTINGS" : "TARGET_SEASON_SAVED",
        candidates: candidates.map((candidate) => ({
          fieldId: candidate.fieldId,
          housingId: candidate.housingId,
          volumeM3: Number(candidate.volumeM3),
          applicationMethod: candidate.applicationMethod,
          applicationDate: candidate.applicationDate,
        })),
      });
      setResult(response);
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
          <span className="block text-sm font-semibold text-fr-v2-graphite">Plan slurry before fertiliser</span>
          <span className="mt-0.5 block text-xs text-fr-v2-muted">Forecast available slurry, assign it to fields, then recalculate the chemical basket.</span>
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-forest">{open ? "Hide" : "Open"}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-5 pb-5 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-fr-v2-muted">
              Planning date
              <input
                type="date"
                value={planningDate}
                onChange={(event) => setPlanningDate(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-[6px] border border-fr-v2-rule bg-white px-3 text-sm font-normal text-fr-v2-graphite"
              />
            </label>
            <label className="text-xs font-semibold text-fr-v2-muted">
              Expected slurry available (m³)
              <input
                inputMode="decimal"
                value={expectedAvailableM3}
                onChange={(event) => setExpectedAvailableM3(event.target.value)}
                placeholder="e.g. 300"
                className="mt-1 min-h-11 w-full rounded-[6px] border border-fr-v2-rule bg-white px-3 text-sm font-normal text-fr-v2-graphite"
              />
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-normal">
                <button type="button" onClick={() => setExpectedAvailableM3(String(Math.round(currentUnallocatedM3 * 100) / 100))} className="text-fr-v2-forest underline underline-offset-2">Use current unallocated ({currentUnallocatedM3.toFixed(0)} m³)</button>
                <button type="button" onClick={() => setExpectedAvailableM3(String(Math.round(stores.reduce((sum, store) => sum + store.capacityM3, 0) * 100) / 100))} className="text-fr-v2-forest underline underline-offset-2">Assume recorded tanks full</button>
              </span>
            </label>
          </div>

          <label className="flex items-start gap-3 border-l-[3px] border-fr-v2-gold pl-3 text-sm text-fr-v2-graphite">
            <input type="checkbox" checked={carryForwardCurrent} onChange={(event) => setCarryForwardCurrent(event.target.checked)} className="mt-1" />
            <span>
              <span className="font-semibold">Use current crop and production settings as the future-season starting assumption</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-fr-v2-muted">Farm Return carries the current field settings into the planning year in memory and resets chemical fertiliser applied to zero. This does not overwrite field records and should be reviewed if next year&apos;s crop or target will change.</span>
            </span>
          </label>

          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fr-v2-graphite">Field slurry proposals</p>
              <p className="text-xs text-fr-v2-muted">Planning assumptions only — these do not change today&apos;s tank volume or create live spreading jobs.</p>
            </div>
            <button type="button" onClick={addCandidate} className="shrink-0 text-sm font-semibold text-fr-v2-forest">
              Add field
            </button>
          </div>

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
                <span className="text-fr-v2-muted">Farmer forecast for {ready.scenario.planningDate}</span>
                {ready.scenario.carriedForwardFromSeason ? <span className="text-fr-v2-muted">Production settings carried forward from {ready.scenario.carriedForwardFromSeason}</span> : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ProcurementPreview title="Without planned slurry" lines={baseline} />
                <ProcurementPreview title="After planned slurry" lines={withSlurry} />
              </div>

              <p className="border-l-[3px] border-fr-v2-gold pl-3 text-xs text-fr-v2-muted">
                Automatic best-return allocation is not being shown yet. The existing economic optimiser still uses the legacy nutrient engine, so Farm Return will not rank fields with it until that assessment path is rebuilt on P3.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProcurementPreview({ title, lines }: { title: string; lines: { product: string; npkAnalysis: string; remainingTotalTonnes: number; remainingTotalKg: number }[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fr-v2-muted">{title}</p>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-fr-v2-muted">No chemical fertiliser remaining in this preview.</p>
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
