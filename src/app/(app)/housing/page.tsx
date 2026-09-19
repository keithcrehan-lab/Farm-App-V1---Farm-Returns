"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Pencil, Plus, SlidersHorizontal, Warehouse, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { Card } from "@/components/ui/Card";
import { ShedCard } from "@/components/farm/ShedCard";
import { AssignedGroupsCard } from "@/components/farm/AssignedGroupsCard";
import { NutrientValueRow } from "@/components/farm/NutrientValueRow";
import { SuggestedAllocationCard } from "@/components/farm/SuggestedAllocationCard";
import { SlurryCompositionCard } from "@/components/farm/SlurryCompositionCard";
import { AddSlurryCompositionSheet } from "@/components/farm/AddSlurryCompositionSheet";
import { useFarmActions, useHousingList, useIsRealMode, useLivestockGroups, useSlurryAllocations, useSlurryCompositionRecords } from "@/store/farm-store";
import { currentSlurryCompositionByHousing } from "@/domain/slurry-composition";

/**
 * Real Farm V1 Phase 11 — a real new farm can genuinely have zero housing
 * records (onboarding's Housing step is skippable). The screen used to
 * assume `useHousingList()[0]` always existed — a real crash, not just a
 * missing feature, for any farmer who hadn't added a shed yet.
 */
export default function HousingPage() {
  const housingList = useHousingList();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const slurryCompositionRecords = useSlurryCompositionRecords();
  const isRealMode = useIsRealMode();
  const { addHousing, updateHousing } = useFarmActions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [compositionSheetOpen, setCompositionSheetOpen] = useState(false);
  // Real Mode Completion Phase 26 — editing an existing shed reuses this
  // same form (prefilled), submitting to updateHousing instead of
  // addHousing, rather than a second near-identical form.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shedName, setShedName] = useState("");
  const [shedType, setShedType] = useState<"slatted" | "straw_bedded" | "other">("slatted");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("");
  const [fillPct, setFillPct] = useState("");
  // Codex audit CRITICAL (Fertiliser Overview and Stock Visuals campaign,
  // round 2 — the round-1 fix only closed the ADD path): `startEdit`
  // prefills `fillPct` from the shed's own existing, possibly-never-
  // confirmed value (`String(h.storageFillPct)`), so on an EDIT that
  // string is never genuinely blank even when the underlying record is
  // still `"estimated"` — saving any unrelated change (e.g. renaming the
  // shed) would re-stamp that untouched value as a fresh, real
  // `"farmer_recorded"` confirmation. `fillPctTouched` tracks whether the
  // farmer actually interacted with THIS field during THIS form session
  // — set only by the field's own `onChange`, reset on every fresh
  // add/edit — so an edit that never touches the fill field omits
  // `storageFillPct`/`storageFillStatus` from the update entirely
  // (preserving whatever real value/provenance already existed) instead
  // of resubmitting a stale prefilled number as a new confirmation.
  const [fillPctTouched, setFillPctTouched] = useState(false);

  const housing = housingList[selectedIndex] ?? housingList[0];
  const linkedGroups = housing ? livestockGroups.filter((g) => housing.linkedGroupIds.includes(g.id)) : [];
  // Slurry Evidence & Composition V1 — this shed/tank's own current,
  // effective composition record (tier-and-recency-resolved), plus how
  // many earlier results exist on file for it (disclosed, not a full
  // history browser — see `SlurryCompositionCard`'s own header).
  const currentComposition = housing ? currentSlurryCompositionByHousing(slurryCompositionRecords).get(housing.id) : undefined;
  const compositionHistoryCount = housing
    ? slurryCompositionRecords.filter((r) => r.housingId === housing.id).length - (currentComposition ? 1 : 0)
    : 0;

  function startEdit(h: NonNullable<typeof housing>) {
    setEditingId(h.id);
    setShedName(h.shedName);
    setShedType(h.shedType);
    setStart(h.housingPeriod.start);
    setEnd(h.housingPeriod.end);
    setCapacity(String(h.storageCapacityM3));
    setFillPct(String(h.storageFillPct));
    setFillPctTouched(false);
  }

  function resetForm() {
    setShedName("");
    setStart("");
    setEnd("");
    setCapacity("");
    setFillPct("");
    setFillPctTouched(false);
    setShedType("slatted");
  }

  async function handleAddShed(e: FormEvent) {
    e.preventDefault();
    if (!shedName.trim() || !start || !end || !(Number(capacity) > 0)) return;
    // Codex audit CRITICAL (Fertiliser Overview and Stock Visuals
    // campaign, round 1): a genuinely BLANK "Current fill (%)" field was
    // silently converted to `0` and then stamped as a real, timestamped
    // farmer confirmation — indistinguishable from a farmer who
    // deliberately typed "0" (a real, valid "my tank is empty" entry).
    // `fillPctEntered` captures the real distinction the store/database
    // now require explicitly: whether this field was actually typed
    // into this submission, never inferred from the resulting number.
    const fillPctEntered = fillPct.trim() !== "";
    if (editingId) {
      updateHousing(editingId, {
        shedName: shedName.trim(),
        shedType,
        housingPeriod: { start, end },
        storageCapacityM3: Number(capacity),
        // Codex audit CRITICAL (round 2): only include a real fill
        // value/status at all when the farmer actually touched this
        // field during THIS edit — see `fillPctTouched`'s own doc
        // comment above. An edit that never touches it must leave the
        // shed's existing real fill value/provenance completely
        // untouched, never resubmit a stale prefilled number as a new
        // confirmation.
        ...(fillPctTouched ? { storageFillPct: fillPctEntered ? Number(fillPct) : 0, storageFillStatus: fillPctEntered ? "farmer_recorded" : "estimated" } : {}),
      });
      setEditingId(null);
    } else {
      await addHousing({
        shedName: shedName.trim(),
        shedType,
        housingPeriod: { start, end },
        storageCapacityM3: Number(capacity),
        storageFillPct: fillPctEntered ? Number(fillPct) : 0,
        storageFillStatus: fillPctEntered ? "farmer_recorded" : "estimated",
      });
    }
    resetForm();
    setAddOpen(false);
  }

  const addForm = (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-fr-ink-900">{editingId ? "Edit shed" : "Add shed"}</p>
        {housingList.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setAddOpen(false);
              setEditingId(null);
              resetForm();
            }}
            className="text-fr-ink-400 hover:text-fr-ink-600"
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <form onSubmit={handleAddShed} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fr-ink-600">Shed name</span>
          <input
            type="text"
            required
            value={shedName}
            onChange={(e) => setShedName(e.target.value)}
            placeholder="e.g. Shed 1"
            className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-fr-ink-600">Type</span>
          <select
            value={shedType}
            onChange={(e) => setShedType(e.target.value as typeof shedType)}
            className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
          >
            <option value="slatted">Slatted</option>
            <option value="straw_bedded">Straw bedded</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Housing period start</span>
            <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Housing period end</span>
            <input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Slurry storage capacity (m³)</span>
            <input type="number" required min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Current fill (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              value={fillPct}
              onChange={(e) => {
                setFillPct(e.target.value);
                setFillPctTouched(true);
              }}
              className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
            />
          </label>
        </div>
        <p className="text-xs text-fr-ink-400">
          Slurry nutrient value starts as a placeholder until a real storage/excretion coefficient is available — see
          docs/evidence-register.md.
        </p>
        <button type="submit" className="rounded-fr-control bg-fr-green-700 py-2.5 text-sm font-semibold text-white">
          {editingId ? "Save changes" : "Add shed"}
        </button>
      </form>
    </Card>
  );

  return (
    <>
      <MobileDetailHeader title="Housing & Slurry" backHref="/livestock" />
      <PageHeader title="Housing & Slurry" subtitle="Shed assignment, slurry inventory and organic nutrient value" />

      {!housing ? (
        <div className="flex flex-col items-center gap-3 rounded-fr-card border border-dashed border-fr-border py-12 text-center">
          <Warehouse className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">No housing recorded yet</p>
          <p className="max-w-xs text-sm text-fr-ink-600">
            Add your winter housing to see slurry capacity, storage fill and organic nutrient value.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {!housing || addOpen ? (
          addForm
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-2.5 text-sm font-semibold text-fr-green-700 hover:border-fr-green-700"
          >
            <Plus className="size-4" />
            Add another shed
          </button>
        )}

        {housing ? (
          <>
            {housingList.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto">
                {housingList.map((h, i) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      i === selectedIndex ? "border-fr-green-700 text-fr-green-700" : "border-fr-border text-fr-ink-600"
                    }`}
                  >
                    {h.shedName}
                  </button>
                ))}
              </div>
            ) : null}
            <ShedCard housing={housing} />
            {!addOpen ? (
              <button
                type="button"
                onClick={() => {
                  startEdit(housing);
                  setAddOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 self-start text-xs font-semibold text-fr-green-700"
              >
                <Pencil className="size-3.5" />
                Edit this shed
              </button>
            ) : null}
            <AssignedGroupsCard groups={linkedGroups} />
            <NutrientValueRow slurry={housing.slurryEstimate} />
            <SlurryCompositionCard
              current={currentComposition}
              historyCount={compositionHistoryCount}
              onAddResult={() => setCompositionSheetOpen(true)}
            />
            {/* Slurry Evidence & Composition V1, campaign brief §8 — this
                app's real slurry-allocation priority/score have no real
                computing logic behind them yet (mock-fixture-only,
                `docs/farm-return-next` campaign investigation) — a real
                signed-in farm must never see them presented as a genuine
                scientific output. `slurryAllocations` is always `[]` for a
                real farm today anyway (no real write path creates a real
                allocation row), but this gate is explicit rather than
                relying on that incidentally — matching this same page's
                sibling gates and `spreading/page.tsx`'s own
                `isRealMode ? [] : mockPlannedApplications` precedent.
                `SuggestedAllocationCard` itself renders an honest "not yet
                assessed" empty state for `[]`, never a blank card. Mock/
                demo mode is unaffected. */}
            <SuggestedAllocationCard allocations={isRealMode ? [] : slurryAllocations} />

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                // Fertiliser Overview and Stock Visuals campaign already
                // made "Current fill (%)" genuinely editable via "Edit
                // this shed" above (storage_fill_status/recorded_at
                // provenance). Slurry Evidence & Composition V1 now makes
                // slurry analysis genuinely editable too (this button used
                // to be permanently disabled, telling farmers this
                // "arrives with the Phase 2 data model"). Tank dimensions
                // (`Housing.tankRefinement`) genuinely remain unbuilt.
                title="Record a dry matter estimate or laboratory analysis for this shed/tank's slurry"
                onClick={() => setCompositionSheetOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-fr-control border border-fr-border py-3 text-sm font-semibold text-fr-ink-900"
              >
                <SlidersHorizontal className="size-4" />
                Slurry analysis
              </button>
              <a
                href="/spreading"
                className="flex flex-1 items-center justify-center gap-2 rounded-fr-control bg-fr-green-700 py-3 text-sm font-semibold text-white"
              >
                View spreading plan
                <ArrowRight className="size-4" />
              </a>
            </div>
            <AddSlurryCompositionSheet
              open={compositionSheetOpen}
              onClose={() => setCompositionSheetOpen(false)}
              onSaved={() => setCompositionSheetOpen(false)}
              housingId={housing.id}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
