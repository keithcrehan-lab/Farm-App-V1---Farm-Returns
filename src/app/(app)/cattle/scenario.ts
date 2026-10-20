import type { CattleDemoScenario } from "@/server/cattle-demo/demo-replay";

/** `?scenario=` → a demonstration scenario (anything unrecognised is the standard herd). */
export function scenarioOf(raw: string | string[] | undefined): CattleDemoScenario {
  return raw === "PLANNING_RUN_FAILURE" || raw === "EMPTY_HERD" ? raw : "STANDARD";
}
