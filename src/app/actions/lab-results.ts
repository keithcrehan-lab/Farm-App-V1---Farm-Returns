"use server";

/**
 * Fertiliser Vertical V1, Checkpoint 2 — Server Actions for Laboratory
 * Evidence (`docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`'s `LabResult -> SoilInterpretation`
 * link).
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import {
  recordLabResultForCompositeSample,
  getLabStatusForCompositeSample,
  type RecordLabResultResult,
  type CompositeSampleLabStatus,
} from "@/orchestration/lab-result";

export interface SubmitLabResultActionInput {
  id: string;
  jobSessionId: string;
  laboratory: string;
  labReportRef: string;
  analysisDate: string;
  ph: number;
  pMgL: number;
  kMgL: number;
  mgMgL?: number;
  organicMatterPct?: number;
  limeRequirementTHa?: number;
  sourceDocumentRef?: string;
}

export async function submitLabResultAction(input: SubmitLabResultActionInput): Promise<RecordLabResultResult> {
  return recordLabResultForCompositeSample(input);
}

export async function getLabStatusForCompositeSampleAction(jobSessionId: string): Promise<CompositeSampleLabStatus> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("getLabStatusForCompositeSampleAction: no real farm for the current session");
  return getLabStatusForCompositeSample(farm.id, jobSessionId);
}
