"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useFarm, useFarmActions, useFields, useHousingList, useSlurryAllocations } from "@/store/farm-store";
import { activeFields } from "@/domain/types";
import { formatHa, formatNumber } from "@/lib/format";
import { buildSlurryTankView } from "@/domain/slurry-storage";
import {
  SLURRY_ALLOCATION_PLAN_ISSUE_COPY,
  SLURRY_APPLICATION_METHOD_OPTIONS,
  SlurryAllocationPlanRejectedError,
  availableToPlanM3,
  describeSlurryAllocationPlanIssues,
  validateNewSlurryAllocationPlan,
  type NewSlurryAllocationPlanInput,
} from "@/domain/slurry-allocation-plan";

const INPUT_CLASS = "rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900";

/**
 * Slurry planning entry — the smallest form that creates one real field
 * slurry allocation (store, field, volume, method, date) through the farm
 * store's canonical write path. Asks only what Farm Return cannot already
 * know: fields, field areas, stores and each store's available volume come
 * from records already on file. Nothing is pre-chosen for the farmer except
 * the store when exactly one holds slurry (the only possible answer).
 */
export function SlurryPlanForm({ onSaved }: { onSaved: () => void }) {
  const farm = useFarm();
  const fields = activeFields(useFields());
  const housingList = useHousingList();
  const allocations = useSlurryAllocations();
  const { createSlurryAllocation } = useFarmActions();

  const stores = housingList
    .map((h) => {
      const tank = buildSlurryTankView(h, allocations);
      return { housing: h, tank, availableM3: availableToPlanM3(tank) };
    })
    .filter((s) => s.availableM3 > 0);

  const [input, setInput] = useState<NewSlurryAllocationPlanInput>({
    fieldId: "",
    housingId: stores.length === 1 ? stores[0].housing.id : "",
    volumeM3: "",
    applicationMethod: "",
    applicationDate: "",
  });
  const [showIssues, setShowIssues] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validation = validateNewSlurryAllocationPlan(input, { fields, housingList, allocations });
  const issues = validation.status === "INVALID" ? validation.issues : [];
  const createsMultiSourcePlan = validation.status === "OK" && validation.value.createsMultiSourcePlan;
  const set = (patch: Partial<NewSlurryAllocationPlanInput>) => setInput((prev) => ({ ...prev, ...patch }));

  async function save() {
    setShowIssues(true);
    setSaveError(null);
    if (validation.status !== "OK" || saving) return;
    setSaving(true);
    try {
      await createSlurryAllocation(input, farm.ownerName);
      onSaved();
    } catch (error: unknown) {
      console.error("[SlurryPlanForm] createSlurryAllocation failed:", error);
      setSaveError(
        error instanceof SlurryAllocationPlanRejectedError
          ? describeSlurryAllocationPlanIssues(error.issues)
          : "Your spreading plan couldn't be saved. Please try again.",
      );
      setSaving(false);
    }
  }

  if (stores.length === 0) {
    return (
      <Card>
        <p className="text-sm text-fr-ink-600">
          None of your slurry stores has slurry available to plan. Update the current fill level on the Housing screen first.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
        Slurry store
        <select className={INPUT_CLASS} value={input.housingId} onChange={(e) => set({ housingId: e.target.value })}>
          <option value="" disabled>
            Select a store
          </option>
          {stores.map(({ housing, tank, availableM3 }) => (
            <option key={housing.id} value={housing.id}>
              {housing.shedName} · {formatNumber(availableM3, 2)} m³ available{tank.status === "estimated" ? " (estimated fill)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
        Field
        <select className={INPUT_CLASS} value={input.fieldId} onChange={(e) => set({ fieldId: e.target.value })}>
          <option value="" disabled>
            Select a field
          </option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {formatHa(f.areaHa)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
        Volume to spread (m³)
        <input type="number" inputMode="decimal" min={0} step="any" className={INPUT_CLASS} value={input.volumeM3} onChange={(e) => set({ volumeM3: e.target.value })} />
      </label>

      <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
        How will this slurry be spread?
        <select className={INPUT_CLASS} value={input.applicationMethod} onChange={(e) => set({ applicationMethod: e.target.value })}>
          <option value="" disabled>
            Select a method
          </option>
          {SLURRY_APPLICATION_METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
        Planned application date
        <input type="date" className={INPUT_CLASS} value={input.applicationDate} onChange={(e) => set({ applicationDate: e.target.value })} />
      </label>

      {createsMultiSourcePlan ? (
        <p className="rounded-fr-control bg-fr-surface-alt p-2.5 text-xs text-fr-ink-600">
          This field already has slurry planned from another store. Farm Return can&apos;t yet value spreading on a field that gets slurry from
          more than one store, so this plan won&apos;t produce a recommendation for it.
        </p>
      ) : null}

      {showIssues && issues.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-fr-risk">
          {issues.map((issue) => (
            <li key={issue}>{SLURRY_ALLOCATION_PLAN_ISSUE_COPY[issue]}</li>
          ))}
        </ul>
      ) : null}
      {saveError ? <p className="text-xs text-fr-risk">{saveError}</p> : null}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-1 rounded-fr-control bg-fr-green-700 py-2.5 text-sm font-semibold text-white disabled:bg-fr-green-700/40"
      >
        {saving ? "Saving…" : "Save spreading plan"}
      </button>
    </Card>
  );
}
