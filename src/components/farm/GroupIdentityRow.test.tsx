import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GroupIdentityRow } from "./GroupIdentityRow";
import { tracked } from "@/domain/types";
import type { LivestockGroup } from "@/domain/types";

afterEach(() => {
  cleanup();
});

// Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
// F9) — the exact real audited case: a group labelled "weanlings"
// stored with category "suckler_cow", silently driving every real N/LU
// calculation as suckler cows while the label implied otherwise.
function group(overrides: Partial<LivestockGroup> = {}): LivestockGroup {
  return {
    id: "g1",
    farmId: "farm-1",
    category: "suckler_cow",
    label: "weanlings",
    count: tracked(20, "verified", "Farmer"),
    system: "grazing",
    value: tracked(30000, "estimated", "Farm Return estimate"),
    ...overrides,
  };
}

describe("GroupIdentityRow", () => {
  it("exposes the real category actually driving calculations, even when it differs from the farmer's own label", () => {
    render(<GroupIdentityRow group={group()} />);
    expect(screen.getByText(/weanlings/i)).toBeTruthy();
    expect(screen.getByText(/calculated as Suckler cow/i)).toBeTruthy();
  });

  it("still shows the real category when the label and category genuinely agree — never hidden either way", () => {
    render(<GroupIdentityRow group={group({ label: "Suckler cows", category: "suckler_cow" })} />);
    expect(screen.getByText(/calculated as Suckler cow/i)).toBeTruthy();
  });
});
