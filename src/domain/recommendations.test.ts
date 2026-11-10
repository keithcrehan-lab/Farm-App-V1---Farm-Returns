import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./farm-calendar";
import { spreadingCompliance } from "./spreading-compliance";
import {
  applyLifecycle, buildRecommendations, candidateRecommendations, fingerprintOf, weeklyOverview,
  type GrazingContext, type PlanningContext, type PromptLike, type RecommendationState, type SlurryForecastLike,
} from "./recommendations";

const TODAY = "2026-11-10";
const FIELDS = [
  { id: "f-home", name: "Home Field" }, { id: "f-back", name: "Back Field" },
  { id: "f-river", name: "River Field" }, { id: "f-road", name: "Road Field" },
];

let n = 0;
const p = (kind: string, fieldId: string, basis: Record<string, unknown>, extra: Partial<PromptLike> = {}): PromptLike => ({
  id: `p${n++}`, kind, fieldId, basis, title: `${kind} needs review`, description: "RAW_CODE (MISSING_THING)", ...extra,
});
const CLOSED = { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD_CALENDAR", consequence: "x" };

/** The same prompt batch `buildAllRealPrompts` produces for the 4-field mock farm in Co. Cork. */
function corkPrompts(): PromptLike[] {
  return FIELDS.flatMap((f) => [
    p("spreading_window", f.id, CLOSED, { inputsSnapshot: { material: "chemical_fertiliser", rule: "GFT057-GFT080 closed periods" }, calculationVersion: "spreading_window_gate_v2.0.0+closed_period_calendar_v1.0.0" }),
    p("spreading_window", f.id, CLOSED, { inputsSnapshot: { material: "organic_fertiliser_other_than_FYM" } }),
    p("soil_test_age", f.id, { status: f.id === "f-river" ? "OK" : "NOT_APPLICABLE" }),
    p("commonage_status", f.id, { status: "BLOCKED_INSUFFICIENT_EVIDENCE", missingInputs: ["FIELD_COMMONAGE_STATUS"] }),
    p("local_buffer_override", f.id, { status: "BLOCKED_INSUFFICIENT_EVIDENCE", missingInputs: ["LOCAL_WATER_BUFFER_OVERRIDE"] }),
    f.id === "f-back"
      ? p("fertiliser_recommendation", f.id, { status: "BLOCKED_INSUFFICIENT_EVIDENCE", missingInputs: ["silage"] })
      : p("fertiliser_recommendation", f.id, { status: "OK" }, { description: `${f.name} needs 142 kg N, 20 kg P, 11 kg K per ha.` }),
  ]);
}

function ctx(over: Partial<PlanningContext> = {}): PlanningContext {
  const prompts = over.prompts ?? corkPrompts();
  return {
    farmId: "farm-1", today: TODAY, fields: FIELDS, prompts,
    compliance: spreadingCompliance("Co. Cork", over.today ?? TODAY, prompts),
    entries: [], lastWalkDate: undefined, ...over,
  };
}

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  id: "e1", kind: "job", category: "cattle", title: "Dose weanlings", startDate: TODAY, endDate: TODAY, startTime: null, endTime: null,
  status: "planned", assignee: null, notes: null, fieldIds: [], source: "farmer", ...over,
});

const NO_RAW = /[A-Z]{3,}_[A-Z_]+|_v\d|needs review/;

describe("scenario 1: chemical fertiliser spreading is prohibited", () => {
  const recs = buildRecommendations(ctx());

  it("shows the closed periods once, as farm-level information with reopening dates", () => {
    const c = spreadingCompliance("Co. Cork", TODAY, corkPrompts())!;
    expect(c.zone).toBe("A");
    const chemical = c.restrictions.find((r) => r.material === "chemical_fertiliser")!;
    expect(chemical).toMatchObject({ active: true, closedThrough: "2027-01-29", reopens: "2027-01-30" });
    expect(c.restrictions.find((r) => r.material === "organic_fertiliser_other_than_FYM")).toMatchObject({ active: true, reopens: "2027-01-13" });
    expect(c.conditions.length).toBeGreaterThan(0);
  });

  it("turns 8 identical spreading-window prompts into no jobs at all", () => {
    expect(recs.some((r) => /spreading window/i.test(r.title))).toBe(false);
    expect(recs.filter((r) => r.statutory && r.action.type === "plan")).toHaveLength(0);
  });

  it("suggests preparing next year's fertiliser plan once, for the fields with a figure", () => {
    const plan = recs.filter((r) => r.key.startsWith("fertiliser:prepare-plan"));
    expect(plan).toHaveLength(1);
    expect(plan[0].title).toBe("Prepare your 2027 fertiliser plan");
    expect(plan[0].explanation).toContain("restricted until 29 Jan");
    expect(plan[0].subject.ids).toEqual(["f-home", "f-river", "f-road"]);
    expect(plan[0].action).toMatchObject({ type: "plan", plan: { endDate: "2027-01-29", category: "nutrients" } });
    expect(plan[0].reliability).toBe("calculated");
  });

  it("never shows raw codes, versions or 'needs review' in titles or explanations", () => {
    for (const r of recs) {
      expect(r.title).not.toMatch(NO_RAW);
      expect(r.explanation).not.toMatch(NO_RAW);
      for (const e of r.evidence) expect(`${e.label} ${e.value}`).not.toMatch(NO_RAW);
    }
  });
});

describe("deduplication across fields", () => {
  const recs = candidateRecommendations(ctx());
  it("folds per-field gaps into one farm-level recommendation each", () => {
    expect(recs.filter((r) => r.key === "fields:spreading-details:farm")).toHaveLength(1);
    expect(recs.find((r) => r.key === "fields:spreading-details:farm")!.subject.ids).toHaveLength(4);
    expect(new Set(recs.map((r) => r.key)).size).toBe(recs.length);
  });
  it("keeps the field that genuinely needs something different on its own", () => {
    const blocked = recs.find((r) => r.key === "fertiliser:complete-inputs:farm")!;
    expect(blocked.subject.ids).toEqual(["f-back"]);
    expect(blocked.explanation).toContain("the silage plan");
  });
  it("keeps keys stable between rebuilds", () => {
    expect(candidateRecommendations(ctx()).map((r) => r.key)).toEqual(recs.map((r) => r.key));
  });
});

describe("scenario 6: incomplete soil information", () => {
  it("asks once for the fields without a soil test", () => {
    const soil = candidateRecommendations(ctx()).find((r) => r.key === "fields:soil-tests:farm")!;
    expect(soil.title).toBe("Add soil test results for 3 fields");
    expect(soil.subject.ids).not.toContain("f-river");
    expect(soil.reliability).toBe("missing");
  });
  it("says why an existing test can't be used and goes to that field", () => {
    const prompts = corkPrompts().map((x) => (x.kind === "soil_test_age" && x.fieldId === "f-home"
      ? { ...x, basis: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", missingInputs: ["plannedUse"] } }
      : x.kind === "soil_test_age" && x.fieldId === "f-road" ? { ...x, basis: { status: "AMBIGUOUS" } } : x));
    const soil = candidateRecommendations(ctx({ prompts })).find((r) => r.key === "fields:soil-tests:farm")!;
    expect(soil.title).toBe("Check soil tests for 3 fields");
    expect(soil.explanation).toContain("Home Field: needs what the field is used for.");
    expect(soil.explanation).toContain("Road Field: p result is on the Index 3/4 boundary.");
    expect(soil.action).toMatchObject({ type: "open", href: "/fields?field=f-home&chapter=nutrients" });
  });
});

describe("scenario 3: grass measurements are overdue", () => {
  it("suggests a walk, and drops it once a walk is recorded", () => {
    expect(buildRecommendations(ctx({ lastWalkDate: "2026-10-22" })).find((r) => r.key === "grass:walk:farm")?.explanation).toContain("19 days ago");
    expect(buildRecommendations(ctx({ lastWalkDate: "2026-11-09" })).some((r) => r.key === "grass:walk:farm")).toBe(false);
    expect(buildRecommendations(ctx()).some((r) => r.key === "grass:walk:farm")).toBe(false);
  });
});

describe("scenario 2 and 7: slurry storage approaching capacity during the closed period", () => {
  const forecast: SlurryForecastLike = {
    status: "READY", targetDate: "2027-01-13", version: "slurry_storage_forecast_v1",
    stores: [{ status: "READY", housingId: "h1", shedName: "Main shed", capacityM3: 400, projectedVolumeM3: 430, projectedFillPct: 107.5, overflowM3: 30, assumptions: ["Housed stock stay housed until the target date"] }],
  };
  const recs = buildRecommendations(ctx({ hasHousing: true, slurryForecast: forecast }));
  it("raises one connected recommendation that names the closed period", () => {
    const s = recs.filter((r) => r.source === "slurry");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ category: "attention", reliability: "modelled", dismissible: false, statutory: true });
    expect(s[0].title).toBe("Slurry storage may run out before spreading reopens");
    expect(s[0].why).toContain("closed period");
  });
  it("ranks it first", () => {
    expect(recs[0].source).toBe("slurry");
  });
  it("asks for tank details instead of inventing levels", () => {
    const blocked = buildRecommendations(ctx({ hasHousing: true, slurryForecast: { ...forecast, status: "PARTIAL", stores: [{ status: "BLOCKED", housingId: "h1", shedName: "Main shed", reasonCodes: ["MISSING_CAPACITY"] }] } }));
    expect(blocked.find((r) => r.source === "slurry")?.key).toBe("slurry:storage-details:farm");
  });
});

describe("scenario 5: a scheme deadline approaches", () => {
  it("raises the deadline with the scheme's own wording and date", () => {
    const r = buildRecommendations(ctx({ schemeName: "SCEP", schemeActions: [{ key: "weighing", label: "Weigh cows and calves", deadline: "2026-11-25", deadlineState: "upcoming", state: "NOT_MET", detail: "12 of 20 weighed." }] }));
    const s = r.find((x) => x.source === "schemes")!;
    expect(s).toMatchObject({ category: "attention", date: "2026-11-25", dismissible: false });
    expect(s.explanation).toBe("12 of 20 weighed.");
  });
  it("ignores deadlines more than 60 days out or already past", () => {
    const r = buildRecommendations(ctx({ schemeActions: [{ key: "a", label: "A", deadline: "2027-03-01", deadlineState: "upcoming", state: "NOT_MET", detail: "" }, { key: "b", label: "B", deadline: "2026-10-01", deadlineState: "past", state: "NOT_MET", detail: "" }] }));
    expect(r.some((x) => x.source === "schemes")).toBe(false);
  });
});

describe("calendar: overdue jobs and unbooked vet or contractor work", () => {
  const recs = buildRecommendations(ctx({ entries: [
    entry({ id: "late", endDate: "2026-11-05", startDate: "2026-11-01" }),
    entry({ id: "vet", category: "vet", kind: "appointment", title: "TB test", startDate: "2026-11-18", endDate: "2026-11-18", startTime: "10:00" }),
    entry({ id: "vet2", category: "vet", kind: "appointment", title: "Scan", startDate: "2027-01-18", endDate: "2027-01-18", startTime: "10:00" }),
  ] }));
  it("asks to complete the overdue job and book the vet, but not a booking two months out", () => {
    expect(recs.find((r) => r.key === "calendar:overdue:late")?.action).toEqual({ type: "complete", label: "Mark done", entryId: "late" });
    expect(recs.find((r) => r.key === "calendar:book:vet")?.title).toBe("Book the vet: TB test");
    expect(recs.some((r) => r.key === "calendar:book:vet2")).toBe(false);
  });
  it("ranks attention above upcoming above opportunities", () => {
    const order = recs.map((r) => r.category);
    expect(order.indexOf("attention")).toBeLessThan(order.indexOf("upcoming"));
    expect(order.lastIndexOf("upcoming")).toBeLessThan(order.indexOf("opportunity"));
  });
});

describe("lifecycle: plan, snooze, dismiss, complete, expiry", () => {
  const base = candidateRecommendations(ctx());
  const plan = base.find((r) => r.key.startsWith("fertiliser:prepare-plan"))!;
  const state = (s: Partial<RecommendationState>): RecommendationState => ({ key: plan.key, status: "dismissed", fingerprint: plan.fingerprint, snoozedUntil: null, ...s });

  it("marks a recommendation planned once a calendar entry is made from it, and done when that entry is done", () => {
    expect(applyLifecycle(base, [], [entry({ id: "x", sourceKey: plan.key })], TODAY).find((r) => r.key === plan.key)).toMatchObject({ status: "planned", planEntryId: "x" });
    expect(applyLifecycle(base, [], [entry({ id: "x", sourceKey: plan.key, status: "done" })], TODAY).find((r) => r.key === plan.key)?.status).toBe("done");
  });
  it("holds a dismissal until the circumstances change", () => {
    expect(applyLifecycle(base, [state({})], [], TODAY).find((r) => r.key === plan.key)?.status).toBe("dismissed");
    expect(applyLifecycle(base, [state({ fingerprint: fingerprintOf(["other"]) })], [], TODAY).find((r) => r.key === plan.key)?.status).toBe("active");
  });
  it("brings a snoozed recommendation back after the snooze date", () => {
    expect(applyLifecycle(base, [state({ status: "snoozed", snoozedUntil: "2026-11-17" })], [], TODAY).find((r) => r.key === plan.key)?.status).toBe("snoozed");
    expect(applyLifecycle(base, [state({ status: "snoozed", snoozedUntil: "2026-11-17" })], [], "2026-11-17").find((r) => r.key === plan.key)?.status).toBe("active");
  });
  it("ignores a dismissal on something that can't be dismissed", () => {
    const slurry = candidateRecommendations(ctx({ hasHousing: true, slurryForecast: { status: "READY", targetDate: "2027-01-13", version: "v", stores: [{ status: "READY", housingId: "h", shedName: "Shed", capacityM3: 100, projectedVolumeM3: 120, projectedFillPct: 120, overflowM3: 20, assumptions: [] }] } })).find((r) => r.source === "slurry")!;
    expect(applyLifecycle([slurry], [{ key: slurry.key, status: "dismissed", fingerprint: slurry.fingerprint, snoozedUntil: null }], [], TODAY)[0].status).toBe("active");
  });
  it("drops recommendations past their expiry date", () => {
    expect(applyLifecycle(base, [], [], "2027-01-31").some((r) => r.key === plan.key)).toBe(false);
  });
});

describe("scenario 4 and data changes: recommendations follow the farm data", () => {
  it("drops the soil-test request for a field once its test is recorded", () => {
    const prompts = corkPrompts().map((x) => (x.kind === "soil_test_age" && x.fieldId === "f-home" ? { ...x, basis: { status: "OK" } } : x));
    const soil = candidateRecommendations(ctx({ prompts })).find((r) => r.key === "fields:soil-tests:farm")!;
    expect(soil.subject.ids).not.toContain("f-home");
    expect(soil.fingerprint).not.toBe(candidateRecommendations(ctx()).find((r) => r.key === "fields:soil-tests:farm")!.fingerprint);
  });
  it("switches from preparing a plan to spreading once the closed period ends", () => {
    // In spring the field checks report the calendar open again.
    const open = corkPrompts().map((x) => (x.kind === "spreading_window" ? { ...x, basis: { status: "OK" } } : x));
    const spring = buildRecommendations(ctx({ today: "2027-03-02", prompts: open }));
    expect(spring.some((r) => r.key.startsWith("fertiliser:prepare-plan"))).toBe(false);
    expect(spring.find((r) => r.key.startsWith("fertiliser:apply"))?.title).toBe("Fertiliser is due on 3 fields");
  });
});

describe("weekly overview", () => {
  it("summarises from real data only", () => {
    const c = ctx({ entries: [entry({ id: "late", startDate: "2026-11-01", endDate: "2026-11-05" }), entry({ id: "w", startDate: "2026-11-12", endDate: "2026-11-12" })] });
    const recs = buildRecommendations(c);
    const o = weeklyOverview(recs, c.entries, c.compliance, TODAY);
    expect(o.attention.map((r) => r.key)).toEqual(["calendar:overdue:late"]);
    expect(o.comingUp.map((e) => e.id)).toEqual(["w"]);
    expect(o.restrictions).toEqual(expect.arrayContaining(["Chemical fertiliser closed until 29 Jan", "Slurry and soiled water closed until 12 Jan"]));
  });
  it("is empty rather than invented for a farm with no data", () => {
    const o = weeklyOverview(buildRecommendations({ farmId: "x", today: TODAY, fields: [], prompts: [], compliance: null, entries: [] }), [], null, TODAY);
    expect(o).toEqual({ attention: [], comingUp: [], opportunities: 0, canWait: 0, restrictions: [] });
  });
});

describe("scenario 4: cattle move between fields", () => {
  const fields: GrazingContext["fields"] = [
    { fieldId: "f-home", name: "Home Field", known: true, coverKgDmHa: 640, basis: "estimated", band: "below_target", measuredAgeDays: 9 },
    { fieldId: "f-river", name: "River Field", known: true, coverKgDmHa: 1530, basis: "measured", band: "target", measuredAgeDays: 3 },
    { fieldId: "f-road", name: "Road Field", known: true, coverKgDmHa: 2410, basis: "measured", band: "surplus", measuredAgeDays: 3 },
    { fieldId: "f-back", name: "Back Field", known: false },
  ];
  const inHome = { sessionId: "s1", fieldId: "f-home", groupId: "g1", groupLabel: "Weanlings", headCount: 24, startedAt: "2026-04-20T08:00:00Z" };
  const april = (grazing: GrazingContext) => buildRecommendations(ctx({ today: "2026-04-28", grazing }));

  it("says to move a group off a field below target, and names the best free field", () => {
    const move = april({ fields, open: [inHome] }).find((r) => r.key === "grazing:move:g1")!;
    expect(move).toMatchObject({ category: "attention", reliability: "modelled" });
    expect(move.title).toBe("Move Weanlings out of Home Field");
    expect(move.explanation).toContain("estimated at about 640 kg DM/ha");
    expect(move.explanation).toContain("Road Field is the best next field");
    expect(move.action).toMatchObject({ type: "open", href: "/cattle/groups/g1", plan: { fieldIds: ["f-road"] } });
  });

  it("retires the advice once the move is recorded", () => {
    const moved = april({ fields, open: [{ ...inHome, sessionId: "s2", fieldId: "f-road" }] });
    expect(moved.some((r) => r.key === "grazing:move:g1")).toBe(false);
    // Road Field is now occupied, so it is no longer offered as ready to graze.
    expect(moved.find((r) => r.key === "grazing:ready:farm")?.subject.ids ?? []).not.toContain("f-road");
  });

  it("asks for a reading when cattle are in a field with none", () => {
    const r = april({ fields, open: [{ ...inHome, fieldId: "f-back" }] }).find((x) => x.key === "grazing:measure:f-back")!;
    expect(r.title).toBe("Measure Back Field while Weanlings graze it");
    expect(r.reliability).toBe("missing");
  });

  it("offers fields above target with no cattle, but not in midwinter", () => {
    expect(april({ fields, open: [] }).find((r) => r.key === "grazing:ready:farm")?.title).toBe("Road Field is ready to graze");
    expect(buildRecommendations(ctx({ today: "2026-12-10", grazing: { fields, open: [] } })).some((r) => r.key === "grazing:ready:farm")).toBe(false);
  });
});

describe("schemes: progress figures", () => {
  it("stays quiet when the action is already complete", () => {
    const r = buildRecommendations(ctx({ schemeActions: [{ key: "w", label: "Weigh", deadline: "2026-11-25", deadlineState: "upcoming", state: "NEEDS_ATTENTION", detail: "20 of 20", current: 20, target: 20 }] }));
    expect(r.some((x) => x.source === "schemes")).toBe(false);
  });
});
