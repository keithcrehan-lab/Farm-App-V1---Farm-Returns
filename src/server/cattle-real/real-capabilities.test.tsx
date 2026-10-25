import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Pilot acceptance — DECISIONS D16: authenticated real-mode recommendation candidates are capability-gated. Only
 * action families whose production store + farmer workflow exist are offered to the frozen engines (today: weights).
 * Programme, obligation, medicine/withdrawal and production-goal actions are not offered — which never asserts those
 * facts are absent: those parts stay "not supplied" (D8) and are shown as unknown / couldn't be checked.
 */

vi.mock("@/lib/farm-data/cattle-source", () => ({ readCattleSourceForCurrentFarm: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));

import type { LivestockGroup } from "@/domain/types";
import type { LivestockIndividualRow, WeightObservationRow } from "@/lib/farm-data/row-types";
import { DEFAULT_CANDIDATE_ACTION_REGISTRY } from "@/domain/cattle/recommendations";
import { RealAnimalProfileScreen } from "@/components/cattle/AnimalProfileScreen";
import { RealGroupScreen, RealHerdScreen } from "@/components/cattle/HerdScreens";
import { DEMO_ACTION_REGISTRY } from "@/server/cattle-demo/demo-catalogue";
import { demoHerdView } from "@/server/cattle-demo/demo-service";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { REAL_MODE_ACTION_REGISTRY, REAL_MODE_CAPABILITIES, evaluateRealCattle, realAnimalView, realHerdView, type RealEvaluation } from "./real-service";

const F = "f0000000-0000-4000-8000-00000000000a";
const G = "6a000000-0000-4000-8000-000000000001";
const TEST = "a1000000-0000-4000-8000-000000000001"; // weighed once, nothing else recorded (the dev animal "test")
const UNWEIGHED = "a1000000-0000-4000-8000-000000000002";
const VP = { effectiveAt: "2026-10-25T08:00:00Z", knowledgeCutoff: "2026-10-25T08:00:00Z" };

const UNSUPPORTED = ["COMPLETE_PROGRAMME_ACTION", "RESOLVE_OBLIGATION_EVIDENCE", "REVIEW_WITHDRAWAL_STATUS", "DECLARE_PRODUCTION_GOAL"] as const;
/** The frozen C10 titles / work-count phrases of the unsupported families. */
const UNSUPPORTED_WORDING = /Complete programme treatment|programme treatment due|declared veterinary programme|Record proof of a requirement|need(s)? proof recorded|Check withdrawal status|withdrawal check|Set a production goal|ha(s|ve) no goal/i;

const group: LivestockGroup = { id: G, farmId: F, category: "weanling", label: "weanlings", count: { value: 20, status: "verified", source: "Owner" }, system: "grazing", value: { value: 0, status: "estimated", source: "Farm Return assumption" } };
const animal = (id: string, tag: string): LivestockIndividualRow => ({ id, farm_id: F, group_id: G, tag_number: tag, category: "steer", sex: "male", breed: "Belgian Blue", date_of_birth: "2019-02-01", goal_status: null, notes: null, created_at: "2026-10-24T08:00:00+00:00", updated_at: "2026-10-24T08:00:00+00:00" });
const w: WeightObservationRow = { id: "c0000000-0000-4000-8000-000000000001", farm_id: F, animal_id: TEST, weight_kg: 600, observed_date: "2026-10-24", source: "Farmer entered", created_at: "2026-10-24T09:00:00+00:00" };

function evaluated(withUnweighed = true): RealEvaluation {
  const r = evaluateRealCattle({ farmId: F, groups: [group], animals: [animal(TEST, "test"), ...(withUnweighed ? [animal(UNWEIGHED, "IE 2")] : [])], weights: [w] }, VP);
  if (!r.ok) throw new Error(r.reason);
  return r.evaluation;
}
const openKinds = (e: RealEvaluation, id: string) => {
  const p = realAnimalView(e, id)!.profile;
  return p.work.open.state === "ITEMS" ? [p.work.open.primary, ...p.work.open.others].map((x) => x.actionKind) : [];
};

afterEach(() => cleanup());

describe("D16 — the real-mode supported action set", () => {
  it("1–4: programme, obligation, withdrawal and production-goal actions are not offered; weights are", () => {
    const kinds = REAL_MODE_ACTION_REGISTRY.definitions.map((d) => d.actionKind);
    for (const k of UNSUPPORTED) expect(kinds).not.toContain(k);
    expect(kinds).toEqual(["RECORD_WEIGHT"]);
    expect(REAL_MODE_CAPABILITIES).toEqual({ weights: true, veterinaryProgrammes: false, obligations: false, healthRecords: false, productionGoals: false });
  });

  it("the supported definitions are the frozen ones, unchanged (same object, not a re-written copy)", () => {
    const frozen = DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.find((d) => d.actionKind === "RECORD_WEIGHT");
    expect(REAL_MODE_ACTION_REGISTRY.definitions[0]).toBe(frozen);
  });

  it("14: the frozen default registry itself still carries all five action families", () => {
    expect(DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.map((d) => d.actionKind).sort()).toEqual([...UNSUPPORTED, "RECORD_WEIGHT"].sort());
  });
});

describe("D16 — what a farmer sees", () => {
  it("5/11: a weighed animal with no other supported data gap gets no job — not one unsupported job after another, and no made-up Record Weight", () => {
    expect(openKinds(evaluated(), TEST)).toEqual([]);
  });

  it("10/12: an animal with no weight still gets the frozen Record Weight proposal", () => {
    expect(openKinds(evaluated(), UNWEIGHED)).toEqual(["RECORD_WEIGHT"]);
  });

  it("6: the herd counts only supported work (the unweighed animal), never an unsupported job as due", () => {
    render(<RealHerdScreen view={realHerdView(evaluated())} />);
    expect(document.body.textContent).not.toMatch(UNSUPPORTED_WORDING);
    expect(screen.getByText(/1 animal needs weighing/)).toBeInTheDocument();
  });

  it("7: the group counts no unsupported job", () => {
    render(<RealGroupScreen view={realHerdView(evaluated(false))} groupRef={G} />);
    expect(document.body.textContent).not.toMatch(UNSUPPORTED_WORDING);
  });

  it("8/9: the animal profile presents no unsupported job, and still says those records aren't kept / couldn't be checked", () => {
    render(<RealAnimalProfileScreen view={realAnimalView(evaluated(), TEST)!} />);
    expect(document.body.textContent).not.toMatch(UNSUPPORTED_WORDING);
    expect(screen.getByText("Veterinary programmes")).toBeInTheDocument();
    expect(screen.getAllByText("Couldn't be checked").length).toBeGreaterThan(0);
    expect(screen.getByText(/Health and medicine records aren't kept in Farm Return yet/)).toBeInTheDocument();
    expect(screen.getByText(/Production goals can't be set in Farm Return yet/)).toBeInTheDocument();
  });

  it("unsupported parts are still passed as not supplied (D8): capability-gating never turns unknown into none", () => {
    const e = evaluated();
    expect(e.outputs.health[TEST]).toBeNull();
    expect(e.outputs.goals[TEST]).toBeNull();
  });
});

describe("D16 — demo mode is unchanged", () => {
  it("13: demo still evaluates the full default registry, and its herd still raises the unsupported-in-real families", () => {
    expect(DEMO_ACTION_REGISTRY).toBe(DEFAULT_CANDIDATE_ACTION_REGISTRY);
    const herd = demoHerdView(EMPTY_CATTLE_DEMO_SESSION, "STANDARD");
    const kinds = herd.groups.state === "ITEMS" ? herd.groups.items.flatMap((g) => (g.workCounts.state === "ITEMS" ? g.workCounts.items.map((c) => c.actionKind) : [])) : [];
    expect(kinds.some((k) => k !== null && (UNSUPPORTED as readonly string[]).includes(k))).toBe(true);
  });
});
