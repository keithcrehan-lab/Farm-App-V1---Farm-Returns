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
import { useFarm, useFarmActions } from "@/store/farm-store";
import { FIELD_NUTRIENT_FOCUS_ATTRIBUTE } from "@/lib/field-nutrient-focus";
import { CROP_SYSTEM_CONTEXT } from "@/lib/crop-system-context";

/** Teagasc drystock clover strategy classes (April sward white-clover
 * content) — stored as the class's own percentage (0 / 5 / 10), the only
 * values the fertiliser engine's clover pathway recognises. */
const WHITE_CLOVER_APRIL_CLASS_OPTIONS: readonly (readonly [string, string])[] = [
  ["0", "Little or none"],
  ["5", "About 5%"],
  ["10", "About 10%"],
];

const INPUT = "min-h-10 w-full border border-fr-v2-cream-rule bg-white px-3 text-sm text-fr-v2-graphite outline-none focus:border-fr-v2-forest";
const LABEL = "flex flex-col gap-1.5 text-xs font-semibold text-fr-v2-graphite";

const cropOptions = Object.entries(CROP_SYSTEM_LABELS) as Array<[CropSystem, string]>;

const GRAZING_SYSTEM_LABELS: Readonly<Record<GrazingProductionSystem, string>> = Object.freeze({
  SUCKLER_CALF_TO_BEEF: "Suckler cows, calves kept to stores or beef",
  SUCKLER_CALF_TO_WEANING: "Suckler cows, calves sold as weanlings",
  OTHER_DRYSTOCK: "Drystock only, no suckler cows",
});

const GRAZING_SYSTEM_CONTEXT: Readonly<Record<GrazingProductionSystem, string>> = Object.freeze({
  SUCKLER_CALF_TO_BEEF: "Cows and their calves, with the calves kept on and finished as beef.",
  SUCKLER_CALF_TO_WEANING: "Cows and their calves, with the calves sold at weaning.",
  OTHER_DRYSTOCK: "Bought-in stores, dry cattle or another drystock system.",
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

export function FieldProductionCycleCard({
  field,
  onSaved,
  planningSeason,
  defaultOpen = false,
}: {
  field: Field;
  onSaved?: () => void;
  /** Quote-planning season carried from Fertiliser Plan. Without its own
   * cycle, a future season is planned from the carried-forward current
   * cycle, so that is the cycle edited here. */
  planningSeason?: string;
  defaultOpen?: boolean;
}) {
  const farm = useFarm();
  const { applySavedProductionCycle } = useFarmActions();
  const currentSeason = String(new Date().getFullYear());
  const requestedSeason = planningSeason ?? currentSeason;
  const [loaded, setLoaded] = useState<{ requested: string; season: string }>({ requested: requestedSeason, season: requestedSeason });
  // Never edit a stale season while a newly requested one is loading.
  const season = loaded.requested === requestedSeason ? loaded.season : requestedSeason;
  const carriedForwardTo = season !== requestedSeason ? requestedSeason : null;
  // Saving always writes the planning season. A carried-forward cycle is
  // only the starting point; editing it for a future quote must never
  // rewrite the current season's record.
  const futureSeason = requestedSeason > currentSeason;
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
  const [open, setOpen] = useState(defaultOpen);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void loadFieldProductionCycleAction(field.id, requestedSeason)
      .then(async (requestedState) => {
        if (requestedState.cycle || requestedSeason === currentSeason) return { state: requestedState, season: requestedSeason };
        const carried = await loadFieldProductionCycleAction(field.id, currentSeason);
        return carried.cycle ? { state: carried, season: currentSeason } : { state: requestedState, season: requestedSeason };
      })
      .then(({ state, season: resolvedSeason }) => {
        if (cancelled) return;
        setLoaded({ requested: requestedSeason, season: resolvedSeason });
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
  }, [field.id, requestedSeason, currentSeason, farm.grazingProductionSystem?.value]);

  const supported = P2_SUPPORTED_CROP_SYSTEMS.includes(cropSystem);
  const needsTarget = cropSystem === "GRASS_FIRST_CUT_SILAGE" || cropSystem === "GRASS_SECOND_CUT_SILAGE" || cropSystem === "GRASS_THIRD_CUT_SILAGE" || cropSystem === "GRASS_HAY" || cropSystem === "GRASS_MIXED" || cropSystem === "GRASS_WHITE_CLOVER_SILAGE";
  const needsClover = cropSystem === "GRASS_WHITE_CLOVER_GRAZING" || cropSystem === "GRASS_WHITE_CLOVER_SILAGE";
  const status = useMemo(() => gateCopy(gate), [gate]);

  const cropLabel = cycle ? CROP_SYSTEM_LABELS[cycle.cropSystem] : "Crop not recorded";
  const evidenceLabel = gate?.status === "READY_FOR_CALCULATION" ? "Evidence complete" : gate?.status === "UNSUPPORTED_PATHWAY" ? "Agronomy not enabled" : "Evidence incomplete";

  return (
    <section className="border-t border-fr-v2-cream-rule" aria-label="1 · Crop & production" id="production-cycle">
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
          <h3 className="mt-1 text-base font-semibold text-fr-v2-graphite">{requestedSeason} production cycle</h3>
          {carriedForwardTo ? (
            <p className="mt-1 text-xs text-fr-v2-muted">
              No {carriedForwardTo} cycle is saved, so this {season} cycle is carried forward for {carriedForwardTo} quote planning. Saving creates a planned {carriedForwardTo} cycle and leaves {season} unchanged.
            </p>
          ) : null}
        </div>
        <span className="text-xs font-semibold text-fr-v2-muted">{cycle && !carriedForwardTo ? "Saved" : "Not saved"}</span>
      </div>

      <label className={LABEL}>
        Crop system
        <select className={INPUT} value={cropSystem} onChange={(event) => setCropSystem(event.target.value as CropSystem)} aria-describedby={`crop-system-context-${field.id}`}>
          {cropOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}{P2_SUPPORTED_CROP_SYSTEMS.includes(value) ? "" : " — not enabled yet"}
            </option>
          ))}
        </select>
      </label>
      <span id={`crop-system-context-${field.id}`} className="-mt-2 text-xs leading-relaxed text-fr-v2-muted">
        {CROP_SYSTEM_CONTEXT[cropSystem]}
      </span>

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
                  aria-describedby={`grazing-system-context-${field.id}`}
                  value={grazingMode === "farmer" ? grazingSystem : ""}
                  onChange={(event) => {
                    setGrazingSystem(event.target.value as GrazingProductionSystem | "");
                    setGrazingMode(event.target.value ? "farmer" : "baseline");
                  }}
                >
                  <option value="">Use farm baseline</option>
                  <option value="SUCKLER_CALF_TO_WEANING">Suckler cows, calves sold as weanlings</option>
                  <option value="SUCKLER_CALF_TO_BEEF">Suckler cows, calves kept to stores or beef</option>
                  <option value="OTHER_DRYSTOCK">Drystock only, no suckler cows</option>
                </select>
              </label>
              <span id={`grazing-system-context-${field.id}`} className="-mt-2 text-xs leading-relaxed text-fr-v2-muted">
                {grazingMode === "farmer" && grazingSystem
                  ? GRAZING_SYSTEM_CONTEXT[grazingSystem]
                  : "Choose a different system only if this field is run differently from the rest of the farm."}
              </span>
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
        <>
        <label className={LABEL}>
          Production target (t DM/ha)
          <input {...{ [FIELD_NUTRIENT_FOCUS_ATTRIBUTE]: "production-target" }} type="number" min="0" step="0.1" className={INPUT} value={target} onChange={(event) => setTarget(event.target.value)} aria-describedby={`production-target-context-${field.id}`} />
        </label>
        <span id={`production-target-context-${field.id}`} className="-mt-2 text-xs leading-relaxed text-fr-v2-muted">
          The dry matter you expect to harvest per hectare from this cut, from your own records or your contractor&apos;s yields.
          {cropSystem === "GRASS_FIRST_CUT_SILAGE" ? " Farm Return's validated first-cut rule covers the published 5 t DM/ha table; another target is saved but not calculated." : ""}
        </span>
        </>
      ) : null}

      {cropSystem === "GRASS_WHITE_CLOVER_GRAZING" ? (
        <fieldset className="flex flex-col gap-2" aria-describedby={`clover-context-${field.id}`}>
          <legend className="text-xs font-semibold text-fr-v2-graphite">White clover in the sward in April</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="White clover in the sward in April">
            {WHITE_CLOVER_APRIL_CLASS_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={cloverPct === value}
                onClick={() => setCloverPct(value)}
                className={`min-h-11 border px-2 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-gold ${
                  cloverPct === value ? "border-fr-v2-forest-deep bg-fr-v2-forest-deep text-white" : "border-fr-v2-cream-rule bg-white text-fr-v2-graphite"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span id={`clover-context-${field.id}`} className="text-xs leading-relaxed text-fr-v2-muted">
            {cloverPct !== "" && !WHITE_CLOVER_APRIL_CLASS_OPTIONS.some(([value]) => value === cloverPct)
              ? `Recorded as ${cloverPct}%, which isn't one of Teagasc's clover classes — choose the closest one above.`
              : "Teagasc's clover nitrogen advice is set by how much of the sward is white clover in April, judged by eye or from a sward assessment."}
          </span>
        </fieldset>
      ) : needsClover ? (
        <>
        <label className={LABEL}>
          White clover content (%)
          <input type="number" min="0" max="100" step="1" className={INPUT} value={cloverPct} onChange={(event) => setCloverPct(event.target.value)} aria-describedby={`clover-context-${field.id}`} />
        </label>
        <span id={`clover-context-${field.id}`} className="-mt-2 text-xs leading-relaxed text-fr-v2-muted">
          Your estimate of the share of the sward that is white clover, by eye or from a sward assessment.
        </span>
        </>
      ) : null}

      {futureSeason ? (
        <p className="text-xs text-fr-v2-muted">
          Fertiliser spread before {requestedSeason} is not deducted from the {requestedSeason} requirement, so nothing needs to be entered here.
        </p>
      ) : (
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
              {...(value === "none" ? { [FIELD_NUTRIENT_FOCUS_ATTRIBUTE]: "prior-fertiliser" } : {})}
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
      )}

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
                season: requestedSeason,
                cropSystem,
                status: futureSeason ? "planned" : "active",
                ...(numericValue(target) !== undefined ? { productionTargetTDMHa: numericValue(target) } : {}),
                // A future season's prior chemical baseline is the planning
                // contract's explicit zero, never a carried-over answer.
                ...(!futureSeason && numericValue(nApplied) !== undefined ? { chemicalNAppliedKgHa: numericValue(nApplied) } : {}),
                ...(!futureSeason && numericValue(pApplied) !== undefined ? { chemicalPAppliedKgHa: numericValue(pApplied) } : {}),
                ...(!futureSeason && numericValue(kApplied) !== undefined ? { chemicalKAppliedKgHa: numericValue(kApplied) } : {}),
                ...(numericValue(cloverPct) !== undefined ? { whiteCloverPct: numericValue(cloverPct) } : {}),
                ...(grazingMode === "farmer" && grazingSystem ? { grazingProductionSystem: grazingSystem } : {}),
                farmerName: farm.ownerName,
              });
              setLoaded({ requested: requestedSeason, season: requestedSeason });
              setCycle(state.cycle);
              setGate(state.gate);
              // Codex audit F010: the farm store's sward follows the save, so
              // every nutrient plan uses the new clover evidence at once.
              applySavedProductionCycle(field.id, requestedSeason, state.cycle);
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
