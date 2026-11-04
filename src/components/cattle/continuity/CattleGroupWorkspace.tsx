"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays, ChevronDown, CircleDollarSign, HeartPulse, MapPin, MoveRight, Scale, Wheat } from "lucide-react";
import { moveLivestockGroupToFieldAction } from "@/app/actions/grazing-field-movements";
import { saveCattleGroupProductionPlanAction } from "@/app/actions/cattle-group-production-plan";
import {
  buildGroupNutritionVM,
  cattleMovementResultMessage,
  cattlePlanResultMessage,
  nutritionDraftOf,
  nutritionDraftToSaveInput,
  nutritionFormOptions,
  type CattleGroupOperationsVM,
  type Details,
  type DisplayTone,
  type MetricVM,
  type NutritionDraft,
  type OptionVM,
} from "@/domain/cattle/presentation";

const STATUS_TONE: Record<DisplayTone, string> = {
  good: "border-fr-v2-forest/30 bg-fr-v2-forest/[0.06] text-fr-v2-forest",
  neutral: "border-fr-v2-rule bg-fr-v2-cream text-fr-v2-charcoal",
  info: "border-fr-v2-gold/40 bg-fr-v2-cream text-fr-v2-charcoal",
  review: "border-fr-v2-gold/50 bg-fr-v2-gold/[0.08] text-fr-v2-charcoal",
  attention: "border-fr-v2-clay/40 bg-fr-v2-clay/[0.06] text-fr-v2-clay",
  risk: "border-fr-v2-clay/50 bg-fr-v2-clay/[0.08] text-fr-v2-clay",
  conflict: "border-fr-v2-clay/50 bg-fr-v2-clay/[0.08] text-fr-v2-clay",
  unknown: "border-fr-v2-rule bg-white text-fr-v2-muted",
};

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
  const [fieldId, setFieldId] = useState(vm.defaultFieldId);
  const [movedOn, setMovedOn] = useState(asOfDate);
  const [message, setMessage] = useState<string | null>(null);

  const [draft, setDraft] = useState<NutritionDraft>(() => nutritionDraftOf(vm.nutrition));
  const set = (key: keyof NutritionDraft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const nutrition = useMemo(() => buildGroupNutritionVM(vm.nutrition, draft, asOfDate), [vm.nutrition, draft, asOfDate]);
  const options = useMemo(() => nutritionFormOptions(vm.nutrition), [vm.nutrition]);

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
    const read = nutritionDraftToSaveInput(draft, asOfDate);
    if (!read.ok) {
      setMessage(read.message);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await saveCattleGroupProductionPlanAction({ groupId: vm.groupRef, ...read.input });
      setMessage(cattlePlanResultMessage(result));
      if (result.status === "saved") router.refresh();
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

      <section className="rounded-[18px] border border-fr-v2-rule bg-white p-5" data-production-plan>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-gold">Production plan</p>
          <h2 className="mt-1 font-display text-[28px] leading-tight text-fr-v2-charcoal">{vm.goalLabel}</h2>
          <p className="mt-1 text-xs text-fr-v2-muted">Set the outcome. Farm Return works out the gain needed and the feeding plan the evidence supports.</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-5">
          <SmallMetric metric={vm.headCount} />
          <SmallMetric metric={vm.currentWeight} />
          <SmallMetric metric={nutrition.targetWeight} />
          <SmallMetric metric={nutrition.requiredAdg} />
          <SmallMetric metric={vm.grassDemand} />
        </div>
        <p className="mt-3 text-[11px] text-fr-v2-muted">{nutrition.stageLine}</p>

        <form onSubmit={savePlan} className="mt-5 border-t border-fr-v2-rule pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PlanInput label="Target weight (kg)" value={draft.targetKg} onChange={set("targetKg")} kind="numeric" />
            <PlanInput label="Target date" value={draft.targetDate} onChange={set("targetDate")} kind="date" />
            <PlanSelect label="Feeding situation" value={draft.feedingSituation} onChange={set("feedingSituation")} options={options.feeding} />
            <PlanSelect label="Silage being fed" value={draft.silageBasis} onChange={set("silageBasis")} options={options.silageBasis} />
            {draft.silageBasis === "lab_analysis" ? (
              <>
                <PlanInput label="Silage DMD (%)" value={draft.silageDmd} onChange={set("silageDmd")} kind="numeric" />
                <PlanInput label="Silage crude protein (%)" value={draft.silageCp} onChange={set("silageCp")} kind="numeric" />
                <PlanInput label="Lab report date" value={draft.silageDate} onChange={set("silageDate")} kind="date" />
              </>
            ) : null}
            {draft.silageBasis === "planning_scenario" ? (
              <PlanSelect label="Assumed silage DMD" value={draft.scenarioDmd} onChange={set("scenarioDmd")} options={options.scenarioDmd} />
            ) : null}
          </div>

          <details className="group mt-4 rounded-[12px] border border-fr-v2-rule px-4 py-3" open={nutrition.overrideActive}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-fr-v2-charcoal">
              Advanced: farmer / advisor override
              <ChevronDown className="size-3.5 text-fr-v2-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-[11px] leading-relaxed text-fr-v2-muted">Only for a rate or price agreed with an advisor or supplier. An override replaces the Teagasc guideline in totals and cost and is labelled as an override. Leave blank to use the recommendation.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PlanInput label="Concentrate kg/head/day" value={draft.overrideConcentrateKg} onChange={set("overrideConcentrateKg")} kind="numeric" />
              <PlanInput label="Your concentrate €/tonne" value={draft.overridePriceEurT} onChange={set("overridePriceEurT")} kind="numeric" />
              <label className="text-xs text-fr-v2-muted sm:col-span-2">
                Plan note
                <input value={draft.notes} onChange={(e) => set("notes")(e.target.value)} className="mt-1 block min-h-10 w-full rounded-[8px] border border-fr-v2-rule px-3 text-sm text-fr-v2-charcoal" />
              </label>
            </div>
          </details>

          <div className="mt-4 flex justify-end">
            <button disabled={pending} className="min-h-10 rounded-[8px] bg-fr-v2-forest px-4 text-sm font-semibold text-white disabled:opacity-40">{pending ? "Saving…" : vm.planButtonLabel}</button>
          </div>
        </form>
      </section>

      <section className="rounded-[18px] border border-fr-v2-rule bg-white p-5" data-feeding-plan={nutrition.status.code}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wheat className="size-4 text-fr-v2-gold" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-muted">Recommended feeding plan</p>
              <h2 className="mt-1 font-display text-[25px] text-fr-v2-charcoal">Concentrate strategy</h2>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${STATUS_TONE[nutrition.status.tone]}`}>{nutrition.status.label}</span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fr-v2-charcoal">{nutrition.summary}</p>

        <div className="mt-5 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <SmallMetric metric={nutrition.concentrate} />
            {nutrition.inputsNeeded.length > 0 ? (
              <ul className="mt-4 space-y-1.5 border-l-[3px] border-fr-v2-harvest pl-3 text-xs text-fr-v2-charcoal">
                {nutrition.inputsNeeded.map((need) => <li key={need}>{need}</li>)}
              </ul>
            ) : null}
            {nutrition.silagePrompt ? <p className="mt-3 text-[11px] leading-relaxed text-fr-v2-muted">{nutrition.silagePrompt}</p> : null}
          </div>
          <dl className="divide-y divide-fr-v2-rule border-y border-fr-v2-rule">
            {nutrition.rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] gap-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fr-v2-muted">{row.label}</dt>
                <dd className="min-w-0">
                  <p className="text-sm font-semibold tabular-nums text-fr-v2-charcoal">{row.value}</p>
                  {row.detail ? <p className="mt-0.5 text-[10.5px] leading-snug text-fr-v2-muted">{row.detail}</p> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Link href={nutrition.inputsMarketHref} className="inline-flex min-h-10 items-center gap-1.5 rounded-[8px] border border-fr-v2-forest px-4 text-sm font-semibold text-fr-v2-forest">
            {nutrition.inputsMarketLabel} <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <details className="group mt-5 border-t border-fr-v2-rule pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-fr-v2-forest">
            Assumptions and evidence <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 grid gap-5 text-xs leading-relaxed text-fr-v2-charcoal md:grid-cols-2">
            <div className="space-y-2">
              {nutrition.assumptions.map((line) => <p key={line} className="border-l-2 border-fr-v2-rule pl-3">{line}</p>)}
              {nutrition.notes.map((line) => <p key={line} className="border-l-2 border-fr-v2-gold/50 pl-3">{line}</p>)}
            </div>
            <ul className="space-y-3">
              {nutrition.evidence.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-fr-v2-forest hover:underline">{source.title}</a>
                  <p className="text-[10.5px] text-fr-v2-muted">{source.meta}</p>
                  <p className="mt-1">{source.usedFor}</p>
                  <p className="mt-1 text-[10.5px] text-fr-v2-muted">{source.limitation}</p>
                </li>
              ))}
            </ul>
          </div>
        </details>
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
            <SmallMetric metric={nutrition.feedCostHeadDay} />
            <SmallMetric metric={nutrition.feedCostGroupDay} />
            <SmallMetric metric={nutrition.costPerTargetKg} />
          </div>
          <p className="mt-3 text-[11px] text-fr-v2-muted">{nutrition.costNote}</p>

          <div className="mt-4 rounded-[14px] border border-fr-v2-rule bg-fr-v2-cream/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-fr-v2-charcoal">{vm.returnOnGain.title}</p>
                <p className="mt-1 text-xs text-fr-v2-muted">{vm.returnOnGain.subtitle}</p>
              </div>
              <span className="font-mono text-xs font-semibold text-fr-v2-clay">{nutrition.costLabel}</span>
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

function PlanSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Details<OptionVM>;
}) {
  return (
    <label className="text-xs text-fr-v2-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block min-h-10 w-full rounded-[8px] border border-fr-v2-rule bg-white px-3 text-sm text-fr-v2-charcoal">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
