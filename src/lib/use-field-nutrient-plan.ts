"use client";

import { useMemo } from "react";
import { mockSilagePlans } from "@/data/mock-farm";
import {
  useAllFieldsIncludingArchived,
  useFarm,
  useFields,
  useHousingList,
  useLivestockGroups,
  useNeatSlurryEvidenceRecords,
  useRegulatoryEvidenceFreshness,
  useSlurryAllocationRecords,
  useSlurryAllocations,
  useSlurryCompositionRecords,
  useSlurryOriginEvidenceRecords,
  useSlurryPlanFreshness,
  useSpreadableAreaRecords,
} from "@/store/farm-store";
import { buildFieldNutrientPlan, type FieldNutrientPlanResult } from "@/orchestration/fertiliser-plan/field-nutrient-plan";
import type { Field } from "@/domain/types";

/**
 * Farm Spatial V2 Phase 4 — one field's canonical nutrient plan from the
 * same farm-store records and the same shared assembly
 * (`buildFieldNutrientPlan`) the Nutrients screen uses, so the spatial
 * drawer and field nutrient plan can never disagree with it. `undefined`
 * when no field is given; computed only for that one field.
 */
export function useFieldNutrientPlan(field: Field | undefined): FieldNutrientPlanResult | undefined {
  const farm = useFarm();
  const fields = useFields();
  const allFields = useAllFieldsIncludingArchived();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const slurryCompositionRecords = useSlurryCompositionRecords();
  const housing = useHousingList();
  const slurryAllocationRecords = useSlurryAllocationRecords();
  const neatSlurryEvidenceRecords = useNeatSlurryEvidenceRecords();
  const spreadableAreaRecords = useSpreadableAreaRecords();
  const slurryOriginEvidenceRecords = useSlurryOriginEvidenceRecords();
  const regulatoryEvidenceFreshness = useRegulatoryEvidenceFreshness();
  const slurryPlanFreshness = useSlurryPlanFreshness();
  const regulatoryEvidenceStale = regulatoryEvidenceFreshness === "stale" || slurryPlanFreshness === "stale";

  return useMemo(() => {
    if (!field) return undefined;
    return buildFieldNutrientPlan({
      farm,
      field,
      fields,
      allFields,
      livestockGroups,
      slurryAllocations,
      slurryCompositionRecords,
      housing,
      slurryAllocationRecords,
      neatSlurryEvidenceRecords,
      spreadableAreaRecords,
      slurryOriginEvidenceRecords,
      regulatoryEvidenceStale,
      // The same silage source the Nutrients screen passes.
      silagePlan: mockSilagePlans.find((p) => p.fieldId === field.id),
      asOfDate: new Date().toISOString().slice(0, 10),
    });
  }, [
    field,
    farm,
    fields,
    allFields,
    livestockGroups,
    slurryAllocations,
    slurryCompositionRecords,
    housing,
    slurryAllocationRecords,
    neatSlurryEvidenceRecords,
    spreadableAreaRecords,
    slurryOriginEvidenceRecords,
    regulatoryEvidenceStale,
  ]);
}

/**
 * Every given field's canonical nutrient plan, from exactly the same assembly as
 * `useFieldNutrientPlan` — for the Farm map's Soil view, which colours each field by
 * what that plan says it needs. Pass an empty list to compute nothing (the view is off).
 */
export function useFieldNutrientPlans(forFields: readonly Field[]): ReadonlyMap<string, FieldNutrientPlanResult> {
  const farm = useFarm();
  const fields = useFields();
  const allFields = useAllFieldsIncludingArchived();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const slurryCompositionRecords = useSlurryCompositionRecords();
  const housing = useHousingList();
  const slurryAllocationRecords = useSlurryAllocationRecords();
  const neatSlurryEvidenceRecords = useNeatSlurryEvidenceRecords();
  const spreadableAreaRecords = useSpreadableAreaRecords();
  const slurryOriginEvidenceRecords = useSlurryOriginEvidenceRecords();
  const regulatoryEvidenceFreshness = useRegulatoryEvidenceFreshness();
  const slurryPlanFreshness = useSlurryPlanFreshness();
  const regulatoryEvidenceStale = regulatoryEvidenceFreshness === "stale" || slurryPlanFreshness === "stale";

  return useMemo(() => {
    const asOfDate = new Date().toISOString().slice(0, 10);
    const plans = new Map<string, FieldNutrientPlanResult>();
    for (const field of forFields) {
      plans.set(field.id, buildFieldNutrientPlan({
        farm,
        field,
        fields,
        allFields,
        livestockGroups,
        slurryAllocations,
        slurryCompositionRecords,
        housing,
        slurryAllocationRecords,
        neatSlurryEvidenceRecords,
        spreadableAreaRecords,
        slurryOriginEvidenceRecords,
        regulatoryEvidenceStale,
        silagePlan: mockSilagePlans.find((p) => p.fieldId === field.id),
        asOfDate,
      }));
    }
    return plans;
  }, [
    forFields,
    farm,
    fields,
    allFields,
    livestockGroups,
    slurryAllocations,
    slurryCompositionRecords,
    housing,
    slurryAllocationRecords,
    neatSlurryEvidenceRecords,
    spreadableAreaRecords,
    slurryOriginEvidenceRecords,
    regulatoryEvidenceStale,
  ]);
}
