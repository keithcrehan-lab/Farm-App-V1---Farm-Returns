"use client";

import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { findNearbyField } from "@/domain/near-field";
import type { LocationPosition } from "@/lib/location/location-tracking-provider";
import type { Field } from "@/domain/types";

/**
 * Strict Visual Reproduction phase (2026-09-03) — Today's own doc
 * comment previously named this exact feature ("location-aware 'near
 * Back Meadow'") as deliberately absent, "needs real GPS permission/
 * geofencing, Vertical C's own scope." That reasoning no longer holds:
 * `LocationTrackingProvider.getCurrentPosition()` (§9's own honest-
 * capability contract, already built and audited for GPS Job Mode) is a
 * real, one-shot, permission-gated position fix that needs no job
 * session at all — Vertical C's actual scope was *continuous tracking*,
 * not this. `position` comes from `useOneShotPosition()`, shared with
 * `MapHero`'s own "you are here" dot so a farmer is asked for
 * permission once per Today visit, not once per consumer.
 *
 * Real, never fabricated: `position` is `null` whenever permission is
 * denied/unavailable — this renders nothing in that case, never a fake
 * "near your farm" guess. The actual proximity determination — real
 * distance to each field's own mapped boundary (not its centroid), and
 * a fail-closed refusal when the position's own reported accuracy isn't
 * good enough to trust — lives in the tested `src/domain/near-field.ts`
 * module, not inline here (final whole-session Codex audit, CRITICAL:
 * the original inline version measured to centroid and ignored
 * `accuracyMeters` entirely — see that module's own doc comment for the
 * full finding).
 */
export function NearbyFieldCard({
  fields,
  position,
  onOpen,
}: {
  fields: Field[];
  position: LocationPosition | null;
  onOpen: (fieldId: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  const nearField = useMemo(
    () =>
      findNearbyField(fields, position ? { latitude: position.lat, longitude: position.lng, accuracyMeters: position.accuracyMeters } : null),
    [fields, position],
  );

  if (!nearField || dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-fr-card border border-white/15 bg-fr-green-900/55 p-3 pr-2 text-white backdrop-blur-md">
      <MapPin className="size-5 shrink-0 text-white/80" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="block text-xs text-white/70">Looks like you&apos;re near</span>
        <span className="font-semibold">{nearField.name}</span>
      </p>
      <button
        type="button"
        onClick={() => onOpen(nearField.id)}
        className="shrink-0 rounded-full bg-fr-green-100 px-3 py-1.5 text-xs font-semibold text-fr-green-900"
      >
        Open
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80"
      >
        Not now
      </button>
    </div>
  );
}
