"use client";

import { useState, type FormEvent } from "react";
import { useFarmActions } from "@/store/farm-store";
import type { Field } from "@/domain/types";

const INPUT = "w-full rounded-[4px] border border-fr-v2-cream-rule bg-white/80 px-2.5 py-2 text-sm text-fr-v2-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fr-v2-gold";
const LABEL = "flex flex-col gap-1.5 text-xs text-fr-v2-muted";

export function FieldSoilTestEditor({ field }: { field: Field }) {
  const { addSoilTest } = useFarmActions();
  const [open, setOpen] = useState(!field.fertility.verifiedTest);
  const [sampleDate, setSampleDate] = useState("");
  const [laboratory, setLaboratory] = useState("");
  const [sampleRef, setSampleRef] = useState("");
  const [p, setP] = useState("");
  const [k, setK] = useState("");
  const [pH, setPH] = useState("");
  const [limeRequirement, setLimeRequirement] = useState("");
  const [organicMatterPct, setOrganicMatterPct] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function reset() {
    setSampleDate("");
    setLaboratory("");
    setSampleRef("");
    setP("");
    setK("");
    setPH("");
    setLimeRequirement("");
    setOrganicMatterPct("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const pVal = Number(p);
    const kVal = Number(k);
    const pHVal = Number(pH);
    const lime = limeRequirement === "" ? undefined : Number(limeRequirement);
    const organic = organicMatterPct === "" ? undefined : Number(organicMatterPct);

    if (!sampleDate || !laboratory.trim() || !sampleRef.trim()) {
      setMessage("Sample date, laboratory and sample reference are required.");
      return;
    }
    if (![pVal, kVal, pHVal].every(Number.isFinite)) {
      setMessage("Enter valid laboratory P, K and pH values.");
      return;
    }
    if (lime !== undefined && (!Number.isFinite(lime) || lime < 0)) {
      setMessage("Lime requirement must be zero or greater.");
      return;
    }
    if (organic !== undefined && (!Number.isFinite(organic) || organic < 0)) {
      setMessage("Organic matter must be zero or greater.");
      return;
    }

    addSoilTest(field.id, {
      sampleDate,
      laboratory: laboratory.trim(),
      sampleRef: sampleRef.trim(),
      p: pVal,
      k: kVal,
      pH: pHVal,
      ...(lime !== undefined ? { limeRequirement: lime } : {}),
      ...(organic !== undefined ? { organicMatterPct: organic } : {}),
    });
    reset();
    setOpen(false);
    setMessage("Laboratory soil test saved to this field.");
  }

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-fr-v2-cream-rule pt-3">
        <p className="text-xs text-fr-v2-muted">
          {message ?? (field.fertility.verifiedTest ? "The active laboratory result is the field's canonical soil evidence." : "No laboratory soil test is recorded.")}
        </p>
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-fr-v2-forest underline underline-offset-2">
          {field.fertility.verifiedTest ? "Add newer lab test" : "Add lab soil test"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 border-t border-fr-v2-cream-rule pt-4" aria-label="Laboratory soil test">
      <div>
        <p className="text-sm font-semibold text-fr-v2-graphite">Laboratory soil test</p>
        <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">Enter the laboratory result once. Farm Return derives the P and K indices from these values and keeps older tests in the evidence history.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={LABEL}>Sample date<input type="date" required value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} className={INPUT} /></label>
        <label className={LABEL}>Laboratory<input type="text" required value={laboratory} onChange={(e) => setLaboratory(e.target.value)} placeholder="Laboratory name" className={INPUT} /></label>
        <label className={LABEL}>Sample reference<input type="text" required value={sampleRef} onChange={(e) => setSampleRef(e.target.value)} placeholder="Report / sample ref" className={INPUT} /></label>
        <label className={LABEL}>pH<input type="number" required step="0.01" min="0" max="14" value={pH} onChange={(e) => setPH(e.target.value)} className={INPUT} /></label>
        <label className={LABEL}>P (mg/L)<input type="number" required step="0.01" min="0" value={p} onChange={(e) => setP(e.target.value)} className={INPUT} /></label>
        <label className={LABEL}>K (mg/L)<input type="number" required step="0.01" min="0" value={k} onChange={(e) => setK(e.target.value)} className={INPUT} /></label>
        <label className={LABEL}>Lime requirement (t/ha, optional)<input type="number" step="0.1" min="0" value={limeRequirement} onChange={(e) => setLimeRequirement(e.target.value)} className={INPUT} /></label>
        <label className={LABEL}>Organic matter % (optional)<input type="number" step="0.1" min="0" value={organicMatterPct} onChange={(e) => setOrganicMatterPct(e.target.value)} className={INPUT} /></label>
      </div>
      {message ? <p className="text-xs font-semibold text-fr-v2-clay">{message}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {field.fertility.verifiedTest ? <button type="button" onClick={() => { reset(); setMessage(null); setOpen(false); }} className="min-h-10 px-3 text-xs font-semibold text-fr-v2-muted">Cancel</button> : null}
        <button type="submit" className="min-h-10 bg-fr-v2-forest-deep px-4 text-sm font-semibold text-white">Save laboratory result</button>
      </div>
    </form>
  );
}
