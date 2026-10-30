"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { AskAIButton } from "@/components/next/AskAI";
import { MapHero } from "@/components/farm/MapHero";
import { FieldWindChip } from "@/components/farm/FieldWindChip";
import { FieldDrawer, ManageField } from "@/components/farm/FieldDrawer";
import { FieldBoundaryMapModal } from "@/components/farm/FieldBoundaryMapModal";
import { FarmFieldDrawer } from "@/components/farm-spatial/FarmFieldDrawer";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { useAllFieldsIncludingArchived, useFarm, useFarmActions, useFields, useIsRealMode, useLivestockGroups, useSlurryAllocations, useSlurryCompositionRecords } from "@/store/farm-store";
import { cn } from "@/lib/cn";
import { formatHa, formatNumber } from "@/lib/format";
import { computeBoundaryGeometry } from "@/domain/field-boundary";
import { calculateActiveFarmAreaHa } from "@/domain/farm-stats";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt } from "@/orchestration/prompt/select-primary";
import { parseSlurryDetailsRequest } from "@/lib/slurry-details-link";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { useFieldNutrientPlan } from "@/lib/use-field-nutrient-plan";
import { fieldNutrientPlanView } from "@/lib/field-nutrient-plan-presentation";
import { FIELD_SELECTION_COLOR, farmFieldLensView, fieldWorkspaceHref, parseFieldWorkspaceChapter } from "@/lib/farm-spatial-field-lens";
import { farmFieldSelectionView } from "@/lib/farm-field-selection";
import { formatFieldDate } from "@/lib/field-workspace-presentation";
import type { Field } from "@/domain/types";
import type { Prompt } from "@/orchestration/prompt";
import type { MissingSlurryPlanningDetail } from "@/domain/what-matters-no-recommendation";

/**
 * Fields — Farm + Fields redesign (2026-10-27,
 * `docs/design/farm-fields-high-fidelity-reference.md` "Desktop Map +
 * List", "Mapping and field management", "Field workspace").
 *
 * Two states on one route:
 * - Companion view (`/fields`): the real map stays dominant with a quiet
 *   field list beside it on desktop, or a Map / List toggle on a phone.
 *   Selecting a field in the list or on the map is the same state and
 *   brings the same selected-field panel forward as Farm. Structural work
 *   (add, edit boundary, rename/change use, archive) lives in an explicit
 *   Manage fields mode, and a Select multiple fields mode holds a
 *   selection without pretending bulk planning exists.
 * - Field workspace (`/fields?field=<id>`, optionally `&chapter=`): the
 *   real map as hero with the field's Overview / Nutrients / History.
 *   The id must resolve to a real active field, otherwise the companion
 *   view shows. Field creation stays boundary-first: a polygon drawn on
 *   satellite imagery, its area derived from that polygon, never typed.
 */
export default function FieldsPage() {
  return (
    <Suspense fallback={null}>
      <FieldsPageContent />
    </Suspense>
  );
}

function FieldsPageContent() {
  const fields = useFields();
  const farm = useFarm();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const slurryCompositionRecords = useSlurryCompositionRecords();
  const searchParams = useSearchParams();
  // Real navigation into "this place" (`?field=<id>`) — from Farm, the
  // list, What Matters or a nearby-field prompt. Derived from the URL, so
  // an id that is unknown, archived or not yet hydrated shows the
  // companion view rather than a guess.
  const requestedFieldId = searchParams.get("field") ?? undefined;
  const workspaceField = fields.find((f) => f.id === requestedFieldId);
  // What Matters' "Add spreading details" link (`slurryDetailsHref`).
  const slurryDetailsRequest = parseSlurryDetailsRequest(searchParams.get("complete"), searchParams.get("missing"));

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same real-wall-clock hydration-safety pattern as Today's own identical effect.
    setMounted(true);
  }, []);
  const allPrompts = useMemo(() => {
    if (!mounted) return [];
    return buildAllRealPrompts(farm, fields, livestockGroups, slurryAllocations, new Date().toISOString(), slurryCompositionRecords);
  }, [mounted, farm, fields, livestockGroups, slurryAllocations, slurryCompositionRecords]);
  const leadingPromptFor = (fieldId: string | undefined) => (fieldId ? selectPrimaryPrompt(allPrompts.filter((p) => p.fieldId === fieldId)) : undefined);

  if (workspaceField) {
    return (
      <FieldWorkspaceView
        key={workspaceField.id}
        field={workspaceField}
        allFields={fields}
        leadingPrompt={leadingPromptFor(workspaceField.id)}
        initialChapter={parseFieldWorkspaceChapter(searchParams.get("chapter"))}
        slurryDetailsRequest={slurryDetailsRequest ?? undefined}
      />
    );
  }

  return <FieldsCompanion leadingPromptFor={leadingPromptFor} />;
}

type CompanionMode = "browse" | "manage" | "multi";

function FieldsCompanion({ leadingPromptFor }: { leadingPromptFor: (fieldId: string | undefined) => Prompt | undefined }) {
  const fields = useFields();
  const allFields = useAllFieldsIncludingArchived();
  const archivedFields = allFields.filter((f) => f.archivedAt);
  const { addField, restoreField } = useFarmActions();
  const farm = useFarm();
  const slurryAllocations = useSlurryAllocations();
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const [mode, setMode] = useState<CompanionMode>("browse");
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  // One selection for the list and the map.
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(undefined);
  // Select multiple fields — held only while that mode is on; normal taps
  // never accumulate a hidden selection.
  const [multiIds, setMultiIds] = useState<string[]>([]);

  const [mappingOpen, setMappingOpen] = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const pendingGeometry = pendingPolygon ? computeBoundaryGeometry(pendingPolygon) : null;

  const selectedField = fields.find((f) => f.id === selectedFieldId);
  const mappedCount = fields.filter((f) => f.polygon).length;
  const farmAreaHa = calculateActiveFarmAreaHa(fields);
  const multiFields = fields.filter((f) => multiIds.includes(f.id));
  const multiAreaHa = calculateActiveFarmAreaHa(multiFields);

  const selectedPlanResult = useFieldNutrientPlan(mode === "multi" ? undefined : selectedField);
  const lensView = selectedField ? farmFieldLensView("current", selectedField, { slurryAllocations }) : undefined;
  const selection =
    mode !== "multi" && selectedField?.polygon && lensView
      ? farmFieldSelectionView({
          lens: "current",
          field: selectedField,
          lensView,
          nutrientPlan: selectedPlanResult ? fieldNutrientPlanView(selectedPlanResult, selectedField) : undefined,
          leadingPrompt: leadingPromptFor(selectedField.id),
          slurryAllocations,
        })
      : undefined;

  function selectField(fieldId: string) {
    if (mode === "multi") {
      setMultiIds((ids) => (ids.includes(fieldId) ? ids.filter((id) => id !== fieldId) : [...ids, fieldId]));
      return;
    }
    setSelectedFieldId((current) => (current === fieldId ? undefined : fieldId));
  }

  function changeMode(next: CompanionMode) {
    setMode((current) => (current === next ? "browse" : next));
    setMultiIds([]);
  }

  async function handleConfirmName() {
    if (!pendingPolygon || !newName.trim()) return;
    setSaving(true);
    try {
      const field = await addField({ name: newName.trim(), polygon: pendingPolygon });
      setPendingPolygon(null);
      setNewName("");
      router.push(fieldWorkspaceHref(field.id, "nutrients"));
    } finally {
      setSaving(false);
    }
  }

  const askAIContext = {
    screen: "Fields",
    facts: { Farm: farm.name, Fields: String(fields.length), ...(selectedField ? { "Selected field": selectedField.name } : {}) },
  };

  return (
    <section data-farm-workspace data-fields-companion className="-mx-4 -mt-4 bg-fr-v2-cream lg:mx-0 lg:mt-0 lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
      {/* Phone: one compact header with the Map / List toggle. */}
      <div className="flex items-center justify-between gap-3 border-b border-fr-v2-cream-rule px-4 py-3 lg:hidden">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-none">Fields</h1>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-fr-v2-muted">
            {mappedCount} of {fields.length} mapped{farmAreaHa !== null ? ` · ${formatNumber(farmAreaHa, 1)} ha` : ""}
          </p>
        </div>
        <div role="group" aria-label="Fields view" className="flex shrink-0 border border-fr-v2-cream-rule">
          {(["map", "list"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={mobileView === view}
              onClick={() => setMobileView(view)}
              className={cn("min-h-11 px-4 text-sm font-semibold capitalize", mobileView === view ? "bg-fr-v2-forest-deep text-white" : "text-fr-v2-muted")}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("relative min-w-0", mobileView === "list" && "hidden lg:block")}>
        <MapHero
          fields={fields}
          getTone={() => "neutral"}
          onSelectField={selectField}
          onMapBackgroundClick={() => (mode === "multi" ? undefined : setSelectedFieldId(undefined))}
          selectedFieldId={mode === "multi" ? undefined : selectedField?.id}
          selectionColor={FIELD_SELECTION_COLOR}
          highlightedFieldIds={mode === "multi" ? multiIds : selectedField ? [selectedField.id] : undefined}
          dimUnhighlighted
          flyToSelection={mode !== "multi" && Boolean(selectedField?.polygon)}
          // Desktop: clear of the panel at the lower left; phone: above the rising panel.
          flyToPadding={isDesktop ? { top: 120, bottom: 80, left: 460, right: 60 } : { top: 60, bottom: 340, left: 32, right: 32 }}
          flyToMaxZoom={16.5}
          flyToDuration={reducedMotion ? 0 : 320}
          compactNeighbourLabels
          neighbourNameLabels
          fitPadding={(width) => (width >= 860 ? { top: 110, bottom: 80, left: 60, right: 60 } : { top: 60, bottom: 60, left: 24, right: 120 })}
          center={farm.location.centroid}
          plain
          className="h-[calc(100dvh-8.5rem)] min-h-[480px] lg:h-dvh"
        >
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
            <div aria-hidden className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_60%_100%_at_0%_0%,rgba(10,14,11,0.5),transparent_72%)]" />
            <div className="relative hidden p-9 pt-8 lg:block [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
              <Link href="/today" className="pointer-events-auto inline-flex items-center gap-1.5 text-xs font-semibold text-white/85 hover:text-white">
                <ArrowLeft className="size-3.5" /> Farm map
              </Link>
              <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/75">Farm Return · Fields</p>
            </div>
            <div className="relative px-2 pb-2 sm:px-3 lg:w-[400px] lg:px-9 lg:pb-8">
              {mode === "multi" ? (
                <div className="pointer-events-auto bg-fr-v2-forest-deep/[0.96] px-5 py-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)]" data-multi-select-bar>
                  <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-straw">Select multiple fields</p>
                  <p className="mt-1 font-display text-[24px] leading-tight">
                    {multiFields.length === 0 ? "Tap fields to select them" : `${multiFields.length} ${multiFields.length === 1 ? "field" : "fields"}`}
                  </p>
                  {multiAreaHa !== null ? <p className="mt-1 font-mono text-[12px] tabular-nums text-white/70">{formatNumber(multiAreaHa, 2)} ha selected</p> : null}
                  <p className="mt-3 text-xs text-white/65">Bulk planning isn&apos;t available yet — open each field to plan it.</p>
                  <p className="mt-3 flex gap-4">
                    <button type="button" onClick={() => setMultiIds([])} className="min-h-10 text-xs font-semibold text-white/80 underline underline-offset-2">
                      Clear
                    </button>
                    <button type="button" onClick={() => changeMode("multi")} className="min-h-10 text-xs font-semibold text-white underline underline-offset-2">
                      Done
                    </button>
                  </p>
                </div>
              ) : (
                <FarmFieldDrawer field={selection ? selectedField : undefined} lensId="current" selection={selection} onClose={() => setSelectedFieldId(undefined)} />
              )}
            </div>
          </div>
        </MapHero>
      </div>

      <aside
        aria-label="Field list"
        className={cn("flex min-w-0 flex-col pb-24 lg:h-dvh lg:overflow-y-auto lg:border-l lg:border-fr-v2-cream-rule lg:pb-8", mobileView === "map" && "hidden lg:flex")}
      >
        <header className="hidden px-7 pb-5 pt-8 lg:block">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-[40px] leading-none tracking-[-0.02em]">Fields</h1>
            <AskAIButton context={askAIContext} />
          </div>
          <p className="mt-2 font-mono text-[12px] tabular-nums text-fr-v2-muted">
            {mappedCount} of {fields.length} mapped{farmAreaHa !== null ? ` · ${formatNumber(farmAreaHa, 1)} ha` : ""}
          </p>
        </header>

        <div className="flex items-center gap-5 border-y border-fr-v2-cream-rule px-4 lg:px-7" role="group" aria-label="Field modes">
          <button
            type="button"
            aria-pressed={mode === "multi"}
            onClick={() => changeMode("multi")}
            className={cn("min-h-11 text-xs font-semibold", mode === "multi" ? "text-fr-v2-graphite underline decoration-fr-v2-gold decoration-2 underline-offset-[6px]" : "text-fr-v2-muted hover:text-fr-v2-graphite")}
          >
            Select multiple
          </button>
          <button
            type="button"
            aria-pressed={mode === "manage"}
            onClick={() => changeMode("manage")}
            className={cn("min-h-11 text-xs font-semibold", mode === "manage" ? "text-fr-v2-graphite underline decoration-fr-v2-gold decoration-2 underline-offset-[6px]" : "text-fr-v2-muted hover:text-fr-v2-graphite")}
          >
            Manage fields
          </button>
        </div>

        {mode === "manage" ? (
          <div className="flex flex-col gap-2 bg-fr-v2-forest-deep px-4 py-4 text-white lg:px-7" data-manage-mode>
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-straw">Managing fields</p>
            <p className="text-xs text-white/70">Select a field for its boundary, name and use, or archive. Split and merge are not available yet.</p>
            <button type="button" onClick={() => setMappingOpen(true)} className="mt-1 flex min-h-11 items-center justify-center gap-2 bg-fr-v2-cream text-sm font-semibold text-fr-v2-forest-deep">
              <Plus className="size-4" /> Add field
            </button>
          </div>
        ) : null}

        {pendingPolygon ? (
          <div className="flex flex-col gap-3 border-b border-fr-v2-cream-rule bg-white/55 px-4 py-5 lg:px-7" data-new-field>
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">New field</p>
            <p className="text-sm">
              <span className="font-mono tabular-nums font-semibold">{formatHa(pendingGeometry?.areaHa ?? 0)}</span>
              <span className="text-fr-v2-muted"> — calculated from the boundary you drew, not typed.</span>
            </p>
            <label className="flex flex-col gap-1.5 text-xs text-fr-v2-muted">
              Name this field
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Bog Field"
                className="rounded-[4px] border border-fr-v2-cream-rule bg-white px-2.5 py-2 text-sm text-fr-v2-graphite"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingPolygon(null);
                  setNewName("");
                }}
                className="min-h-11 flex-1 border border-fr-v2-cream-rule text-sm font-semibold text-fr-v2-muted"
              >
                Cancel
              </button>
              <button type="button" disabled={!newName.trim() || saving} onClick={handleConfirmName} className="min-h-11 flex-1 bg-fr-v2-forest-deep text-sm font-semibold text-white disabled:opacity-40">
                {saving ? "Saving…" : "Save field"}
              </button>
            </div>
            <p className="text-xs text-fr-v2-muted">After saving, Farm Return takes you straight to this field&apos;s recommendation setup. Crop, soil and legal evidence are captured once there.</p>
          </div>
        ) : null}

        <ul className="flex flex-col" data-field-list>
          {fields.map((field) => (
            <FieldListItem
              key={field.id}
              field={field}
              mode={mode}
              selected={mode === "multi" ? multiIds.includes(field.id) : field.id === selectedFieldId}
              onSelect={() => selectField(field.id)}
              onOpen={() => router.push(fieldWorkspaceHref(field.id))}
            />
          ))}
        </ul>
        {fields.length === 0 ? (
          <p className="px-4 py-6 text-sm text-fr-v2-muted lg:px-7">No fields yet. Draw your first boundary on the satellite map to add one.</p>
        ) : null}

        {mode !== "manage" && !pendingPolygon ? (
          <button type="button" onClick={() => setMappingOpen(true)} className="mx-4 mt-4 flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-fr-v2-forest lg:mx-7">
            <Plus className="size-4" /> Add field
          </button>
        ) : null}

        {mode === "manage" && archivedFields.length > 0 ? (
          <div className="mx-4 mt-6 lg:mx-7" data-archived-fields>
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-muted">Archived fields ({archivedFields.length})</p>
            <ul className="mt-2 flex flex-col">
              {archivedFields.map((field) => (
                <li key={field.id} className="flex min-h-11 items-center justify-between border-b border-fr-v2-cream-rule text-sm">
                  <span>{field.name}</span>
                  <button type="button" onClick={() => restoreField(field.id)} className="text-xs font-semibold text-fr-v2-forest">
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      {mappingOpen ? (
        <FieldBoundaryMapModal
          fieldName="new field"
          initialCentroid={farm.location.centroid}
          onClose={() => setMappingOpen(false)}
          onSave={(polygon) => {
            setPendingPolygon(polygon);
            setMappingOpen(false);
            setMobileView("list");
          }}
        />
      ) : null}
    </section>
  );
}

function FieldListItem({ field, mode, selected, onSelect, onOpen }: { field: Field; mode: CompanionMode; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  return (
    <li className={cn("relative border-b border-fr-v2-cream-rule", selected && "bg-white/70")} data-field-row={field.id} data-selected={selected ? "true" : "false"}>
      {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-fr-v2-gold" /> : null}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-h-14 w-full items-baseline justify-between gap-4 px-4 py-3 text-left transition-colors duration-[160ms] hover:bg-white/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fr-v2-gold motion-reduce:transition-none lg:px-7"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            {mode === "multi" ? (
              <span aria-hidden className={cn("size-3.5 shrink-0 border", selected ? "border-fr-v2-gold bg-fr-v2-gold" : "border-fr-v2-muted")} />
            ) : null}
            <span className="truncate font-display text-[19px] leading-tight text-fr-v2-graphite">{field.name}</span>
          </span>
          <span className="mt-0.5 block text-xs text-fr-v2-muted">{field.polygon ? "Mapped field" : "Boundary not mapped"}</span>
        </span>
        <span className={cn("shrink-0 font-mono text-[12px] tabular-nums", field.polygon ? "text-fr-v2-charcoal" : "italic text-fr-v2-muted")}>
          {field.polygon ? `${formatNumber(field.areaHa, 2)} ha` : "Not mapped"}
        </span>
      </button>
      {selected && mode === "browse" ? (
        <div className="px-4 pb-3 lg:px-7">
          {field.polygon ? null : <p className="pb-2 text-xs text-fr-v2-muted">No boundary yet, so it isn&apos;t on the map.</p>}
          <button type="button" onClick={onOpen} className="text-sm font-semibold text-fr-v2-forest underline decoration-fr-v2-forest/30 underline-offset-[3px] hover:decoration-fr-v2-gold">
            Open field workspace →
          </button>
        </div>
      ) : null}
      {selected && mode === "manage" ? (
        <div className="px-4 pb-4 lg:px-7">
          <ManageField key={field.id} field={field} defaultOpen />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The field workspace: the real map remains the hero (the selected boundary
 * in straw, neighbours named and receding), with the field's identity over
 * it and its Overview / Nutrients / History below on warm cream.
 */
function FieldWorkspaceView({
  field,
  allFields,
  leadingPrompt,
  initialChapter,
  slurryDetailsRequest,
}: {
  field: Field;
  allFields: Field[];
  leadingPrompt: Prompt | undefined;
  initialChapter: ReturnType<typeof parseFieldWorkspaceChapter>;
  slurryDetailsRequest?: MissingSlurryPlanningDetail[];
}) {
  const router = useRouter();
  const isRealMode = useIsRealMode();
  const reducedMotion = usePrefersReducedMotion();
  const [promptOpen, setPromptOpen] = useState(false);
  const drawn = formatFieldDate(field.polygonCapturedAt);
  const askAIContext = { screen: "Field", facts: { Field: field.name, Area: `${formatNumber(field.areaHa, 2)} ha` } };

  return (
    <div data-farm-workspace data-field-workspace-view className="-mx-4 -mt-4 min-h-dvh bg-fr-v2-cream lg:mx-0 lg:mt-0">
      <div className="relative">
        <MapHero
          fields={allFields}
          getTone={() => "neutral"}
          selectedFieldId={field.id}
          selectionColor={FIELD_SELECTION_COLOR}
          highlightedFieldIds={[field.id]}
          dimUnhighlighted
          onSelectField={(id) => router.push(fieldWorkspaceHref(id))}
          flyToSelection
          flyToPadding={{ top: 150, bottom: 60, left: 80, right: 80 }}
          flyToMaxZoom={16.5}
          flyToDuration={reducedMotion ? 0 : 320}
          compactNeighbourLabels
          neighbourNameLabels
          center={field.centroid}
          plain
          className="h-[48dvh] min-h-[340px] lg:h-[54dvh] lg:min-h-[440px]"
        >
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
            <div aria-hidden className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_70%_100%_at_0%_0%,rgba(10,14,11,0.6),transparent_72%)]" />
            <div className="relative flex items-start justify-between gap-4 p-4 pt-[max(env(safe-area-inset-top),1.25rem)] lg:px-12 lg:pt-8">
              <div className="pointer-events-auto min-w-0 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-white/85">
                  <Link href="/fields" className="inline-flex min-h-9 items-center gap-1.5 hover:text-white">
                    <ArrowLeft className="size-3.5" /> Fields
                  </Link>
                  <Link href={`/today?field=${encodeURIComponent(field.id)}`} className="inline-flex min-h-9 items-center hover:text-white">
                    Farm map
                  </Link>
                </p>
                <p className="mt-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-straw">Field workspace</p>
                <h1 className="mt-1.5 max-w-[18ch] text-balance font-display text-[34px] leading-[1] tracking-[-0.02em] text-white lg:text-[56px]">{field.name}</h1>
                <p className="mt-3 font-mono text-[12px] tabular-nums text-white/85" data-field-identity>
                  {formatNumber(field.areaHa, 2)} ha{field.polygon ? ` · boundary ${drawn ? `drawn ${drawn}` : "drawn"}` : " · not mapped"}
                </p>
              </div>
              <div className="pointer-events-auto shrink-0">
                <AskAIButton context={askAIContext} />
              </div>
            </div>
            <div className="flex justify-end p-4 lg:px-12 lg:pb-6">
              <div className="pointer-events-auto">
                <FieldWindChip centroid={field.centroid} />
              </div>
            </div>
          </div>
        </MapHero>
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 lg:px-12 lg:pb-16">
        <FieldDrawer
          field={field}
          initialChapter={initialChapter}
          slurryDetailsRequest={slurryDetailsRequest}
          leadingPrompt={leadingPrompt}
          onViewPrompt={leadingPrompt ? () => setPromptOpen(true) : undefined}
        />
      </div>

      <ExpandedPromptSheet open={promptOpen} onClose={() => setPromptOpen(false)} prompt={leadingPrompt} fieldName={field.name} canRecord={isRealMode} />
    </div>
  );
}
