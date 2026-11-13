"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays, Check, ChevronDown, CircleDollarSign, Compass, HeartPulse, Home, MapPin, MoveRight, Scale, Wheat } from "lucide-react";
import { moveLivestockGroupToFieldAction, moveLivestockGroupToHousingAction } from "@/app/actions/grazing-field-movements";
import { saveCattleGroupProductionPlanAction } from "@/app/actions/cattle-group-production-plan";
import {
  buildGroupNutritionVM,
  cattleHousingMoveResultMessage,
  cattleMovementResultMessage,
  cattlePlanResultMessage,
  nutritionDraftOf,
  nutritionDraftToSaveInput,
  nutritionFormOptions,
  type AdvisoryActionVM,
  type AdvisoryItemVM,
  type AdvisoryPathVM,
  type AdvisoryStatusVM,
  type CattleGroupOperationsVM,
  type Details,
  type DisplayTone,
  type MetricVM,
  type NutritionDraft,
  type OptionVM,
} from "@/domain/cattle/presentation";
import styles from "./CattleGroupWorkspace.module.css";

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

type StatePanel = "location" | "weight" | "production" | "feeding" | null;

function metricValue(metric: MetricVM) {
  return metric.value ?? metric.state.label;
}

function metricLine(metric: MetricVM) {
  const value = metricValue(metric);
  return metric.unit ? `${value} ${metric.unit}` : value;
}

function SmallMetric({ metric }: { metric: MetricVM }) {
  const value = metricValue(metric);
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

function StateTile({
  id,
  label,
  value,
  detail,
  active,
  onClick,
}: {
  id: string;
  label: string;
  value: string;
  detail: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={active}
      aria-controls={id}
      onClick={onClick}
      className={`${styles.stateTile} ${active ? styles.stateTileActive : ""}`}
    >
      <span className={styles.tileLabel}>{label}</span>
      <span className={`${styles.tileValue} block`}>{value}</span>
      <span className={`${styles.tileDetail} block`}>{detail}</span>
    </button>
  );
}

function AdvisoryPaths({ paths }: { paths: Details<AdvisoryPathVM> }) {
  return (
    <ul className="divide-y divide-fr-v2-rule border-y border-fr-v2-rule">
      {paths.map((path) => (
        <li key={path.code} className="grid gap-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start" data-advisory-path={path.code}>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fr-v2-charcoal">
              {path.label}
              {path.marker ? <span className="rounded-full border border-fr-v2-forest/30 px-2 py-0.5 text-[10px] font-semibold text-fr-v2-forest">{path.marker}</span> : null}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-fr-v2-muted">{path.detail}</p>
          </div>
          <span className={`justify-self-start rounded-full border px-3 py-1 text-[11px] font-semibold ${STATUS_TONE[path.tone]}`}>{path.status}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusChip({ status }: { status: AdvisoryStatusVM }) {
  return <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${STATUS_TONE[status.tone]}`}>{status.label}</span>;
}

function AdvisoryAction({ action, onOpenEditor, onOpenLocation }: { action: AdvisoryActionVM; onOpenEditor: () => void; onOpenLocation: () => void }) {
  const actionClass = `${styles.actionButton} inline-flex min-h-9 items-center gap-1 rounded-full border border-fr-v2-forest px-3.5 text-xs font-semibold text-fr-v2-forest`;
  if (action.kind === "LINK") {
    return action.href.startsWith("#") ? (
      <a href={action.href} className={actionClass}>{action.label}</a>
    ) : (
      <Link href={action.href} className={actionClass}>{action.label} <ArrowUpRight className="size-3" /></Link>
    );
  }
  if (action.kind === "OPEN_EDITOR") return <button type="button" onClick={onOpenEditor} className={actionClass}>{action.label}</button>;
  if (action.kind === "OPEN_LOCATION") return <button type="button" onClick={onOpenLocation} className={actionClass}>{action.label}</button>;
  return <p className="text-[11px] leading-snug text-fr-v2-muted">{action.label}</p>;
}

function AdvisoryChecklist({
  items,
  onOpenEditor,
  onOpenLocation,
}: {
  items: Details<AdvisoryItemVM>;
  onOpenEditor: () => void;
  onOpenLocation: () => void;
}) {
  return (
    <ul className="divide-y divide-fr-v2-rule border-y border-fr-v2-rule">
      {items.map((item) => (
        <li key={item.code} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-advisory-item={item.code}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fr-v2-charcoal">{item.label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-fr-v2-muted">{item.value}</p>
          </div>
          <AdvisoryAction action={item.action} onOpenEditor={onOpenEditor} onOpenLocation={onOpenLocation} />
        </li>
      ))}
    </ul>
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
  const [activeState, setActiveState] = useState<StatePanel>(null);
  const [moveOpen, setMoveOpen] = useState<"field" | "housing" | null>(null);
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [fieldId, setFieldId] = useState(vm.defaultFieldId);
  const [movedOn, setMovedOn] = useState(asOfDate);
  const [housingId, setHousingId] = useState(vm.defaultHousingId);
  const [message, setMessage] = useState<string | null>(null);

  const [draft, setDraft] = useState<NutritionDraft>(() => nutritionDraftOf(vm.nutrition));
  const set = (key: keyof NutritionDraft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const nutrition = useMemo(() => buildGroupNutritionVM(vm.nutrition, draft, asOfDate), [vm.nutrition, draft, asOfDate]);
  const options = useMemo(() => nutritionFormOptions(vm.nutrition), [vm.nutrition]);

  const toggleState = (next: Exclude<StatePanel, null>) => {
    setActiveState((current) => (current === next ? null : next));
  };
  const advisory = vm.advisory;
  const openEditor = () => setEditPlanOpen(true);
  const openLocation = () => setActiveState("location");

  async function moveGroup(e: FormEvent) {
    e.preventDefault();
    if (fieldId === "") return;
    setMessage(null);
    startTransition(async () => {
      const result = await moveLivestockGroupToFieldAction({ livestockGroupId: vm.groupRef, fieldId, movedOn });
      setMessage(cattleMovementResultMessage(result));
      if (result.status === "saved") {
        setMoveOpen(null);
        setActiveState(null);
        window.dispatchEvent(new Event("farm-return:grazing-moved"));
        router.refresh();
      }
    });
  }

  async function moveToHousing(e: FormEvent) {
    e.preventDefault();
    if (housingId === "") return;
    setMessage(null);
    startTransition(async () => {
      const result = await moveLivestockGroupToHousingAction({ livestockGroupId: vm.groupRef, housingId, housedOn: movedOn });
      setMessage(cattleHousingMoveResultMessage(result));
      if (result.status === "saved" || result.status === "unchanged") {
        setMoveOpen(null);
        setActiveState(null);
        window.dispatchEvent(new Event("farm-return:grazing-moved"));
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
      if (result.status === "saved") {
        setEditPlanOpen(false);
        router.refresh();
      }
    });
  }

  const canChooseField = vm.fieldChoices.state === "ITEMS";
  const canChooseHousing = vm.housingChoices.state === "ITEMS";
  const productionValue = nutrition.targetWeight.value ? metricLine(nutrition.targetWeight) : vm.goalLabel;
  const productionDetail = nutrition.requiredAdg.value ? `${metricLine(nutrition.requiredAdg)} required` : nutrition.requiredAdg.state.label;
  const feedingValue = nutrition.concentrate.value ? metricLine(nutrition.concentrate) : nutrition.status.label;
  const weightDetail = vm.currentWeightDetail;

  return (
    <div className={`mt-6 space-y-4 ${styles.workspace}`} data-cattle-group-workspace={vm.groupRef}>
      {message ? (
        <div className="border-l-[3px] border-fr-v2-harvest bg-fr-v2-cream px-4 py-3 text-sm text-fr-v2-charcoal" role="status">
          {message}
        </div>
      ) : null}

      <section aria-label="Group state" className={styles.stateGrid}>
        <StateTile
          id="group-state-location"
          label="Current location"
          value={vm.location.value ?? vm.location.state.label}
          detail={vm.locationDetail}
          active={activeState === "location"}
          onClick={() => toggleState("location")}
        />
        <StateTile
          id="group-state-weight"
          label={vm.currentWeight.label}
          value={metricLine(vm.currentWeight)}
          detail={weightDetail}
          active={activeState === "weight"}
          onClick={() => toggleState("weight")}
        />
        <StateTile
          id="group-state-production"
          label="Production target"
          value={productionValue}
          detail={productionDetail}
          active={activeState === "production"}
          onClick={() => toggleState("production")}
        />
        <StateTile
          id="group-state-feeding"
          label="Feeding"
          value={feedingValue}
          detail={nutrition.status.label}
          active={activeState === "feeding"}
          onClick={() => toggleState("feeding")}
        />
      </section>

      <div className={`${styles.reveal} ${activeState ? styles.revealOpen : ""}`}>
        <div className={styles.revealInner}>
          {activeState === "location" ? (
            <section id="group-state-location" className={`${styles.surface} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-fr-v2-forest">
                    <MapPin className="size-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em]">{vm.location.label}</p>
                  </div>
                  <p className="mt-2 font-display text-[27px] leading-tight text-fr-v2-charcoal">{vm.location.value ?? vm.location.state.label}</p>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-fr-v2-muted">{vm.locationDetail}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-expanded={moveOpen === "field"}
                    onClick={() => setMoveOpen((open) => (open === "field" ? null : "field"))}
                    disabled={!canChooseField}
                    className={`${styles.actionButton} inline-flex min-h-11 items-center gap-2 rounded-full bg-fr-v2-forest px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <MoveRight className="size-4" />
                    {vm.moveToFieldLabel}
                  </button>
                  <button
                    type="button"
                    aria-expanded={moveOpen === "housing"}
                    onClick={() => setMoveOpen((open) => (open === "housing" ? null : "housing"))}
                    disabled={!canChooseHousing}
                    className={`${styles.actionButton} inline-flex min-h-11 items-center gap-2 rounded-full border border-fr-v2-forest px-5 text-sm font-semibold text-fr-v2-forest disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <Home className="size-4" />
                    {vm.moveToHousingLabel}
                  </button>
                </div>
              </div>

              {moveOpen === "field" && vm.fieldChoices.state === "ITEMS" ? (
                <form onSubmit={moveGroup} className="mt-5 grid gap-3 border-t border-fr-v2-rule pt-4 sm:grid-cols-[1fr_180px_auto]" data-move-form="field">
                  <label className="text-xs text-fr-v2-muted">
                    Destination field
                    <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} className="mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-rule bg-white px-3 text-sm text-fr-v2-charcoal">
                      {vm.fieldChoices.items.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-fr-v2-muted">
                    Moved on
                    <input type="date" value={movedOn} max={asOfDate} onChange={(e) => setMovedOn(e.target.value)} className="mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-rule px-3 text-sm text-fr-v2-charcoal" />
                  </label>
                  <button disabled={pending || fieldId === ""} className={`${styles.actionButton} mt-auto min-h-11 rounded-full border border-fr-v2-forest px-5 text-sm font-semibold text-fr-v2-forest disabled:opacity-40`}>Record move</button>
                </form>
              ) : null}

              {moveOpen === "housing" && vm.housingChoices.state === "ITEMS" ? (
                <form onSubmit={moveToHousing} className="mt-5 grid gap-3 border-t border-fr-v2-rule pt-4 sm:grid-cols-[1fr_180px_auto]" data-move-form="housing">
                  <label className="text-xs text-fr-v2-muted">
                    Shed
                    <select value={housingId} onChange={(e) => setHousingId(e.target.value)} className="mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-rule bg-white px-3 text-sm text-fr-v2-charcoal">
                      {vm.housingChoices.items.map((shed) => <option key={shed.id} value={shed.id}>{shed.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-fr-v2-muted">
                    Housed on
                    <input type="date" value={movedOn} max={asOfDate} onChange={(e) => setMovedOn(e.target.value)} className="mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-rule px-3 text-sm text-fr-v2-charcoal" />
                  </label>
                  <button disabled={pending || housingId === ""} className={`${styles.actionButton} mt-auto min-h-11 rounded-full border border-fr-v2-forest px-5 text-sm font-semibold text-fr-v2-forest disabled:opacity-40`}>Record housing</button>
                </form>
              ) : null}

              {vm.fieldChoices.state !== "ITEMS" ? (
                <div className="mt-4 border-t border-fr-v2-rule pt-4 text-xs text-fr-v2-muted">
                  <p className="font-semibold text-fr-v2-charcoal">{vm.fieldChoices.display.label}</p>
                  {vm.fieldChoices.display.detail ? <p className="mt-1">{vm.fieldChoices.display.detail}</p> : null}
                </div>
              ) : null}
              {vm.housingChoices.state !== "ITEMS" ? (
                <div className="mt-4 border-t border-fr-v2-rule pt-4 text-xs text-fr-v2-muted">
                  <p className="font-semibold text-fr-v2-charcoal">{vm.housingChoices.display.label}</p>
                  {vm.housingChoices.display.detail ? <p className="mt-1">{vm.housingChoices.display.detail}</p> : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeState === "weight" ? (
            <section id="group-state-weight" className={`${styles.surface} p-5`}>
              <div className="flex items-center gap-2 text-fr-v2-gold"><Scale className="size-4" /><p className="text-[10px] font-semibold uppercase tracking-[0.13em]">{vm.currentWeight.label}</p></div>
              <p className="mt-2 font-display text-[30px] leading-none text-fr-v2-charcoal">{metricLine(vm.currentWeight)}</p>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-fr-v2-muted">{weightDetail}</p>
              <p className="mt-3 text-xs font-medium text-fr-v2-charcoal">Weights remain owned by the animal records. Open an animal below to record or review its weights.</p>
            </section>
          ) : null}

          {activeState === "production" ? (
            <section id="group-state-production" className={`${styles.surface} p-5`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-gold">Production target</p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
                <SmallMetric metric={vm.currentWeight} />
                <SmallMetric metric={nutrition.targetWeight} />
                <SmallMetric metric={nutrition.requiredAdg} />
                <SmallMetric metric={vm.grassDemand} />
              </div>
              <p className="mt-3 text-[11px] text-fr-v2-muted">{nutrition.stageLine}</p>
              <button type="button" onClick={() => setEditPlanOpen(true)} className={`${styles.actionButton} mt-4 min-h-11 rounded-full border border-fr-v2-forest px-5 text-sm font-semibold text-fr-v2-forest`}>
                {vm.planButtonLabel === "Save plan" ? "Override / edit production target" : vm.planButtonLabel}
              </button>
            </section>
          ) : null}

          {activeState === "feeding" ? (
            <section id="group-state-feeding" className={`${styles.surface} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><Wheat className="size-4 text-fr-v2-gold" /><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-muted">Feeding recommendation</p></div>
                  <p className="mt-2 font-display text-[29px] text-fr-v2-charcoal">{feedingValue}</p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fr-v2-charcoal">{nutrition.summary}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${STATUS_TONE[nutrition.status.tone]}`}>{nutrition.status.label}</span>
              </div>
              <Link href={nutrition.inputsMarketHref} className={`${styles.actionButton} mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-fr-v2-forest px-5 text-sm font-semibold text-fr-v2-forest`}>
                {nutrition.inputsMarketLabel} <ArrowUpRight className="size-3.5" />
              </Link>
            </section>
          ) : null}
        </div>
      </div>

      <section className={`${styles.surface} ${styles.primarySurface} p-5`} aria-labelledby="production-recommendation-title" data-production-advisory={advisory.state}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-fr-v2-gold"><Compass className="size-4" /><p className="text-[10px] font-semibold uppercase tracking-[0.13em]">Production recommendation</p></div>
            <h2 id="production-recommendation-title" className="mt-1 font-display text-[29px] leading-tight text-fr-v2-charcoal">{advisory.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fr-v2-charcoal">{advisory.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Recommendation status">
            <StatusChip status={advisory.readiness} />
            <StatusChip status={advisory.confidence} />
          </div>
        </div>

        <dl className="mt-4 grid gap-x-5 gap-y-3 border-t border-fr-v2-rule pt-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fr-v2-muted">Readiness</dt>
            <dd className="mt-1 font-semibold text-fr-v2-charcoal">{advisory.readiness.label}</dd>
            <dd className="mt-0.5 leading-snug text-fr-v2-muted">{advisory.readiness.detail}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fr-v2-muted">Confidence</dt>
            <dd className="mt-1 font-semibold text-fr-v2-charcoal">{advisory.confidence.label}</dd>
            <dd className="mt-0.5 leading-snug text-fr-v2-muted">{advisory.confidence.detail}</dd>
          </div>
          <div data-advisory-economics>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fr-v2-muted">Economics</dt>
            <dd className="mt-1 font-semibold text-fr-v2-charcoal">{advisory.economics.label}</dd>
            <dd className="mt-0.5 leading-snug text-fr-v2-muted">{advisory.economics.detail}</dd>
          </div>
        </dl>

        {advisory.required.length > 0 ? (
          <div className="mt-5" data-advisory-required>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-clay">Needed before Farm Return can recommend</p>
            <AdvisoryChecklist items={advisory.required} onOpenEditor={openEditor} onOpenLocation={openLocation} />
          </div>
        ) : null}

        {advisory.paths.length > 0 ? (
          <div className="mt-5" data-advisory-paths>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-muted">Feasible paths and evidence</p>
            <AdvisoryPaths paths={advisory.paths} />
          </div>
        ) : null}

        {advisory.reasons.length > 0 ? (
          <div className="mt-5" data-advisory-reasons>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-muted">Why this path</p>
            <ul className="space-y-1.5 text-xs leading-relaxed text-fr-v2-charcoal">
              {advisory.reasons.map((reason) => (
                <li key={reason} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-fr-v2-forest" /><span>{reason}</span></li>
              ))}
            </ul>
          </div>
        ) : null}

        {advisory.improve.length > 0 ? (
          <div className="mt-5" data-advisory-improve>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-muted">{advisory.improveTitle}</p>
            <AdvisoryChecklist items={advisory.improve} onOpenEditor={openEditor} onOpenLocation={openLocation} />
          </div>
        ) : null}

        <div className="mt-5 space-y-2 border-l-[3px] border-fr-v2-rule pl-3 text-[11px] leading-relaxed text-fr-v2-muted">
          <p data-advisory-alternatives>{advisory.alternatives}</p>
          <p data-advisory-trajectory>{advisory.trajectory}</p>
          <p data-advisory-action-note>{advisory.actionNote}</p>
        </div>

        <details className={`${styles.disclosure} mt-3`}>
          <summary className={styles.disclosureSummary}>
            <span className="text-sm font-semibold text-fr-v2-forest">Core facts and evidence</span>
            <ChevronDown className={`${styles.chevron} size-4 text-fr-v2-muted`} />
          </summary>
          <div className="space-y-4 pb-4">
            <dl className="divide-y divide-fr-v2-rule border-y border-fr-v2-rule">
              {[...advisory.core, ...advisory.evidenceFacts].map((item) => (
                <div key={item.code} className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fr-v2-muted">{item.label}</dt>
                  <dd className={`text-sm ${item.met ? "text-fr-v2-charcoal" : "text-fr-v2-clay"}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-5 text-xs leading-relaxed text-fr-v2-charcoal md:grid-cols-2">
              <div className="space-y-2">
                {advisory.limitations.map((line) => <p key={line} className="border-l-2 border-fr-v2-rule pl-3">{line}</p>)}
              </div>
              <ul className="space-y-3">
                {advisory.evidence.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-fr-v2-forest hover:underline">{source.title}</a>
                    <p className="text-[10.5px] text-fr-v2-muted">{source.meta}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </section>

      <section className={`${styles.surface} p-5`} data-production-plan>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-gold">Your production target</p>
            <h2 className="mt-1 font-display text-[24px] leading-tight text-fr-v2-charcoal">{vm.goalLabel}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fr-v2-muted">{vm.productionTargetNote}</p>
          </div>
          <button
            type="button"
            aria-expanded={editPlanOpen}
            aria-controls="production-plan-editor"
            onClick={() => setEditPlanOpen((open) => !open)}
            className={`${styles.actionButton} min-h-11 rounded-full border border-fr-v2-rule bg-white px-5 text-sm font-semibold text-fr-v2-forest`}
          >
            {editPlanOpen ? "Close editor" : "Override / edit production target"}
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-5">
          <SmallMetric metric={vm.headCount} />
          <SmallMetric metric={vm.currentWeight} />
          <SmallMetric metric={nutrition.targetWeight} />
          <SmallMetric metric={nutrition.requiredAdg} />
          <SmallMetric metric={nutrition.concentrate} />
        </div>
        <p className="mt-3 text-[11px] text-fr-v2-muted">{nutrition.stageLine}</p>

        {editPlanOpen ? (
          <div className={styles.editorEnter}>
            <form id="production-plan-editor" onSubmit={savePlan} className="mt-5 border-t border-fr-v2-rule pt-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <PlanSelect label="Group goal" value={draft.goal} onChange={set("goal")} options={options.goal} />
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

              <details className="group mt-4 rounded-[12px] border border-fr-v2-rule px-4 py-3" open={nutrition.overrideActive || undefined}>
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
                    <input value={draft.notes} onChange={(e) => set("notes")(e.target.value)} className="mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-rule px-3 text-sm text-fr-v2-charcoal" />
                  </label>
                </div>
              </details>

              <div className="mt-4 flex justify-end">
                <button disabled={pending} className={`${styles.actionButton} min-h-11 rounded-full bg-fr-v2-forest px-5 text-sm font-semibold text-white disabled:opacity-40`}>{pending ? "Saving…" : vm.planButtonLabel}</button>
              </div>
            </form>
          </div>
        ) : null}
      </section>

      <section className={`${styles.surface} p-5`} data-feeding-plan={nutrition.status.code}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Wheat className="size-4 text-fr-v2-gold" /><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-muted">Recommended feeding plan</p></div>
            <h2 className="mt-2 font-display text-[31px] leading-none text-fr-v2-charcoal">{feedingValue}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fr-v2-charcoal">{nutrition.summary}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${STATUS_TONE[nutrition.status.tone]}`}>{nutrition.status.label}</span>
        </div>

        {nutrition.inputsNeeded.length > 0 ? (
          <ul className="mt-4 space-y-1.5 border-l-[3px] border-fr-v2-harvest pl-3 text-xs text-fr-v2-charcoal">
            {nutrition.inputsNeeded.map((need) => <li key={need}>{need}</li>)}
          </ul>
        ) : null}
        {nutrition.silagePrompt ? <p className="mt-3 text-[11px] leading-relaxed text-fr-v2-muted">{nutrition.silagePrompt}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href={nutrition.inputsMarketHref} className={`${styles.actionButton} inline-flex min-h-11 items-center gap-1.5 rounded-full border border-fr-v2-forest px-5 text-sm font-semibold text-fr-v2-forest`}>
            {nutrition.inputsMarketLabel} <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <details className={`${styles.disclosure} mt-5`}>
          <summary className={styles.disclosureSummary}>
            <span className="text-sm font-semibold text-fr-v2-forest">Why this recommendation?</span>
            <ChevronDown className={`${styles.chevron} size-4 text-fr-v2-muted`} />
          </summary>
          <div className="pb-4">
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
            <div className="mt-4 grid gap-5 text-xs leading-relaxed text-fr-v2-charcoal md:grid-cols-2">
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
          </div>
        </details>
      </section>

      <details className={`${styles.surface} px-5`}>
        <summary className={styles.disclosureSummary}>
          <span className="flex items-center gap-2"><CircleDollarSign className="size-4 text-fr-v2-gold" /><span className="font-semibold">Production economics</span></span>
          <ChevronDown className={`${styles.chevron} size-4 text-fr-v2-muted`} />
        </summary>
        <div className="pb-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
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
            <div className="relative mt-4 flex h-28 items-center justify-center overflow-hidden border-b border-l border-fr-v2-rule">
              <div className="max-w-[300px] px-4 text-center">
                <p className="text-[11px] font-semibold text-fr-v2-charcoal">{vm.returnOnGain.waitingTitle}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-fr-v2-muted">{vm.returnOnGain.waitingDetail}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-fr-v2-muted">{vm.returnOnGain.note}</p>
          </div>
        </div>
      </details>

      <section className={`${styles.surface} px-5`} aria-label="More group information">
        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>
            <span className="flex items-center gap-2"><CalendarDays className="size-4 text-fr-v2-forest" /><span className="font-semibold">Next actions</span></span>
            <ChevronDown className={`${styles.chevron} size-4 text-fr-v2-muted`} />
          </summary>
          <div className="pb-4">
            <p className="text-[17px] font-semibold text-fr-v2-charcoal">{workLabel}</p>
            <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">{workDetail}</p>
            <Link href="/plan" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fr-v2-forest">Open Planning <ArrowUpRight className="size-3.5" /></Link>
          </div>
        </details>

        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>
            <span className="flex items-center gap-2"><HeartPulse className="size-4 text-fr-v2-clay" /><span className="font-semibold">{vm.health.title}</span></span>
            <ChevronDown className={`${styles.chevron} size-4 text-fr-v2-muted`} />
          </summary>
          <div className="pb-4">
            <p className="text-sm font-medium text-fr-v2-charcoal">{vm.health.lead}</p>
            <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">{vm.health.detail}</p>
          </div>
        </details>

        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>
            <span className="flex items-center gap-2"><Scale className="size-4 text-fr-v2-gold" /><span className="font-semibold">{vm.market.title}</span></span>
            <ChevronDown className={`${styles.chevron} size-4 text-fr-v2-muted`} />
          </summary>
          <div className="pb-4">
            <p className="text-sm font-medium text-fr-v2-charcoal">{vm.market.lead}</p>
            <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">{vm.market.detail}</p>
          </div>
        </details>
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
        className="mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-rule px-3 text-sm text-fr-v2-charcoal"
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
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-rule bg-white px-3 text-sm text-fr-v2-charcoal">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
