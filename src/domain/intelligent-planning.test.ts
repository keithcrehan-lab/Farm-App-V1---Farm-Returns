import { describe, expect, it } from "vitest";
import { classifyPlanning, recommendationKey, type PlanningRecommendation } from "./intelligent-planning";
const base: PlanningRecommendation = { id:"a", farmId:"farm1", source:"fertiliser", kind:"action", subjectId:"field1", actionKey:"soil-test", period:"2027", title:"Review soil results", explanation:"Results are missing", evidence:"verified", evidenceRefs:["soil:field1"], priority:5 };
describe("intelligent planning", () => {
 it("deduplicates identical farm/subject/action/period and retains highest priority", () => {
  const result = classifyPlanning([base,{...base,id:"b",priority:8}],[],"2026-11-10");
  expect(result.actions).toHaveLength(1); expect(result.actions[0].priority).toBe(8);
 });
 it("does not merge different fields", () => expect(classifyPlanning([base,{...base,subjectId:"field2"}],[],"2026-11-10").actions).toHaveLength(2));
 it("keeps statutory restrictions informational even if supplied as actions", () => {
  const result=classifyPlanning([{...base,source:"compliance",kind:"action",href:"/plan/new"}],[],"2026-11-10");
  expect(result.actions).toHaveLength(0); expect(result.information[0].href).toBeUndefined();
 });
 it("honours dismissal and snooze and expiry", () => {
  expect(classifyPlanning([base],[{key:recommendationKey(base),status:"dismissed"}],"2026-11-10").actions).toHaveLength(0);
  expect(classifyPlanning([base],[{key:recommendationKey(base),status:"snoozed",snoozedUntil:"2026-11-11"}],"2026-11-10").actions).toHaveLength(0);
  expect(classifyPlanning([base],[{key:recommendationKey(base),status:"snoozed",snoozedUntil:"2026-11-10"}],"2026-11-10").actions).toHaveLength(1);
  expect(classifyPlanning([{...base,expiresOn:"2026-11-09"}],[],"2026-11-10").actions).toHaveLength(0);
 });
});
