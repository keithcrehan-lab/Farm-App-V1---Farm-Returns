/**
 * Farm records: the record books Bord Bia SBLAS, the Nitrates rules and the
 * pesticide rules ask for, the farm diary, and audit readiness.
 *
 * Feed and pesticide records are entered here; every other book is filled
 * from what the farmer already does elsewhere in the app (medicines,
 * cattle moves, slurry spreading, grass walks, finished Plan jobs). Pure
 * functions: dates are YYYY-MM-DD and `today` is always passed in.
 */
import { addDays, daysBetween, isIsoDate } from "./farm-calendar";

export const FEED_TYPES = ["concentrate", "straight", "mineral", "forage", "other"] as const;
export type FeedType = (typeof FEED_TYPES)[number];
export const FEED_TYPE_LABEL: Record<FeedType, string> = {
  concentrate: "Concentrate (nuts, ration)", straight: "Straight (barley, maize, soya)", mineral: "Minerals", forage: "Forage (hay, silage, straw)", other: "Other",
};
export const FEED_UNITS = ["tonnes", "kg", "bags", "bales", "litres"] as const;
export type FeedUnit = (typeof FEED_UNITS)[number];
export const HOME_GROWN = "Grown on this farm";

export const RATE_UNITS = ["l_ha", "ml_ha", "kg_ha", "g_ha"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];
export const RATE_UNIT_LABEL: Record<RateUnit, string> = { l_ha: "L/ha", ml_ha: "ml/ha", kg_ha: "kg/ha", g_ha: "g/ha" };
export const SPRAY_REASONS = ["Docks", "Rushes", "Thistles", "Buttercup", "Nettles", "Weeds before reseeding", "Weeds after reseeding", "Other"] as const;
export const CROP_SITUATIONS = ["Grassland", "Reseed", "Yard or farm buildings", "Other"] as const;
export const DOSE_UNITS = ["ml", "l", "g", "tablet", "dose"] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];
export const HEALTH_KINDS = ["death", "illness", "injury", "other"] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];
export const HEALTH_KIND_LABEL: Record<HealthKind, string> = { death: "Death", illness: "Illness", injury: "Injury or lameness", other: "Other health issue" };

/** Animal remedy usage: who got what, and when the meat withdrawal ends. */
export interface MedicineTreatment {
  id: string;
  treatedOn: string;
  medicinePurchaseId: string | null;
  productName: string;
  batchNumber: string | null;
  livestockGroupId: string | null;
  animalTags: string | null;
  animalCount: number;
  dose: number;
  doseUnit: DoseUnit;
  withdrawalMeatDays: number;
  withdrawalEndsOn: string;
  administeredBy: string;
  prescribedBy: string | null;
  reason: string | null;
}
export type MedicineTreatmentInput = Omit<MedicineTreatment, "withdrawalEndsOn">;

/** The first day meat from a treated animal can enter the food chain. */
export function withdrawalEndsOn(treatedOn: string, days: number): string {
  return addDays(treatedOn, days);
}

export interface HealthEvent {
  id: string;
  occurredOn: string;
  kind: HealthKind;
  animalTag: string | null;
  livestockGroupId: string | null;
  animalCount: number;
  description: string;
  vetSeen: boolean;
  disposal: "knackery" | "other" | null;
  disposalRef: string | null;
  evidencePath: string | null;
}

export interface FeedRecord {
  id: string;
  receivedOn: string;
  supplierName: string;
  supplierAddress: string | null;
  product: string;
  feedType: FeedType;
  batchNumber: string | null;
  quantity: number;
  unit: FeedUnit;
  livestockGroupId: string | null;
  homeGrown: boolean;
  notes: string | null;
  /** Docket photo in the record-evidence store. */
  evidencePath?: string | null;
}
export type FeedRecordInput = Omit<FeedRecord, "homeGrown"> & { homeGrown?: boolean };

export interface SprayOperator {
  id: string;
  name: string;
  puNumber: string;
  isContractor: boolean;
  address: string | null;
  sprayerCert: string | null;
}
export type SprayOperatorInput = SprayOperator;

export interface PesticideApplication {
  id: string;
  sprayJobId: string;
  appliedOn: string;
  fieldId: string;
  fieldName?: string;
  lpisRef: string | null;
  cropSituation: string;
  productName: string;
  pcsNumber: string;
  areaHa: number;
  rate: number;
  rateUnit: RateUnit;
  waterLHa: number | null;
  reason: string;
  operatorId: string;
  evidencePath?: string | null;
}

/** One spray job: the same product on one or more fields on one day. */
export interface PesticideJobInput {
  sprayJobId: string;
  appliedOn: string;
  fields: Array<{ fieldId: string; areaHa: number }>;
  cropSituation: string;
  productName: string;
  pcsNumber: string;
  rate: number;
  rateUnit: RateUnit;
  waterLHa: number | null;
  reason: string;
  operatorId: string;
  /** Label photo, kept with every field's record. */
  evidencePath?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
const optText = (v: unknown, max: number) => v === null || v === undefined || (typeof v === "string" && v.length <= max);
const positive = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max;

/** Farmer-readable problem, or null when the feed record can be saved. */
export function validateFeedRecord(r: FeedRecordInput, today: string): string | null {
  if (!r || !UUID.test(String(r.id))) return "Something went wrong. Try again.";
  if (!isIsoDate(r.receivedOn)) return "Add the date it arrived.";
  if (r.receivedOn > today) return "The date can't be in the future.";
  if (!text(r.supplierName, 120)) return "Add who supplied it.";
  if (!optText(r.supplierAddress, 300)) return "The supplier address is too long.";
  if (!r.homeGrown && r.supplierName.trim() !== HOME_GROWN && !text(r.supplierAddress, 300)) return "Add the supplier's address. Bord Bia asks for it.";
  if (!text(r.product, 120)) return "Add what the feed is.";
  if (!(FEED_TYPES as readonly string[]).includes(r.feedType)) return "Choose the type of feed.";
  if (!optText(r.batchNumber, 60)) return "The batch number is too long.";
  if (!positive(r.quantity, 100000)) return "Add how much arrived.";
  if (!(FEED_UNITS as readonly string[]).includes(r.unit)) return "Choose a unit.";
  if (r.livestockGroupId !== null && !UUID.test(String(r.livestockGroupId))) return "Check the group.";
  if (!optText(r.notes, 1000)) return "Notes are too long.";
  if (!validEvidencePath(r.evidencePath)) return "Something went wrong with the photo. Try again.";
  return null;
}

export function validateSprayOperator(o: SprayOperatorInput): string | null {
  if (!o || !UUID.test(String(o.id))) return "Something went wrong. Try again.";
  if (!text(o.name, 80)) return "Add the person's or contractor's name.";
  if (!text(o.puNumber, 30)) return "Add their professional user (PU) number.";
  if (o.isContractor && !text(o.address, 300)) return "Add the contractor's address. The Department asks for it.";
  if (!optText(o.address, 300) || !optText(o.sprayerCert, 40)) return "Some details are too long.";
  return null;
}

export function validatePesticideJob(j: PesticideJobInput, today: string): string | null {
  if (!j || !UUID.test(String(j.sprayJobId))) return "Something went wrong. Try again.";
  if (!isIsoDate(j.appliedOn)) return "Add the date it was sprayed.";
  if (j.appliedOn > today) return "The date can't be in the future.";
  if (!Array.isArray(j.fields) || !j.fields.length) return "Pick at least one field.";
  if (j.fields.length > 100) return "That's too many fields for one record.";
  for (const f of j.fields) {
    if (!UUID.test(String(f.fieldId))) return "Check the fields.";
    if (!positive(f.areaHa, 1000)) return "Check the area sprayed for each field.";
  }
  if (new Set(j.fields.map((f) => f.fieldId)).size !== j.fields.length) return "A field is listed twice.";
  if (!text(j.cropSituation, 60)) return "Choose the crop or situation.";
  if (!text(j.productName, 120)) return "Add the product name from the container.";
  if (!/^\d{3,6}$/.test(String(j.pcsNumber).trim())) return "Add the PCS number from the container label (numbers only).";
  if (!positive(j.rate, 100000)) return "Add the rate applied.";
  if (!(RATE_UNITS as readonly string[]).includes(j.rateUnit)) return "Choose the rate unit.";
  if (j.waterLHa !== null && !positive(j.waterLHa, 2000)) return "Check the water volume.";
  if (!text(j.reason, 120)) return "Add why it was sprayed.";
  if (!UUID.test(String(j.operatorId))) return "Choose who sprayed it.";
  if (!validEvidencePath(j.evidencePath)) return "Something went wrong with the photo. Try again.";
  return null;
}

const EVIDENCE = /^[0-9a-f-]{36}\/(feed|spray|health)\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;
export const validEvidencePath = (p: unknown) => p === null || p === undefined || (typeof p === "string" && EVIDENCE.test(p));

export function validateTreatment(t: MedicineTreatmentInput, today: string): string | null {
  if (!t || !UUID.test(String(t.id))) return "Something went wrong. Try again.";
  if (!isIsoDate(t.treatedOn)) return "Add the date it was given.";
  if (t.treatedOn > today) return "The date can't be in the future.";
  if (t.medicinePurchaseId !== null && !UUID.test(String(t.medicinePurchaseId))) return "Check the medicine.";
  if (!text(t.productName, 160)) return "Choose or name the medicine.";
  if (!optText(t.batchNumber, 60)) return "The batch number is too long.";
  if (t.livestockGroupId !== null && !UUID.test(String(t.livestockGroupId))) return "Check the group.";
  if (!t.livestockGroupId && !text(t.animalTags, 2000)) return "Pick the group or add the tag numbers treated.";
  if (!optText(t.animalTags, 2000)) return "Too many tag numbers for one record.";
  if (!Number.isInteger(t.animalCount) || t.animalCount < 1 || t.animalCount > 10000) return "Add how many animals were treated.";
  if (!positive(t.dose, 100000)) return "Add the dose given to each animal.";
  if (!(DOSE_UNITS as readonly string[]).includes(t.doseUnit)) return "Choose the dose unit.";
  if (!Number.isInteger(t.withdrawalMeatDays) || t.withdrawalMeatDays < 0 || t.withdrawalMeatDays > 1000) return "Add the meat withdrawal period in days, from the label (0 if none).";
  if (!text(t.administeredBy, 80)) return "Add who gave it.";
  if (!optText(t.prescribedBy, 120) || !optText(t.reason, 300)) return "Some details are too long.";
  return null;
}

export function validateHealthEvent(h: HealthEvent, today: string): string | null {
  if (!h || !UUID.test(String(h.id))) return "Something went wrong. Try again.";
  if (!isIsoDate(h.occurredOn)) return "Add the date.";
  if (h.occurredOn > today) return "The date can't be in the future.";
  if (!(HEALTH_KINDS as readonly string[]).includes(h.kind)) return "Choose what happened.";
  if (!optText(h.animalTag, 40)) return "The tag number is too long.";
  if (h.livestockGroupId !== null && !UUID.test(String(h.livestockGroupId))) return "Check the group.";
  if (!Number.isInteger(h.animalCount) || h.animalCount < 1 || h.animalCount > 10000) return "Add how many animals.";
  if (!text(h.description, 1000)) return "Add a short description.";
  if (h.disposal !== null && h.disposal !== "knackery" && h.disposal !== "other") return "Check how the carcass was disposed of.";
  if (!optText(h.disposalRef, 80)) return "The docket number is too long.";
  if (!validEvidencePath(h.evidencePath)) return "Something went wrong with the photo. Try again.";
  return null;
}

// ---------------------------------------------------------------- books

export const RECORD_BOOKS = ["medicines", "treatments", "movements", "feed", "pesticides", "slurry", "grass", "health", "jobs"] as const;
export type RecordBook = (typeof RECORD_BOOKS)[number];
export const RECORD_BOOK_LABEL: Record<RecordBook, string> = {
  medicines: "Medicines bought", treatments: "Treatments given", movements: "Cattle movements", feed: "Feed", pesticides: "Pesticides",
  slurry: "Slurry spreading", grass: "Grass walks", health: "Health and deaths", jobs: "Jobs done",
};
export const RECORD_BOOK_COLOR: Record<RecordBook, string> = {
  medicines: "#A32D2D", treatments: "#791F1F", movements: "#993C1D", feed: "#854F0B", pesticides: "#534AB7",
  slurry: "#0F6E56", grass: "#3B6D11", health: "#72243E", jobs: "#5F5E5A",
};

export interface DiaryEntry {
  id: string;
  book: RecordBook;
  date: string;
  /** ISO timestamp when known, for ordering within a day. */
  at?: string;
  title: string;
  detail: string;
  href?: string;
}

/** Newest first; same day by time, then title. */
export function sortDiary(entries: readonly DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.at ?? "").localeCompare(a.at ?? "") || a.title.localeCompare(b.title));
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", day: "numeric", month: "short" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function feedDiaryEntry(r: FeedRecord, groupName?: string): DiaryEntry {
  return {
    id: `feed-${r.id}`, book: "feed", date: r.receivedOn,
    title: `${r.homeGrown ? "Home-grown" : "Feed in"}: ${r.product}`,
    detail: [`${r.quantity} ${r.unit}`, r.homeGrown ? null : r.supplierName, r.batchNumber ? `batch ${r.batchNumber}` : null, groupName ? `for ${groupName}` : null].filter(Boolean).join(" · "),
  };
}

/** One diary line per spray job, however many fields it covered. */
export function pesticideDiaryEntries(rows: readonly PesticideApplication[], operatorName: (id: string) => string): DiaryEntry[] {
  const jobs = new Map<string, PesticideApplication[]>();
  for (const r of rows) jobs.set(r.sprayJobId, [...(jobs.get(r.sprayJobId) ?? []), r]);
  return [...jobs.values()].map((job) => {
    const first = job[0];
    const area = job.reduce((s, r) => s + r.areaHa, 0);
    const names = job.map((r) => r.fieldName ?? "a field");
    return {
      id: `spray-${first.sprayJobId}`, book: "pesticides", date: first.appliedOn,
      title: `Sprayed ${first.productName} for ${first.reason.toLowerCase()}`,
      detail: `${names.length <= 2 ? names.join(" and ") : plural(names.length, "field")} · ${Math.round(area * 100) / 100} ha · PCS ${first.pcsNumber} · ${operatorName(first.operatorId)}`,
    };
  });
}

// ---------------------------------------------------------------- readiness

export type ReadinessStatus = "complete" | "gap" | "not_used" | "outside_app" | "not_tracked";
export interface ReadinessItem {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  book?: RecordBook;
  /** Lets the farmer confirm the book is genuinely empty for the period. */
  canConfirmNotUsed?: boolean;
}

export interface ReadinessInput {
  today: string;
  /** Dates of records in each book (YYYY-MM-DD). */
  dates: Partial<Record<RecordBook, readonly string[]>>;
  /** Books the farmer has confirmed as not used, with when they confirmed. */
  notUsed: Partial<Record<RecordBook, string>>;
}

function bookItem(key: string, label: string, book: RecordBook, input: ReadinessInput, from: string, opts: { staleAfterDays?: number; emptyText: string; confirmable?: boolean }): ReadinessItem {
  const inPeriod = (input.dates[book] ?? []).filter((d) => d >= from && d <= input.today).sort();
  const confirmed = input.notUsed[book];
  if (!inPeriod.length) {
    if (confirmed && confirmed >= from) return { key, label, book, status: "not_used", detail: `None used, confirmed ${fmtShort(confirmed)}` };
    return { key, label, book, status: "gap", detail: opts.emptyText, canConfirmNotUsed: opts.confirmable };
  }
  const last = inPeriod[inPeriod.length - 1];
  if (opts.staleAfterDays !== undefined && daysBetween(last, input.today) > opts.staleAfterDays) {
    return { key, label, book, status: "gap", detail: `Nothing recorded since ${fmtShort(last)}`, canConfirmNotUsed: opts.confirmable };
  }
  return { key, label, book, status: "complete", detail: `${plural(inPeriod.length, "record")} since ${fmtShort(from)}` };
}

/** Bord Bia SBLAS: full records for the last six months. */
export function sblasReadiness(input: ReadinessInput): { from: string; items: ReadinessItem[] } {
  const from = addDays(input.today, -182);
  return {
    from,
    items: [
      bookItem("remedy-purchases", "Animal remedy purchases", "medicines", input, from, { emptyText: "No medicine purchases recorded in the last 6 months", confirmable: true }),
      bookItem("remedy-usage", "Animal remedy usage", "treatments", input, from, { emptyText: "No treatments recorded in the last 6 months", confirmable: true }),
      bookItem("movements", "Animal movements", "movements", input, from, { emptyText: "No cattle moves recorded in the last 6 months" }),
      bookItem("feed", "Feed purchases and home-grown feed", "feed", input, from, { staleAfterDays: 60, emptyText: "No feed recorded in the last 6 months", confirmable: true }),
      bookItem("pesticides", "Pesticide usage", "pesticides", input, from, { emptyText: "Nothing recorded. Confirm if no sprays were used.", confirmable: true }),
      bookItem("health", "Mortality and significant health issues", "health", input, from, { emptyText: "Nothing recorded. Confirm if there were no deaths or significant illness.", confirmable: true }),
      { key: "herd-register", label: "Herd register and passports", status: "outside_app", detail: "Kept on AgFood. Have passports to hand." },
      { key: "outside", label: "Other documents", status: "outside_app", detail: "Animal health plan, farm safety risk assessment, waste plastic receipts, knackery receipts." },
    ],
  };
}

/** Nitrates: the calendar year to date. */
export function nitratesReadiness(input: ReadinessInput): { from: string; items: ReadinessItem[] } {
  const from = `${input.today.slice(0, 4)}-01-01`;
  return {
    from,
    items: [
      bookItem("slurry", "Slurry spread", "slurry", input, from, { emptyText: `No slurry spreading recorded in ${input.today.slice(0, 4)}`, confirmable: true }),
      { key: "movements-organic", label: "Slurry and manure imports and exports", status: "outside_app", detail: "Declare exports on AgFood within 4 days of the movement." },
      { key: "chemical", label: "Chemical fertiliser", status: "outside_app", detail: "Purchases are on the national fertiliser database. Spreading plans are in Fields." },
    ],
  };
}

export const readinessSummary = (items: readonly ReadinessItem[]) => {
  const gaps = items.filter((i) => i.status === "gap").length;
  return gaps === 0 ? "Records in place for the period" : `${plural(gaps, "gap")} to fill`;
};

export function treatmentDiaryEntry(t: MedicineTreatment, groupName?: string): DiaryEntry {
  const who = groupName ? `${t.animalCount} in ${groupName}` : `${plural(t.animalCount, "animal")}${t.animalTags ? ` (${t.animalTags.length > 40 ? `${t.animalTags.slice(0, 40)}…` : t.animalTags})` : ""}`;
  return {
    id: `treat-${t.id}`, book: "treatments", date: t.treatedOn,
    title: `Gave ${t.productName} to ${who}`,
    detail: [`${t.dose} ${t.doseUnit} each`, t.withdrawalMeatDays ? `meat withdrawal ends ${fmtShort(t.withdrawalEndsOn)}` : "no meat withdrawal", `by ${t.administeredBy}`].join(" · "),
  };
}

export function healthDiaryEntry(h: HealthEvent, groupName?: string): DiaryEntry {
  const subject = h.animalTag ? `tag ${h.animalTag}` : groupName ? `${plural(h.animalCount, "animal")} in ${groupName}` : plural(h.animalCount, "animal");
  return {
    id: `health-${h.id}`, book: "health", date: h.occurredOn,
    title: `${HEALTH_KIND_LABEL[h.kind]}: ${subject}`,
    detail: [h.description.length > 80 ? `${h.description.slice(0, 80)}…` : h.description, h.vetSeen ? "vet seen" : null, h.disposal === "knackery" ? `knackery${h.disposalRef ? ` ${h.disposalRef}` : ""}` : null].filter(Boolean).join(" · "),
  };
}

/** Animals still inside a meat withdrawal period on `today`. */
export function activeWithdrawals(treatments: readonly MedicineTreatment[], today: string): MedicineTreatment[] {
  return treatments.filter((t) => t.withdrawalMeatDays > 0 && t.withdrawalEndsOn > today).sort((a, b) => b.withdrawalEndsOn.localeCompare(a.withdrawalEndsOn));
}

export { fmt as formatRecordDate };
