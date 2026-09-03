"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { AskAIButton } from "@/components/next/AskAI";
import { Card } from "@/components/ui/Card";
import { FieldMap } from "@/components/farm/FieldMap";
import { FieldListRow } from "@/components/farm/FieldListRow";
import { FieldDrawer } from "@/components/farm/FieldDrawer";
import { MapLegend } from "@/components/farm/MapLegend";
import { FieldBoundaryMapModal } from "@/components/farm/FieldBoundaryMapModal";
import { useAllFieldsIncludingArchived, useFarm, useFarmActions, useFields } from "@/store/farm-store";
import { landUseTone } from "@/lib/status";
import { formatHa } from "@/lib/format";
import { computeBoundaryGeometry } from "@/domain/field-boundary";

/**
 * Codex remediation Priority 6/7 — boundary-first field creation, real
 * polygon rendering.
 *
 * Add Field is now: draw the boundary on real satellite imagery
 * (`FieldBoundaryMapModal`, already built for editing an existing field's
 * boundary — reused here for creation, not duplicated) → area/centroid
 * derive automatically from the drawn geometry → confirm a name → save.
 * No manual area entry, no planned-use choice up front — planned use and
 * every other agronomic attribute are set afterward in `FieldDrawer`
 * (Field Detail), never required before the field exists.
 *
 * The map itself now renders each field's own real `polygon`
 * (`FieldMap`), not a hardcoded illustrative shape keyed by mock field id
 * — the dead zoom/layers controls that overlaid it (no real pan/zoom
 * behind them) are removed rather than left as a non-functional
 * affordance; the mobile "Soil"/"Zones" tabs are removed for the same
 * reason (`aria-disabled`, no content ever rendered for them).
 */
/**
 * `useSearchParams()` below opts this page out of static prerendering
 * unless wrapped in `<Suspense>` (Next.js App Router requirement) — the
 * default export is just that boundary; `FieldsPageContent` is the real
 * page, unchanged in behaviour, just no longer the page-level component
 * so this build constraint doesn't leak into every reader of the actual
 * logic below.
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
  // Today's real map hero (`MapHero`'s `onSelectField`) links a tapped
  // field here as `?field=<id>` — real navigation into "this place",
  // Visual Acceptance Contract's "fields behave like an interactive
  // world" requirement, not a fabricated deep link. Only used as the
  // *initial* selection so a farmer can still browse other fields
  // afterward without the URL fighting their taps.
  const searchParams = useSearchParams();
  const linkedFieldId = searchParams.get("field") ?? undefined;
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(linkedFieldId);
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? fields[0];
  const effectiveSelectedId = selectedFieldId ?? fields[0]?.id;

  const [mappingOpen, setMappingOpen] = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const pendingGeometry = pendingPolygon ? computeBoundaryGeometry(pendingPolygon) : null;

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

  // Farm Return Next v1.1 — "Farm" primary nav item (`nav-items.ts`)
  // points here as the honest interim for canonical screen #2 until a
  // real Field-exploration surface is built (`IMPLEMENTATION_MATRIX.md`).
  // Codex audit MEDIUM (round 3,
  // docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round3.md):
  // every v1.1 primary screen needs a real Ask AI affordance — this one
  // had none at all until this fix.
  const askAIContext = {
    screen: "Farm",
    facts: { Farm: farm.name, Fields: String(fields.length), ...(selectedField ? { "Selected field": selectedField.name } : {}) },
  };

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
            <FieldMap
              fields={fields}
              getTone={(field) => (field.plannedUse ? landUseTone(field.plannedUse.value) : "neutral")}
              selectedFieldId={effectiveSelectedId}
              onSelectField={setSelectedFieldId}
              className="rounded-none"
            />
            <div className="flex items-center justify-between gap-3 p-4">
              <MapLegend />
            </div>
          </Card>

          <div className="mt-4 hidden lg:block">
            {selectedField ? <FieldDrawer field={selectedField} /> : null}
          </div>
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
            <FieldListRow
              key={field.id}
              field={field}
              selected={field.id === effectiveSelectedId}
              onSelect={setSelectedFieldId}
            />
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

        <div className="min-w-0 lg:hidden">
          {selectedField ? <FieldDrawer field={selectedField} /> : null}
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
