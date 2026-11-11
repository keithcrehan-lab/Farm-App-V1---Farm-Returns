import { classifyPlanning, recommendationKey, type PlanningRecommendation, type PlanningSource } from "./intelligent-planning";
import type { Recommendation } from "./recommendations";

/** Apply the shared domain classifier to farmer-facing active cards, without
 * altering their original actions, persistence keys or evidence. */
export function prioritisePlanningCards(recommendations: readonly Recommendation[], today: string): Recommendation[] {
  const original = new Map<string, Recommendation>();
  const candidates: PlanningRecommendation[] = [];
  for (const r of recommendations) {
    if (r.status !== "active" || r.source === "calendar") continue;
    // Statutory restrictions are displayed by the separate compliance panel.
    if (r.statutory) continue;
    const source: PlanningSource = r.source === "grazing" ? "grass" :
      r.source === "fields" || r.source === "records" ? "fertiliser" : r.source;
    const subjectId = [...r.subject.ids].sort().join(",") || "farm";
    const item: PlanningRecommendation = {
      id: r.key, farmId: r.farmId, source, kind: "action", subjectId,
      actionKey: r.key, period: r.date?.slice(0, 7) ?? today.slice(0, 7),
      title: r.title, explanation: r.explanation,
      evidence: r.reliability === "modelled" ? "forecast" : r.reliability === "missing" ? "insufficient" : r.reliability,
      evidenceRefs: r.evidence.map(e => e.label), priority: r.priority,
      ...(r.date ? { dueDate: r.date } : {}),
      ...(r.expiresAfter ? { expiresOn: r.expiresAfter } : {}),
      ...(r.href ? { href: r.href } : {}),
    };
    const key = recommendationKey(item);
    const prior = original.get(key);
    if (!prior || prior.priority < r.priority) original.set(key, r);
    candidates.push(item);
  }
  return classifyPlanning(candidates, [], today).actions.map(item => original.get(recommendationKey(item))).filter((r): r is Recommendation => Boolean(r));
}
