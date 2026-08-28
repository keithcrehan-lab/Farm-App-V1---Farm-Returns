"use server";

/**
 * Real Farm V1 Phase 4 — onboarding Server Actions.
 *
 * Called directly from `OnboardingWizard.tsx` (a Client Component) as
 * plain async functions, not `<form action>` bindings — this is a
 * multi-step wizard threading an id from one step into the next, which
 * `useActionState`'s single-state-slot model doesn't fit cleanly. Every
 * function still independently re-derives the current user via
 * `createClient().auth.getUser()` (through the `farm-data` modules it
 * calls) and relies on Postgres RLS as the real authorization boundary —
 * see the Data Security guide comment in `src/lib/farm-data/farms.ts`.
 *
 * Each function returns `{ error }` on failure instead of throwing, so a
 * bad write (or the documented "no live Supabase project" blocker) shows
 * the farmer an inline message rather than crashing the wizard.
 */
import { redirect } from "next/navigation";
import type { EnterpriseType, Field, FieldUse, Housing, LivestockCategory, LivestockGoal } from "@/domain/types";
import { createFarmForCurrentUser } from "@/lib/farm-data/farms";
import { createField } from "@/lib/farm-data/fields";
import { addSoilTestToField, type NewSoilTestInput } from "@/lib/farm-data/soil";
import { createLivestockGroup } from "@/lib/farm-data/livestock";
import { createHousing } from "@/lib/farm-data/housing";
import { upsertFinancialAssumption } from "@/lib/farm-data/financial-assumptions";

function errorResult(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : "Something went wrong. Please try again." };
}

export async function createFarmStep(input: {
  name: string;
  ownerName: string;
  county: string;
  centroid: [number, number];
  primaryEnterprises: EnterpriseType[];
}) {
  try {
    const farm = await createFarmForCurrentUser(input);
    return { farm };
  } catch (error) {
    return errorResult(error);
  }
}

export async function addFieldStep(
  farmId: string,
  input: { name: string; areaHa: number; centroid: [number, number]; plannedUse: FieldUse; farmerName: string },
) {
  try {
    const field: Field = await createField(farmId, {
      name: input.name,
      areaHa: input.areaHa,
      centroid: input.centroid,
      plannedUse: { value: input.plannedUse, status: "farmer_adjusted", source: input.farmerName },
      mappedSoil: {
        soilAssociation: "Pending mapping",
        dominantSeries: "Pending mapping",
        texture: "Unknown",
        drainage: "moderately_drained",
        coveragePct: 0,
        datasetVersion: "Not yet mapped",
        source: "Awaiting automatic mapping",
      },
      fertility: {
        pIndex: { value: 2, status: "estimated", source: "Farm Return assumption" },
        kIndex: { value: 2, status: "estimated", source: "Farm Return assumption" },
      },
    });
    return { field };
  } catch (error) {
    return errorResult(error);
  }
}

export async function addSoilTestStep(fieldId: string, input: NewSoilTestInput) {
  try {
    const field = await addSoilTestToField(fieldId, input);
    return { field };
  } catch (error) {
    return errorResult(error);
  }
}

export async function addLivestockStep(
  farmId: string,
  input: {
    label: string;
    category: LivestockCategory;
    count: number;
    avgWeightKg?: number;
    system: "grazing" | "housed";
    goal?: LivestockGoal;
    farmerName: string;
  },
) {
  try {
    const group = await createLivestockGroup(farmId, input);
    return { group };
  } catch (error) {
    return errorResult(error);
  }
}

export async function addHousingStep(
  farmId: string,
  input: {
    shedName: string;
    shedType: "slatted" | "straw_bedded" | "other";
    housingPeriod: { start: string; end: string };
    storageCapacityM3: number;
    storageFillPct: number;
  },
) {
  try {
    const housing: Housing = await createHousing(farmId, input);
    return { housing };
  } catch (error) {
    return errorResult(error);
  }
}

export async function setFinancialAssumptionStep(
  farmId: string,
  input: { key: Parameters<typeof upsertFinancialAssumption>[1]; value: number; unit: string; farmerAdjusted: boolean; farmerName: string; referenceSource: string },
) {
  try {
    const assumption = await upsertFinancialAssumption(
      farmId,
      input.key,
      input.value,
      input.unit,
      input.farmerAdjusted ? "farmer_adjusted" : "estimated",
      input.farmerAdjusted ? input.farmerName : input.referenceSource,
    );
    return { assumption };
  } catch (error) {
    return errorResult(error);
  }
}

export async function finishOnboarding(): Promise<never> {
  redirect("/dashboard");
}
