/**
 * Server-side Prompt recomputation — extracted from
 * `src/app/actions/decisions.ts`'s own `submitPromptDecisionAction` (Codex
 * audit HIGH, `docs/overnight/audits/
 * phase-1-visual-nav-today-plan-records-codex-audit-round1.md`: the first
 * version of that action trusted a client-constructed Prompt/`basis`
 * verbatim — "any authenticated owner can invoke the server action with
 * fabricated scientific or financial provenance"). The fix there —
 * recompute the real Prompt from a fresh database read using the same
 * pure producer functions `src/orchestration/prompt/build-all.ts` already
 * uses, so the client can only ever select *which* real Prompt to act on,
 * never inject its own evidence — is exactly the discipline this
 * checkpoint's own `startJobSessionFromPromptAction`
 * (`src/app/actions/job-sessions.ts`) needs too, for the identical reason
 * (Starting a Job Session from a Prompt is a real Decide-stage
 * `"accepted"` outcome, same as any other Prompt acceptance). Extracted
 * here rather than duplicated across two server actions — two independent
 * copies of a security-sensitive "which evidence is trustworthy" switch
 * statement is exactly the kind of drift risk that class of bug thrives
 * on.
 */
import { promptForSpreadingWindow } from "./spreading-window";
import { promptForSoilTestAge } from "./soil-test-age";
import { promptForCommonageStatus } from "./commonage-status";
import { promptForLocalBufferOverride } from "./local-buffer-override";
import type { SpreadingMaterial } from "@/domain/closed-period-calendar";
import type { Prompt } from "./index";
import type { Farm, Field } from "@/domain/types";

/** The real Prompt kinds this module can recompute — the same "reviewed
 * starter registry" shape `Prompt.kind`'s own doc comment describes, kept
 * as a real closed union here specifically so an unrecognised kind fails
 * closed rather than silently skipping evidence reconstruction. */
export type RecomputablePromptKind = "spreading_window" | "soil_test_age" | "commonage_status" | "local_buffer_override";

export interface RecomputePromptInput {
  promptKind: RecomputablePromptKind;
  farm: Farm;
  field: Field;
  /** Required only for `"spreading_window"` — that producer has no
   * default (a Prompt built for one material must be re-decided for that
   * same material, never a different, unconfirmed one). */
  material?: SpreadingMaterial;
  now: string;
}

export function recomputePromptByKind(input: RecomputePromptInput): Prompt {
  switch (input.promptKind) {
    case "spreading_window":
      if (!input.material) {
        throw new Error("recomputePromptByKind: material is required to recompute a spreading_window Prompt");
      }
      return promptForSpreadingWindow(input.farm, input.field, input.material, undefined, input.now);
    case "soil_test_age":
      return promptForSoilTestAge(input.field, undefined, input.now);
    case "commonage_status":
      return promptForCommonageStatus(input.field, input.now);
    case "local_buffer_override":
      return promptForLocalBufferOverride(input.field, input.now);
    default: {
      // Exhaustiveness guard — a future Prompt kind must be added above
      // explicitly, never silently accepted without its own real
      // recomputation path.
      const exhaustive: never = input.promptKind;
      throw new Error(`recomputePromptByKind: unrecognised promptKind ${String(exhaustive)}`);
    }
  }
}
