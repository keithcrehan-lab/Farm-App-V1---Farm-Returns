import type { Prompt } from "@/orchestration/prompt";

/** Present statutory spreading checks as one informational status, never a calendar job.
 * Preserve the original prompts for field-level legal/evidence inspection. */
export interface SpreadingComplianceGroup {
  key: string;
  title: string;
  summary: string;
  prompts: Prompt[];
}

export function partitionPlanningPrompts(prompts: readonly Prompt[]): {
  actionable: Prompt[];
  spreadingCompliance: SpreadingComplianceGroup[];
} {
  const actionable: Prompt[] = [];
  const grouped = new Map<string, SpreadingComplianceGroup>();
  for (const prompt of prompts) {
    if (prompt.kind !== "spreading_window") {
      actionable.push(prompt);
      continue;
    }
    const snapshot = prompt.inputsSnapshot;
    const zone = typeof snapshot?.zone === "string" ? snapshot.zone : "unknown";
    const material = typeof snapshot?.material === "string" ? snapshot.material : "unknown";
    const date = typeof snapshot?.asOfDate === "string" ? snapshot.asOfDate : "unknown";
    const key = [prompt.farmId, zone, material, date, prompt.basis.status].map(encodeURIComponent).join(":");
    const existing = grouped.get(key);
    if (existing) {
      existing.prompts.push(prompt);
    } else {
      grouped.set(key, {
        key,
        title: "Spreading restrictions",
        summary: "Review the current statutory spreading status before planning any application. Restrictions depend on material, location and date.",
        prompts: [prompt],
      });
    }
  }
  return { actionable, spreadingCompliance: [...grouped.values()] };
}
