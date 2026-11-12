import { describe, expect, it } from "vitest";
import type { Field } from "@/domain/types";
import {
  cattleGroupWhereabouts,
  fieldAtPoint,
  fromLocalDateTimeInput,
  moveRefusedMessage,
  moveTimeProblem,
  placeCattleGroups,
  toLocalDateTimeInput,
  type CattleMapGroup,
} from "./farm-cattle-map";

const square = (x0: number, y0: number): GeoJSON.Polygon => ({
  type: "Polygon",
  coordinates: [[[x0, y0], [x0 + 0.001, y0], [x0 + 0.001, y0 + 0.001], [x0, y0 + 0.001], [x0, y0]]],
});
const field = (id: string, polygon?: GeoJSON.Polygon, extra: Partial<Field> = {}) =>
  ({ id, name: id.toUpperCase(), areaHa: 1, centroid: [0, 0], polygon, ...extra }) as unknown as Field;
const FIELDS = [field("a", square(-8.8, 52.7)), field("b", square(-8.798, 52.7)), field("unmapped"), field("old", square(-8.796, 52.7), { archivedAt: "2026-01-01" } as Partial<Field>)];
const group = (id: string, extra: Partial<CattleMapGroup> = {}): CattleMapGroup => ({ id, label: id, headCount: 10, system: "grazing", ...extra });

describe("cattle groups on the Farm map", () => {
  it("puts each group on its mapped field and everything else in the strip", () => {
    const placed = placeCattleGroups([
      group("Weanlings", { currentFieldId: "a" }),
      group("Cows", { currentFieldId: "a" }),
      group("Bulls", { currentFieldId: "unmapped" }),
      group("Stores", { currentFieldId: "old" }),
      group("Housed", { system: "housed" }),
    ], FIELDS);
    expect(placed.byField.get("a")?.map((g) => g.id)).toEqual(["Cows", "Weanlings"]);
    expect(placed.byField.has("unmapped")).toBe(false);
    expect(placed.elsewhere.map((g) => g.id)).toEqual(["Bulls", "Housed", "Stores"]);
  });

  it("finds the mapped field under a point, and nothing between fields or on an archived field", () => {
    expect(fieldAtPoint(FIELDS, { lng: -8.7995, lat: 52.7005 })?.id).toBe("a");
    expect(fieldAtPoint(FIELDS, { lng: -8.7975, lat: 52.7005 })?.id).toBe("b");
    expect(fieldAtPoint(FIELDS, { lng: -8.7985, lat: 52.7005 })).toBeUndefined();
    expect(fieldAtPoint(FIELDS, { lng: -8.7955, lat: 52.7005 })).toBeUndefined();
  });

  it("says where a group is", () => {
    expect(cattleGroupWhereabouts(group("x", { currentFieldName: "Callas 1" }))).toBe("in Callas 1");
    expect(cattleGroupWhereabouts(group("x", { system: "housed" }))).toBe("housed");
    expect(cattleGroupWhereabouts(group("x"))).toBe("not on a field");
  });

  it("round-trips the move time through the time picker, to the minute", () => {
    const at = new Date(2026, 10, 12, 19, 5, 42);
    expect(toLocalDateTimeInput(at)).toBe("2026-11-12T19:05");
    expect(fromLocalDateTimeInput("2026-11-12T19:05")?.getTime()).toBe(new Date(2026, 10, 12, 19, 5).getTime());
    expect(fromLocalDateTimeInput("")).toBeUndefined();
    expect(fromLocalDateTimeInput("12/11/2026")).toBeUndefined();
  });

  it("checks the move time before sending: not missing, not in the future, after the group went into its field", () => {
    const now = new Date("2026-11-12T19:00:00Z");
    const g = group("Weanlings", { currentFieldName: "Callas 1", currentSince: "2026-11-12T08:00:00Z" });
    expect(moveTimeProblem(undefined, g, now)).toMatch(/pick the date/i);
    expect(moveTimeProblem(new Date("2026-11-12T20:00:00Z"), g, now)).toMatch(/future/i);
    expect(moveTimeProblem(new Date("2026-11-12T08:00:00Z"), g, now)).toMatch(/went into Callas 1 after that/);
    expect(moveTimeProblem(new Date("2026-11-12T12:00:00Z"), g, now)).toBeUndefined();
  });

  it("explains a refused move in plain words, with a safe default", () => {
    expect(moveRefusedMessage("HEADCOUNT_NOT_RECORDED")).toMatch(/head count/i);
    expect(moveRefusedMessage("SOMETHING_NEW")).toMatch(/nothing was changed/i);
  });
});
