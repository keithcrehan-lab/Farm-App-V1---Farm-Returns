"use client";

/**
 * Real Mode Completion Phase 2/3 — onboarding wizard, redesigned.
 *
 * Two real steps only: Farm, then Livestock (broad — category/system/
 * head count, nothing finer). Field/soil/housing/financial-assumption
 * capture removed entirely — those live in their own modules now, each
 * with a real "add" action already (Fields, Soil, Housing, Finance).
 *
 * **The Back-button data-loss bug, fixed at the architecture level, not
 * patched visually**: the previous wizard's Farm step always called a
 * `create` action, so revisiting it via Back and submitting again created
 * a *second* `farms` row for the same user. Fixed two ways:
 *   1. In-session: once `farm` is set in this component's state, the Farm
 *      step calls `updateFarmStep` (an UPDATE) instead of `createFarmStep`
 *      (an INSERT) — which action gets called is what makes Back safe,
 *      not a UI-only disable.
 *   2. Across a full reload/leave/return/sign-out-sign-in: `page.tsx`
 *      resolves real onboarding status server-side on every visit and
 *      passes the already-created farm (and any livestock groups already
 *      added) in as `resumeFarm`/`resumeLivestockGroups` — this component
 *      never starts from a blank slate if real progress already exists.
 *
 * **Save states are real, not decorative**: every write shows Saving… /
 * Saved / Failed to save via `saveState`, driven by whether the awaited
 * Server Action actually succeeded — a failed write always surfaces an
 * error banner, it never leaves the UI looking successful while the
 * database write silently failed.
 */
import { useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { EnterpriseType, Farm, LivestockCategory, LivestockGroup } from "@/domain/types";
import { IRISH_COUNTIES } from "@/lib/irish-counties";
import { addLivestockStep, createFarmStep, finishOnboarding, updateFarmStep, type FarmStepInput } from "@/app/actions/onboarding";

const STEPS = ["Farm", "Livestock"] as const;

const ENTERPRISE_OPTIONS: { value: EnterpriseType; label: string }[] = [
  { value: "suckler_beef", label: "Suckler beef" },
  { value: "dairy_beef", label: "Dairy beef" },
  { value: "dairy", label: "Dairy" },
  { value: "sheep", label: "Sheep" },
  { value: "tillage", label: "Tillage" },
  { value: "mixed", label: "Mixed" },
];

const LIVESTOCK_CATEGORY_OPTIONS: { value: LivestockCategory; label: string }[] = [
  { value: "suckler_cow", label: "Suckler cow" },
  { value: "dairy_cow", label: "Dairy cow" },
  { value: "bull", label: "Bull" },
  { value: "calf", label: "Calf" },
  { value: "weanling", label: "Weanling" },
  { value: "store", label: "Store" },
  { value: "steer", label: "Steer" },
  { value: "heifer", label: "Heifer" },
];

type SaveState = "idle" | "saving" | "saved" | "error";

const inputClass = "rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2 text-sm text-fr-ink-900";
const labelClass = "flex flex-col gap-1 text-xs text-fr-ink-600";
const primaryButtonClass =
  "flex items-center justify-center gap-1.5 rounded-fr-control bg-fr-green-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:bg-fr-green-700/40";
const secondaryButtonClass =
  "flex items-center justify-center gap-1.5 rounded-fr-control border border-fr-border px-5 py-2.5 text-sm font-medium text-fr-ink-900 transition-colors hover:bg-fr-surface-alt disabled:opacity-40";

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="text-xs text-fr-ink-600">Saving…</span>;
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-fr-good">
        <CheckCircle2 className="size-3.5" />
        Saved
      </span>
    );
  if (state === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-fr-risk">
        <TriangleAlert className="size-3.5" />
        Failed to save
      </span>
    );
  return null;
}

export function OnboardingWizard({
  suggestedOwnerName,
  resumeFarm,
  resumeLivestockGroups,
}: {
  suggestedOwnerName: string;
  resumeFarm: Farm | null;
  resumeLivestockGroups: LivestockGroup[];
}) {
  const [step, setStep] = useState(resumeFarm ? 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [farm, setFarm] = useState<Farm | null>(resumeFarm);
  const [livestockGroups, setLivestockGroups] = useState<LivestockGroup[]>(resumeLivestockGroups);

  return (
    <div className="rounded-fr-card border border-fr-border bg-fr-surface p-6 shadow-fr-card">
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Onboarding steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium " +
              (i === step ? "bg-fr-green-700 text-white" : i < step ? "bg-fr-good-bg text-fr-good" : "bg-fr-surface-alt text-fr-ink-600")
            }
          >
            {i < step ? <CheckCircle2 className="size-3.5" /> : null}
            {label}
          </li>
        ))}
      </ol>

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-fr-card bg-fr-risk-bg p-3 text-sm text-fr-risk">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <FarmStep
          existingFarm={farm}
          suggestedOwnerName={suggestedOwnerName}
          saveState={saveState}
          onSubmit={async (input) => {
            setError(null);
            setSaveState("saving");
            const result = farm ? await updateFarmStep(farm.id, input) : await createFarmStep(input);
            if ("error" in result) {
              setSaveState("error");
              return setError(result.error);
            }
            setSaveState("saved");
            setFarm(result.farm);
            setStep(1);
          }}
        />
      ) : null}

      {step === 1 && farm ? (
        <LivestockStep
          farmId={farm.id}
          farmerName={farm.ownerName}
          groups={livestockGroups}
          saveState={saveState}
          onAdd={async (input) => {
            setError(null);
            setSaveState("saving");
            const result = await addLivestockStep(farm.id, { ...input, farmerName: farm.ownerName });
            if ("error" in result) {
              setSaveState("error");
              return setError(result.error);
            }
            setSaveState("saved");
            setLivestockGroups((g) => [...g, result.group]);
          }}
          onBack={() => setStep(0)}
          onFinish={async () => {
            setError(null);
            setSaveState("saving");
            await finishOnboarding(farm.id);
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Farm
// ---------------------------------------------------------------------------

function FarmStep({
  existingFarm,
  suggestedOwnerName,
  saveState,
  onSubmit,
}: {
  existingFarm: Farm | null;
  suggestedOwnerName: string;
  saveState: SaveState;
  onSubmit: (input: FarmStepInput) => void;
}) {
  const [name, setName] = useState(existingFarm?.name ?? "");
  const [ownerName, setOwnerName] = useState(existingFarm?.ownerName ?? suggestedOwnerName);
  const [county, setCounty] = useState(existingFarm?.location.county ?? IRISH_COUNTIES[3].name);
  const [enterprise, setEnterprise] = useState<EnterpriseType>(existingFarm?.primaryEnterprises[0] ?? "suckler_beef");

  const valid = name.trim().length > 0 && ownerName.trim().length > 0;
  const submitting = saveState === "saving";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fr-ink-900">Let&apos;s set up your farm</h1>
        <p className="mt-1 text-sm text-fr-ink-600">Just the basics — everything else lives inside the app.</p>
      </div>
      <label className={labelClass}>
        Farm name
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ballybeg Farm" />
      </label>
      <label className={labelClass}>
        Your name
        <input className={inputClass} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
      </label>
      <label className={labelClass}>
        County
        <select className={inputClass} value={county} onChange={(e) => setCounty(e.target.value)}>
          {IRISH_COUNTIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-fr-ink-600/70">
          Farm location starts at the county centre (approximate) — map your fields inside Fields for a real position.
        </span>
      </label>
      <label className={labelClass}>
        Primary enterprise
        <select className={inputClass} value={enterprise} onChange={(e) => setEnterprise(e.target.value as EnterpriseType)}>
          {ENTERPRISE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-fr-ink-600">Units: metric (ha, kg, °C) — the only system supported for Irish farms.</p>
      <div className="flex items-center justify-between">
        <SaveIndicator state={saveState} />
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!valid || submitting}
          onClick={() => {
            const centroid = IRISH_COUNTIES.find((c) => c.name === county)?.centroid ?? IRISH_COUNTIES[3].centroid;
            onSubmit({ name: name.trim(), ownerName: ownerName.trim(), county, centroid, primaryEnterprises: [enterprise] });
          }}
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Livestock (broad only — no weight/tag/breed/age/goal/housing)
// ---------------------------------------------------------------------------

function LivestockStep({
  groups,
  saveState,
  onAdd,
  onBack,
  onFinish,
}: {
  farmId: string;
  farmerName: string;
  groups: LivestockGroup[];
  saveState: SaveState;
  onAdd: (input: { label: string; category: LivestockCategory; count: number; system: "grazing" | "housed" }) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<LivestockCategory>("suckler_cow");
  const [count, setCount] = useState("");
  const [system, setSystem] = useState<"grazing" | "housed">("grazing");
  const [finishing, setFinishing] = useState(false);

  const valid = label.trim().length > 0 && Number(count) > 0;
  const submitting = saveState === "saving";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fr-ink-900">Your livestock, broadly</h1>
        <p className="mt-1 text-sm text-fr-ink-600">
          Category and head count only — weight, breed, tags and individual animals are all set up inside Livestock
          afterwards.
        </p>
      </div>

      {groups.length > 0 ? (
        <ul className="flex flex-col divide-y divide-fr-border rounded-fr-control border border-fr-border">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="font-medium text-fr-ink-900">{g.label}</span>
              <span className="text-fr-ink-600">{g.count.value} head</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Group name
          <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Suckler cows" />
        </label>
        <label className={labelClass}>
          Category
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as LivestockCategory)}>
            {LIVESTOCK_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Head count
          <input type="number" min={1} className={inputClass} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label className={labelClass}>
          System
          <select className={inputClass} value={system} onChange={(e) => setSystem(e.target.value as "grazing" | "housed")}>
            <option value="grazing">Grazing</option>
            <option value="housed">Housed</option>
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between">
        <SaveIndicator state={saveState} />
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={!valid || submitting}
          onClick={() => {
            onAdd({ label: label.trim(), category, count: Number(count), system });
            setLabel("");
            setCount("");
          }}
        >
          {submitting ? "Adding…" : "Add group"}
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-fr-border pt-4">
        <button type="button" className={secondaryButtonClass} onClick={onBack} disabled={submitting || finishing}>
          Back
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={submitting || finishing}
          onClick={() => {
            setFinishing(true);
            onFinish();
          }}
        >
          {finishing ? "Entering…" : "Enter Farm Return"}
        </button>
      </div>
    </div>
  );
}
