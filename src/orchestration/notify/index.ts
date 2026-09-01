/**
 * Notify stage — Farm Return Next Checkpoint 2, Vertical G. A new
 * orchestration concern, additive to Checkpoint 1's original six-stage
 * layering (`observe`/`prompt`/`decide`/`act`/`confirm`/`learn`,
 * `ARCHITECTURE.md`'s own layering diagram) — the product-owner decision
 * establishing in-app notifications as the canonical first channel
 * (2026-09-01, `MASTER_SPEC.md`/`BLOCKERS.md`) postdates that original
 * six-stage list, and notification lifecycle genuinely isn't any of the
 * existing six (it isn't Observe — nothing is being ingested; isn't
 * Prompt — a Prompt already exists by the time a notification is
 * created from it; isn't Decide/Act/Confirm/Learn either). Recorded here
 * as a real, documented addition, not silently invented — see
 * `ARCHITECTURE.md`'s layering diagram, updated alongside this module.
 *
 * **This module never generates suggestion copy.** `notificationFromPrompt`
 * copies `title`/`body` verbatim from an already-real `Prompt`'s own
 * `title`/`description` (`src/orchestration/prompt/index.ts`, computed by
 * `buildPrompt`'s existing `describeOk`/`describeBlockedBasis` machinery)
 * — `ARCHITECTURE.md`'s reuse boundary applies to this module exactly as
 * it does to every other orchestration module: it may call
 * `src/domain/`/`src/lib/farm-data/` exports, it may never contain its
 * own copy of a calculation or invent new copy a domain/Prompt layer
 * didn't already produce.
 *
 * **Only an `OK`-status Prompt may become a notification** — the
 * product-owner decision's own "contextual and actionable... never a
 * generic data-update alert" requirement, enforced structurally here
 * rather than left to caller discipline: `notificationFromPrompt` throws
 * on any other `basis.status`. A blocked/ambiguous/not-applicable Prompt
 * has nothing actionable to notify about yet.
 *
 * **`dedupeKey` is a required parameter, never computed here** — see
 * `supabase/migrations/20260901020000_notifications.sql`'s own header
 * comment for why: what makes two Prompts of the same `kind` "the same
 * underlying recurring situation" is genuinely kind-specific (a
 * spreading-window Prompt's natural key might be `fieldId + windowDate`;
 * a soil-test Prompt's might be `fieldId` alone), and no real caller
 * exists yet to inform that design per-kind — the same "don't invent
 * wiring ahead of its real consumer" discipline Vertical A's own scoping
 * note already applied to GPS capture (`ARCHITECTURE.md`).
 */
import type { Prompt } from "@/orchestration/prompt";
import type { NotificationInput } from "@/lib/farm-data/notifications";

/**
 * Builds a `NotificationInput` from a real, `OK`-status `Prompt` — ready
 * to pass straight to `insertNotification`
 * (`src/lib/farm-data/notifications.ts`). Throws if `prompt.basis.status
 * !== "OK"` (see this module's own header comment for why).
 */
export function notificationFromPrompt(prompt: Prompt, dedupeKey: string): NotificationInput {
  if (prompt.basis.status !== "OK") {
    throw new Error(
      `notificationFromPrompt: prompt ${prompt.id} (kind "${prompt.kind}") has basis.status "${prompt.basis.status}", not "OK" — only an actionable, OK-status Prompt may become a notification (product-owner decision: contextual and actionable, never a generic alert)`,
    );
  }
  return {
    farmId: prompt.farmId,
    kind: prompt.kind,
    dedupeKey,
    title: prompt.title,
    body: prompt.description,
    ...(prompt.fieldId ? { fieldId: prompt.fieldId } : {}),
  };
}
