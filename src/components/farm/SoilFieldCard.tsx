"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Plus, TriangleAlert, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { IndexSelector } from "@/components/ui/IndexSelector";
import { Sheet } from "@/components/ui/Sheet";
import { FieldThumbnail } from "@/components/farm/FieldThumbnail";
import { useFarm, useFarmActions } from "@/store/farm-store";
import type { Field, SoilTest } from "@/domain/types";
import { yearsBetweenIsoDates } from "@/domain/nutrients";
import { checkSoilTestAgeValidity } from "@/domain/soil-test-validity";

/**
 * Real Farm V1 Phase 7 — "the user must be able to inspect ... test age;
 * validity" (brief). `checkSoilTestAgeValidity` (Scientific Engine V3)
 * already gates the NAP ceiling on this exact question but was never
 * surfaced anywhere in the UI — a farmer had no way to see *why* a
 * recommendation might be treated as unverified. Same function, same age
 * computation (`yearsBetweenIsoDates`, exported from nutrients.ts rather
 * than reimplemented here), just displayed.
 */
function soilTestValidityLabel(sampleDate: string, pIndex: 1 | 2 | 3 | 4): { label: string; tone: "good" | "risk" | "neutral" } {
  const ageYears = yearsBetweenIsoDates(sampleDate, new Date().toISOString().slice(0, 10));
  const outcome = checkSoilTestAgeValidity({ ageYears, pIndex });
  const ageLabel = ageYears < 1 ? "<1 year old" : `${Math.floor(ageYears)} year${Math.floor(ageYears) === 1 ? "" : "s"} old`;
  if (outcome.status !== "OK") return { label: `${ageLabel} — age unknown`, tone: "neutral" };
  if (outcome.value === "VALID") return { label: `Valid — ${ageLabel}`, tone: "good" };
  if (outcome.value === "INDEX4_PERSISTED") return { label: `${ageLabel} — P4 result still applies`, tone: "good" };
  return { label: `${ageLabel} — too old for statutory ceilings (4-year limit)`, tone: "risk" };
}

const inputClass = "w-full rounded-fr-control border border-fr-border px-2.5 py-1.5 text-sm text-fr-ink-900";

/**
 * The field soil row from mobile-soil-overview.png: thumbnail, mapped
 * soil/drainage, provenance badge, and P/K index selectors. Tapping a P/K
 * index farmer-adjusts that assumption (`farmerAdjust`, chaining the prior
 * value rather than overwriting it); "Add soil test" opens an inline form
 * that submits a lab result via `verify()` — a *different* provenance
 * status (`verified`, not `farmer_adjusted`) because it comes from
 * documented lab evidence rather than the farmer's own estimate (see
 * src/domain/provenance.ts).
 */
export function SoilFieldCard({ field }: { field: Field }) {
  const { fertility, mappedSoil } = field;
  const badgeStatus = fertility.verifiedTest ? "verified" : (fertility.pIndex?.status ?? "unavailable");
  const farm = useFarm();
  const { updateFieldIndex, addSoilTest } = useFarmActions();

  const [formOpen, setFormOpen] = useState(false);
  const [viewTestOpen, setViewTestOpen] = useState(false);
  const [sampleDate, setSampleDate] = useState("");
  const [laboratory, setLaboratory] = useState("");
  const [sampleRef, setSampleRef] = useState("");
  const [p, setP] = useState("");
  const [k, setK] = useState("");
  const [pH, setPH] = useState("");
  const [limeRequirement, setLimeRequirement] = useState("");
  const [organicMatterPct, setOrganicMatterPct] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const pVal = Number(p);
    const kVal = Number(k);
    const pHVal = Number(pH);
    if (!sampleDate || !laboratory.trim() || !sampleRef.trim()) return;
    if (![pVal, kVal, pHVal].every(Number.isFinite)) return;
    addSoilTest(field.id, {
      sampleDate,
      laboratory: laboratory.trim(),
      sampleRef: sampleRef.trim(),
      p: pVal,
      k: kVal,
      pH: pHVal,
      ...(limeRequirement ? { limeRequirement: Number(limeRequirement) } : {}),
      ...(organicMatterPct ? { organicMatterPct: Number(organicMatterPct) } : {}),
    });
    setFormOpen(false);
    setSampleDate("");
    setLaboratory("");
    setSampleRef("");
    setP("");
    setK("");
    setPH("");
    setLimeRequirement("");
    setOrganicMatterPct("");
  }

  // Computed once, here, so both the card's own inline validity badge and
  // the "View test" detail sheet render the exact same real classification
  // — never two separately-called copies that could silently disagree.
  const validity =
    fertility.verifiedTest && fertility.pIndex ? soilTestValidityLabel(fertility.verifiedTest.sampleDate, fertility.pIndex.value) : null;

  // Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
  // F4) — walks the real `previous` chain `addSoilTestToField` now
  // preserves, oldest-lost-last, so the "View test" sheet can show real
  // history rather than only ever the currently-active test.
  const previousTests: SoilTest[] = [];
  for (let t = fertility.verifiedTest?.previous; t; t = t.previous) previousTests.push(t);

  return (
    <>
      <Card className="flex gap-4 p-4">
        <FieldThumbnail field={field} className="h-auto w-24" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex justify-end">
            <StatusBadge status={badgeStatus} className="shrink-0" />
          </div>
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0 text-xs text-fr-ink-600">Mapped soil</span>
              <span className="text-right font-semibold leading-tight text-fr-ink-900">
                {mappedSoil?.dominantSeries ?? "Unavailable — not yet mapped"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0 text-xs text-fr-ink-600">Drainage</span>
              <span className="text-right font-semibold capitalize leading-tight text-fr-ink-900">
                {mappedSoil?.drainage.replace(/_/g, " ") ?? "Unavailable"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <IndexSelector
              label="P Index (assumption)"
              value={fertility.pIndex?.value}
              tone={fertility.pIndex?.status === "farmer_adjusted" ? "attention" : "good"}
              onSelect={(v) => updateFieldIndex(field.id, "pIndex", v, farm.ownerName)}
            />
            <IndexSelector
              label="K Index (assumption)"
              value={fertility.kIndex?.value}
              tone={fertility.kIndex?.status === "farmer_adjusted" ? "attention" : "good"}
              onSelect={(v) => updateFieldIndex(field.id, "kIndex", v, farm.ownerName)}
            />
          </div>

          {formOpen ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 rounded-fr-control border border-fr-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-fr-ink-900">Add soil test</p>
                <button type="button" onClick={() => setFormOpen(false)} className="text-fr-ink-400 hover:text-fr-ink-600" aria-label="Cancel">
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-0.5 block text-xs text-fr-ink-600">Sample date</span>
                  <input type="date" required value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-fr-ink-600">Laboratory</span>
                  <input type="text" required value={laboratory} onChange={(e) => setLaboratory(e.target.value)} placeholder="e.g. Southern Agri Labs" className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-fr-ink-600">Sample ref</span>
                  <input type="text" required value={sampleRef} onChange={(e) => setSampleRef(e.target.value)} placeholder="e.g. SAL-2026-0113" className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-fr-ink-600">pH</span>
                  <input type="number" required step="0.01" min="0" max="14" value={pH} onChange={(e) => setPH(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-fr-ink-600">P (mg/l)</span>
                  <input type="number" required step="0.01" min="0" value={p} onChange={(e) => setP(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-fr-ink-600">K (mg/l)</span>
                  <input type="number" required step="0.01" min="0" value={k} onChange={(e) => setK(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-fr-ink-600">Lime req. (t/ha, optional)</span>
                  <input type="number" step="0.1" min="0" value={limeRequirement} onChange={(e) => setLimeRequirement(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-fr-ink-600">Organic matter % (optional)</span>
                  <input type="number" step="0.1" min="0" value={organicMatterPct} onChange={(e) => setOrganicMatterPct(e.target.value)} className={inputClass} />
                </label>
              </div>
              <p className="text-xs text-fr-ink-400">
                P/K index are derived from the mg/l values via the Teagasc Green Book index tables (6-4/6-5) — see
                src/domain/nutrients.ts.
              </p>
              <button type="submit" className="rounded-fr-control bg-fr-green-700 py-2 text-sm font-semibold text-white">
                Save test result
              </button>
            </form>
          ) : fertility.verifiedTest ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-fr-good">
                  <CheckCircle2 className="size-4" />
                  Verified test on{" "}
                  {new Date(fertility.verifiedTest.sampleDate).toLocaleDateString("en-IE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <button type="button" onClick={() => setViewTestOpen(true)} className="font-medium text-fr-green-700 hover:underline">
                    View test →
                  </button>
                  {/* Grassland Fertiliser Pilot Completion, Checkpoint B
                      (audit finding F4) — a real, dated new lab result
                      must be enterable on an already-tested field, never
                      blocked just because a real test is already on
                      file. The form itself (`handleSubmit`) already
                      chains the previously-active test rather than
                      discarding it — see `addSoilTestToField`'s own doc
                      comment for the real history-preservation fix. */}
                  <button type="button" onClick={() => setFormOpen(true)} className="font-medium text-fr-ink-600 hover:text-fr-green-700 hover:underline">
                    Add new test
                  </button>
                </span>
              </div>
              {validity ? (
                <span
                  className={
                    "flex items-center gap-1.5 text-xs " +
                    (validity.tone === "good" ? "text-fr-good" : validity.tone === "risk" ? "text-fr-risk" : "text-fr-ink-600")
                  }
                >
                  {validity.tone === "risk" ? <TriangleAlert className="size-3.5" /> : null}
                  {validity.label}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="flex items-center gap-1 font-medium text-fr-green-700"
              >
                <Plus className="size-4" />
                Add soil test
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Real, existing `SoilTest` record (`field.fertility.verifiedTest`) —
          the same data `addSoilTest` persisted and `pIndexFromMgL`/
          `kIndexFromMgL` classified from, never a second lookup or a
          parallel storage path. `Sheet` is the app's own shared accessible
          overlay primitive (focus trap, Escape-to-close, ARIA dialog role)
          already used by `FertiliserPlanSheet` etc. — reused here rather
          than a bespoke modal. */}
      {fertility.verifiedTest ? (
        <Sheet open={viewTestOpen} onClose={() => setViewTestOpen(false)} title={`${field.name} — soil test`}>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-fr-ink-600">Status</span>
              <StatusBadge status={badgeStatus} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-fr-ink-600">Sample reference</p>
                <p className="font-semibold text-fr-ink-900">{fertility.verifiedTest.sampleRef}</p>
              </div>
              <div>
                <p className="text-xs text-fr-ink-600">Test date</p>
                <p className="font-semibold text-fr-ink-900">
                  {new Date(fertility.verifiedTest.sampleDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <div>
                <p className="text-xs text-fr-ink-600">Laboratory</p>
                <p className="font-semibold text-fr-ink-900">{fertility.verifiedTest.laboratory}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 rounded-fr-control border border-fr-border p-3">
              <div>
                <p className="text-xs text-fr-ink-600">pH</p>
                <p className="font-semibold text-fr-ink-900">{fertility.verifiedTest.pH}</p>
              </div>
              <div>
                <p className="text-xs text-fr-ink-600">P (mg/l)</p>
                <p className="font-semibold text-fr-ink-900">{fertility.verifiedTest.p}</p>
              </div>
              <div>
                <p className="text-xs text-fr-ink-600">K (mg/l)</p>
                <p className="font-semibold text-fr-ink-900">{fertility.verifiedTest.k}</p>
              </div>
            </div>
            {/* Grassland Fertiliser Pilot Completion, Checkpoint B
                (audit finding F5) — the real laboratory-evidenced lime
                requirement, when this test carries one. Never computed
                from pH alone (this app has no such engine, and never
                will fabricate one) — absent means the lab genuinely
                didn't report a lime requirement for this sample, shown
                honestly rather than guessed. */}
            {fertility.verifiedTest.limeRequirement !== undefined ? (
              <div>
                <p className="text-xs text-fr-ink-600">Lime requirement (laboratory)</p>
                <p className="font-semibold text-fr-ink-900">{fertility.verifiedTest.limeRequirement} t/ha</p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-fr-ink-600">P Index (derived)</p>
                <p className="flex items-center gap-2 font-semibold text-fr-ink-900">
                  {fertility.pIndex ? fertility.pIndex.value : "Not recorded"}
                  <StatusBadge status={fertility.pIndex?.status ?? "unavailable"} />
                </p>
              </div>
              <div>
                <p className="text-xs text-fr-ink-600">K Index (derived)</p>
                <p className="flex items-center gap-2 font-semibold text-fr-ink-900">
                  {fertility.kIndex ? fertility.kIndex.value : "Not recorded"}
                  <StatusBadge status={fertility.kIndex?.status ?? "unavailable"} />
                </p>
              </div>
            </div>
            {validity ? (
              <span
                className={
                  "flex items-center gap-1.5 text-xs " +
                  (validity.tone === "good" ? "text-fr-good" : validity.tone === "risk" ? "text-fr-risk" : "text-fr-ink-600")
                }
              >
                {validity.tone === "risk" ? <TriangleAlert className="size-3.5" /> : null}
                {validity.label}
              </span>
            ) : null}
            {/* Grassland Fertiliser Pilot Completion, Checkpoint B
                (audit finding F4) — real test history, walking the same
                `previous` chain `addSoilTestToField` now preserves
                (never overwritten, never silently lost when a newer
                test is added). The test shown above is always the real
                active one; this makes that explicit rather than leaving
                a farmer to assume it. */}
            {previousTests.length > 0 ? (
              <div className="border-t border-fr-border pt-2.5">
                <p className="mb-1.5 text-xs font-medium text-fr-ink-600">
                  {previousTests.length} earlier test{previousTests.length === 1 ? "" : "s"} on file
                </p>
                <div className="flex flex-col gap-1.5">
                  {previousTests.map((t, i) => (
                    <div key={`${t.sampleRef}-${t.sampleDate}-${i}`} className="text-xs text-fr-ink-600">
                      {new Date(t.sampleDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })} — {t.laboratory},
                      ref {t.sampleRef} — pH {t.pH}, P {t.p} mg/l, K {t.k} mg/l
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {/* Grassland Fertiliser Pilot Completion, Checkpoint B
                (audit finding F6/F10) — reuses the exact same Scientific
                Evidence Report the GPS-guided sampling flow already
                produces (`buildScientificEvidenceReportForField`, no
                second report engine), reachable from this legacy/manual
                lab-entry workflow without requiring a farmer to
                fabricate GPS sampling or a new composite sample. */}
            <Link
              href={`/evidence-report/field/${field.id}`}
              className="flex items-center justify-center gap-1.5 rounded-fr-control border border-fr-border py-2 text-sm font-medium text-fr-green-700 hover:bg-fr-surface-alt"
            >
              <FileText className="size-4" />
              View scientific evidence report
            </Link>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
