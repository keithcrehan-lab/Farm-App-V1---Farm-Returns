"use server";

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listRecommendationStates, upsertRecommendationState } from "@/lib/farm-data/recommendation-states";
import { isIsoDate } from "@/domain/farm-calendar";
import type { RecommendationState } from "@/domain/recommendations";

const KEY = /^[a-z0-9:_.-]{1,200}$/i;
const STATUSES = ["active", "snoozed", "dismissed", "done"] as const;

function isFutureSnoozeDate(value: string | null): boolean {
  return isIsoDate(value) && value! > new Date().toISOString().slice(0, 10);
}

export async function listRecommendationStatesAction(): Promise<{ status: "ok"; states: RecommendationState[] } | { status: "not_signed_in" } | { status: "unavailable" }> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "not_signed_in" };
  try {
    return { status: "ok", states: await listRecommendationStates(farm.id) };
  } catch (err) {
    console.error("[Recommendations] list failed", err);
    return { status: "unavailable" };
  }
}

export async function setRecommendationStateAction(input: RecommendationState): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input || !KEY.test(String(input.key)) || !(STATUSES as readonly string[]).includes(input.status)
    || typeof input.fingerprint !== "string" || !/^[a-z0-9]{1,64}$/.test(input.fingerprint)
    || (input.status === "snoozed" ? !isFutureSnoozeDate(input.snoozedUntil) : input.snoozedUntil !== null)) {
    return { ok: false, error: "Invalid request." };
  }
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save this." };
  try {
    await upsertRecommendationState(farm.id, input);
    return { ok: true };
  } catch (err) {
    console.error("[Recommendations] save failed", err);
    return { ok: false, error: "Couldn't save just now. Try again." };
  }
}
