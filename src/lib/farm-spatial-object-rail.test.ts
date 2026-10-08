import { describe, expect, it } from "vitest";
import { tracked, type Housing, type LivestockGroup } from "@/domain/types";
import { cattleGroupRows, shedRows } from "./farm-spatial-object-rail";

function group(id: string, overrides: Partial<LivestockGroup> = {}): LivestockGroup {
  return { id, farmId: "f", category: "weanling", label: id, count: tracked(10, "verified", "Farmer"), system: "grazing", value: tracked(0, "estimated", "Farm Return assumption"), ...overrides };
}

function shed(id: string, linkedGroupIds: string[]): Housing {
  return { id, shedName: `Shed ${id}`, shedType: "other", linkedGroupIds } as unknown as Housing;
}

describe("cattleGroupRows", () => {
  it("names the shed a housed group is linked to, falling back to its own housingId", () => {
    const rows = cattleGroupRows([group("a", { system: "housed" }), group("b", { system: "housed", housingId: "h2" })], [shed("h1", ["a"]), shed("h2", [])]);
    expect(rows.map((r) => r.location)).toEqual(["Housed · Shed h1", "Housed · Shed h2"]);
  });

  it("says a housed group's shed is not recorded rather than guessing one", () => {
    const [row] = cattleGroupRows([group("a", { system: "housed" })], [shed("h1", [])]);
    expect(row).toMatchObject({ location: "Housed · shed not recorded", locationMissing: true });
  });

  it("never places a grazing group on a field", () => {
    expect(cattleGroupRows([group("a")], [])[0]).toMatchObject({ location: "Grazing · field not recorded", locationMissing: true });
  });

  it("shows an unavailable head count as Unknown, never 0", () => {
    const [row] = cattleGroupRows([group("a", { count: tracked(0, "unavailable", "Not recorded") })], []);
    expect(row).toMatchObject({ head: "Unknown", headMissing: true });
    expect(row.headBasis).toBeUndefined();
  });

  it("carries the provenance of a non-verified head count", () => {
    expect(cattleGroupRows([group("a", { count: tracked(12, "farmer_adjusted", "Farmer") })], [])[0]).toMatchObject({ head: "12 head", headBasis: "Farmer entered" });
  });
});

describe("shedRows", () => {
  it("states an unknown linked head count as unknown, not a number", () => {
    const [row] = shedRows([shed("h1", ["a", "b"])], [group("a"), group("b", { count: tracked(0, "unavailable", "Not recorded") })]);
    expect(row).toMatchObject({ occupancy: "2 groups · head count unknown", occupancyMissing: true });
  });

  it("reports real occupancy from linked groups", () => {
    expect(shedRows([shed("h1", ["a", "b"])], [group("a"), group("b")])[0]).toMatchObject({ occupancy: "20 head · 2 groups", type: "Other" });
  });
});
