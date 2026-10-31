"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { phStatusLabel } from "@/lib/status";
import { mockSilagePlans } from "@/data/mock-farm";
import type { Field } from "@/domain/types";
import type { Prompt } from "@/orchestration/prompt";
import { CLOSED_PERIOD_BY_ZONE_MATERIAL, type SpreadingMaterial, type SpreadingZone } from "@/domain/closed-period-calendar";
import { formatHa, formatNumber } from "@/lib/format";
import { nearestStationsForField } from "@/domain/weather-stations";
import { FieldBoundaryMapModal } from "@/components/farm/FieldBoundaryMapModal";
import { FieldSatelliteHistory } from "@/components/farm/FieldSatelliteHistory";
import { SpreadableAreaEvidencePanel } from "@/components/farm/SpreadableAreaEvidencePanel";
import { FieldProductionCycleCard } from "@/components/farm/FieldProductionCycleCard";
import { FieldSoilTestEditor } from "@/components/farm/FieldSoilTestEditor";
import { CROP_SYSTEM_LABELS, type CropSystem } from "@/domain/fertiliser-field-evidence";
import { getFieldWorkspaceContextAction, type FieldWorkspaceContext, type FieldActivityEvent } from "@/app/actions/field-workspace";
import { saveFieldProductionCycleAction } from "@/app/actions/fertiliser-field-evidence";
import { autoAssessFieldLegalSpatialEvidenceAction } from "@/app/actions/farm";
import { FieldNutrientPlanBody } from "@/app/(app)/today/field/[fieldId]/FieldNutrientPlanPageClient";
import { useFarmActions, useFarm, useHousingList, useIsRealMode, useSlurryAllocations } from "@/store/farm-store";
import type { BufferFeature } from "@/domain/buffer-gate";
import { soilTestAgeValidityForFertility } from "@/domain/nutrients";
import type { MissingSlurryPlanningDetail } from "@/domain/what-matters-no-recommendation";
import { useFieldNutrientPlan } from "@/lib/use-field-nutrient-plan";
import { fieldNutrientPlanView } from "@/lib/field-nutrient-plan-presentation";
import { fieldNutrientPlanHref, type FieldWorkspaceChapter } from "@/lib/farm-spatial-field-lens";
import { fieldHistoryEvents, formatFieldDate, type FieldHistoryEvent } from "@/lib/field-workspace-presentation";

const FARMER_MATERIAL_LABEL: Record<SpreadingMaterial, string> = {
  chemical_fertiliser: "Chemical fertiliser",
  organic_fertiliser_other_than_FYM: "Slurry and organic fertiliser",
  farmyard_manure: "Farmyard manure",
};

function formatReopenDate(mmDd: string): string {
  const [month, day] = mmDd.split("-").map(Number);
  if (!month || !day) return "";
  const date = new Date(Date.UTC(2026, month - 1, day + 1));
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

function farmerPromptSummary(prompt: Prompt, fieldName: string): { title: string; message?: string; detailLabel: string } {
  if (prompt.kind === "spreading_window" && prompt.basis.status === "LEGAL_PROHIBITION" && prompt.basis.reasonCode === "CLOSED_PERIOD_CALENDAR") {
    const zone = prompt.inputsSnapshot?.zone as SpreadingZone | undefined;
    const material = prompt.inputsSnapshot?.material as SpreadingMaterial | undefined;
    const period = zone && material ? CLOSED_PERIOD_BY_ZONE_MATERIAL[zone]?.[material] : undefined;
    const reopen = period ? formatReopenDate(period.closedThroughMmDd) : "";
    const materialLabel = material ? FARMER_MATERIAL_LABEL[material] : "Spreading";
    return {
      title: `${materialLabel} spreading is closed`,
      message: reopen
        ? `You can’t spread ${materialLabel.toLowerCase()} on ${fieldName} right now. Reopens ${reopen}.`
        : `You can’t spread ${materialLabel.toLowerCase()} on ${fieldName} right now.`,
      detailLabel: "View rules & evidence",
    };
  }

  return { title: prompt.title, message: prompt.description, detailLabel: "Why? See the evidence" };
}

const BUFFER_FEATURE_OPTIONS: { value: BufferFeature; label: string }[] = [
  { value: "surface_water", label: "Surface water (stream/river/canal)" },
  { value: "major_drinking_water_abstraction", label: "Major drinking-water abstraction" },
  { value: "drinking_water_abstraction", label: "Drinking-water abstraction" },
  { value: "other_drinking_well_spring_borehole", label: "Well / spring / borehole" },
  { value: "lake_or_turlough_likely_to_flood", label: "Lake or turlough likely to flood" },
  { value: "exposed_cavernous_or_karst_limestone_feature", label: "Exposed karst/cavernous limestone" },
];

const SLURRY_METHOD_LABEL: Record<string, string> = { LESS: "LESS", splashplate: "Splash plate", incorporate_24h: "Incorporated within 24 h", other: "Other method" };

const CHAPTERS: { id: FieldWorkspaceChapter; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "nutrients", label: "Nutrients" },
  { id: "history", label: "History" },
];

const INPUT = "w-full rounded-[4px] border border-fr-v2-cream-rule bg-white/75 px-2.5 py-2 text-sm text-fr-v2-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fr-v2-gold";
const LABEL = "flex flex-col gap-1.5 text-xs text-fr-v2-muted";
const TEXT_LINK = "text-sm font-semibold text-fr-v2-forest underline decoration-fr-v2-forest/30 underline-offset-[3px] transition-colors duration-[160ms] hover:decoration-fr-v2-gold motion-reduce:transition-none";

/**
 * Farm + Fields redesign — the field workspace's chapters
 * (`docs/design/farm-fields-high-fidelity-reference.md` "Field workspace"):
 * only Overview, Nutrients and History. The earlier Now / Soil / Activity /
 * Constraints tabs are regrouped, not rewritten: current state, planned
 * work, conditions and recent activity live in Overview; soil evidence and
 * the statutory inputs (commonage, water buffers, slurry method and date,
 * spreadable area) sit inside Nutrients beside the canonical nutrient plan
 * they feed; History is the dated evidence ledger.
 *
 * Structural changes (boundary, name/use, archive) sit behind an explicit
 * "Manage field" control, so reading the field never edits it.
 *
 * Every value is the persisted `Field`, a canonical store/engine export or
 * the shared nutrient plan assembly. Nothing here calculates; unknown stays
 * unknown.
 */
export function FieldDrawer({
  field,
  className,
  slurryDetailsRequest,
  initialChapter,
  leadingPrompt,
  onViewPrompt,
}: {
  field: Field;
  className?: string;
  /** Set when the farmer arrived from What Matters' "Add spreading
   * details" link: opens Nutrients on the spreading details, explains why,
   * and asks only for the method/date each allocation was actually missing
   * when the workspace opened — values already on record are not asked for
   * again. */
  slurryDetailsRequest?: MissingSlurryPlanningDetail[];
  initialChapter?: FieldWorkspaceChapter;
  /** The field's own leading Prompt from the real producers, if any. */
  leadingPrompt?: Prompt;
  /** Opens that Prompt's evidence ("Why?"). */
  onViewPrompt?: () => void;
}) {
  const [chapter, setChapter] = useState<FieldWorkspaceChapter>(slurryDetailsRequest ? "nutrients" : (initialChapter ?? "overview"));
  const [workspaceContext, setWorkspaceContext] = useState<FieldWorkspaceContext | null>(null);
  const [workspaceUnavailable, setWorkspaceUnavailable] = useState(false);
  const { restoreField } = useFarmActions();

  const refreshWorkspace = () => {
    setWorkspaceUnavailable(false);
    void getFieldWorkspaceContextAction(field.id)
      .then(setWorkspaceContext)
      .catch(() => {
        setWorkspaceContext(null);
        setWorkspaceUnavailable(true);
      });
  };

  useEffect(() => {
    let cancelled = false;
    void getFieldWorkspaceContextAction(field.id)
      .then((context) => {
        if (!cancelled) {
          setWorkspaceUnavailable(false);
          setWorkspaceContext(context);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaceContext(null);
          setWorkspaceUnavailable(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [field.id]);

  return (
    <div className={cn("flex flex-col text-fr-v2-graphite", className)} data-field-workspace>
      <nav aria-label="Field chapters" className="flex gap-7 border-b border-fr-v2-cream-rule">
        {CHAPTERS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChapter(c.id)}
            aria-pressed={chapter === c.id}
            data-chapter={c.id}
            className={cn(
              "relative -mb-px min-h-11 border-b-2 pb-2.5 pt-3 text-sm font-semibold tracking-[0.01em] transition-colors duration-[160ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-gold motion-reduce:transition-none",
              chapter === c.id ? "border-fr-v2-gold text-fr-v2-graphite" : "border-transparent text-fr-v2-muted hover:text-fr-v2-graphite",
            )}
          >
            {c.label}
          </button>
        ))}
      </nav>

      {field.archivedAt ? (
        <div className="mt-5 flex items-center justify-between gap-4 border-l-[3px] border-fr-v2-clay bg-fr-v2-clay-tint/60 px-4 py-2.5 text-sm">
          <span className="text-fr-v2-charcoal">
            Archived {formatFieldDate(field.archivedAt)} — hidden from Nutrients, Soil and other planning screens.
          </span>
          <button type="button" onClick={() => restoreField(field.id)} className="shrink-0 text-xs font-semibold text-fr-v2-forest underline underline-offset-2">
            Restore
          </button>
        </div>
      ) : null}

      <div className="pt-7">
        {chapter === "overview" ? (
          <OverviewChapter field={field} workspaceContext={workspaceContext} workspaceUnavailable={workspaceUnavailable} leadingPrompt={leadingPrompt} onViewPrompt={onViewPrompt} onOpenHistory={() => setChapter("history")} onProductionCycleSaved={refreshWorkspace} />
        ) : chapter === "nutrients" ? (
          <NutrientsChapter field={field} slurryDetailsRequest={slurryDetailsRequest} onProductionCycleSaved={refreshWorkspace} />
        ) : (
          <HistoryChapter field={field} workspaceContext={workspaceContext} workspaceUnavailable={workspaceUnavailable} />
        )}
      </div>
    </div>
  );
}

function Section({ kicker, children, className, id }: { kicker: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-label={kicker} id={id} className={cn("border-t border-fr-v2-cream-rule pt-4", className)}>
      <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-muted">{kicker}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ProgressiveStage({
  label,
  summary,
  children,
  defaultOpen = false,
}: {
  label: string;
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-fr-v2-cream-rule" aria-label={label}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center justify-between gap-5 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-gold"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fr-v2-graphite">{label}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-fr-v2-muted">{summary}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-forest">{open ? "Hide" : "Open"}</span>
      </button>
      {open ? <div className="pb-6 pt-2">{children}</div> : null}
    </section>
  );
}

function Row({ label, value, detail, quiet }: { label: string; value: ReactNode; detail?: ReactNode; quiet?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-sm text-fr-v2-muted">{label}</dt>
      <dd className="min-w-0 sm:text-right">
        <span className={cn("text-sm", quiet ? "italic text-fr-v2-muted" : "font-semibold text-fr-v2-graphite")}>{value}</span>
        {detail ? <span className="block font-mono text-[11px] text-fr-v2-muted">{detail}</span> : null}
      </dd>
    </div>
  );
}

/* ---------------------------------------------------------------- Overview */

function OverviewChapter({
  field,
  workspaceContext,
  workspaceUnavailable,
  leadingPrompt,
  onViewPrompt,
  onOpenHistory,
  onProductionCycleSaved,
}: {
  field: Field;
  workspaceContext: FieldWorkspaceContext | null;
  workspaceUnavailable: boolean;
  leadingPrompt?: Prompt;
  onViewPrompt?: () => void;
  onOpenHistory: () => void;
  onProductionCycleSaved: () => void;
}) {
  const isRealMode = useIsRealMode();
  const farm = useFarm();
  const slurryAllocations = useSlurryAllocations();
  const housing = useHousingList();
  const planResult = useFieldNutrientPlan(field);
  const planAvailable = planResult ? fieldNutrientPlanView(planResult, field).status === "available" : false;
  const allocations = slurryAllocations.filter((a) => a.fieldId === field.id && a.priority !== "not_suitable");
  // The silage plan source is demonstration data only — never shown to a
  // signed-in farm.
  const silagePlan = isRealMode ? undefined : mockSilagePlans.find((p) => p.fieldId === field.id);
  // Real Met Éireann station-selection engine (src/domain/weather-stations.ts):
  // a confirmed 25-station registry, matched by real geographic distance, not
  // county. No live/historical observation feed is wired to any station yet —
  // this only answers "which station," not "what's the weather there."
  const [nearestWeatherStation] = nearestStationsForField(field, undefined, 1);
  const recent = [
    ...fieldHistoryEvents(field),
    ...(workspaceContext?.activities.map(activityToHistoryEvent) ?? []),
  ]
    .sort((a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0))
    .slice(0, 3);
  const currentCycle = workspaceContext?.cycle;
  const season = currentCycle?.season ?? String(new Date().getFullYear());
  const [editingUse, setEditingUse] = useState(false);
  const [useDraft, setUseDraft] = useState<CropSystem>(currentCycle?.cropSystem ?? "GRASS_GRAZING");
  const [useMessage, setUseMessage] = useState<string | null>(null);
  const [savingUse, startUseTransition] = useTransition();

  const promptSummary = leadingPrompt ? farmerPromptSummary(leadingPrompt, field.name) : null;

  const primary = planAvailable
    ? { label: "Open nutrient plan", href: fieldNutrientPlanHref(field.id) }
    : !field.fertility.verifiedTest
      ? { label: "Take soil sample", href: `/soil-sample/${encodeURIComponent(field.id)}` }
      : undefined;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-14">
      <div className="flex min-w-0 flex-col gap-8">
        <section aria-label="Now" data-field-now>
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Now</p>
          {leadingPrompt && promptSummary ? (
            <>
              <p className="mt-2 max-w-[34ch] text-[22px] font-semibold leading-[1.18] tracking-[-0.01em] text-fr-v2-graphite">{promptSummary.title}</p>
              {promptSummary.message ? <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-fr-v2-muted">{promptSummary.message}</p> : null}
              {onViewPrompt ? (
                <button type="button" onClick={onViewPrompt} className={cn(TEXT_LINK, "mt-3")}>
                  {promptSummary.detailLabel} →
                </button>
              ) : null}
            </>
          ) : (
            <p className="mt-2 font-display text-[22px] leading-snug text-fr-v2-muted">No open prompt for this field.</p>
          )}
        </section>

        <Section kicker="Use">
          <dl className="divide-y divide-fr-v2-cream-rule/70">
            <div className="py-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <dt className="shrink-0 text-sm text-fr-v2-muted">Current crop / use</dt>
                <dd className="min-w-0 sm:text-right">
                  {workspaceUnavailable ? (
                    <>
                      <span className="text-sm italic text-fr-v2-muted">Temporarily unavailable</span>
                      <span className="block font-mono text-[11px] text-fr-v2-muted">Production-cycle evidence could not be loaded</span>
                    </>
                  ) : editingUse ? (
                    <div className="flex min-w-[280px] flex-col gap-2 sm:items-end">
                      <select
                        aria-label="Current crop / use"
                        value={useDraft}
                        onChange={(event) => setUseDraft(event.target.value as CropSystem)}
                        className="min-h-10 w-full max-w-sm border border-fr-v2-cream-rule bg-white px-3 text-sm text-fr-v2-graphite outline-none focus:border-fr-v2-forest"
                      >
                        {(Object.entries(CROP_SYSTEM_LABELS) as Array<[CropSystem, string]>).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => { setEditingUse(false); setUseMessage(null); setUseDraft(currentCycle?.cropSystem ?? "GRASS_GRAZING"); }} className="min-h-9 px-3 text-xs font-semibold text-fr-v2-muted">Cancel</button>
                        <button
                          type="button"
                          disabled={savingUse}
                          onClick={() => {
                            setUseMessage(null);
                            startUseTransition(async () => {
                              try {
                                const saved = await saveFieldProductionCycleAction({
                                  fieldId: field.id,
                                  season,
                                  cropSystem: useDraft,
                                  status: "active",
                                  farmerName: farm.ownerName,
                                });
                                setEditingUse(false);
                                setUseMessage(saved.gate?.status === "READY_FOR_CALCULATION" ? "Field use updated." : "Field use updated. More production evidence may be needed for the recommendation.");
                                onProductionCycleSaved();
                              } catch {
                                setUseMessage("Could not update field use. Please try again.");
                              }
                            });
                          }}
                          className="min-h-9 bg-fr-v2-forest-deep px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {savingUse ? "Saving…" : "Save use"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setUseDraft(currentCycle?.cropSystem ?? "GRASS_GRAZING");
                          setEditingUse(true);
                        }}
                        className="text-sm font-semibold text-fr-v2-graphite underline decoration-fr-v2-forest/30 underline-offset-[3px] hover:decoration-fr-v2-gold"
                      >
                        {currentCycle ? CROP_SYSTEM_LABELS[currentCycle.cropSystem] : "Not recorded"}
                      </button>
                      <span className="block font-mono text-[11px] text-fr-v2-muted">
                        {currentCycle ? `${currentCycle.season} production cycle · ${currentCycle.status}${currentCycle.evidence.cropSystem?.source ? ` · ${currentCycle.evidence.cropSystem.source}` : ""}` : "Click to set this season's field use"}
                      </span>
                    </>
                  )}
                  {useMessage ? <span className="mt-1 block text-xs text-fr-v2-muted">{useMessage}</span> : null}
                </dd>
              </div>
            </div>
            <Row label="Livestock" value="Not recorded for fields yet" detail="Groups carry no field location" quiet />
          </dl>
        </Section>

        <Section kicker="Planned work">
          {allocations.length > 0 ? (
            <ul className="divide-y divide-fr-v2-cream-rule/70">
              {allocations.map((allocation) => {
                const shed = housing.find((h) => h.id === allocation.housingId);
                return (
                  <li key={allocation.housingId} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                    <span className="text-sm font-semibold">Slurry spreading{shed ? ` from ${shed.shedName}` : ""}</span>
                    <span className="font-mono text-[12px] tabular-nums text-fr-v2-charcoal">
                      {formatNumber(allocation.volumeM3, 0)} m³
                      {allocation.applicationMethod ? ` · ${SLURRY_METHOD_LABEL[allocation.applicationMethod.value] ?? allocation.applicationMethod.value}` : " · method not recorded"}
                      {allocation.applicationDate ? ` · ${formatFieldDate(allocation.applicationDate.value) ?? allocation.applicationDate.value}` : " · date not recorded"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm italic text-fr-v2-muted">No planned work recorded for this field.</p>
          )}
          {silagePlan ? (
            <dl className="mt-2 divide-y divide-fr-v2-cream-rule/70" data-demo-silage>
              <Row
                label="Cutting window · demonstration"
                value={`${new Date(silagePlan.targetCutWindow.value.start).toLocaleDateString("en-IE", { day: "numeric", month: "short" })} – ${new Date(silagePlan.targetCutWindow.value.end).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}`}
              />
              <Row label="Expected yield · demonstration" value={`${formatNumber(silagePlan.expectedYieldTDMha.value, 1)} t DM/ha`} />
            </dl>
          ) : null}
          <Link href="/plan" className={cn(TEXT_LINK, "mt-3 inline-block")}>
            Plan →
          </Link>
        </Section>

        <Section kicker="Conditions">
          <dl className="divide-y divide-fr-v2-cream-rule/70">
            {/* Was "Spreading today: {score}/100" or "Do not spread" — an
                unsourced mock verdict presented as fact. See
                SpreadingSuitabilityValidationCard's doc comment. */}
            <Row label="Spreading suitability" value="Under validation" quiet />
            <Row label="Drainage" value={field.mappedSoil ? field.mappedSoil.drainage.replace(/_/g, " ") : "Unavailable"} quiet={!field.mappedSoil} />
            {nearestWeatherStation ? (
              <Row
                label="Nearest weather station"
                value={nearestWeatherStation.station.canonicalName}
                detail={`${formatNumber(nearestWeatherStation.distanceKm, 1)} km · confirmed Met Éireann station, no feed connected yet`}
              />
            ) : null}
          </dl>
        </Section>

        <Section kicker="Recent activity">
          {recent.length > 0 ? <HistoryList events={recent} /> : <p className="text-sm italic text-fr-v2-muted">Nothing recorded for this field yet.</p>}
          <button type="button" onClick={onOpenHistory} className={cn(TEXT_LINK, "mt-3")}>
            Full history →
          </button>
        </Section>

        <Section kicker="Satellite history">
          <FieldSatelliteHistory field={field} />
        </Section>
      </div>

      <aside className="flex min-w-0 flex-col gap-6 lg:border-l lg:border-fr-v2-cream-rule lg:pl-8" aria-label="Field actions">
        <div>
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-muted">Actions</p>
          {primary ? (
            <Link
              href={primary.href}
              data-primary-action
              className="mt-3 flex min-h-11 items-center justify-between gap-3 bg-fr-v2-forest-deep px-4 text-sm font-semibold text-white transition-colors duration-[160ms] hover:bg-fr-v2-forest-deep-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-gold motion-reduce:transition-none"
            >
              {primary.label}
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
          <ul className="mt-3 flex flex-col">
            <ActionLink href={`/fields?field=${encodeURIComponent(field.id)}&chapter=nutrients`}>Recommendation setup</ActionLink>
            <ActionLink href={`/soil-sample/${encodeURIComponent(field.id)}`}>Start soil sample</ActionLink>
            <ActionLink href="/records">Records</ActionLink>
          </ul>
        </div>
        <ManageField field={field} />
      </aside>
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li className="border-b border-fr-v2-cream-rule/70 first:border-t">
      <Link href={href} className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-fr-v2-graphite transition-colors duration-[160ms] hover:text-fr-v2-forest motion-reduce:transition-none">
        {children}
        <ArrowRight className="size-3.5 text-fr-v2-muted" />
      </Link>
    </li>
  );
}

/** Structural changes behind an explicit control — reading the field never
 * edits it. Only what the store genuinely supports end to end. */
export function ManageField({ field, defaultOpen = false }: { field: Field; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [nameInput, setNameInput] = useState(field.name);
  const [areaInput, setAreaInput] = useState(String(field.areaHa));
  const { setFieldBoundary, updateFieldDetails, archiveField } = useFarmActions();
  const farm = useFarm();

  return (
    <div data-manage-field>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between border-y border-fr-v2-cream-rule text-sm font-semibold text-fr-v2-graphite"
      >
        Manage field
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fr-v2-muted">{open ? "Done" : "Boundary · name · archive"}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 pt-3">
          <button type="button" onClick={() => setMappingOpen(true)} className="flex min-h-11 items-center justify-center border border-fr-v2-forest text-sm font-semibold text-fr-v2-forest">
            {field.polygon ? "Edit boundary" : "Map this field"}
          </button>

          {editOpen ? (
            <div className="flex flex-col gap-2.5">
              <label className={LABEL}>
                Field name
                <input className={INPUT} value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
              </label>
              {field.polygon ? (
                <p className="text-xs text-fr-v2-muted">Area ({formatHa(field.areaHa)}) comes from the mapped boundary — edit the boundary to change it.</p>
              ) : (
                <label className={LABEL}>
                  Area (ha) — typed, not yet mapped
                  <input type="number" min={0.1} step={0.1} className={INPUT} value={areaInput} onChange={(e) => setAreaInput(e.target.value)} />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(field.name);
                    setAreaInput(String(field.areaHa));
                    setEditOpen(false);
                  }}
                  className="min-h-10 border border-fr-v2-cream-rule px-3 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!nameInput.trim()}
                  onClick={() => {
                    const areaHa = Number(areaInput);
                    updateFieldDetails(
                      field.id,
                      {
                        ...(nameInput.trim() !== field.name ? { name: nameInput.trim() } : {}),
                        ...(!field.polygon && Number.isFinite(areaHa) && areaHa > 0 && areaHa !== field.areaHa ? { areaHa } : {}),
                      },
                      farm.ownerName,
                    );
                    setEditOpen(false);
                  }}
                  className="min-h-10 bg-fr-v2-forest-deep px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setEditOpen(true)} className="flex min-h-11 items-center justify-center border border-fr-v2-cream-rule text-sm font-semibold">
              Rename field
            </button>
          )}

          {field.archivedAt ? null : confirmArchive ? (
            <div className="flex items-center justify-between gap-3 border-l-[3px] border-fr-v2-clay pl-3 text-xs">
              <span>Archive {field.name}? Its records are kept.</span>
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setConfirmArchive(false)} className="min-h-10 px-2 font-semibold text-fr-v2-muted">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    archiveField(field.id);
                    setConfirmArchive(false);
                  }}
                  className="min-h-10 px-2 font-semibold text-fr-v2-clay"
                >
                  Archive
                </button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmArchive(true)} className="min-h-10 self-start text-xs font-semibold text-fr-v2-clay">
              Archive field
            </button>
          )}
          <p className="text-xs text-fr-v2-muted">Split and merge are not available yet.</p>
        </div>
      ) : null}

      {mappingOpen ? (
        <FieldBoundaryMapModal
          fieldName={field.name}
          initialCentroid={field.centroid}
          initialPolygon={field.polygon}
          onClose={() => setMappingOpen(false)}
          onSave={(polygon) => {
            setFieldBoundary(field.id, polygon);
            setMappingOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Nutrients */

function NutrientsChapter({ field, slurryDetailsRequest, onProductionCycleSaved }: { field: Field; slurryDetailsRequest?: MissingSlurryPlanningDetail[]; onProductionCycleSaved?: () => void }) {
  const result = useFieldNutrientPlan(field);
  const view = result ? fieldNutrientPlanView(result, field) : undefined;
  const slurryAllocations = useSlurryAllocations().filter((allocation) => allocation.fieldId === field.id && allocation.priority !== "not_suitable");
  const soilSummary = [
    field.fertility.pIndex && field.fertility.pIndex.status !== "unavailable" ? `P Index ${field.fertility.pIndex.value}` : "P not recorded",
    field.fertility.kIndex && field.fertility.kIndex.status !== "unavailable" ? `K Index ${field.fertility.kIndex.value}` : "K not recorded",
    field.fertility.pH && field.fertility.pH.status !== "unavailable" ? `pH ${field.fertility.pH.value}` : "pH not recorded",
  ].join(" · ");
  const legalSummary = [
    field.commonageStatus?.value === "commonage" ? "Commonage" : field.commonageStatus?.value === "not_commonage" ? "Not commonage" : "Commonage not confirmed",
    field.waterBufferContext?.value.featureType ? "Water feature assessed" : "Water buffer not assessed",
    slurryAllocations.length === 0
      ? "No slurry allocation"
      : slurryAllocations.every((allocation) => allocation.applicationMethod && allocation.applicationDate)
        ? "Slurry details complete"
        : "Slurry details incomplete",
  ].join(" · ");

  const recommendationReady = view?.status === "available";
  const soilReady = Boolean(field.fertility.verifiedTest && field.fertility.pIndex && field.fertility.kIndex);
  const legalReady =
    field.commonageStatus?.value !== undefined &&
    field.commonageStatus.value !== "unknown" &&
    field.waterBufferContext?.value.featureType !== undefined &&
    field.waterBufferContext.value.distanceM !== undefined &&
    field.waterBufferContext.value.localOverrideStatus !== "unknown" &&
    slurryAllocations.every((allocation) => Boolean(allocation.applicationMethod && allocation.applicationDate));

  return (
    <div className="flex flex-col" data-field-nutrients>
      <section className="pb-6">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Recommendation setup</p>
        <h2 className="mt-1 font-display text-[28px] leading-tight text-fr-v2-graphite">One field. One evidence path.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fr-v2-muted">Complete the field evidence below once. Farm Return uses those same records for the recommendation, evidence report and farm procurement totals.</p>
      </section>

      <div className="border-t border-fr-v2-cream-rule">
        <FieldProductionCycleCard field={field} onSaved={onProductionCycleSaved} />
      </div>

      <ProgressiveStage label="2 · Laboratory soil evidence" summary={soilReady ? soilSummary : "Required · add the field's laboratory P, K and pH result"} defaultOpen={!soilReady}>
        <SoilEvidence field={field} />
      </ProgressiveStage>

      <ProgressiveStage label="3 · Legal & spreading checks" summary={legalReady ? "Complete · " + legalSummary : "Required · confirm commonage, water buffer and any slurry spreading details"} defaultOpen={Boolean(slurryDetailsRequest) || (soilReady && !legalReady)}>
        <LegalInputs field={field} slurryDetailsRequest={slurryDetailsRequest} />
      </ProgressiveStage>

      <section aria-label="Nutrient recommendation" className="border-t border-fr-v2-cream-rule pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">4 · Recommendation</p>
            <p className="mt-1 text-sm text-fr-v2-muted">{recommendationReady ? "Ready from the evidence above." : "Held until the required field evidence above is complete."}</p>
          </div>
          {recommendationReady ? <Link href={fieldNutrientPlanHref(field.id)} className={TEXT_LINK}>Full calculation & evidence →</Link> : null}
        </div>
        <div className="mt-5">
          {result && view ? <FieldNutrientPlanBody view={view} result={result} fieldId={field.id} hideSupportingDisclosures /> : <p className="text-sm italic text-fr-v2-muted">Complete the setup stages above to generate this field&apos;s recommendation.</p>}
        </div>
      </section>
    </div>
  );
}

/**
 * Soil evidence underneath nutrient state — the same P/K Index, pH and
 * validity display as `SoilFieldCard` (`/soil`): one real classification,
 * shown in two places, not two separate guesses at it.
 */
function SoilEvidence({ field }: { field: Field }) {
  const { fertility } = field;
  // Campaign A (A1.2): the laboratory's own P Index, never a farmer override.
  const validityOutcome = soilTestAgeValidityForFertility(fertility, new Date().toISOString().slice(0, 10));
  const validity = validityOutcome.status === "OK" ? validityOutcome.value : null;
  const indexValue = (tracked: typeof fertility.pIndex) =>
    tracked && tracked.status !== "unavailable" ? `Index ${tracked.value}` : "Not recorded";

  return (
    <div>
      <dl className="divide-y divide-fr-v2-cream-rule/70">
        <Row label="P Index" value={indexValue(fertility.pIndex)} detail={fertility.pIndex?.source} quiet={!fertility.pIndex} />
        <Row label="K Index" value={indexValue(fertility.kIndex)} detail={fertility.kIndex?.source} quiet={!fertility.kIndex} />
        {fertility.pH ? <Row label="pH" value={`${fertility.pH.value} (${phStatusLabel(fertility.pH.value)})`} detail={fertility.pH.source} /> : <Row label="pH" value="Not recorded" quiet />}
        {fertility.verifiedTest ? (
          <Row
            label="Lab test"
            value={`${fertility.verifiedTest.laboratory}, ${formatFieldDate(fertility.verifiedTest.sampleDate) ?? "date unknown"}`}
            detail={
              validity === "VALID"
                ? "Valid for statutory ceilings"
                : validity === "INDEX4_PERSISTED"
                  ? "P4 result still applies"
                  : validity === "DISREGARD"
                    ? "Too old for statutory ceilings (4-year limit)"
                    : undefined
            }
          />
        ) : (
          <Row label="Lab test" value="No lab test recorded yet" detail="P/K are Farm Return assumptions until one is added" quiet />
        )}
      </dl>
      {/* Fertiliser Vertical V1, Checkpoint 1 — the guided GPS sampling
          workflow, distinct from manual lab-result entry on /soil. */}
      <FieldSoilTestEditor field={field} />
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <Link href={`/soil-sample/${field.id}`} className={TEXT_LINK}>Start guided field sampling →</Link>
        <Link href="/soil" className={TEXT_LINK}>View farm soil overview →</Link>
      </p>
    </div>
  );
}

/**
 * The statutory inputs the nutrient plan's legal gates read — the same real,
 * tested, live-wired compliance-evidence capture (commonage-gate.ts,
 * buffer-gate.ts, less-method-gate.ts) formerly under "Constraints".
 */
function LegalInputs({ field, slurryDetailsRequest }: { field: Field; slurryDetailsRequest?: MissingSlurryPlanningDetail[] }) {
  const { replaceFieldFromServer, updateFieldCommonageStatus, updateFieldWaterBufferContext, updateSlurryApplicationMethod, updateSlurryApplicationDate } = useFarmActions();
  type AutoAssessment = Awaited<ReturnType<typeof autoAssessFieldLegalSpatialEvidenceAction>>["assessment"];
  const [autoAssessment, setAutoAssessment] = useState<AutoAssessment | null>(null);
  const [autoChecking, setAutoChecking] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const attemptedFieldIds = useRef(new Set<string>());
  const farm = useFarm();
  const slurryAllocations = useSlurryAllocations();
  // Codex audit HIGH (round 31): every one of this field's own real
  // allocations gets its own method selector — the schema's
  // `unique (field_id, housing_id)` allows slurry from more than one shed.
  const fieldSlurryAllocations = slurryAllocations.filter((a) => a.fieldId === field.id);
  // Snapshot at open (not live) so an input the farmer has just filled
  // stays visible with its saved value rather than vanishing mid-edit.
  const [requestedSlurryInputs] = useState(() =>
    slurryDetailsRequest ? new Map(fieldSlurryAllocations.map((a) => [a.housingId, { method: !a.applicationMethod, date: !a.applicationDate }])) : null,
  );
  const shownSlurryAllocations = requestedSlurryInputs
    ? fieldSlurryAllocations.filter((a) => {
        if (a.priority === "not_suitable") return false;
        const requested = requestedSlurryInputs.get(a.housingId);
        return !requested || requested.method || requested.date;
      })
    : fieldSlurryAllocations;
  const slurryDetailsComplete = shownSlurryAllocations.every((a) => a.applicationMethod && a.applicationDate);

  const shouldAutoCheck = Boolean(field.polygon) && (
    !field.commonageStatus ||
    field.commonageStatus.value === "unknown" ||
    field.waterBufferContext?.value.featureType === undefined ||
    field.waterBufferContext.value.distanceM === undefined
  );

  useEffect(() => {
    if (!shouldAutoCheck || attemptedFieldIds.current.has(field.id)) return;
    attemptedFieldIds.current.add(field.id);
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setAutoChecking(true);
      setAutoError(null);
      void autoAssessFieldLegalSpatialEvidenceAction(field.id)
        .then((result) => {
          if (cancelled) return;
          setAutoAssessment(result.assessment);
          replaceFieldFromServer(result.field);
        })
        .catch(() => {
          if (!cancelled) setAutoError("Automatic public-data check is temporarily unavailable.");
        })
        .finally(() => {
          if (!cancelled) setAutoChecking(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [field.id, replaceFieldFromServer, shouldAutoCheck]);

  return (
    <div className="flex flex-col gap-4" data-legal-inputs>
        {slurryDetailsRequest && shownSlurryAllocations.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-l-[3px] border-fr-v2-gold bg-white/60 px-3 py-2.5 text-xs text-fr-v2-charcoal">
            <p className="text-sm font-semibold text-fr-v2-graphite">{slurryDetailsComplete ? "Spreading details added" : "Add spreading details"}</p>
            <p>
              {slurryDetailsComplete
                ? "What Matters will check your slurry again with these details when you go back to Today."
                : `Farm Return needs the ${slurryDetailsRequest.length === 2 ? "planned spreading method and date" : slurryDetailsRequest[0] === "method" ? "planned spreading method" : "planned spreading date"} for this field's slurry before it can work out which opportunity is likely to give you the best return.`}
            </p>
            <Link href="/today" className="inline-flex items-center gap-1 font-semibold text-fr-v2-forest">
              Back to Today
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : null}

        {shownSlurryAllocations.map((allocation) => (
          <div key={allocation.housingId} className="flex flex-col gap-2.5 border-l-[3px] border-fr-v2-teal pl-3">
            {requestedSlurryInputs?.get(allocation.housingId)?.method === false ? null : (
              <label className={LABEL}>
                How will this slurry be spread?
                {fieldSlurryAllocations.length > 1 ? ` (${Math.round(allocation.volumeM3)} m³ allocation)` : " for this field's allocation"}
                <select
                  className={INPUT}
                  value={allocation.applicationMethod?.value ?? ""}
                  onChange={(e) => updateSlurryApplicationMethod(field.id, allocation.housingId, e.target.value as "LESS" | "splashplate" | "incorporate_24h" | "other", farm.ownerName)}
                >
                  <option value="" disabled>
                    Select a method
                  </option>
                  <option value="LESS">Low Emission Slurry Spreading (LESS)</option>
                  <option value="splashplate">Splashplate</option>
                  <option value="incorporate_24h">Incorporated within 24 hours</option>
                  <option value="other">Other</option>
                </select>
              </label>
            )}
            {requestedSlurryInputs?.get(allocation.housingId)?.date === false ? null : (
              <label className={LABEL}>
                Application date
                <input
                  type="date"
                  className={INPUT}
                  value={allocation.applicationDate?.value ?? ""}
                  onChange={(e) => {
                    if (e.target.value === "") return;
                    updateSlurryApplicationDate(field.id, allocation.housingId, e.target.value, farm.ownerName);
                  }}
                />
              </label>
            )}
            {/* Slurry Application Context V1 — brief §9: concise contextual education only. */}
            <p className="text-xs text-fr-v2-muted">
              Why does spreading method matter? Nitrogen recovery from slurry can differ depending on how it&apos;s applied — Farm Return uses the Teagasc-backed table for your recorded
              method to work out the available nutrient contribution.
            </p>
          </div>
        ))}

        <div className="border-y border-fr-v2-cream-rule py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fr-v2-graphite">Automatic field checks</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fr-v2-muted">
                Farm Return uses the mapped field boundary with public DAFM and EPA spatial data. Only resolved source evidence is written into the legal calculation.
              </p>
            </div>
            {autoChecking ? (
              <span className="flex items-center gap-2 text-xs font-semibold text-fr-v2-muted"><Loader2 className="size-3.5 animate-spin" /> Checking public data…</span>
            ) : null}
          </div>

          <div className="mt-4 divide-y divide-fr-v2-cream-rule/70">
            <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div>
                <p className="text-sm font-medium text-fr-v2-graphite">Commonage</p>
                <p className="mt-0.5 text-xs text-fr-v2-muted">DAFM LPIS Commonage Indicator</p>
              </div>
              {field.commonageStatus && field.commonageStatus.value !== "unknown" ? (
                <div className="sm:text-right">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fr-v2-graphite sm:justify-end"><CheckCircle2 className="size-4 text-fr-v2-forest" />{field.commonageStatus.value === "commonage" ? "Commonage" : "Not identified as commonage"}</p>
                  <p className="mt-0.5 max-w-md text-xs text-fr-v2-muted">{field.commonageStatus.source}</p>
                </div>
              ) : (
                <div className="sm:text-right">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fr-v2-muted sm:justify-end"><TriangleAlert className="size-4" />Needs confirmation</p>
                  <p className="mt-0.5 max-w-md text-xs text-fr-v2-muted">{autoAssessment?.commonage.detail ?? (autoError ?? "Farm Return has not resolved this from public data yet.")}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div>
                <p className="text-sm font-medium text-fr-v2-graphite">Nearest mapped watercourse</p>
                <p className="mt-0.5 text-xs text-fr-v2-muted">EPA river / stream network</p>
              </div>
              {field.waterBufferContext?.value.featureType === "surface_water" && field.waterBufferContext.value.distanceM !== undefined ? (
                <div className="sm:text-right">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fr-v2-graphite sm:justify-end"><CheckCircle2 className="size-4 text-fr-v2-forest" />{field.waterBufferContext.value.nearestFeature ?? "Mapped watercourse"} · {formatNumber(field.waterBufferContext.value.distanceM, 1)} m</p>
                  <p className="mt-0.5 max-w-md text-xs text-fr-v2-muted">{field.waterBufferContext.source} · measured from the field boundary</p>
                </div>
              ) : (
                <div className="sm:text-right">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fr-v2-muted sm:justify-end"><TriangleAlert className="size-4" />Needs confirmation</p>
                  <p className="mt-0.5 max-w-md text-xs text-fr-v2-muted">{autoAssessment?.water.detail ?? (autoError ?? "Farm Return has not resolved a mapped watercourse yet.")}</p>
                </div>
              )}
            </div>
          </div>

          <details className="mt-2 border-t border-fr-v2-cream-rule pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-fr-v2-forest">Review or correct automatic evidence</summary>
            <div className="mt-4 flex flex-col gap-4">
              <label className={LABEL}>
                Commonage status
                <select
                  className={INPUT}
                  value={field.commonageStatus?.value ?? "unknown"}
                  onChange={(e) => updateFieldCommonageStatus(field.id, e.target.value as "commonage" | "not_commonage" | "unknown", farm.ownerName)}
                >
                  <option value="unknown">Unknown — not yet confirmed</option>
                  <option value="not_commonage">Not commonage</option>
                  <option value="commonage">Commonage</option>
                </select>
              </label>

              <label className={LABEL}>
                Nearest regulated water feature
                <select
                  className={INPUT}
                  value={field.waterBufferContext?.value.featureType ?? ""}
                  onChange={(e) =>
                    updateFieldWaterBufferContext(
                      field.id,
                      {
                        ...field.waterBufferContext?.value,
                        featureType: (e.target.value || undefined) as BufferFeature | undefined,
                        localOverrideStatus: field.waterBufferContext?.value.localOverrideStatus ?? "unknown",
                      },
                      farm.ownerName,
                    )
                  }
                >
                  <option value="">Not assessed yet</option>
                  {BUFFER_FEATURE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>

              {field.waterBufferContext?.value.featureType ? (
                <label className={LABEL}>
                  Distance to that feature (metres)
                  <input
                    type="number" min={0} step={0.1} className={INPUT}
                    value={field.waterBufferContext?.value.distanceM ?? ""}
                    onChange={(e) => updateFieldWaterBufferContext(field.id, { ...field.waterBufferContext!.value, distanceM: e.target.value === "" ? undefined : Number(e.target.value) }, farm.ownerName)}
                  />
                </label>
              ) : null}
            </div>
          </details>
        </div>

        <div className="border-l-[3px] border-fr-v2-gold pl-3">
          <p className="text-sm font-semibold text-fr-v2-graphite">Any field-specific local authority buffer?</p>
          <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">This is the one check Farm Return cannot currently resolve from a complete national public dataset.</p>
          <p className="mt-1.5 text-xs leading-relaxed text-fr-v2-muted">
            <span className="font-semibold text-fr-v2-graphite">Example:</span> your local authority has formally told you to keep a wider no-spread buffer around a particular water source or sensitive area on this field.
          </p>
          <label className={`${LABEL} mt-3`}>
            Local authority restriction
            <select
              className={INPUT}
              value={field.waterBufferContext?.value.localOverrideStatus ?? "unknown"}
              onChange={(e) =>
                updateFieldWaterBufferContext(
                  field.id,
                  {
                    ...(field.waterBufferContext?.value ?? {}),
                    localOverrideStatus: e.target.value as "authoritative_rule" | "verified_none" | "unknown",
                  },
                  farm.ownerName,
                )
              }
            >
              <option value="unknown">Not sure</option>
              <option value="verified_none">No additional local restriction known</option>
              <option value="authoritative_rule">Yes — a local authority buffer applies</option>
            </select>
          </label>

          {field.waterBufferContext?.value.localOverrideStatus === "authoritative_rule" ? (
            <label className={`${LABEL} mt-3`}>
              Local authority buffer distance (metres)
              <input
                type="number" min={0} step={0.1} className={INPUT}
                value={field.waterBufferContext?.value.localOverrideDistanceM ?? ""}
                onChange={(e) =>
                  updateFieldWaterBufferContext(
                    field.id,
                    { ...field.waterBufferContext!.value, localOverrideDistanceM: e.target.value === "" ? undefined : Number(e.target.value) },
                    farm.ownerName,
                  )
                }
              />
            </label>
          ) : null}
        </div>

        {/* Campaign B — the field's spreadable area, beside its other
            spreading constraints; never its gross size. */}
        <SpreadableAreaEvidencePanel field={field} />
    </div>
  );
}

/* ----------------------------------------------------------------- History */

function activityToHistoryEvent(activity: FieldActivityEvent): FieldHistoryEvent {
  return {
    id: activity.id,
    kind: "activity",
    date: activity.confirmedAt,
    dateLabel: formatFieldDate(activity.confirmedAt) ?? "Date not recorded",
    title: activity.title,
    detail: [activity.detail, activity.provenance].filter(Boolean).join(" · "),
  };
}

function HistoryChapter({ field, workspaceContext, workspaceUnavailable }: { field: Field; workspaceContext: FieldWorkspaceContext | null; workspaceUnavailable: boolean }) {
  const events = [
    ...fieldHistoryEvents(field),
    ...(workspaceContext?.activities.map(activityToHistoryEvent) ?? []),
  ].sort((a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0));
  return (
    <div className="flex max-w-3xl flex-col gap-6" data-field-history>
      <div>
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Field history · newest first</p>
        <p className="mt-2 text-sm text-fr-v2-muted">Confirmed field work, crop/use changes and soil evidence in one dated record. Planned work stays labelled as planned elsewhere.</p>
      </div>
      {workspaceUnavailable ? <p className="border-l-[3px] border-fr-v2-clay pl-3 text-sm text-fr-v2-muted">Confirmed job activity is temporarily unavailable. Field metadata and soil history below are still complete for what is loaded.</p> : null}
      {events.length > 0 ? <HistoryList events={events} /> : <p className="text-sm italic text-fr-v2-muted">Nothing recorded for this field yet.</p>}
      {workspaceContext?.activitiesTruncated ? <p className="text-xs text-fr-v2-muted">Older confirmed job activity exists beyond the current records limit and is not shown here.</p> : null}
      <p className="text-sm text-fr-v2-muted">
        The complete farm-wide evidence ledger remains in{" "}
        <Link href="/records" className="font-semibold text-fr-v2-forest underline underline-offset-2">
          Records
        </Link>
        .
      </p>
    </div>
  );
}

function HistoryList({ events }: { events: FieldHistoryEvent[] }) {
  return (
    <ol className="flex flex-col" data-history-list>
      {events.map((event) => (
        <li key={event.id} data-history-kind={event.kind} className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-b border-fr-v2-cream-rule/70 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)]">
          <span className="pt-0.5 font-mono text-[11px] tabular-nums text-fr-v2-muted">{event.dateLabel}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fr-v2-graphite">{event.title}</span>
            {event.detail ? <span className="block text-xs text-fr-v2-muted">{event.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
