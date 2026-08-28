"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Plus, TriangleAlert, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { IndexSelector } from "@/components/ui/IndexSelector";
import { FieldThumbnail } from "@/components/farm/FieldThumbnail";
import { useFarm, useFarmActions } from "@/store/farm-store";
import type { Field } from "@/domain/types";
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

  return (
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
                <input type="number" required step="0.1" min="0" max="14" value={pH} onChange={(e) => setPH(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-xs text-fr-ink-600">P (mg/l)</span>
                <input type="number" required step="0.1" min="0" value={p} onChange={(e) => setP(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-xs text-fr-ink-600">K (mg/l)</span>
                <input type="number" required step="0.1" min="0" value={k} onChange={(e) => setK(e.target.value)} className={inputClass} />
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
              <button type="button" disabled className="font-medium text-fr-ink-400" title="Full test report viewer is a future refinement">
                View test →
              </button>
            </div>
            {fertility.pIndex ? (() => {
              const validity = soilTestValidityLabel(fertility.verifiedTest!.sampleDate, fertility.pIndex!.value);
              return (
                <span
                  className={
                    "flex items-center gap-1.5 text-xs " +
                    (validity.tone === "good" ? "text-fr-good" : validity.tone === "risk" ? "text-fr-risk" : "text-fr-ink-600")
                  }
                >
                  {validity.tone === "risk" ? <TriangleAlert className="size-3.5" /> : null}
                  {validity.label}
                </span>
              );
            })() : null}
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
  );
}
