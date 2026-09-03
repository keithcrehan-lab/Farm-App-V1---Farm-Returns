"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ChevronLeft, Flag, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { AskAIButton } from "@/components/next/AskAI";
import { Card } from "@/components/ui/Card";
import { MapHero } from "@/components/farm/MapHero";
import { FieldWindChip } from "@/components/farm/FieldWindChip";
import { FieldListRow } from "@/components/farm/FieldListRow";
import { FieldDrawer } from "@/components/farm/FieldDrawer";
import { MapLegend } from "@/components/farm/MapLegend";
import { FieldBoundaryMapModal } from "@/components/farm/FieldBoundaryMapModal";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { useAllFieldsIncludingArchived, useFarm, useFarmActions, useFields, useIsRealMode } from "@/store/farm-store";
import { landUseLabel, landUseTone, promptStatusTone } from "@/lib/status";
import { formatHa } from "@/lib/format";
import { computeBoundaryGeometry } from "@/domain/field-boundary";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt } from "@/orchestration/prompt/select-primary";

/**
 * Codex remediation Priority 6/7 — boundary-first field creation, real
 * polygon rendering.
 *
 * Strict Visual Reproduction phase (2026-09-03): explicitly selecting a
 * field (a tap, or a real `?field=` link from Today) now opens a
 * literal reproduction of media/image3.png's own Field-detail
 * composition — a full-bleed real aerial hero (glowing selected
 * boundary, real neighbour-field pins, a real leading-Prompt status
 * card, real wind) with the field's own real tab panel
 * (`FieldDrawer`'s Now/Soil/Activity/Constraints) below it, and a
 * back chevron returning to this farm-overview (list + bounded map,
 * unchanged from before this phase). Nothing in the reference this
 * build cannot honestly show (a real farm-yard building location, a
 * gate sensor, a precise "best window" time-of-day) is fabricated —
 * each is simply absent; see the hero's own inline comments for which
 * and why.
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
  const allFields = useAllFieldsIncludingArchived();
  const archivedFields = allFields.filter((f) => f.archivedAt);
  const { addField, restoreField } = useFarmActions();
  const farm = useFarm();
  const isRealMode = useIsRealMode();
  // Today's real map hero (`MapHero`'s `onSelectField`) links a tapped
  // field here as `?field=<id>` — real navigation into "this place",
  // Visual Acceptance Contract's "fields behave like an interactive
  // world" requirement, not a fabricated deep link.
  const searchParams = useSearchParams();
  const requestedFieldId = searchParams.get("field") ?? undefined;
  const linkedFieldId = fields.some((f) => f.id === requestedFieldId) ? requestedFieldId : undefined;
  // Strict Visual Reproduction phase: `selectedFieldId` is now a real,
  // explicit "did the farmer (or a real link) choose a field" state —
  // undefined means the farm-overview shows, not a fallback-to-first-
  // field guess. `detailField` (not this) is what actually decides
  // which mode renders.
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(linkedFieldId);
  const detailField = fields.find((f) => f.id === selectedFieldId);

  const [mappingOpen, setMappingOpen] = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const pendingGeometry = pendingPolygon ? computeBoundaryGeometry(pendingPolygon) : null;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same real-wall-clock hydration-safety pattern as Today's own identical effect.
    setMounted(true);
  }, []);
  const allPrompts = useMemo(() => {
    if (!mounted) return [];
    return buildAllRealPrompts(farm, fields, new Date().toISOString());
  }, [mounted, farm, fields]);
  const [openPrompt, setOpenPrompt] = useState(false);
  const detailFieldPrompt = detailField ? selectPrimaryPrompt(allPrompts.filter((p) => p.fieldId === detailField.id)) : undefined;

  async function handleConfirmName() {
    if (!pendingPolygon || !newName.trim()) return;
    setSaving(true);
    try {
      const field = await addField({ name: newName.trim(), polygon: pendingPolygon });
      setSelectedFieldId(field.id);
      setPendingPolygon(null);
      setNewName("");
    } finally {
      setSaving(false);
    }
  }

  const askAIContext = {
    screen: "Farm",
    facts: { Farm: farm.name, Fields: String(fields.length), ...(detailField ? { "Selected field": detailField.name } : {}) },
  };

  if (detailField) {
    return (
      <FieldDetailView
        field={detailField}
        allFields={fields}
        onBack={() => setSelectedFieldId(undefined)}
        onSelectField={setSelectedFieldId}
        leadingPrompt={detailFieldPrompt}
        onViewPromptDetails={() => setOpenPrompt(true)}
        askAIContext={askAIContext}
        openPrompt={openPrompt}
        onClosePrompt={() => setOpenPrompt(false)}
        canRecord={isRealMode}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Farm Map"
        subtitle="Field boundaries, planned use and per-field detail"
        actions={<AskAIButton context={askAIContext} />}
      />

      {/* Mobile header */}
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <h1 className="text-title text-fr-ink-900">Fields</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-fr-ink-600">All Fields ({fields.length})</span>
          <AskAIButton context={askAIContext} />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-5">
        <div className="min-w-0 lg:col-span-2">
          <Card className="overflow-hidden p-0">
            <MapHero
              fields={fields}
              getTone={(field) => (field.plannedUse ? landUseTone(field.plannedUse.value) : "neutral")}
              onSelectField={setSelectedFieldId}
              center={farm.location.centroid}
              plain
              className="h-[50vh] min-h-[360px] lg:h-[420px]"
            />
            <div className="flex items-center justify-between gap-3 p-4">
              <MapLegend />
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {pendingPolygon ? (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold text-fr-ink-900">Name this field</p>
              <div className="mb-3 flex flex-col gap-1 text-xs text-fr-ink-600">
                <span>
                  Area: <span className="font-semibold text-fr-ink-900">{formatHa(pendingGeometry?.areaHa ?? 0)}</span>{" "}
                  — calculated from the boundary you drew, not typed.
                </span>
              </div>
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Bog Field"
                className="mb-3 w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingPolygon(null);
                    setNewName("");
                  }}
                  className="flex-1 rounded-fr-control border border-fr-border py-2 text-sm font-medium text-fr-ink-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newName.trim() || saving}
                  onClick={handleConfirmName}
                  className="flex-1 rounded-fr-control bg-fr-green-700 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save field"}
                </button>
              </div>
              <p className="mt-3 text-xs text-fr-ink-400">
                Planned use, soil and fertility are set afterward on this field&apos;s own detail screen — nothing is
                assumed here.
              </p>
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => setMappingOpen(true)}
              className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-2.5 text-sm font-semibold text-fr-green-700 hover:border-fr-green-700"
            >
              <Plus className="size-4" />
              Add field
            </button>
          )}
          {fields.map((field) => (
            <FieldListRow key={field.id} field={field} selected={false} onSelect={setSelectedFieldId} />
          ))}

          {archivedFields.length > 0 ? (
            <details className="mt-2 rounded-fr-control border border-fr-border p-3 text-sm">
              <summary className="cursor-pointer font-medium text-fr-ink-600">
                Archived fields ({archivedFields.length})
              </summary>
              <ul className="mt-2 flex flex-col divide-y divide-fr-border">
                {archivedFields.map((field) => (
                  <li key={field.id} className="flex items-center justify-between py-2">
                    <span className="text-fr-ink-900">{field.name}</span>
                    <button
                      type="button"
                      onClick={() => restoreField(field.id)}
                      className="text-xs font-semibold text-fr-green-700"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>

      {mappingOpen ? (
        <FieldBoundaryMapModal
          fieldName="new field"
          initialCentroid={farm.location.centroid}
          onClose={() => setMappingOpen(false)}
          onSave={(polygon) => {
            setPendingPolygon(polygon);
            setMappingOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Field detail — literal reproduction of media/image3.png's own
 * composition: full-bleed real hero (back/name/more header, glowing
 * selected boundary, real neighbour pins, a real leading-Prompt status
 * card, real wind) with the field's own real tab panel below it.
 *
 * Deliberately absent, and why (never fabricated to fill the
 * reference's own slot): a real farm-yard building location (`Farm`
 * has no such coordinate — only a general area `location.centroid`);
 * a gate-sensor state (not a Farm Return concept at all); a precise
 * "best window HH:MM–HH:MM" (this app's own spreading-window engine
 * only answers a binary calendar-open question, never a time-of-day
 * forecast window).
 */
function FieldDetailView({
  field,
  allFields,
  onBack,
  onSelectField,
  leadingPrompt,
  onViewPromptDetails,
  askAIContext,
  openPrompt,
  onClosePrompt,
  canRecord,
}: {
  field: import("@/domain/types").Field;
  allFields: import("@/domain/types").Field[];
  onBack: () => void;
  onSelectField: (fieldId: string) => void;
  leadingPrompt: import("@/orchestration/prompt").Prompt | undefined;
  onViewPromptDetails: () => void;
  askAIContext: { screen: string; facts: Record<string, string> };
  openPrompt: boolean;
  onClosePrompt: () => void;
  canRecord: boolean;
}) {
  const promptTone = leadingPrompt ? promptStatusTone(leadingPrompt.basis.status) : undefined;

  const primaryAction = leadingPrompt ? (
    <button
      type="button"
      onClick={onViewPromptDetails}
      className="flex flex-1 items-center justify-center gap-2 rounded-full bg-fr-green-700 px-5 py-3.5 text-sm font-semibold text-white shadow-fr-card"
    >
      View details
      <ArrowRight className="size-4" />
    </button>
  ) : (
    <Link
      href={`/nutrients?field=${field.id}`}
      className="flex flex-1 items-center justify-center gap-2 rounded-full bg-fr-green-700 px-5 py-3.5 text-sm font-semibold text-white shadow-fr-card"
    >
      Open this field&apos;s nutrient plan
      <ArrowRight className="size-4" />
    </Link>
  );

  return (
    <>
      <div className="relative -mx-4 -mt-4 lg:mx-0 lg:mt-0 lg:overflow-hidden lg:rounded-fr-card lg:shadow-fr-card">
        {/* Codex audit round 3 (Strict Visual Reproduction, Field
            detail): rounds 1-2 oscillated on hero height alone (52vh
            "too short" then 66vh "pushes the panel below the fold") —
            the real structural problem was never the height, it was
            that the primary action + Ask AI lived inside the hero at
            all. Both now live in their own persistent control (below,
            after the tab panel, matching image3's own "Plan job" sitting
            after its Now-tab content), freeing the hero to be a
            genuinely dominant 60vh without also being cluttered. */}
        <MapHero
          fields={allFields}
          getTone={(f) => (f.plannedUse ? landUseTone(f.plannedUse.value) : "neutral")}
          getStatusLabel={(f) => (f.plannedUse ? landUseLabel(f.plannedUse.value) : undefined)}
          selectedFieldId={field.id}
          onSelectField={onSelectField}
          flyToSelection
          flyToPadding={{ top: 130, bottom: 60, left: 90, right: 90 }}
          flyToMaxZoom={15}
          glowSelection
          compactNeighbourLabels
          center={field.centroid}
          plain
          className="h-[60vh] min-h-[440px] lg:h-[500px]"
        >
          <div className="absolute inset-0 z-10 flex flex-col justify-between bg-gradient-to-b from-black/50 via-transparent to-black/35 p-4 pt-[max(env(safe-area-inset-top),1.5rem)]">
            {/* Top cluster — header, then the informational status line
                grouped directly beneath it (not spread to mid-map by
                `justify-between`, which previously let it collide with
                the selected field's own centred marker). */}
            <div className="flex flex-col gap-3">
              {/* Header — back + left-aligned name/area only (Codex audit
                  round 2: a trailing Ask AI pill "competed with the field
                  identity in the primary header row" next to image3's own
                  quiet header). */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back to Farm"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/30 text-white backdrop-blur-sm"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-display text-2xl text-white drop-shadow-sm">{field.name}</h1>
                  <p className="text-sm text-white/80">
                    {formatHa(field.areaHa)}
                    {field.plannedUse ? ` · ${landUseLabel(field.plannedUse.value)}` : ""}
                  </p>
                </div>
              </div>

              {/* Informational status card — Codex audit round 4: a
                  single-line pill read as too minor next to image3's own
                  "large, visually dominant" two-tier card. A bold
                  headline (the real Prompt's title) plus its real
                  description as a second line, matching that two-tier
                  shape without inventing the reference's own unsupported
                  time-of-day detail. */}
              {leadingPrompt ? (
                <div className="flex items-start gap-3 self-start rounded-fr-card border border-white/15 bg-black/35 p-3.5 backdrop-blur-md">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: promptTone === "risk" ? "#C0362C" : promptTone === "attention" ? "#D98324" : "#2E7D4F",
                    }}
                  >
                    <Flag className="size-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-white">{leadingPrompt.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-white/75">{leadingPrompt.description}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <FieldWindChip centroid={field.centroid} />
            </div>
          </div>
        </MapHero>
      </div>

      {/* Codex audit round 3: the drawer read as "a separate white card"
          rather than an integrated panel — a small negative margin lets
          its own rounded top corners overlap the hero's bottom edge,
          and `hideIdentity` drops the name/area text the hero's own
          header already shows. Extra bottom padding on mobile reserves
          room for the fixed action bar below, which sits above it. */}
      <div className="-mt-6 flex flex-col gap-4 pb-24 lg:mt-4 lg:pb-0">
        <FieldDrawer field={field} hideIdentity className="rounded-t-2xl lg:rounded-fr-card" />
      </div>

      {/* Persistent primary action — Codex audit round 3: "the primary
          action is embedded inside the map hero... and scrolls away,
          whereas image3 places the persistent action after the panel...
          pinned above the bottom navigation." Fixed above the mobile nav
          (light system here, not the hero's dark overlay, since it sits
          over the light panel); a normal static control at the end of
          the column on desktop, which has no bottom nav to pin above. */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 px-4 lg:static lg:bottom-auto lg:z-auto lg:mt-4 lg:px-0">
        <div className="flex items-center gap-2 rounded-fr-card border border-fr-border bg-fr-surface p-3 shadow-fr-card lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <AskAIButton context={askAIContext} className="shrink-0 border-fr-border bg-fr-surface-alt px-3 text-fr-ink-900" />
          {primaryAction}
        </div>
      </div>

      <ExpandedPromptSheet
        open={openPrompt}
        onClose={onClosePrompt}
        prompt={leadingPrompt}
        fieldName={field.name}
        canRecord={canRecord}
      />
    </>
  );
}
