"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Pencil, Plus, Warehouse, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { Card } from "@/components/ui/Card";
import { ShedCard } from "@/components/farm/ShedCard";
import { AssignedGroupsCard } from "@/components/farm/AssignedGroupsCard";
import { NutrientValueRow } from "@/components/farm/NutrientValueRow";
import { SlurryCompositionCard } from "@/components/farm/SlurryCompositionCard";
import { AddSlurryCompositionSheet } from "@/components/farm/AddSlurryCompositionSheet";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { NeatSlurryEvidenceCard } from "@/components/farm/NeatSlurryEvidenceCard";
import { useFarmActions, useHousingList, useLivestockGroups, useSlurryAllocations, useSlurryCompositionRecords } from "@/store/farm-store";
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
  const linkedHeadcount = linkedGroups.reduce((sum, group) => sum + group.count.value, 0);
  const housingAllocations = housing ? slurryAllocations.filter((allocation) => allocation.housingId === housing.id) : [];

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
      <MobileDetailHeader title="Housing" backHref="/cattle/manage" />
      <PageHeader title="Housing" subtitle="Select a shed or tank, then open only the evidence or action you need." />

      {!housing ? (
        <div className="flex flex-col items-center gap-3 rounded-fr-card border border-dashed border-fr-border py-12 text-center">
          <Warehouse className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">No housing recorded yet</p>
          <p className="max-w-sm text-sm leading-relaxed text-fr-ink-600">
            Add the physical shed and slurry store once. Animal links, slurry evidence and spreading plans will use that same record.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col">
        {!housing || addOpen ? (
          <div className="mb-5">{addForm}</div>
        ) : null}

        {housing ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {housingList.length > 1 ? (
                <div className="flex min-w-0 gap-2 overflow-x-auto" aria-label="Housing objects">
                  {housingList.map((h, i) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setSelectedIndex(i)}
                      aria-pressed={i === selectedIndex}
                      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        i === selectedIndex ? "border-fr-green-700 bg-fr-green-50 text-fr-green-700" : "border-fr-border text-fr-ink-600"
                      }`}
                    >
                      {h.shedName}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Housing object</p>
              )}
              {!addOpen ? (
                <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 text-sm font-semibold text-fr-green-700">
                  <Plus className="size-4" /> Add shed
                </button>
              ) : null}
            </div>

            <ShedCard housing={housing} />

            <ProgressiveDisclosure
              label="1 · Animals in this shed"
              summary={linkedGroups.length > 0 ? `${linkedHeadcount.toFixed(0)} head · ${linkedGroups.length} group${linkedGroups.length === 1 ? "" : "s"}` : "No livestock groups linked yet"}
              status={linkedGroups.length > 0 ? "good" : "attention"}
              defaultOpen={linkedGroups.length === 0}
            >
              <AssignedGroupsCard groups={linkedGroups} />
            </ProgressiveDisclosure>

            <ProgressiveDisclosure
              label="2 · Shed & storage details"
              summary={`${housing.storageCapacityM3.toFixed(0)} m³ capacity · housing period ${housing.housingPeriod.start} to ${housing.housingPeriod.end}`}
              status={housing.storageFillStatus === "farmer_recorded" ? "good" : "attention"}
            >
              <div className="flex flex-col gap-3">
                <p className="text-sm leading-relaxed text-fr-ink-600">The summary above is the canonical physical record for this shed and its store. Edit it only when the housing period, capacity or observed fill changes.</p>
                <button
                  type="button"
                  onClick={() => { startEdit(housing); setAddOpen(true); }}
                  className="flex min-h-11 items-center justify-center gap-2 self-start rounded-fr-control border border-fr-border px-4 text-sm font-semibold text-fr-green-700"
                >
                  <Pencil className="size-4" /> Edit shed & fill
                </button>
              </div>
            </ProgressiveDisclosure>

            <ProgressiveDisclosure
              label="3 · Slurry evidence"
              summary={currentComposition ? `Composition recorded · ${compositionHistoryCount} earlier result${compositionHistoryCount === 1 ? "" : "s"}` : "Composition not recorded · nutrient value may remain unknown"}
              status={currentComposition ? "good" : "attention"}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <NutrientValueRow slurry={housing.slurryEstimate} />
                <SlurryCompositionCard
                  current={currentComposition}
                  historyCount={compositionHistoryCount}
                  onAddResult={() => setCompositionSheetOpen(true)}
                />
              </div>
              <div className="mt-4">
                <NeatSlurryEvidenceCard housingId={housing.id} />
              </div>
            </ProgressiveDisclosure>

            <ProgressiveDisclosure
              label="4 · Slurry planning"
              summary={housingAllocations.length > 0 ? `${housingAllocations.length} field allocation${housingAllocations.length === 1 ? "" : "s"} linked to this store` : "No field allocation adopted for this store"}
              status={housingAllocations.length > 0 ? "good" : "neutral"}
            >
              <p className="max-w-2xl text-sm leading-relaxed text-fr-ink-600">
                This screen owns the physical store and its evidence. Field allocation and chemical-fertiliser balancing are planned once in Fertiliser Plan.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="/fertiliser-plan" className="flex min-h-11 items-center justify-center gap-2 rounded-fr-control bg-fr-green-700 px-4 text-sm font-semibold text-white">
                  Plan slurry & fertiliser <ArrowRight className="size-4" />
                </a>
                <a href="/spreading" className="flex min-h-11 items-center justify-center gap-2 rounded-fr-control border border-fr-border px-4 text-sm font-semibold text-fr-green-700">
                  View spreading plan
                </a>
              </div>
            </ProgressiveDisclosure>

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
