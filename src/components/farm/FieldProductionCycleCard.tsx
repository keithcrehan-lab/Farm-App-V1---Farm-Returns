"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Field } from "@/domain/types";
import {
  CROP_SYSTEM_LABELS,
  P2_SUPPORTED_CROP_SYSTEMS,
  type CropSystem,
  type FertiliserInputGateResult,
  type GrazingProductionSystem,
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

const GRAZING_SYSTEM_LABELS: Readonly<Record<GrazingProductionSystem, string>> = Object.freeze({
  SUCKLER_CALF_TO_BEEF: "Suckler calf-to-beef",
  SUCKLER_CALF_TO_WEANING: "Suckler calf-to-weaning",
  OTHER_DRYSTOCK: "Other drystock",
});


function numericValue(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type ChemicalAppliedState = "none" | "yes" | "unknown";

function chemicalAppliedState(n: string, p: string, k: string): ChemicalAppliedState {
  const values = [n, p, k];
  if (values.every((value) => value.trim() === "")) return "unknown";
  if (values.every((value) => numericValue(value) === 0)) return "none";
  return "yes";
}

function farmerFacingSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || message.startsWith("{") || /\b(code|details|hint)\b/i.test(message)) {
    return "Could not save production evidence. Please try again.";
  }
  return message;
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

export function FieldProductionCycleCard({ field, onSaved }: { field: Field; onSaved?: () => void }) {
  const farm = useFarm();
  const season = String(new Date().getFullYear());
  const [cycle, setCycle] = useState<FieldProductionCycle | null>(null);
  const [gate, setGate] = useState<FertiliserInputGateResult | null>(null);
  const [cropSystem, setCropSystem] = useState<CropSystem>("GRASS_GRAZING");
  const [target, setTarget] = useState("");
  const [nApplied, setNApplied] = useState("");
  const [pApplied, setPApplied] = useState("");
  const [kApplied, setKApplied] = useState("");
  const [chemicalApplied, setChemicalApplied] = useState<ChemicalAppliedState>("unknown");
  const [cloverPct, setCloverPct] = useState("");
  const [grazingSystem, setGrazingSystem] = useState<GrazingProductionSystem | "">("");
  const [grazingMode, setGrazingMode] = useState<"baseline" | "farmer">("baseline");
  const [editingGrazingSystem, setEditingGrazingSystem] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
          const loadedN = state.cycle.evidence.chemicalNAppliedKgHa?.value?.toString() ?? "";
          const loadedP = state.cycle.evidence.chemicalPAppliedKgHa?.value?.toString() ?? "";
          const loadedK = state.cycle.evidence.chemicalKAppliedKgHa?.value?.toString() ?? "";
          setNApplied(loadedN);
          setPApplied(loadedP);
          setKApplied(loadedK);
          setChemicalApplied(chemicalAppliedState(loadedN, loadedP, loadedK));
          setCloverPct(state.cycle.evidence.whiteCloverPct?.value?.toString() ?? "");
          const grazingEvidence = state.cycle.evidence.grazingProductionSystem;
          if (grazingEvidence?.method === "FARMER_DECLARED" && grazingEvidence.source.startsWith("Field exception · ")) {
            setGrazingSystem(grazingEvidence.value);
            setGrazingMode("farmer");
          } else {
            setGrazingSystem(farm.grazingProductionSystem?.value ?? "");
            setGrazingMode("baseline");
          }
        } else {
          setGrazingSystem(farm.grazingProductionSystem?.value ?? "");
          setGrazingMode("baseline");
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Production evidence is unavailable in this session.");
      });
    return () => {
      cancelled = true;
    };
  }, [field.id, season, farm.grazingProductionSystem?.value]);

  const supported = P2_SUPPORTED_CROP_SYSTEMS.includes(cropSystem);
  const needsTarget = cropSystem === "GRASS_FIRST_CUT_SILAGE" || cropSystem === "GRASS_SECOND_CUT_SILAGE" || cropSystem === "GRASS_THIRD_CUT_SILAGE" || cropSystem === "GRASS_HAY" || cropSystem === "GRASS_MIXED" || cropSystem === "GRASS_WHITE_CLOVER_SILAGE";
  const needsClover = cropSystem === "GRASS_WHITE_CLOVER_GRAZING" || cropSystem === "GRASS_WHITE_CLOVER_SILAGE";
  const status = useMemo(() => gateCopy(gate), [gate]);

  const cropLabel = cycle ? CROP_SYSTEM_LABELS[cycle.cropSystem] : "Crop not recorded";
  const evidenceLabel = gate?.status === "READY_FOR_CALCULATION" ? "Evidence complete" : gate?.status === "UNSUPPORTED_PATHWAY" ? "Agronomy not enabled" : "Evidence incomplete";

  return (
    <section className="border-t border-fr-v2-cream-rule" aria-label="1 · Crop & production">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center justify-between gap-5 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-gold"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fr-v2-graphite">1 · Crop & production</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-fr-v2-muted">{cropLabel} · {season} · {evidenceLabel}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-forest">{open ? "Hide" : "Open"}</span>
      </button>

      {open ? <div className="flex flex-col gap-4 pb-6 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Field evidence</p>
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

      {cropSystem === "GRASS_GRAZING" ? (
        <div className="border border-fr-v2-cream-rule bg-fr-v2-cream-soft px-4 py-3" aria-label="Grazing production system">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-fr-v2-graphite">Grazing production system</p>
              {grazingSystem ? (
                <p className="mt-1 text-sm font-semibold text-fr-v2-forest-deep">{GRAZING_SYSTEM_LABELS[grazingSystem]}</p>
              ) : (
                <p className="mt-1 text-sm font-semibold text-fr-v2-graphite">Farm baseline not set</p>
              )}
              <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">
                {grazingMode === "farmer"
                  ? "Field exception. Recorded cattle movements still take priority when they provide stronger field-specific evidence."
                  : grazingSystem
                    ? "Using the farm baseline. Recorded cattle movements automatically override it when they clearly identify a different field system."
                    : "Set this once for the farm in Settings. You do not need to enter it separately for every field."}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-gold">
              {grazingMode === "farmer" ? "Field exception" : grazingSystem ? "Farm baseline" : "Set once"}
            </span>
          </div>

          {editingGrazingSystem ? (
            <div className="mt-3 flex flex-col gap-2">
              <label className={LABEL}>
                Field exception
                <select
                  className={INPUT}
                  value={grazingMode === "farmer" ? grazingSystem : ""}
                  onChange={(event) => {
                    setGrazingSystem(event.target.value as GrazingProductionSystem | "");
                    setGrazingMode(event.target.value ? "farmer" : "baseline");
                  }}
                >
                  <option value="">Use farm baseline</option>
                  <option value="SUCKLER_CALF_TO_BEEF">Suckler calf-to-beef</option>
                  <option value="SUCKLER_CALF_TO_WEANING">Suckler calf-to-weaning</option>
                  <option value="OTHER_DRYSTOCK">Other drystock</option>
                </select>
              </label>
              <button type="button" className="self-start text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-gold underline-offset-4" onClick={() => { setGrazingMode("baseline"); setGrazingSystem(farm.grazingProductionSystem?.value ?? ""); setEditingGrazingSystem(false); }}>Use farm baseline</button>
            </div>
          ) : grazingSystem ? (
            <button type="button" className="mt-3 text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-gold underline-offset-4" onClick={() => setEditingGrazingSystem(true)}>Set field exception</button>
          ) : (
            <a href="/settings#grazing-production-system" className="mt-3 inline-block text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-gold underline-offset-4">Set farm grazing system</a>
          )}
        </div>
      ) : null}

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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold text-fr-v2-graphite">Has chemical fertiliser already been applied to this field this season?</legend>
        <p className="text-xs text-fr-v2-muted">Only enter nutrient amounts when fertiliser has actually been applied.</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Chemical fertiliser already applied">
          {[
            ["none", "No"],
            ["yes", "Yes"],
            ["unknown", "Not sure"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={chemicalApplied === value}
              onClick={() => {
                const next = value as ChemicalAppliedState;
                setChemicalApplied(next);
                if (next === "none") {
                  setNApplied("0");
                  setPApplied("0");
                  setKApplied("0");
                } else if (next === "unknown") {
                  setNApplied("");
                  setPApplied("");
                  setKApplied("");
                } else if (chemicalApplied !== "yes") {
                  setNApplied("");
                  setPApplied("");
                  setKApplied("");
                }
              }}
              className={`min-h-10 border px-3 text-sm font-semibold ${chemicalApplied === value ? "border-fr-v2-forest bg-fr-v2-forest-deep text-white" : "border-fr-v2-cream-rule bg-white text-fr-v2-graphite"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {chemicalApplied === "yes" ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className={LABEL}>N (kg/ha)<input aria-label="Chemical N applied" type="number" min="0" step="0.1" className={INPUT} value={nApplied} onChange={(e) => setNApplied(e.target.value)} /></label>
            <label className={LABEL}>P (kg/ha)<input aria-label="Chemical P applied" type="number" min="0" step="0.1" className={INPUT} value={pApplied} onChange={(e) => setPApplied(e.target.value)} /></label>
            <label className={LABEL}>K (kg/ha)<input aria-label="Chemical K applied" type="number" min="0" step="0.1" className={INPUT} value={kApplied} onChange={(e) => setKApplied(e.target.value)} /></label>
          </div>
        ) : null}
      </fieldset>

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
                ...(grazingMode === "farmer" && grazingSystem ? { grazingProductionSystem: grazingSystem } : {}),
                farmerName: farm.ownerName,
              });
              setCycle(state.cycle);
              setGate(state.gate);
              setMessage("Field evidence saved.");
              onSaved?.();
            } catch (error) {
              setMessage(farmerFacingSaveError(error));
            }
          });
        }}
        className="min-h-11 bg-fr-v2-forest-deep px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save production evidence"}
      </button>
      </div> : null}
    </section>
  );
}
