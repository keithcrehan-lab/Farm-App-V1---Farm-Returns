"use client";

/**
 * Pilot Integration P4 — What Matters: what to pay attention to, why, what can be done, and the evidence behind it.
 * Presentation only: the result is the one real evaluation shared with Farm (`useWhatMattersPilot` →
 * `evaluateWhatMattersPilot`), rendered by the same `WhatMattersPilotCard`. Nothing is ranked or valued here, no
 * price is assumed, and missing evidence is said plainly rather than shown as "nothing to do".
 */
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { WhatMattersPilotCard, ContractorCostRateInput } from "@/components/next/WhatMattersPilotCard";
import { useWhatMattersPilot } from "@/components/next/useWhatMattersPilot";
import type { WhatMattersEvidenceSummary } from "@/app/actions/what-matters-pilot";

const SUBTITLE = "What needs your attention, why it matters and what you can do, from your farm's own records";

export const PRICE_EVIDENCE_UNAVAILABLE =
  "Farm Return can't value fertiliser savings from your slurry yet, because current fertiliser price evidence isn't available. No price is assumed in its place.";

export function WhatMattersScreen({ mode }: { mode: "REAL" | "DEMO" }) {
  return (
    <>
      <PageHeader title="What Matters" subtitle={SUBTITLE} />
      <h1 className="mb-1 text-title text-fr-ink-900 lg:hidden">What Matters</h1>
      <p className="mb-4 text-sm text-fr-ink-600 lg:hidden">{SUBTITLE}</p>
      {mode === "DEMO" ? <DemoNotice /> : <RealWhatMatters />}
    </>
  );
}

function DemoNotice() {
  return (
    <Card className="p-5">
      <p className="text-sm text-fr-ink-900">What Matters is worked out from a signed-in farm&apos;s own fields, slurry, prices and weather.</p>
      <p className="mt-1 text-sm text-fr-ink-600">This demonstration has no farm records to evaluate, so nothing is recommended here.</p>
      <Link href="/today" className="mt-3 inline-block text-sm font-semibold text-fr-green-700">
        Back to Farm →
      </Link>
    </Card>
  );
}

function RealWhatMatters() {
  const { pilotState, pilotError, pilotLoading, contractorRateError, handlePilotConfirm, handleSaveContractorCostRate, pilotFieldName, handlePilotViewDetails } = useWhatMattersPilot();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section aria-labelledby="wm-now" className="flex flex-col gap-3">
        <h2 id="wm-now" className="text-label uppercase tracking-wide text-fr-ink-600">
          What to pay attention to
        </h2>
        {pilotLoading && !pilotState ? (
          <Card className="animate-pulse p-5" aria-busy="true">
            <div className="h-5 w-40 rounded bg-fr-surface-alt" />
            <div className="mt-3 h-4 w-full rounded bg-fr-surface-alt" />
          </Card>
        ) : pilotError ? (
          <Card className="p-5" role="status">
            <p className="text-sm text-fr-ink-900">Unable to verify a recommendation right now.</p>
            <p className="mt-1 text-sm text-fr-ink-600">Nothing is recommended in its place. Try again shortly.</p>
          </Card>
        ) : pilotState ? (
          <>
            <WhatMattersPilotCard result={pilotState.result} fieldName={pilotFieldName()} onViewDetails={handlePilotViewDetails} onConfirm={handlePilotConfirm} missingSlurryDetails={pilotState.missingSlurryDetails} multiSourceSlurryFieldIds={pilotState.multiSourceSlurryFieldIds} disabled={pilotLoading} variant="light" />
            {!pilotState.contractorRatePerHa ? (
              <ContractorCostRateInput onSave={handleSaveContractorCostRate} disabled={pilotLoading} variant="light" currentRatePerHa={pilotState.contractorRatePerHa} error={contractorRateError} />
            ) : null}
          </>
        ) : null}
      </section>

      {pilotState ? (
        <section aria-labelledby="wm-evidence" className="flex flex-col gap-3">
          <h2 id="wm-evidence" className="text-label uppercase tracking-wide text-fr-ink-600">
            Evidence used
          </h2>
          <Card className="flex flex-col gap-3 p-5 text-sm">
            <PriceEvidence evidence={pilotState.evidence} />
            <div>
              <p className="font-medium text-fr-ink-900">Spreading cost</p>
              <p className="text-fr-ink-600">
                {pilotState.contractorRatePerHa ? `Your contractor rate on record: €${pilotState.contractorRatePerHa}/ha.` : "No contractor rate is on record yet, so spreading costs can't be counted."}
              </p>
            </div>
            <div>
              <p className="font-medium text-fr-ink-900">Your slurry plans and weather</p>
              <p className="text-fr-ink-600">Your fields&apos; planned slurry spreading, and the Met Éireann forecast for a field when a spreading recommendation is checked.</p>
            </div>
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="wm-act" className="flex flex-col gap-2">
        <h2 id="wm-act" className="text-label uppercase tracking-wide text-fr-ink-600">
          Where to act
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <Link href="/fields" className="font-semibold text-fr-green-700">Fields: spreading plans, soil and nutrients →</Link>
          </li>
          <li>
            <Link href="/today" className="font-semibold text-fr-green-700">Farm map and farm topics →</Link>
          </li>
          <li>
            <Link href="/records" className="font-semibold text-fr-green-700">Records of work done →</Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

function PriceEvidence({ evidence }: { evidence: WhatMattersEvidenceSummary | null }) {
  if (!evidence) return null;
  const available = evidence.fertiliserPrices.filter((p) => p.state === "AVAILABLE");
  return (
    <div>
      <p className="font-medium text-fr-ink-900">Fertiliser prices (CSO)</p>
      {available.length === 0 ? (
        <p className="text-fr-ink-600" data-price-evidence="UNAVAILABLE">
          {PRICE_EVIDENCE_UNAVAILABLE}
        </p>
      ) : (
        <ul className="text-fr-ink-600" data-price-evidence="AVAILABLE">
          {evidence.fertiliserPrices.map((p) => (
            <li key={p.product}>
              {p.product}: {p.state === "AVAILABLE" ? `${p.sourceSeriesLabel}, ${p.referencePeriod}` : "no current price on record"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
