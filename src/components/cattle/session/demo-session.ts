/**
 * Cattle C10 — the demonstration session contract (shared by the client
 * session store and the server replay). A session is an ordered list of
 * farmer actions taken in local demonstration mode. It is never persisted:
 * it lives in the browser tab and is sent with each server action, where it
 * is untrusted input and is validated by `parseCattleDemoSession` before the
 * frozen engines (which validate again at their own canonical boundaries).
 */

import { z } from "zod";
import { isPlanDate } from "@/domain/cattle/presentation";

export const CATTLE_DEMO_SESSION_VERSION = 1;
/** Hard cap: a demonstration session is small by construction. */
export const CATTLE_DEMO_SESSION_MAX_EVENTS = 40;

const tag = z.string().regex(/^\d{3,6}$/);
const eventId = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const isoDate = z.string().refine((s) => isPlanDate(s), "invalid calendar date");

const recordWeight = z
  .object({
    kind: z.literal("RECORD_WEIGHT"),
    eventId,
    tag,
    /** Kilograms as entered (scale reading). */
    kg: z.number().finite().gt(0).lte(2000),
    /** `null` = observed now (the session instant of this action); otherwise a back-dated calendar day. */
    observedDate: isoDate.nullable(),
  })
  .strict();

const savePlanGoal = z
  .object({
    kind: z.literal("SAVE_PLAN_GOAL"),
    eventId,
    tag,
    goalType: z.enum(["FINISHING", "SALE"]),
    targetKg: z.number().finite().gt(0).lte(2000).nullable(),
    targetDate: isoDate,
  })
  .strict();

export const cattleDemoSessionSchema = z
  .object({
    version: z.literal(CATTLE_DEMO_SESSION_VERSION),
    events: z.array(z.discriminatedUnion("kind", [recordWeight, savePlanGoal])).max(CATTLE_DEMO_SESSION_MAX_EVENTS),
  })
  .strict();

export type CattleDemoSession = z.infer<typeof cattleDemoSessionSchema>;
export type CattleDemoEvent = CattleDemoSession["events"][number];

export const EMPTY_CATTLE_DEMO_SESSION: CattleDemoSession = { version: CATTLE_DEMO_SESSION_VERSION, events: [] };

export type ParsedSession = { ok: true; session: CattleDemoSession } | { ok: false; reason: string };

export function parseCattleDemoSession(input: unknown): ParsedSession {
  const r = cattleDemoSessionSchema.safeParse(input);
  if (!r.success) return { ok: false, reason: "CATTLE_DEMO_SESSION_INVALID" };
  const ids = r.data.events.map((e) => e.eventId);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "CATTLE_DEMO_SESSION_DUPLICATE_EVENT" };
  return { ok: true, session: r.data };
}
