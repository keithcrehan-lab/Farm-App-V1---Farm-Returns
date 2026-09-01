/**
 * Runs every real, shipped Prompt producer against a real farm's real
 * `Field[]` — shared by Today (`app/(app)/today/page.tsx`) and Plan
 * (`app/(app)/plan/page.tsx`) so both screens compute the identical real
 * Prompt set from the identical real inputs, rather than one screen's
 * own copy silently drifting from the other's (`CLAUDE.md`'s reuse rule
 * applied to this checkpoint's own new orchestration code, not just
 * pre-existing modules).
 *
 * Not itself a calculation — each producer already is one (see their own
 * doc comments); this only fans a real field list out across all four.
 * A producer that can't apply to a given field (e.g. no `commonageStatus`
 * recorded) returns its own honest `BLOCKED_INSUFFICIENT_EVIDENCE`
 * Prompt rather than being filtered out here — a farmer seeing "no data
 * yet" for a field is itself real, disclosed information (§6: "If
 * required data is absent, fail closed: ask, defer or explain").
 */
import { promptForSpreadingWindow } from "./spreading-window";
import { promptForSoilTestAge } from "./soil-test-age";
import { promptForCommonageStatus } from "./commonage-status";
import { promptForLocalBufferOverride } from "./local-buffer-override";
import type { Prompt } from "./index";
import type { Farm, Field } from "@/domain/types";

export function buildAllRealPrompts(farm: Pick<Farm, "id" | "location">, fields: readonly Field[], createdAt: string): Prompt[] {
  const prompts: Prompt[] = [];
  for (const field of fields) {
    prompts.push(promptForSpreadingWindow(farm, field, "chemical_fertiliser", undefined, createdAt));
    prompts.push(promptForSoilTestAge(field, undefined, createdAt));
    prompts.push(promptForCommonageStatus(field, createdAt));
    prompts.push(promptForLocalBufferOverride(field, createdAt));
  }
  return prompts;
}
