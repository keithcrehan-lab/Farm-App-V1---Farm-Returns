"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Field } from "@/domain/types";
import {
  CROP_SYSTEM_LABELS,
  P2_SUPPORTED_CROP_SYSTEMS,
  type CropSystem,
  type FertiliserInputGateResult,
  type FieldProductionCycle,
} from "@/domain/fertiliser-field-evidence";
import {
  loadFieldProductionCycleAction,
  saveFieldProductionCycleAction,
} from "@/app/actions/fertiliser-field-evidence";
import { useFarm } from "@/store/farm-store";

const INPUT = "min-h-10 w-full border border-fr-v2-cream-rule bg-white px-3 text-sm text-fr-v2-graphite outline-none focus:border-fr-v2-forest";
const LABEL = "flex flex-col gap-1.5 text-xs font-semibold text-fr-v2-graphite";

const cropOptions = Object.entries(CROP_SYSTEM_LABELS) as Array<[CropSystem, string]>;

function numericValue(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function gateCopy(gate: FertiliserInputGateResult | null): { title: string; detail: string } {
  if (!gate) return { title: "Evidence not set", detail: "Choose this season's crop system and record the field evidence Farm Return needs." };
  if (gate.status === "READY_FOR_CALCULATION") {
    return {
      title: "Ready for the future calculation engine",
      detail: "P2 has the required field evidence. No new fertiliser recommendation is being calculated yet.",
    };
  }
  if (gate.status === "UNSUPPORTED_PATHWAY") {
    return {
      title: "Crop recorded — agronomy not enabled yet",
      detail: "Farm Return will keep this crop cycle, but it will not borrow grassland rules or produce a fertiliser recommendation for it.",
    };
  }
  return {
    title: "Recommendation evidence incomplete",
    detail: `Still needed: ${gate.missingInputs.join(", ")}.`,
  };
}

export function FieldProductionCycleCard({ field }: { field: Field }) {
  const farm = useFarm();
  const season = String(new Date().getFullYear());
  const [cycle, setCycle] = useState<FieldProductionCycle | null>(null);
  const [gate, setGate] = useState<FertiliserInputGateResult | null>(null);
  const [cropSystem, setCropSystem] = useState<CropSystem>("GRASS_GRAZING");
  const [target, setTarget] = useState("");
  const [nApplied, setNApplied] = useState("");
  const [pApplied, setPApplied] = useState("");
  const [kApplied, setKApplied] = useState("");
  const [cloverPct, setCloverPct] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void loadFieldProductionCycleAction(field.id, season)
      .then((state) => {
        if (cancelled) return;
        setCycle(state.cycle);
        setGate(state.gate);
        if (state.cycle) {
          setCropSystem(state.cycle.cropSystem);
          setTarget(state.cycle.evidence.productionTargetTDMHa?.value?.toString() ?? "");
          setNApplied(state.cycle.evidence.chemicalNAppliedKgHa?.value?.toString() ?? "");
          setPApplied(state.cycle.evidence.chemicalPAppliedKgHa?.value?.toString() ?? "");
          setKApplied(state.cycle.evidence.chemicalKAppliedKgHa?.value?.toString() ?? "");
          setCloverPct(state.cycle.evidence.whiteCloverPct?.value?.toString() ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Production evidence is unavailable in this session.");
      });
    return () => {
      cancelled = true;
    };
  }, [field.id, season]);

  const supported = P2_SUPPORTED_CROP_SYSTEMS.includes(cropSystem);
  const needsTarget = cropSystem === "GRASS_FIRST_CUT_SILAGE" || cropSystem === "GRASS_SECOND_CUT_SILAGE" || cropSystem === "GRASS_THIRD_CUT_SILAGE" || cropSystem === "GRASS_HAY" || cropSystem === "GRASS_MIXED" || cropSystem === "GRASS_WHITE_CLOVER_SILAGE";
  const needsClover = cropSystem === "GRASS_WHITE_CLOVER_GRAZING" || cropSystem === "GRASS_WHITE_CLOVER_SILAGE";
  const status = useMemo(() => gateCopy(gate), [gate]);

  return (
    <section className="flex flex-col gap-4 border-t border-fr-v2-cream-rule pt-6" aria-label="Field production cycle">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Fertiliser P2 · field evidence</p>
          <h3 className="mt-1 text-base font-semibold text-fr-v2-graphite">{season} production cycle</h3>
        </div>
        <span className="text-xs font-semibold text-fr-v2-muted">{cycle ? "Saved" : "Not saved"}</span>
      </div>

      <label className={LABEL}>
        Crop system
        <select className={INPUT} value={cropSystem} onChange={(event) => setCropSystem(event.target.value as CropSystem)}>
          {cropOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}{P2_SUPPORTED_CROP_SYSTEMS.includes(value) ? "" : " — not enabled yet"}
            </option>
          ))}
        </select>
      </label>

      {!supported ? (
        <p className="border-l-[3px] border-fr-v2-gold pl-3 text-xs text-fr-v2-muted">
          This crop can be recorded now, but P2 deliberately blocks recommendation maths until its own scientific rule pack is validated.
        </p>
      ) : null}

      {needsTarget ? (
        <label className={LABEL}>
          Production target (t DM/ha)
          <input type="number" min="0" step="0.1" className={INPUT} value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
      ) : null}

      {needsClover ? (
        <label className={LABEL}>
          White clover content (%)
          <input type="number" min="0" max="100" step="1" className={INPUT} value={cloverPct} onChange={(event) => setCloverPct(event.target.value)} />
        </label>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-semibold text-fr-v2-graphite">Chemical fertiliser already applied this season (kg nutrient/ha)</p>
        <p className="mb-3 text-xs text-fr-v2-muted">Enter 0 only when you are explicitly declaring that none has been applied. Blank means unknown.</p>
        <div className="grid grid-cols-3 gap-2">
          <label className={LABEL}>N<input aria-label="Chemical N applied" type="number" min="0" step="0.1" className={INPUT} value={nApplied} onChange={(e) => setNApplied(e.target.value)} /></label>
          <label className={LABEL}>P<input aria-label="Chemical P applied" type="number" min="0" step="0.1" className={INPUT} value={pApplied} onChange={(e) => setPApplied(e.target.value)} /></label>
          <label className={LABEL}>K<input aria-label="Chemical K applied" type="number" min="0" step="0.1" className={INPUT} value={kApplied} onChange={(e) => setKApplied(e.target.value)} /></label>
        </div>
      </div>

      <div className="border-l-[3px] border-fr-v2-forest pl-3">
        <p className="text-sm font-semibold text-fr-v2-graphite">{status.title}</p>
        <p className="mt-1 text-xs text-fr-v2-muted">{status.detail}</p>
      </div>

      {message ? <p className="text-xs text-fr-v2-muted">{message}</p> : null}

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const state = await saveFieldProductionCycleAction({
                fieldId: field.id,
                season,
                cropSystem,
                status: "active",
                ...(numericValue(target) !== undefined ? { productionTargetTDMHa: numericValue(target) } : {}),
                ...(numericValue(nApplied) !== undefined ? { chemicalNAppliedKgHa: numericValue(nApplied) } : {}),
                ...(numericValue(pApplied) !== undefined ? { chemicalPAppliedKgHa: numericValue(pApplied) } : {}),
                ...(numericValue(kApplied) !== undefined ? { chemicalKAppliedKgHa: numericValue(kApplied) } : {}),
                ...(numericValue(cloverPct) !== undefined ? { whiteCloverPct: numericValue(cloverPct) } : {}),
                farmerName: farm.ownerName,
              });
              setCycle(state.cycle);
              setGate(state.gate);
              setMessage("Field evidence saved.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Could not save field evidence.");
            }
          });
        }}
        className="min-h-11 bg-fr-v2-forest-deep px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save production evidence"}
      </button>
    </section>
  );
}
