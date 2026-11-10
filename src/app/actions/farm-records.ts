"use server";

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { insertFeedRecord, insertHealthEvent, insertPesticideRows, insertSprayOperator, insertTreatment, listSprayOperators, upsertBookConfirmation } from "@/lib/farm-data/farm-records";
import { loadRecordBooks } from "@/lib/farm-data/record-books";
import { addDays } from "@/domain/farm-calendar";
import {
  RECORD_BOOKS, nitratesReadiness, sblasReadiness, validateFeedRecord, validateHealthEvent, validatePesticideJob, validateSprayOperator, validateTreatment, withdrawalEndsOn,
  type FeedRecord, type FeedRecordInput, type HealthEvent, type MedicineTreatment, type MedicineTreatmentInput, type PesticideApplication, type PesticideJobInput, type RecordBook, type SprayOperator,
} from "@/domain/farm-records";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });

export async function saveFeedRecordAction(input: FeedRecordInput): Promise<Result<{ record: FeedRecord }>> {
  const problem = validateFeedRecord(input, today());
  if (problem) return { ok: false, error: problem };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save records." };
  if (input.evidencePath && !input.evidencePath.startsWith(`${farm.id}/`)) return { ok: false, error: "Something went wrong with the photo. Try again." };
  try {
    const record = await insertFeedRecord(farm.id, input);
    revalidatePath("/records");
    return { ok: true, record };
  } catch (err) {
    console.error("[Records] feed save failed", err);
    return { ok: false, error: "Couldn't save just now. Check your signal and try again." };
  }
}

export async function saveSprayOperatorAction(input: SprayOperator): Promise<Result<{ operator: SprayOperator }>> {
  const problem = validateSprayOperator(input);
  if (problem) return { ok: false, error: problem };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save records." };
  try {
    return { ok: true, operator: await insertSprayOperator(farm.id, input) };
  } catch (err) {
    console.error("[Records] operator save failed", err);
    return { ok: false, error: "Couldn't save just now. Try again." };
  }
}

export async function savePesticideJobAction(input: PesticideJobInput): Promise<Result<{ rows: PesticideApplication[] }>> {
  const problem = validatePesticideJob(input, today());
  if (problem) return { ok: false, error: problem };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save records." };
  if (input.evidencePath && !input.evidencePath.startsWith(`${farm.id}/`)) return { ok: false, error: "Something went wrong with the photo. Try again." };
  try {
    const [fields, operators] = await Promise.all([listFieldsForFarm(farm.id), listSprayOperators(farm.id)]);
    const byId = new Map(fields.map((f) => [f.id, f]));
    if (input.fields.some((f) => !byId.has(f.fieldId))) return { ok: false, error: "One of those fields isn't on this farm." };
    if (!operators.some((o) => o.id === input.operatorId)) return { ok: false, error: "Choose who sprayed it." };
    const rows = await insertPesticideRows(farm.id, input.fields.map((f) => ({
      id: globalThis.crypto.randomUUID(), sprayJobId: input.sprayJobId, appliedOn: input.appliedOn, fieldId: f.fieldId,
      lpisRef: byId.get(f.fieldId)?.lpisRef ?? null, cropSituation: input.cropSituation, productName: input.productName,
      pcsNumber: input.pcsNumber, areaHa: f.areaHa, rate: input.rate, rateUnit: input.rateUnit, waterLHa: input.waterLHa,
      reason: input.reason, operatorId: input.operatorId, evidencePath: input.evidencePath ?? null,
    })));
    revalidatePath("/records");
    return { ok: true, rows };
  } catch (err) {
    console.error("[Records] pesticide save failed", err);
    return { ok: false, error: "Couldn't save just now. Check your signal and try again." };
  }
}

export async function confirmBookNotUsedAction(book: RecordBook): Promise<Result<{ on: string }>> {
  if (!(RECORD_BOOKS as readonly string[]).includes(book)) return { ok: false, error: "Invalid request." };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save records." };
  try {
    const on = today();
    await upsertBookConfirmation(farm.id, book, on);
    revalidatePath("/records");
    return { ok: true, on };
  } catch (err) {
    console.error("[Records] confirmation failed", err);
    return { ok: false, error: "Couldn't save just now. Try again." };
  }
}

// ---------------------------------------------------------------- phase 2

export async function saveTreatmentAction(input: MedicineTreatmentInput): Promise<Result<{ treatment: MedicineTreatment }>> {
  const problem = validateTreatment(input, today());
  if (problem) return { ok: false, error: problem };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save records." };
  try {
    const treatment = await insertTreatment(farm.id, { ...input, withdrawalEndsOn: withdrawalEndsOn(input.treatedOn, input.withdrawalMeatDays) });
    revalidatePath("/records");
    return { ok: true, treatment };
  } catch (err) {
    console.error("[Records] treatment save failed", err);
    return { ok: false, error: "Couldn't save just now. Check your signal and try again." };
  }
}

export async function saveHealthEventAction(input: HealthEvent): Promise<Result<{ event: HealthEvent }>> {
  const problem = validateHealthEvent(input, today());
  if (problem) return { ok: false, error: problem };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save records." };
  if (input.evidencePath && !input.evidencePath.startsWith(`${farm.id}/`)) return { ok: false, error: "Something went wrong with the photo. Try again." };
  try {
    const event = await insertHealthEvent(farm.id, input);
    revalidatePath("/records");
    return { ok: true, event };
  } catch (err) {
    console.error("[Records] health save failed", err);
    return { ok: false, error: "Couldn't save just now. Check your signal and try again." };
  }
}

/** Readiness gaps for Plan's recommendations. */
export async function getRecordGapsAction(): Promise<Result<{ gaps: Array<{ key: string; label: string; detail: string; pack: "sblas" | "nitrates" }> }>> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Not signed in." };
  try {
    const t = today();
    const from = [addDays(t, -183), `${t.slice(0, 4)}-01-01`].sort()[0];
    const books = await loadRecordBooks(farm.id, from, t);
    const input = { today: t, dates: books.dates, notUsed: books.notUsed };
    const gaps = [
      ...sblasReadiness(input).items.filter((i) => i.status === "gap" && !(i.book && books.unavailable.includes(i.book))).map((i) => ({ key: i.key, label: i.label, detail: i.detail, pack: "sblas" as const })),
      ...nitratesReadiness(input).items.filter((i) => i.status === "gap" && !(i.book && books.unavailable.includes(i.book))).map((i) => ({ key: i.key, label: i.label, detail: i.detail, pack: "nitrates" as const })),
    ];
    return { ok: true, gaps };
  } catch (err) {
    console.error("[Records] gaps failed", err);
    return { ok: false, error: "unavailable" };
  }
}
