import "server-only";
/**
 * Loads every record book for Records and the audit packs: feed and
 * pesticides from their own tables, the rest from what the farmer already
 * records elsewhere (medicines, cattle moves, slurry spreading, grass walks,
 * finished Plan jobs). Each source loads on its own; one failing marks that
 * book unavailable rather than hiding the others.
 */
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listMedicinePurchases, type MedicinePurchase } from "@/lib/farm-data/medicine-purchases";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import { listSlurryAllocationRecordsForFarm } from "@/lib/farm-data/slurry";
import { listCalendarEntries } from "@/lib/farm-data/calendar-entries";
import { listBookConfirmations, listFeedRecords, listPesticideApplications, listSprayOperators } from "@/lib/farm-data/farm-records";
import { listGrassSurveysAction } from "@/app/actions/grass-surveys";
import {
  feedDiaryEntry, pesticideDiaryEntries, sortDiary,
  type DiaryEntry, type FeedRecord, type PesticideApplication, type RecordBook, type SprayOperator,
} from "@/domain/farm-records";

export interface FieldRef { id: string; name: string; areaHa: number; lpisRef: string | null }
export interface GroupRef { id: string; name: string }
export interface MoveRecord { id: string; date: string; groupName: string; fieldName: string; headCount: number; endedOn: string | null }
export interface SlurryRecord { id: string; date: string; fieldName: string; volumeM3: number | null }
export interface WalkRecord { id: string; date: string; distanceKm: number | null }
export interface JobDoneRecord { id: string; date: string; title: string; assignee: string | null }

export interface RecordBooks {
  fields: FieldRef[];
  groups: GroupRef[];
  operators: SprayOperator[];
  feed: FeedRecord[];
  sprays: PesticideApplication[];
  medicines: MedicinePurchase[];
  moves: MoveRecord[];
  slurry: SlurryRecord[];
  walks: WalkRecord[];
  jobsDone: JobDoneRecord[];
  notUsed: Partial<Record<RecordBook, string>>;
  diary: DiaryEntry[];
  dates: Partial<Record<RecordBook, string[]>>;
  unavailable: RecordBook[];
}

const str = (o: unknown, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = (o as Record<string, unknown> | null)?.[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
};
const num = (o: unknown, k: string): number | null => {
  const v = (o as Record<string, unknown> | null)?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
};
const day = (iso: string) => iso.slice(0, 10);

async function safe<T>(book: RecordBook | null, unavailable: RecordBook[], fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[Records] loading ${book ?? "reference data"} failed`, err);
    if (book) unavailable.push(book);
    return fallback;
  }
}

export async function loadRecordBooks(farmId: string, from: string, to: string): Promise<RecordBooks> {
  const unavailable: RecordBook[] = [];
  const [rawFields, rawGroups, operators, feed, sprays, medicines, sessions, slurryRecords, surveys, entries, notUsed] = await Promise.all([
    safe(null, unavailable, () => listFieldsForFarm(farmId), []),
    safe(null, unavailable, () => listLivestockGroupsForFarm(farmId), []),
    safe("pesticides", unavailable, () => listSprayOperators(farmId), [] as SprayOperator[]),
    safe("feed", unavailable, () => listFeedRecords(farmId, from), [] as FeedRecord[]),
    safe("pesticides", unavailable, () => listPesticideApplications(farmId, from), [] as PesticideApplication[]),
    safe("medicines", unavailable, () => listMedicinePurchases(farmId, 1000), [] as MedicinePurchase[]),
    safe("movements", unavailable, () => listGrazingFieldSessionsForFarm(farmId), []),
    safe("slurry", unavailable, () => listSlurryAllocationRecordsForFarm(farmId), []),
    safe("grass", unavailable, async () => {
      const r = await listGrassSurveysAction();
      if (!r.ok) throw new Error(r.error);
      return r.surveys;
    }, []),
    safe("jobs", unavailable, () => listCalendarEntries(farmId, from, to), []),
    safe(null, unavailable, () => listBookConfirmations(farmId), {} as Partial<Record<RecordBook, string>>),
  ]);

  const fields: FieldRef[] = rawFields.map((f) => ({ id: f.id, name: f.name, areaHa: num(f, "areaHa") ?? 0, lpisRef: str(f, "lpisRef") ?? null }));
  const groups: GroupRef[] = rawGroups.map((g) => ({ id: g.id, name: str(g, "name", "label", "groupName") ?? "A group" }));
  const fieldName = new Map(fields.map((f) => [f.id, f.name]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const inRange = (d: string) => d >= from && d <= to;

  const withNames = sprays.map((s) => ({ ...s, fieldName: fieldName.get(s.fieldId) ?? "A field" }));
  const meds = medicines.filter((m) => inRange(m.dateReceived));
  const moves: MoveRecord[] = sessions.filter((s) => inRange(day(s.startedAt))).map((s) => ({
    id: s.id, date: day(s.startedAt), groupName: groupName.get(s.livestockGroupId) ?? "A group",
    fieldName: fieldName.get(s.fieldId) ?? "a field", headCount: s.headCountSnapshot, endedOn: s.endedAt ? day(s.endedAt) : null,
  }));
  const slurry: SlurryRecord[] = slurryRecords
    .filter((r) => String(r.status) === "completed")
    .map((r) => ({ id: r.id, date: r.actualSpreadDate ?? day(r.completedAt ?? r.updatedAt), fieldName: fieldName.get(str(r, "fieldId") ?? "") ?? "a field", volumeM3: r.actualVolumeM3 ?? null }))
    .filter((r) => inRange(r.date));
  const walks: WalkRecord[] = surveys
    .filter((s) => s.status === "finished" && s.finishedAt && inRange(day(s.finishedAt)))
    .map((s) => ({ id: s.id, date: day(s.finishedAt!), distanceKm: s.distanceM ? Math.round(s.distanceM / 100) / 10 : null }));
  const jobsDone: JobDoneRecord[] = entries
    .filter((e) => e.status === "done" && e.kind !== "season")
    .map((e) => ({ id: e.id, date: e.endDate, title: e.title, assignee: e.assignee }));
  const opName = new Map(operators.map((o) => [o.id, o.name]));

  const diary = sortDiary([
    ...feed.map((r) => feedDiaryEntry(r, r.livestockGroupId ? groupName.get(r.livestockGroupId) : undefined)),
    ...pesticideDiaryEntries(withNames, (id) => opName.get(id) ?? "Unknown sprayer"),
    ...meds.map((m): DiaryEntry => ({
      id: `med-${m.id}`, book: "medicines", date: m.dateReceived, title: `Bought ${m.productName}`,
      detail: [`Qty ${m.quantity}`, m.supplierName, m.batchNumber ? `batch ${m.batchNumber}` : null, m.vetName ? `vet ${m.vetName}` : null].filter(Boolean).join(" · "),
    })),
    ...moves.map((m): DiaryEntry => ({
      id: `move-${m.id}`, book: "movements", date: m.date, title: `Moved ${m.groupName} into ${m.fieldName}`,
      detail: `${m.headCount} head${m.endedOn ? ` · out ${m.endedOn.slice(8)}/${m.endedOn.slice(5, 7)}` : " · still there"}`,
    })),
    ...slurry.map((s): DiaryEntry => ({
      id: `slurry-${s.id}`, book: "slurry", date: s.date, title: `Spread slurry on ${s.fieldName}`,
      detail: s.volumeM3 !== null ? `${Math.round(s.volumeM3)} m³` : "Volume not recorded",
    })),
    ...walks.map((w): DiaryEntry => ({ id: `walk-${w.id}`, book: "grass", date: w.date, title: "Grass walk", detail: w.distanceKm !== null ? `${w.distanceKm} km` : "Walk recorded", href: `/grass/walks/${w.id}` })),
    ...jobsDone.map((j): DiaryEntry => ({ id: `job-${j.id}`, book: "jobs", date: j.date, title: `Done: ${j.title}`, detail: j.assignee ? `By ${j.assignee}` : "Ticked off in Plan" })),
  ]);

  return {
    fields, groups, operators, feed, sprays: withNames, medicines: meds, moves, slurry, walks, jobsDone, notUsed, diary,
    dates: {
      feed: feed.map((r) => r.receivedOn), pesticides: sprays.map((s) => s.appliedOn), medicines: meds.map((m) => m.dateReceived),
      movements: moves.map((m) => m.date), slurry: slurry.map((s) => s.date), grass: walks.map((w) => w.date), jobs: jobsDone.map((j) => j.date),
    },
    unavailable: [...new Set(unavailable)],
  };
}
