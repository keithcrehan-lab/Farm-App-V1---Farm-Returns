"use client";

/**
 * Real Farm V1 Phase 4 — the onboarding wizard (brief's Steps 1/2+6/3/4/5/7;
 * "Field use" is folded into the Fields step rather than asked twice —
 * `Field.plannedUse` is already the one property both brief steps describe,
 * and CLAUDE.md's "enter once" rule means a real second field-use question
 * would be a duplicate capture of the same fact, not a distinct step).
 *
 * Local step state, not URL-per-step routing — each step's data is
 * persisted to Supabase as soon as it's submitted (via the Server Actions
 * in `src/app/actions/onboarding.ts`), so leaving partway through doesn't
 * lose already-entered data; the wizard only tracks *which step to show
 * next* and the ids it needs to keep threading forward (farmId, the
 * fields just created, ...).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import type {
  EnterpriseType,
  Farm,
  Field,
  FieldUse,
  Housing,
  LivestockCategory,
  LivestockGoal,
  LivestockGroup,
} from "@/domain/types";
import { CSO_COMPOUND_18_6_12, latestPoint } from "@/domain/market";
import { IRISH_COUNTIES } from "@/lib/irish-counties";
import {
  addFieldStep,
  addHousingStep,
  addLivestockStep,
  addSoilTestStep,
  createFarmStep,
  finishOnboarding,
  setFinancialAssumptionStep,
} from "@/app/actions/onboarding";

const STEPS = ["Farm", "Fields", "Soil", "Livestock", "Housing", "Financials"] as const;

const ENTERPRISE_OPTIONS: { value: EnterpriseType; label: string }[] = [
  { value: "suckler_beef", label: "Suckler beef" },
  { value: "dairy_beef", label: "Dairy beef" },
  { value: "dairy", label: "Dairy" },
  { value: "sheep", label: "Sheep" },
  { value: "tillage", label: "Tillage" },
  { value: "mixed", label: "Mixed" },
];

const FIELD_USE_OPTIONS: { value: FieldUse; label: string }[] = [
  { value: "grazing", label: "Grazing" },
  { value: "silage_1st_cut", label: "Silage — 1st cut" },
  { value: "silage_2nd_cut", label: "Silage — 2nd cut" },
  { value: "silage_3rd_cut", label: "Silage — 3rd cut" },
  { value: "mixed", label: "Mixed" },
  { value: "tillage", label: "Tillage" },
  { value: "other", label: "Other / not yet decided" },
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

const LIVESTOCK_GOAL_OPTIONS: { value: LivestockGoal; label: string }[] = [
  { value: "maintain", label: "Maintain" },
  { value: "grow", label: "Grow" },
  { value: "breed", label: "Breed" },
  { value: "sell_store", label: "Sell as store" },
  { value: "finish_slaughter", label: "Finish to slaughter" },
];

const inputClass = "rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2 text-sm text-fr-ink-900";
const labelClass = "flex flex-col gap-1 text-xs text-fr-ink-600";
const primaryButtonClass =
  "flex items-center justify-center gap-1.5 rounded-fr-control bg-fr-green-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:bg-fr-green-700/40";
const secondaryButtonClass =
  "flex items-center justify-center gap-1.5 rounded-fr-control border border-fr-border px-5 py-2.5 text-sm font-medium text-fr-ink-900 transition-colors hover:bg-fr-surface-alt disabled:opacity-40";

export function OnboardingWizard({ suggestedOwnerName }: { suggestedOwnerName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [farm, setFarm] = useState<Farm | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [livestockGroups, setLivestockGroups] = useState<LivestockGroup[]>([]);
  const [housing, setHousing] = useState<Housing[]>([]);

  function goNext() {
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleFinish() {
    setSubmitting(true);
    await finishOnboarding();
    router.push("/dashboard");
  }

  return (
    <div className="rounded-fr-card border border-fr-border bg-fr-surface p-6 shadow-fr-card">
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Onboarding steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium " +
              (i === step
                ? "bg-fr-green-700 text-white"
                : i < step
                  ? "bg-fr-good-bg text-fr-good"
                  : "bg-fr-surface-alt text-fr-ink-600")
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
          suggestedOwnerName={suggestedOwnerName}
          submitting={submitting}
          onSubmit={async (input) => {
            setSubmitting(true);
            const result = await createFarmStep(input);
            setSubmitting(false);
            if ("error" in result) return setError(result.error);
            setFarm(result.farm);
            goNext();
          }}
        />
      ) : null}

      {step === 1 && farm ? (
        <FieldsStep
          farmId={farm.id}
          farmerName={farm.ownerName}
          farmCentroid={farm.location.centroid}
          fields={fields}
          submitting={submitting}
          onAdd={async (input) => {
            setSubmitting(true);
            const result = await addFieldStep(farm.id, { ...input, farmerName: farm.ownerName });
            setSubmitting(false);
            if ("error" in result) return setError(result.error);
            setFields((f) => [...f, result.field]);
          }}
          onNext={goNext}
          onBack={goBack}
        />
      ) : null}

      {step === 2 && farm ? (
        <SoilStep
          fields={fields}
          submitting={submitting}
          onAdd={async (fieldId, input) => {
            setSubmitting(true);
            const result = await addSoilTestStep(fieldId, input);
            setSubmitting(false);
            if ("error" in result) return setError(result.error);
            setFields((fs) => fs.map((f) => (f.id === fieldId ? result.field : f)));
          }}
          onNext={goNext}
          onBack={goBack}
        />
      ) : null}

      {step === 3 && farm ? (
        <LivestockStep
          farmId={farm.id}
          farmerName={farm.ownerName}
          groups={livestockGroups}
          submitting={submitting}
          onAdd={async (input) => {
            setSubmitting(true);
            const result = await addLivestockStep(farm.id, { ...input, farmerName: farm.ownerName });
            setSubmitting(false);
            if ("error" in result) return setError(result.error);
            setLivestockGroups((g) => [...g, result.group]);
          }}
          onNext={goNext}
          onBack={goBack}
        />
      ) : null}

      {step === 4 && farm ? (
        <HousingStep
          farmId={farm.id}
          housing={housing}
          submitting={submitting}
          onAdd={async (input) => {
            setSubmitting(true);
            const result = await addHousingStep(farm.id, input);
            setSubmitting(false);
            if ("error" in result) return setError(result.error);
            setHousing((h) => [...h, result.housing]);
          }}
          onNext={goNext}
          onBack={goBack}
        />
      ) : null}

      {step === 5 && farm ? (
        <FinancialsStep
          farmId={farm.id}
          farmerName={farm.ownerName}
          submitting={submitting}
          onSave={async (entries) => {
            setSubmitting(true);
            for (const entry of entries) {
              const result = await setFinancialAssumptionStep(farm.id, entry);
              if ("error" in result) {
                setSubmitting(false);
                return setError(result.error);
              }
            }
            await handleFinish();
          }}
          onBack={goBack}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Farm
// ---------------------------------------------------------------------------

function FarmStep({
  suggestedOwnerName,
  submitting,
  onSubmit,
}: {
  suggestedOwnerName: string;
  submitting: boolean;
  onSubmit: (input: {
    name: string;
    ownerName: string;
    county: string;
    centroid: [number, number];
    primaryEnterprises: EnterpriseType[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState(suggestedOwnerName);
  const [county, setCounty] = useState(IRISH_COUNTIES[3].name); // Cork, matching the app's existing demo farm
  const [enterprise, setEnterprise] = useState<EnterpriseType>("suckler_beef");

  const valid = name.trim().length > 0 && ownerName.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fr-ink-900">Let&apos;s set up your farm</h1>
        <p className="mt-1 text-sm text-fr-ink-600">Just the basics — you can refine everything later.</p>
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
          Farm location starts at the county centre (approximate) — map your fields next for a real position.
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
      <div className="flex justify-end">
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
// Step 2 — Fields (+ field use)
// ---------------------------------------------------------------------------

function FieldsStep({
  farmCentroid,
  fields,
  submitting,
  onAdd,
  onNext,
  onBack,
}: {
  farmId: string;
  farmerName: string;
  farmCentroid: [number, number];
  fields: Field[];
  submitting: boolean;
  onAdd: (input: { name: string; areaHa: number; centroid: [number, number]; plannedUse: FieldUse }) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [areaHa, setAreaHa] = useState("");
  const [plannedUse, setPlannedUse] = useState<FieldUse>("grazing");

  const valid = name.trim().length > 0 && Number(areaHa) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fr-ink-900">Add your fields</h1>
        <p className="mt-1 text-sm text-fr-ink-600">
          Name, area and what each field is mainly for. Draw real boundaries on the Fields screen after onboarding — this
          just gets you started.
        </p>
      </div>

      {fields.length > 0 ? (
        <ul className="flex flex-col divide-y divide-fr-border rounded-fr-control border border-fr-border">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="font-medium text-fr-ink-900">{f.name}</span>
              <span className="text-fr-ink-600">
                {f.areaHa} ha · {FIELD_USE_OPTIONS.find((o) => o.value === f.plannedUse.value)?.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Field name
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home Field" />
        </label>
        <label className={labelClass}>
          Area (ha)
          <input
            type="number"
            min={0.1}
            step={0.1}
            className={inputClass}
            value={areaHa}
            onChange={(e) => setAreaHa(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Main use
          <select className={inputClass} value={plannedUse} onChange={(e) => setPlannedUse(e.target.value as FieldUse)}>
            {FIELD_USE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={!valid || submitting}
          onClick={() => {
            // Placed at the farm centroid, same "no live geocoding yet"
            // fallback farm-store.tsx's addField already uses — a real
            // per-field position arrives once the farmer draws a boundary
            // on the Fields screen.
            onAdd({ name: name.trim(), areaHa: Number(areaHa), centroid: farmCentroid, plannedUse });
            setName("");
            setAreaHa("");
            setPlannedUse("grazing");
          }}
        >
          {submitting ? "Adding…" : "Add field"}
        </button>
      </div>

      <StepFooter onBack={onBack} onNext={onNext} nextDisabled={submitting} skippable />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Soil (optional, per field)
// ---------------------------------------------------------------------------

function SoilStep({
  fields,
  submitting,
  onAdd,
  onNext,
  onBack,
}: {
  fields: Field[];
  submitting: boolean;
  onAdd: (
    fieldId: string,
    input: { sampleDate: string; laboratory: string; sampleRef: string; p: number; k: number; pH: number },
  ) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [sampleDate, setSampleDate] = useState("");
  const [laboratory, setLaboratory] = useState("");
  const [sampleRef, setSampleRef] = useState("");
  const [p, setP] = useState("");
  const [k, setK] = useState("");
  const [pH, setPH] = useState("");

  if (fields.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fr-ink-600">No fields yet — add real soil results once you&apos;ve added fields.</p>
        <StepFooter onBack={onBack} onNext={onNext} skippable />
      </div>
    );
  }

  const valid = sampleDate && laboratory.trim() && p !== "" && k !== "" && pH !== "";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fr-ink-900">Real soil results (optional)</h1>
        <p className="mt-1 text-sm text-fr-ink-600">
          Add a lab test where you have one. Skip fields you don&apos;t — a missing test is shown as missing, not guessed.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {fields.map((f) => {
          const hasVerified = Boolean(f.fertility.verifiedTest);
          const open = openFieldId === f.id;
          return (
            <li key={f.id} className="rounded-fr-control border border-fr-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fr-ink-900">{f.name}</span>
                {hasVerified ? (
                  <span className="text-xs font-medium text-fr-good">Lab test added</span>
                ) : (
                  <button
                    type="button"
                    className="text-xs font-semibold text-fr-green-700"
                    onClick={() => setOpenFieldId(open ? null : f.id)}
                  >
                    {open ? "Cancel" : "Add soil test"}
                  </button>
                )}
              </div>
              {open ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <label className={labelClass}>
                    Sample date
                    <input type="date" className={inputClass} value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} />
                  </label>
                  <label className={labelClass}>
                    Laboratory
                    <input className={inputClass} value={laboratory} onChange={(e) => setLaboratory(e.target.value)} />
                  </label>
                  <label className={labelClass}>
                    Sample ref
                    <input className={inputClass} value={sampleRef} onChange={(e) => setSampleRef(e.target.value)} />
                  </label>
                  <label className={labelClass}>
                    P (mg/L)
                    <input type="number" step={0.1} className={inputClass} value={p} onChange={(e) => setP(e.target.value)} />
                  </label>
                  <label className={labelClass}>
                    K (mg/L)
                    <input type="number" step={0.1} className={inputClass} value={k} onChange={(e) => setK(e.target.value)} />
                  </label>
                  <label className={labelClass}>
                    pH
                    <input type="number" step={0.1} className={inputClass} value={pH} onChange={(e) => setPH(e.target.value)} />
                  </label>
                  <div className="col-span-2 sm:col-span-3">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={!valid || submitting}
                      onClick={() => {
                        onAdd(f.id, {
                          sampleDate,
                          laboratory: laboratory.trim(),
                          sampleRef: sampleRef.trim(),
                          p: Number(p),
                          k: Number(k),
                          pH: Number(pH),
                        });
                        setOpenFieldId(null);
                        setSampleDate("");
                        setLaboratory("");
                        setSampleRef("");
                        setP("");
                        setK("");
                        setPH("");
                      }}
                    >
                      {submitting ? "Saving…" : "Save soil test"}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <StepFooter onBack={onBack} onNext={onNext} nextDisabled={submitting} skippable />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Livestock
// ---------------------------------------------------------------------------

function LivestockStep({
  groups,
  submitting,
  onAdd,
  onNext,
  onBack,
}: {
  farmId: string;
  farmerName: string;
  groups: LivestockGroup[];
  submitting: boolean;
  onAdd: (input: {
    label: string;
    category: LivestockCategory;
    count: number;
    avgWeightKg?: number;
    system: "grazing" | "housed";
    goal?: LivestockGoal;
  }) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<LivestockCategory>("suckler_cow");
  const [count, setCount] = useState("");
  const [avgWeightKg, setAvgWeightKg] = useState("");
  const [system, setSystem] = useState<"grazing" | "housed">("grazing");
  const [goal, setGoal] = useState<LivestockGoal | "">("");

  const valid = label.trim().length > 0 && Number(count) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fr-ink-900">Your livestock</h1>
        <p className="mt-1 text-sm text-fr-ink-600">Group by category — individual animal tracking isn&apos;t needed here.</p>
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
          <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Spring weanlings" />
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
          Avg weight (kg, optional)
          <input type="number" min={0} className={inputClass} value={avgWeightKg} onChange={(e) => setAvgWeightKg(e.target.value)} />
        </label>
        <label className={labelClass}>
          System
          <select className={inputClass} value={system} onChange={(e) => setSystem(e.target.value as "grazing" | "housed")}>
            <option value="grazing">Grazing</option>
            <option value="housed">Housed</option>
          </select>
        </label>
        <label className={labelClass}>
          Goal (optional)
          <select className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value as LivestockGoal | "")}>
            <option value="">Not set</option>
            {LIVESTOCK_GOAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={!valid || submitting}
          onClick={() => {
            onAdd({
              label: label.trim(),
              category,
              count: Number(count),
              ...(avgWeightKg ? { avgWeightKg: Number(avgWeightKg) } : {}),
              system,
              ...(goal ? { goal } : {}),
            });
            setLabel("");
            setCount("");
            setAvgWeightKg("");
            setGoal("");
          }}
        >
          {submitting ? "Adding…" : "Add group"}
        </button>
      </div>

      <StepFooter onBack={onBack} onNext={onNext} nextDisabled={submitting} skippable />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Housing
// ---------------------------------------------------------------------------

function HousingStep({
  housing,
  submitting,
  onAdd,
  onNext,
  onBack,
}: {
  farmId: string;
  housing: Housing[];
  submitting: boolean;
  onAdd: (input: {
    shedName: string;
    shedType: "slatted" | "straw_bedded" | "other";
    housingPeriod: { start: string; end: string };
    storageCapacityM3: number;
    storageFillPct: number;
  }) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [shedName, setShedName] = useState("");
  const [shedType, setShedType] = useState<"slatted" | "straw_bedded" | "other">("slatted");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("");
  const [fillPct, setFillPct] = useState("");

  const valid = shedName.trim().length > 0 && start && end && Number(capacity) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fr-ink-900">Winter housing</h1>
        <p className="mt-1 text-sm text-fr-ink-600">Link livestock groups to sheds later on the Housing screen.</p>
      </div>

      {housing.length > 0 ? (
        <ul className="flex flex-col divide-y divide-fr-border rounded-fr-control border border-fr-border">
          {housing.map((h) => (
            <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="font-medium text-fr-ink-900">{h.shedName}</span>
              <span className="text-fr-ink-600">{h.storageCapacityM3} m³</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Shed name
          <input className={inputClass} value={shedName} onChange={(e) => setShedName(e.target.value)} placeholder="e.g. Shed 1" />
        </label>
        <label className={labelClass}>
          Type
          <select className={inputClass} value={shedType} onChange={(e) => setShedType(e.target.value as typeof shedType)}>
            <option value="slatted">Slatted</option>
            <option value="straw_bedded">Straw bedded</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={labelClass}>
          Housing period start
          <input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className={labelClass}>
          Housing period end
          <input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className={labelClass}>
          Slurry storage capacity (m³)
          <input type="number" min={0} className={inputClass} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </label>
        <label className={labelClass}>
          Current storage fill (%)
          <input type="number" min={0} max={100} className={inputClass} value={fillPct} onChange={(e) => setFillPct(e.target.value)} />
        </label>
      </div>
      <div>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={!valid || submitting}
          onClick={() => {
            onAdd({
              shedName: shedName.trim(),
              shedType,
              housingPeriod: { start, end },
              storageCapacityM3: Number(capacity),
              storageFillPct: fillPct ? Number(fillPct) : 0,
            });
            setShedName("");
            setStart("");
            setEnd("");
            setCapacity("");
            setFillPct("");
          }}
        >
          {submitting ? "Adding…" : "Add shed"}
        </button>
      </div>

      <StepFooter onBack={onBack} onNext={onNext} nextDisabled={submitting} skippable />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Financial assumptions
// ---------------------------------------------------------------------------

interface AssumptionField {
  key: "fertiliser_price_eur_per_t" | "concentrate_feed_price_eur_per_t" | "contractor_silage_cost_eur_per_ha" | "cattle_sale_price_eur_per_kg_carcass" | "fuel_price_eur_per_l";
  label: string;
  unit: string;
  /** Only set where this codebase has a real sourced series to default
   * from (src/domain/market.ts) — the brief's "never invent a production
   * number" rule means the rest start genuinely blank, not guessed. */
  reference?: { value: number; source: string };
}

const ASSUMPTION_FIELDS: AssumptionField[] = [
  {
    key: "fertiliser_price_eur_per_t",
    label: "Fertiliser price (18-6-12 compound)",
    unit: "€/t",
    reference: (() => {
      const latest = latestPoint(CSO_COMPOUND_18_6_12);
      return { value: latest.value, source: `CSO reference, ${latest.month}` };
    })(),
  },
  { key: "concentrate_feed_price_eur_per_t", label: "Concentrate feed price", unit: "€/t" },
  { key: "contractor_silage_cost_eur_per_ha", label: "Contractor silage cost", unit: "€/ha" },
  { key: "cattle_sale_price_eur_per_kg_carcass", label: "Cattle sale price", unit: "€/kg carcass" },
  { key: "fuel_price_eur_per_l", label: "Fuel price", unit: "€/l" },
];

function FinancialsStep({
  farmerName,
  submitting,
  onSave,
  onBack,
}: {
  farmId: string;
  farmerName: string;
  submitting: boolean;
  onSave: (
    entries: {
      key: AssumptionField["key"];
      value: number;
      unit: string;
      farmerAdjusted: boolean;
      farmerName: string;
      referenceSource: string;
    }[],
  ) => void;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(ASSUMPTION_FIELDS.map((f) => [f.key, f.reference ? String(f.reference.value) : ""])),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fr-ink-900">Financial assumptions</h1>
        <p className="mt-1 text-sm text-fr-ink-600">
          Accept the public reference price where shown, or enter your own real cost. Leave a field blank if you don&apos;t
          know it yet — it stays marked as missing rather than guessed.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {ASSUMPTION_FIELDS.map((f) => (
          <label key={f.key} className={labelClass}>
            {f.label} ({f.unit})
            <input
              type="number"
              step={0.01}
              className={inputClass}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            <span className="text-fr-ink-600/70">
              {f.reference ? `Prefilled from ${f.reference.source} — edit to use your own price.` : "No public reference price available yet."}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-fr-border pt-4">
        <button type="button" className={secondaryButtonClass} onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={submitting}
          onClick={() => {
            const entries = ASSUMPTION_FIELDS.filter((f) => values[f.key] !== "").map((f) => ({
              key: f.key,
              value: Number(values[f.key]),
              unit: f.unit,
              farmerAdjusted: !f.reference || Number(values[f.key]) !== f.reference.value,
              farmerName,
              referenceSource: f.reference?.source ?? "Farm Return assumption",
            }));
            onSave(entries);
          }}
        >
          {submitting ? "Finishing…" : "Finish setup"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared step footer
// ---------------------------------------------------------------------------

function StepFooter({
  onBack,
  onNext,
  nextDisabled,
  skippable,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  skippable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-fr-border pt-4">
      <button type="button" className={secondaryButtonClass} onClick={onBack}>
        Back
      </button>
      <button type="button" className={primaryButtonClass} disabled={nextDisabled} onClick={onNext}>
        {skippable ? "Continue" : "Next"}
      </button>
    </div>
  );
}
