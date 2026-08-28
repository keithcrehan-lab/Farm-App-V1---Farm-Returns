"use server";

/**
 * Real Mode Completion Phase 2/3 — onboarding Server Actions.
 *
 * Redesigned per the brief: Farm -> Livestock -> Enter Farm Return only.
 * Field/soil/housing/financial-assumption capture moved entirely out of
 * onboarding — those modules already have their own real creation
 * actions (`src/app/actions/farm.ts`'s `addFieldAction`/`addSoilTestAction`/
 * `addHousingAction`), so the equivalent onboarding-only actions this file
 * used to export (`addFieldStep`/`addSoilTestStep`/`addHousingStep`/
 * `setFinancialAssumptionStep`) were removed rather than left as unused
 * duplicates.
 *
 * **Back-button safety**: `createFarmStep` only ever creates. If the
 * wizard is showing the Farm step again after a farm already exists
 * (the farmer clicked Back), the client calls `updateFarmStep` instead —
 * an update, not a second insert. This is enforced by which action the
 * wizard calls (`OnboardingWizard.tsx`), not by a database constraint,
 * so it's documented here explicitly as the reason both exist.
 */
import { redirect } from "next/navigation";
import type { EnterpriseType, LivestockCategory } from "@/domain/types";
import { createFarmForCurrentUser, markOnboardingComplete, updateFarmProfileForCurrentUser } from "@/lib/farm-data/farms";
import { createLivestockGroup } from "@/lib/farm-data/livestock";

function errorResult(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : "Something went wrong. Please try again." };
}

export interface FarmStepInput {
  name: string;
  ownerName: string;
  county: string;
  centroid: [number, number];
  primaryEnterprises: EnterpriseType[];
}

export async function createFarmStep(input: FarmStepInput) {
  try {
    const farm = await createFarmForCurrentUser(input);
    return { farm };
  } catch (error) {
    return errorResult(error);
  }
}

/** Same shape as `createFarmStep` — called instead of it when the wizard
 * revisits the Farm step for a farm that already exists (see the Back-
 * button-safety note above). */
export async function updateFarmStep(farmId: string, input: FarmStepInput) {
  try {
    const farm = await updateFarmProfileForCurrentUser(farmId, {
      name: input.name,
      ownerName: input.ownerName,
      county: input.county,
    });
    return { farm };
  } catch (error) {
    return errorResult(error);
  }
}

/**
 * Deliberately narrow (Phase 2's "onboarding livestock capture should be
 * deliberately broad" — no weight, tag, breed, age, goal, housing, feed
 * or breeding fields here; those belong inside the Livestock module,
 * where `AddLivestockGroupInput` already supports them). */
export async function addLivestockStep(
  farmId: string,
  input: {
    label: string;
    category: LivestockCategory;
    count: number;
    system: "grazing" | "housed";
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

export async function finishOnboarding(farmId: string): Promise<never> {
  await markOnboardingComplete(farmId);
  redirect("/dashboard");
}
