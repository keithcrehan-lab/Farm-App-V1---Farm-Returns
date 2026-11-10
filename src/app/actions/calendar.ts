"use server";

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listCalendarEntries, setCalendarEntryStatus, upsertCalendarEntry } from "@/lib/farm-data/calendar-entries";
import { CALENDAR_STATUSES, daysBetween, isIsoDate, validateCalendarEntry, type CalendarEntry, type CalendarEntryInput, type CalendarStatus } from "@/domain/farm-calendar";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CalendarListResult = { status: "ok"; entries: CalendarEntry[] } | { status: "not_signed_in" } | { status: "unavailable" };

export async function listCalendarEntriesAction(from: string, to: string): Promise<CalendarListResult> {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from || daysBetween(from, to) > 800) return { status: "unavailable" };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "not_signed_in" };
  try {
    return { status: "ok", entries: await listCalendarEntries(farm.id, from, to) };
  } catch (err) {
    console.error("[Calendar] list failed", err);
    return { status: "unavailable" };
  }
}

export async function saveCalendarEntryAction(input: CalendarEntryInput): Promise<{ ok: true; entry: CalendarEntry } | { ok: false; error: string }> {
  const problem = validateCalendarEntry(input);
  if (problem) return { ok: false, error: problem };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save to your calendar." };
  try {
    if (input.fieldIds.length) {
      const own = new Set((await listFieldsForFarm(farm.id)).map((f) => f.id));
      if (input.fieldIds.some((id) => !own.has(id))) return { ok: false, error: "One of those fields isn't on this farm." };
    }
    const entry = await upsertCalendarEntry(farm.id, input);
    revalidatePath("/plan");
    return { ok: true, entry };
  } catch (err) {
    console.error("[Calendar] save failed", err);
    return { ok: false, error: "Couldn't save just now. Check your signal and try again." };
  }
}

export async function setCalendarEntryStatusAction(id: string, status: CalendarStatus): Promise<{ ok: true; entry: CalendarEntry } | { ok: false; error: string }> {
  if (!UUID.test(String(id)) || !(CALENDAR_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Invalid request." };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to update your calendar." };
  try {
    const entry = await setCalendarEntryStatus(farm.id, id, status);
    revalidatePath("/plan");
    return { ok: true, entry };
  } catch (err) {
    console.error("[Calendar] status failed", err);
    return { ok: false, error: "Couldn't update just now. Try again." };
  }
}
