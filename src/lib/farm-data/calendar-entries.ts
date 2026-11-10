import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEntry, CalendarEntryInput, CalendarStatus } from "@/domain/farm-calendar";

const TABLE = "calendar_entries";
const COLUMNS = "id,kind,category,title,start_date,end_date,start_time,end_time,status,assignee_name,notes,field_ids,source_key";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toEntry = (r: any): CalendarEntry => ({
  id: r.id,
  kind: r.kind,
  category: r.category,
  title: r.title,
  startDate: r.start_date,
  endDate: r.end_date,
  startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
  endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
  status: r.status,
  assignee: r.assignee_name,
  notes: r.notes,
  fieldIds: r.field_ids ?? [],
  source: "farmer",
  sourceKey: r.source_key ?? null,
});

export async function listCalendarEntries(farmId: string, from: string, to: string): Promise<CalendarEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select(COLUMNS)
    .eq("farm_id", farmId).lte("start_date", to).gte("end_date", from).neq("status", "cancelled")
    .order("start_date", { ascending: true }).limit(2000);
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

/** Insert or update by client id; an id that belongs to another farm is refused by RLS. */
export async function upsertCalendarEntry(farmId: string, e: CalendarEntryInput): Promise<CalendarEntry> {
  const supabase = await createClient();
  const row = {
    farm_id: farmId,
    kind: e.kind,
    category: e.category,
    title: e.title.trim(),
    start_date: e.startDate,
    end_date: e.endDate,
    start_time: e.startTime,
    end_time: e.endTime,
    status: e.status,
    assignee_name: e.assignee?.trim() || null,
    notes: e.notes?.trim() || null,
    field_ids: e.fieldIds,
    // Only written when given, so editing an entry keeps its link.
    ...(e.sourceKey !== undefined ? { source_key: e.sourceKey } : {}),
    completed_at: e.status === "done" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const existing = await supabase.from(TABLE).select("id").eq("farm_id", farmId).eq("id", e.id).maybeSingle();
  if (existing.error) throw existing.error;
  const query = existing.data
    ? supabase.from(TABLE).update(row).eq("farm_id", farmId).eq("id", e.id)
    : supabase.from(TABLE).insert({ id: e.id, ...row });
  const { data, error } = await query.select(COLUMNS).single();
  if (error) throw error;
  return toEntry(data);
}

export async function setCalendarEntryStatus(farmId: string, id: string, status: CalendarStatus): Promise<CalendarEntry> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE)
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("farm_id", farmId).eq("id", id).select(COLUMNS).single();
  if (error) throw error;
  return toEntry(data);
}
