/** Pure, auditable planning decisions. No model-generated compliance facts. */
export type PlanningSource = "fertiliser" | "slurry" | "grass" | "cattle" | "schemes" | "compliance";
export type EvidenceLevel = "verified" | "calculated" | "forecast" | "insufficient";
export type PlanningKind = "action" | "information";
export type PlanningStatus = "open" | "scheduled" | "completed" | "dismissed" | "snoozed";
export interface PlanningRecommendation {
  id: string;
  farmId: string;
  source: PlanningSource;
  kind: PlanningKind;
  subjectId: string;
  actionKey: string;
  period: string;
  title: string;
  explanation: string;
  evidence: EvidenceLevel;
  evidenceRefs: string[];
  priority: number;
  dueDate?: string;
  expiresOn?: string;
  href?: string;
}
export interface PlanningDecision { key: string; status: PlanningStatus; snoozedUntil?: string; }
export const recommendationKey = (r: PlanningRecommendation): string =>
  [r.farmId, r.kind, r.subjectId, r.actionKey, r.period].map(encodeURIComponent).join(":");
/** Statutory information never becomes an addable job. */
export function classifyPlanning(recommendations: PlanningRecommendation[], decisions: PlanningDecision[], today: string) {
  const byKey = new Map<string, PlanningRecommendation>();
  for (const item of recommendations) {
    if (!item.farmId || !item.title || !item.period) continue;
    if (item.expiresOn && item.expiresOn < today) continue;
    const normalised = item.source === "compliance" ? { ...item, kind: "information" as const, href: undefined } : item;
    const key = recommendationKey(normalised);
    const existing = byKey.get(key);
    if (!existing || normalised.priority > existing.priority) byKey.set(key, normalised);
  }
  const state = new Map(decisions.map(d => [d.key, d]));
  const visible = [...byKey.values()].filter(item => {
    if (item.kind === "information") return true;
    const decision = state.get(recommendationKey(item));
    if (!decision) return true;
    if (["completed", "dismissed", "scheduled"].includes(decision.status)) return false;
    return decision.status !== "snoozed" || !decision.snoozedUntil || decision.snoozedUntil <= today;
  }).sort((a, b) => b.priority - a.priority || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return { actions: visible.filter(r => r.kind === "action"), information: visible.filter(r => r.kind === "information") };
}
