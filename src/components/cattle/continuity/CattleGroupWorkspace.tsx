"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays, ChevronDown, CircleDollarSign, HeartPulse, MapPin, MoveRight, Scale } from "lucide-react";
import { moveLivestockGroupToFieldAction } from "@/app/actions/grazing-field-movements";
import { saveCattleGroupProductionPlanAction } from "@/app/actions/cattle-group-production-plan";
import {
  cattleMovementResultMessage,
  cattlePlanResultMessage,
  NUMERIC_FIELDS,
  numericInputValue,
  parseNumericInput,
  type CattleGroupOperationsVM,
  type MetricVM,
  type NumericFieldSpec,
} from "@/domain/cattle/presentation";

function optionalNumber(value: string, spec: NumericFieldSpec): { value: number | null; valid: boolean } {
  const parsed = parseNumericInput(value, spec);
  if (parsed.state === "EMPTY") return { value: null, valid: true };
  if (parsed.state === "INVALID") return { value: null, valid: false };
  return { value: numericInputValue(parsed), valid: true };
}

function textOrNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function SmallMetric({ metric }: { metric: MetricVM }) {
  const value = metric.value ?? metric.state.label;
  return (
    <div className="min-w-0 border-l border-fr-v2-rule pl-4 first:border-l-0 first:pl-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fr-v2-muted">{metric.label}</p>
      <p className="mt-1 font-display text-[25px] leading-none tabular-nums text-fr-v2-charcoal">
        {value}
        {metric.unit ? <span className="ml-1 font-sans text-[11px] font-medium text-fr-v2-muted">{metric.unit}</span> : null}
      </p>
      {metric.caption ? <p className="mt-1 text-[10.5px] leading-snug text-fr-v2-muted">{metric.caption}</p> : null}
      {metric.value === null && metric.state.detail ? <p className="mt-1 text-[10.5px] leading-snug text-fr-v2-muted">{metric.state.detail}</p> : null}
    </div>
  );
}

export function CattleGroupWorkspace({
  vm,
  asOfDate,
  workLabel,
  workDetail,
}: {
  vm: CattleGroupOperationsVM;
  asOfDate: string;
  workLabel: string;
  workDetail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [fieldId, setFieldId] = useState(vm.defaultFieldId);
  const [movedOn, setMovedOn] = useState(asOfDate);
  const [message, setMessage] = useState<string | null>(null);

  const [targetWeight, setTargetWeight] = useState(vm.form.targetKg);
  const [targetDate, setTargetDate] = useState(vm.form.targetDate);
  const [dietLabel, setDietLabel] = useState(vm.form.dietLabel);
  const [concentrateKg, setConcentrateKg] = useState(vm.form.concentrateKgHeadDay);
  const [concentratePrice, setConcentratePrice] = useState(vm.form.concentratePriceEurT);
  const [forageCost, setForageCost] = useState(vm.form.forageCostEurHeadDay);
  const [housingCost, setHousingCost] = useState(vm.form.housingCostEurHeadDay);
  const [notes, setNotes] = useState(vm.form.notes);

  async function moveGroup(e: FormEvent) {
    e.preventDefault();
    if (fieldId === "") return;
    setMessage(null);
    startTransition(async () => {
      const result = await moveLivestockGroupToFieldAction({ livestockGroupId: vm.groupRef, fieldId, movedOn });
      setMessage(cattleMovementResultMessage(result));
      if (result.status === "saved") {
        setMoveOpen(false);
        router.refresh();
      }
    });
  }

  async function savePlan(e: FormEvent) {
    e.preventDefault();
    const targetWeightRead = optionalNumber(targetWeight, NUMERIC_FIELDS.TARGET_KG);
    const concentrateKgRead = optionalNumber(concentrateKg, NUMERIC_FIELDS.PLAN_AMOUNT);
    const concentratePriceRead = optionalNumber(concentratePrice, NUMERIC_FIELDS.PLAN_AMOUNT);
    const forageCostRead = optionalNumber(forageCost, NUMERIC_FIELDS.PLAN_AMOUNT);
    const housingCostRead = optionalNumber(housingCost, NUMERIC_FIELDS.PLAN_AMOUNT);
    if (![targetWeightRead, concentrateKgRead, concentratePriceRead, forageCostRead, housingCostRead].every((read) => read.valid)) {
      setMessage("Check the production-plan numbers before saving.");
      return;
    }
    const parsed = {
      targetKg: targetWeightRead.value,
      targetDate: textOrNull(targetDate),
      dietLabel: textOrNull(dietLabel),
      concentrateKgHeadDay: concentrateKgRead.value,
      concentratePriceEurT: concentratePriceRead.value,
      forageCostEurHeadDay: forageCostRead.value,
      housingCostEurHeadDay: housingCostRead.value,
      notes: textOrNull(notes),
    };
    setMessage(null);
    startTransition(async () => {
      const result = await saveCattleGroupProductionPlanAction({ groupId: vm.groupRef, ...parsed });
      setMessage(cattlePlanResultMessage(result));
      if (result.status === "saved") {
        setPlanOpen(false);
        router.refresh();
      }
    });
  }

  const canChooseField = vm.fieldChoices.state === "ITEMS";

  return (
    <div className="mt-6 space-y-5" data-cattle-group-workspace={vm.groupRef}>
      {message ? <div className="border-l-[3px] border-fr-v2-harvest bg-fr-v2-cream px-4 py-3 text-sm text-fr-v2-charcoal" role="status">{message}</div> : null}

      <section className="rounded-[18px] border border-fr-v2-rule bg-white p-5">
        <div className="grid gap-5 md:grid-cols-[1.25fr_.75fr]">
          <div>
            <div className="flex items-center gap-2 text-fr-v2-forest">
              <MapPin className="size-4" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em]">{vm.location.label}</p>
            </div>
            <p className="mt-2 font-display text-[28px] leading-tight text-fr-v2-charcoal">{vm.location.value ?? vm.location.state.label}</p>
            <p className="mt-1 text-xs text-fr-v2-muted">{vm.locationDetail}</p>
          </div>
          <div className="flex items-end justify-start md:justify-end">
            <button
              type="button"
              onClick={() => setMoveOpen((open) => !open)}
              disabled={!canChooseField}
              className="inline-flex min-h-10 items-center gap-2 rounded-[9px] bg-fr-v2-forest px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MoveRight className="size-4" />
              Move cattle
            </button>
          </div>
        </div>
        {moveOpen && vm.fieldChoices.state === "ITEMS" ? (
          <form onSubmit={moveGroup} className="mt-4 grid gap-3 border-t border-fr-v2-rule pt-4 sm:grid-cols-[1fr_180px_auto]">
            <label className="text-xs text-fr-v2-muted">
              Destination field
              <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} className="mt-1 block min-h-10 w-full rounded-[8px] border border-fr-v2-rule bg-white px-3 text-sm text-fr-v2-charcoal">
                {vm.fieldChoices.items.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-fr-v2-muted">
              Moved on
              <input type="date" value={movedOn} max={asOfDate} onChange={(e) => setMovedOn(e.target.value)} className="mt-1 block min-h-10 w-full rounded-[8px] border border-fr-v2-rule px-3 text-sm text-fr-v2-charcoal" />
            </label>
            <button disabled={pending || fieldId === ""} className="mt-auto min-h-10 rounded-[8px] border border-fr-v2-forest px-4 text-sm font-semibold text-fr-v2-forest disabled:opacity-40">Record move</button>
          </form>
        ) : vm.fieldChoices.state !== "ITEMS" ? (
          <div className="mt-4 border-t border-fr-v2-rule pt-4 text-xs text-fr-v2-muted">
            <p className="font-semibold text-fr-v2-charcoal">{vm.fieldChoices.display.label}</p>
            {vm.fieldChoices.display.detail ? <p className="mt-1">{vm.fieldChoices.display.detail}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-[18px] border border-fr-v2-rule bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-gold">Production plan</p>
            <h2 className="mt-1 font-display text-[28px] leading-tight text-fr-v2-charcoal">{vm.goalLabel}</h2>
            <p className="mt-1 text-xs text-fr-v2-muted">Group objective → required performance → diet → cost → planning.</p>
          </div>
          <button type="button" onClick={() => setPlanOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-fr-v2-rule px-3 text-xs font-semibold text-fr-v2-forest">
            {vm.planButtonLabel} <ChevronDown className={`size-3.5 transition-transform ${planOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-4">
          <SmallMetric metric={vm.currentWeight} />
          <SmallMetric metric={vm.targetWeight} />
          <SmallMetric metric={vm.requiredAdg} />
          <SmallMetric metric={vm.grassDemand} />
        </div>

        {planOpen ? (
          <form onSubmit={savePlan} className="mt-5 border-t border-fr-v2-rule pt-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PlanInput label="Target weight (kg)" value={targetWeight} onChange={setTargetWeight} kind="numeric" />
              <PlanInput label="Target date" value={targetDate} onChange={setTargetDate} kind="date" />
              <PlanInput label="Concentrate kg/head/day" value={concentrateKg} onChange={setConcentrateKg} kind="numeric" />
              <PlanInput label="Concentrate €/tonne" value={concentratePrice} onChange={setConcentratePrice} kind="numeric" />
              <PlanInput label="Forage €/head/day" value={forageCost} onChange={setForageCost} kind="numeric" />
              <PlanInput label="Housing €/head/day" value={housingCost} onChange={setHousingCost} kind="numeric" />
              <label className="text-xs text-fr-v2-muted sm:col-span-2">
                Diet / ration
                <input value={dietLabel} onChange={(e) => setDietLabel(e.target.value)} placeholder="e.g. grazing + 2 kg concentrate" className="mt-1 block min-h-10 w-full rounded-[8px] border border-fr-v2-rule px-3 text-sm text-fr-v2-charcoal" />
              </label>
              <label className="text-xs text-fr-v2-muted sm:col-span-2 lg:col-span-4">
                Plan note
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 block w-full rounded-[8px] border border-fr-v2-rule px-3 py-2 text-sm text-fr-v2-charcoal" />
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button disabled={pending} className="min-h-10 rounded-[8px] bg-fr-v2-forest px-4 text-sm font-semibold text-white disabled:opacity-40">{pending ? "Saving…" : "Save production plan"}</button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[18px] border border-fr-v2-rule bg-white p-5">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-fr-v2-gold" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-muted">Production economics</p>
              <h2 className="mt-1 font-display text-[25px] text-fr-v2-charcoal">Cost of gain</h2>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <SmallMetric metric={vm.feedCostHeadDay} />
            <SmallMetric metric={vm.feedCostGroupDay} />
            <SmallMetric metric={vm.costPerTargetKg} />
          </div>

          <div className="mt-4 rounded-[14px] border border-fr-v2-rule bg-fr-v2-cream/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-fr-v2-charcoal">{vm.returnOnGain.title}</p>
                <p className="mt-1 text-xs text-fr-v2-muted">{vm.returnOnGain.subtitle}</p>
              </div>
              <span className="font-mono text-xs font-semibold text-fr-v2-clay">{vm.returnOnGain.costLabel}</span>
            </div>
            <div className="relative mt-4 flex h-32 items-center justify-center overflow-hidden border-b border-l border-fr-v2-rule bg-[linear-gradient(to_right,transparent_49%,rgba(214,206,192,.45)_50%,transparent_51%),linear-gradient(to_bottom,transparent_49%,rgba(214,206,192,.45)_50%,transparent_51%)] bg-[length:25%_100%,100%_50%]">
              <div className="max-w-[270px] px-4 text-center">
                <p className="text-[11px] font-semibold text-fr-v2-charcoal">{vm.returnOnGain.waitingTitle}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-fr-v2-muted">{vm.returnOnGain.waitingDetail}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-fr-v2-muted">{vm.returnOnGain.note}</p>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[18px] border border-fr-v2-rule bg-white p-5">
            <div className="flex items-center gap-2"><CalendarDays className="size-4 text-fr-v2-forest" /><h2 className="font-semibold text-fr-v2-charcoal">Next actions</h2></div>
            <p className="mt-3 text-[17px] font-semibold text-fr-v2-charcoal">{workLabel}</p>
            <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">{workDetail}</p>
            <Link href="/plan" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-fr-v2-forest">Open Planning <ArrowUpRight className="size-3.5" /></Link>
          </section>

          <section className="rounded-[18px] border border-fr-v2-rule bg-white p-5">
            <div className="flex items-center gap-2"><HeartPulse className="size-4 text-fr-v2-clay" /><h2 className="font-semibold text-fr-v2-charcoal">{vm.health.title}</h2></div>
            <p className="mt-3 text-sm font-medium text-fr-v2-charcoal">{vm.health.lead}</p>
            <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">{vm.health.detail}</p>
          </section>

          <section className="rounded-[18px] border border-fr-v2-rule bg-white p-5">
            <div className="flex items-center gap-2"><Scale className="size-4 text-fr-v2-gold" /><h2 className="font-semibold text-fr-v2-charcoal">{vm.market.title}</h2></div>
            <p className="mt-3 text-sm font-medium text-fr-v2-charcoal">{vm.market.lead}</p>
            <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">{vm.market.detail}</p>
          </section>
        </div>
      </section>
    </div>
  );
}

function PlanInput({
  label,
  value,
  onChange,
  kind,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind: "numeric" | "date";
}) {
  return (
    <label className="text-xs text-fr-v2-muted">
      {label}
      <input
        type={kind === "date" ? "date" : "text"}
        inputMode={kind === "numeric" ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block min-h-10 w-full rounded-[8px] border border-fr-v2-rule px-3 text-sm text-fr-v2-charcoal"
      />
    </label>
  );
}
