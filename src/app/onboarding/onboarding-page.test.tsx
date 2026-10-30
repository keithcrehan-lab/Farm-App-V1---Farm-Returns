import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /onboarding resumes from what already exists and never shows a finished farmer onboarding again; the map-led
 * workspace opens on the right panel for each stage. The map itself (Mapbox) isn't rendered under jsdom.
 */

const data = vi.hoisted(() => ({ status: null as null | { farm: Record<string, unknown>; completed: boolean }, fields: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/farm-data/farms", () => ({ getOnboardingStatusForCurrentUser: vi.fn(async () => data.status) }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn(async () => data.fields) }));
vi.mock("@/lib/mapbox", async (orig) => ({ ...(await orig<typeof import("@/lib/mapbox")>()), mapboxConfigured: true }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/onboarding/OnboardingMap", () => ({ OnboardingMap: () => null }));
vi.mock("@/app/actions/onboarding", () => ({ establishFarmStep: vi.fn(), addOnboardingFieldStep: vi.fn(), finishOnboardingStep: vi.fn(), lookupExactEircodeStep: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ signOut: vi.fn() }));
const redirectTo = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    redirectTo.value = to;
    throw new Error("NEXT_REDIRECT");
  }),
}));

import OnboardingPage from "./page";
import { OnboardingWorkspace } from "@/components/onboarding/OnboardingWorkspace";

const farm = { id: "farm-a", name: "Back Avenue Farm", location: { county: "Galway", centroid: [-8.71, 53.31] }, primaryEnterprises: ["suckler_beef"], ownerName: "mary" };
const polygon: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[-8.712, 53.318], [-8.71, 53.318], [-8.71, 53.3195], [-8.712, 53.318]]] };

beforeEach(() => {
  data.status = null;
  data.fields = [];
  redirectTo.value = "";
  window.localStorage.clear();
});
afterEach(() => cleanup());

async function page() {
  const el = await OnboardingPage();
  return isValidElement<{ stage: string }>(el) ? el : null;
}

describe("/onboarding resumes truthfully", () => {
  it("a new account (no farm) starts at finding the farm", async () => {
    expect((await page())?.props.stage).toBe("LOCATE");
  });
  it("left after creating the farm → resumes at the first field", async () => {
    data.status = { farm, completed: false };
    expect((await page())?.props.stage).toBe("FIRST_FIELD");
  });
  it("left after saving a field → resumes at the next-steps choice", async () => {
    data.status = { farm, completed: false };
    data.fields = [{ id: "f1", name: "Meadow", polygon }];
    expect((await page())?.props.stage).toBe("NEXT_STEPS");
  });
  it("an archived field doesn't count as the farm's first field", async () => {
    data.status = { farm, completed: false };
    data.fields = [{ id: "f1", name: "Old", polygon, archivedAt: "2026-01-01T00:00:00Z" }];
    expect((await page())?.props.stage).toBe("FIRST_FIELD");
  });
  it("a finished farmer is sent to Farm — even with no fields", async () => {
    data.status = { farm, completed: true };
    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTo.value).toBe("/today");
  });
});

describe("the onboarding panel for each stage", () => {
  it("LOCATE: find the farm by search, current location or moving the map (location permission never required)", () => {
    render(<OnboardingWorkspace stage="LOCATE" farm={null} fields={[]} />);
    expect(screen.getByRole("heading", { name: "Let’s find your farm" })).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use my current location/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Yes, this is my farm/ })).toBeNull();
  });

  it("keeps the farmer's previous location search after a page refresh/remount", async () => {
    window.localStorage.setItem("farm-return:onboarding:location-search", "V95 TY07");
    render(<OnboardingWorkspace stage="LOCATE" farm={null} fields={[]} />);
    expect(await screen.findByDisplayValue("V95 TY07")).toBeInTheDocument();
  });

  it("FIRST_FIELD: one clear action to draw a real boundary", () => {
    render(<OnboardingWorkspace stage="FIRST_FIELD" farm={farm as never} fields={[]} />);
    expect(screen.getByRole("heading", { name: "Let’s add your first field" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Draw field boundary/ })).toBeInTheDocument();
  });

  it("NEXT_STEPS: three choices — explore, map another field, add cattle (cattle optional)", () => {
    render(<OnboardingWorkspace stage="NEXT_STEPS" farm={farm as never} fields={[{ id: "f1", name: "Meadow", polygon }]} />);
    expect(screen.getByRole("heading", { name: "Your farm is taking shape." })).toBeInTheDocument();
    expect(screen.getByText("1 field mapped · Meadow")).toBeInTheDocument();
    for (const name of [/Explore Farm Return/, /Map another field/, /Add cattle/]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("a farmer can always sign out mid-way", () => {
    render(<OnboardingWorkspace stage="FIRST_FIELD" farm={farm as never} fields={[]} />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
