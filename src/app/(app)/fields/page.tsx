"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Flag, Plus } from "lucide-react";
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

  return (
    <>
      <div className="relative -mx-4 -mb-20 -mt-4 lg:mx-0 lg:mb-0 lg:mt-0 lg:overflow-hidden lg:rounded-fr-card lg:shadow-fr-card">
        <MapHero
          fields={allFields}
          getTone={(f) => (f.plannedUse ? landUseTone(f.plannedUse.value) : "neutral")}
          getStatusLabel={(f) => (f.plannedUse ? landUseLabel(f.plannedUse.value) : undefined)}
          selectedFieldId={field.id}
          onSelectField={onSelectField}
          flyToSelection
          glowSelection
          center={field.centroid}
          plain
          className="h-[68vh] min-h-[460px] lg:h-[500px]"
        >
          <div className="absolute inset-0 z-10 flex flex-col justify-between overflow-y-auto bg-gradient-to-b from-black/50 via-transparent to-transparent p-4 pt-[max(env(safe-area-inset-top),1.5rem)]">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back to Farm"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/30 text-white backdrop-blur-sm"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <h1 className="truncate font-display text-xl text-white drop-shadow-sm">{field.name}</h1>
                  <p className="text-xs text-white/80">
                    {formatHa(field.areaHa)}
                    {field.plannedUse ? ` · ${landUseLabel(field.plannedUse.value)}` : ""}
                  </p>
                </div>
                <AskAIButton
                  context={askAIContext}
                  className="shrink-0 border-white/30 bg-transparent px-3 text-white backdrop-blur-sm"
                />
              </div>

              {/* Real leading-Prompt status card for this one field —
                  the reference's own "Ready for fertiliser ✓" card,
                  honestly scoped to whatever this field's real Prompt
                  status actually is, never a fabricated "best window"
                  time. */}
              {leadingPrompt ? (
                <div className="ml-auto flex max-w-[260px] flex-col gap-1.5 rounded-fr-card border border-white/15 bg-fr-surface/95 p-3 text-left shadow-fr-card backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundColor:
                          promptTone === "risk" ? "#C0362C" : promptTone === "attention" ? "#D98324" : "#2E7D4F",
                      }}
                    >
                      <Flag className="size-3 text-white" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fr-ink-900">{leadingPrompt.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onViewPromptDetails}
                    className="self-start rounded-full bg-fr-green-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    View details
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <FieldWindChip centroid={field.centroid} />
            </div>
          </div>
        </MapHero>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <FieldDrawer field={field} />
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
