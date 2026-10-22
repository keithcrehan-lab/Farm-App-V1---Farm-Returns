# Claude audit 2026-10-22-1 — reproduction probes

Copied verbatim from `/private/tmp/claude-501/c10-claude-audit-probes` (outside the repo). Reproduced again by the coordinating session on 2026-10-22 (p2, p3, p4, p8 rerun; outputs matched the report). Run from the audit worktree with `npx vitest run --config /private/tmp/claude-501/c10-claude-audit-probes/vitest.config.mts --disableConsoleIntercept /private/tmp/claude-501/c10-claude-audit-probes/<probe>.probe.ts`.

## vitest.config.mts

```ts
import { defineConfig } from "/private/tmp/claude-501/-Users-macbookair-Desktop-Farm-Return-Spatial-V2-Overnight/097ad2ad-db00-44ca-8286-d7eb3f10445a/scratchpad/claude-audit-8148e35/node_modules/vitest/dist/config.js";
import path from "node:path";
const R = "/private/tmp/claude-501/-Users-macbookair-Desktop-Farm-Return-Spatial-V2-Overnight/097ad2ad-db00-44ca-8286-d7eb3f10445a/scratchpad/claude-audit-8148e35";
export default defineConfig({
  root: R,
  resolve: { alias: { "@": path.resolve(R, "src"), "server-only": path.resolve(R, "test/server-only-mock.ts"), "vitest": path.resolve(R, "node_modules/vitest") } },
  server: { fs: { allow: [R, "/private/tmp/claude-501/c10-claude-audit-probes"] } },
  test: { environment: "node", include: ["/private/tmp/claude-501/c10-claude-audit-probes/**/*.probe.ts"], root: R, dir: "/private/tmp/claude-501/c10-claude-audit-probes" },
});
```

## p1.probe.ts

```ts
import { it } from "vitest";
import { demoProjection, demoAnimalView } from "@/server/cattle-demo/demo-service";
import { planScreenView } from "@/domain/cattle/presentation";
it("tiny projection", () => {
  for (const kg of [252.76504613367055, 252.9, 253.5, 250]) {
    const session = { version: 1 as const, events: [{ kind: "RECORD_WEIGHT" as const, eventId: "p", tag: "1427", kg, observedDate: null }] };
    const projection = demoProjection(session, "1427", "2027-12-04");
    const view = demoAnimalView(session, "1427")!;
    const vm = planScreenView({ inputs: view.plan.inputs, assumptions: { ...view.plan.defaults, saleDate: "2027-12-04" }, martId: view.plan.defaultMartId, projection, profile: view.profile });
    console.log(kg, JSON.stringify(projection));
    for (const r of vm.rows) console.log("  ", r.label, "=>", JSON.stringify(r.value));
    console.log("  headline", JSON.stringify(vm.headline.value), vm.headline.summary);
    console.log("  profile projection", JSON.stringify(view.profile.projection.label), JSON.stringify(view.profile.chart.state === "CHART" ? view.profile.chart.projection : null));
  }
});
```

## p2.probe.ts

```ts
import { it } from "vitest";
import { demoProjection, demoAnimalView, demoHerdView } from "@/server/cattle-demo/demo-service";
import { planScreenView } from "@/domain/cattle/presentation";
it("negative profile projection", () => {
  for (const kg of [5, 100]) {
    const session = { version: 1 as const, events: [{ kind: "RECORD_WEIGHT" as const, eventId: "p", tag: "1427", kg, observedDate: null }] };
    const view = demoAnimalView(session, "1427")!;
    console.log(kg, "goal", JSON.stringify(view.profile.goal.summary), "proj", JSON.stringify(view.profile.projection.label), JSON.stringify(view.profile.projection.state));
    console.log("  chart overlay", JSON.stringify(view.profile.chart.state === "CHART" ? view.profile.chart.projection : null));
    console.log("  metrics", JSON.stringify(view.profile.metrics.weight), JSON.stringify(view.profile.metrics.gain));
    const herd = demoHerdView(session);
    console.log("  herd", JSON.stringify(herd).slice(0, 1500));
  }
});
```

## p3.probe.ts

```ts
import { it } from "vitest";
import { outputsWithGoal } from "@/server/cattle-demo/c10-engine-fixtures";
import { animalViewFrom, DEMO_DIRECTORY } from "@/server/cattle-demo/demo-service";
import { animalIdOf } from "@/server/cattle-demo/demo-herd";
import { summariseAnimalCosts } from "@/domain/animal-plan";
import { DEMO_COST_ENTRIES } from "@/server/cattle-demo/demo-economics";
import { planScreenView, planSaveIntent } from "@/domain/cattle/presentation";
it("lb goal", () => {
  const T = "1427";
  for (const g of [{ type: "FINISHING", targetWeight: { value: 1400, unit: "POUND" as const }, targetDate: "2026-12-04" }, { type: "FINISHING", targetWeight: { value: 1400, unit: "POUND" as const }, targetDate: "2026-10-01" }, { type: "FINISHING", targetWeight: null, targetDate: "2026-10-16" }]) {
    const o = outputsWithGoal(T, g);
    const v = animalViewFrom(o, animalIdOf(T), summariseAnimalCosts(DEMO_COST_ENTRIES, animalIdOf(T), "2026-10-16"));
    console.log("GOAL", JSON.stringify(g));
    console.log("  summary", JSON.stringify(v.profile.goal.summary));
    console.log("  timeline goal entries", JSON.stringify((v.profile.timeline as any).items?.filter((e: any) => e.id.startsWith("goal:"))));
    console.log("  saleDateSource", v.plan.saleDateSource, v.plan.defaults.saleDate);
    const vm = planScreenView({ inputs: v.plan.inputs, assumptions: v.plan.defaults, martId: v.plan.defaultMartId, projection: undefined, profile: v.profile });
    console.log("  goal row", JSON.stringify([...vm.rows].find((r) => r.key === "goalWeight")));
    console.log("  intent", JSON.stringify(planSaveIntent(v.profile.goal.read, T)));
  }
});
```

## p4.probe.ts

```ts
import { it } from "vitest";
import { replayCattleDemo } from "@/server/cattle-demo/demo-replay";
import { demoAnimalView } from "@/server/cattle-demo/demo-service";
import { DEMO_ANIMALS } from "@/server/cattle-demo/demo-herd";
it("deadlines", () => {
  const o = replayCattleDemo({ version: 1, events: [] });
  for (const s of o.jobs) console.log(s.job.id.slice(0,30), s.job.actionKey.slice(0,60), JSON.stringify(s.job.timing.recommendedWindow), JSON.stringify(s.job.timing.hardDeadline?.dueIso ?? null));
  for (const a of DEMO_ANIMALS) {
    const v = demoAnimalView({ version: 1, events: [] }, a.tag)!;
    const w = v.profile.work.open;
    if (w.state === "ITEMS") for (const j of [w.primary, ...w.others]) console.log(a.tag, j.title, JSON.stringify(j.window), JSON.stringify(j.hardDeadline));
    console.log(a.tag, "goal", JSON.stringify(v.profile.goal.summary), "sale", v.plan.defaults.saleDate, v.plan.saleDateSource, "weight", JSON.stringify(v.profile.metrics.weight.value), "housing", JSON.stringify(v.profile.identity.location.housing));
  }
});
```

## p5.probe.ts

```ts
import { it } from "vitest";
import { demoAnimalView, demoProjection } from "@/server/cattle-demo/demo-service";
import { DEMO_ANIMALS } from "@/server/cattle-demo/demo-herd";
import { planScreenView } from "@/domain/cattle/presentation";
it("profile vs plan projection consistency", () => {
  const sessions = [
    { version: 1 as const, events: [] as any[] },
    { version: 1 as const, events: [{ kind: "RECORD_WEIGHT", eventId: "a", tag: "1427", kg: 530, observedDate: null }, { kind: "SAVE_PLAN_GOAL", eventId: "b", tag: "1427", goalType: "FINISHING", targetKg: 655.5, targetDate: "2027-01-20" }, { kind: "SAVE_PLAN_GOAL", eventId: "c", tag: "1445", goalType: "FINISHING", targetKg: null, targetDate: "2027-02-01" }] },
  ];
  for (const s of sessions) for (const a of DEMO_ANIMALS) {
    const v = demoAnimalView(s as any, a.tag)!;
    const sale = v.plan.defaults.saleDate;
    const pr = demoProjection(s as any, a.tag, sale);
    const vm = planScreenView({ inputs: v.plan.inputs, assumptions: v.plan.defaults, martId: v.plan.defaultMartId, projection: pr, profile: v.profile });
    const pw = [...vm.rows].find((r) => r.key === "projectedWeightKg")!.value;
    const gw = [...vm.rows].find((r) => r.key === "goalWeight")?.value;
    console.log(s.events.length, a.tag, "goal:", v.profile.goal.summary.state === "TEXT" ? v.profile.goal.summary.text : v.profile.goal.summary.display.label, "| profile proj:", v.profile.projection.label, "| chart:", v.profile.chart.state === "CHART" && v.profile.chart.projection.state === "SHOWN" ? v.profile.chart.projection.label : "-", "| plan sale", sale, "proj", JSON.stringify(pw.text), "goalrow", gw?.text, "| target field", v.plan.defaults.saleDate);
  }
});
```

## p6.probe.ts

```ts
import { it } from "vitest";
import { demoAnimalView } from "@/server/cattle-demo/demo-service";
it("goal timeline superseded", () => {
  const s = { version: 1 as const, events: [{ kind: "SAVE_PLAN_GOAL", eventId: "b", tag: "1427", goalType: "FINISHING", targetKg: 655.5, targetDate: "2027-01-20" }] };
  const v = demoAnimalView(s as any, "1427")!;
  const t: any = v.profile.timeline;
  console.log(JSON.stringify(t.items.filter((e: any) => e.id.startsWith("goal:") || e.id.startsWith("weight:")), null, 0));
}, 30000);
```

## p7.probe.ts

```ts
import { it } from "vitest";
import { demoAnimalView, demoProjection } from "@/server/cattle-demo/demo-service";
import { planScreenView } from "@/domain/cattle/presentation";
it("far future", () => {
  const s = { version: 1 as const, events: [] };
  const v = demoAnimalView(s, "1427")!;
  for (const sale of ["2036-10-16", "9999-12-31"]) {
    const pr = demoProjection(s, "1427", sale);
    const vm = planScreenView({ inputs: v.plan.inputs, assumptions: { ...v.plan.defaults, saleDate: sale }, martId: v.plan.defaultMartId, projection: pr, profile: v.profile });
    console.log(sale, vm.titleDate, JSON.stringify([...vm.rows].map((r) => [r.label, r.value.text])), vm.headline.value.text);
  }
}, 30000);
```

## p8.probe.ts

```ts
import { it } from "vitest";
import { projectProductionGoals } from "@/domain/cattle/goals";
import { replayCattleDemo } from "@/server/cattle-demo/demo-replay";
import { animalIdOf, goalDeclaration } from "@/server/cattle-demo/demo-herd";
import { hash } from "@/server/cattle-demo/demo-catalogue";
import { buildAnimalProfile } from "@/domain/cattle/presentation";
import { DEMO_DIRECTORY } from "@/server/cattle-demo/demo-service";
import { summariseAnimalCosts } from "@/domain/animal-plan";
it("two active goals", () => {
  const T = "1427"; const animalId = animalIdOf(T);
  const o: any = structuredClone(replayCattleDemo({ version: 1, events: [] }, { animalIds: [animalId] }));
  const d1 = goalDeclaration({ goalId: "G-A", version: "1", supersedes: [], animalId, type: "FINISHING", targetKg: 640, targetDate: "2026-12-04", validFrom: "2026-05-01T00:00:00Z", receivedAt: "2026-05-01T00:00:00Z" });
  const d2 = goalDeclaration({ goalId: "G-B", version: "1", supersedes: [], animalId, type: "SALE", targetKg: null, targetDate: "2026-11-01", validFrom: "2026-05-01T00:00:00Z", receivedAt: "2026-05-01T00:00:00Z" });
  const g = projectProductionGoals(structuredClone({ declarations: [d1, d2], query: { subject: { kind: "ANIMAL", animalId }, effectiveAt: o.viewpoint.effectiveAt, knowledgeCutoff: o.viewpoint.knowledgeCutoff } }) as never, hash);
  if (!g.ok) { console.log(JSON.stringify(g.issues)); return; }
  console.log("C6 status", g.projection.status, g.projection.activeGoals.map((a: any) => a.declaration.goalType + " " + a.declaration.targetDate));
  o.goals[animalId] = g.projection;
  const p = buildAnimalProfile(o, animalId, DEMO_DIRECTORY, summariseAnimalCosts([], animalId, "2026-10-16"));
  console.log("profile goal", JSON.stringify(p.goal.summary), JSON.stringify(p.goal.state));
}, 30000);
```
