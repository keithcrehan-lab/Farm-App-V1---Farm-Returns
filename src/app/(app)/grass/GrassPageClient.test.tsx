import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrassPageClient } from "./GrassPageClient";
import type { Field, Farm } from "@/domain/types";

const FIELD_ID = "11111111-1111-4111-8111-111111111111";
const FARM_ID = "22222222-2222-4222-8222-222222222222";
const field = {
  id: FIELD_ID,
  farmId: FARM_ID,
  name: "Home Field",
  areaHa: 4,
  centroid: [-8, 53],
  polygon: { type: "Polygon", coordinates: [[[-8,53],[-8.001,53],[-8.001,53.001],[-8,53]]] },
  fertility: {},
} as Field;
const farm = { id: FARM_ID, name: "Ballybeg Farm", ownerName: "Keith", location: { centroid: [-8, 53] } } as Farm;

const getData = vi.fn();
const recordCover = vi.fn();
const recordGrowth = vi.fn();
vi.mock("@/app/actions/grass-surveys", () => ({ listGrassSurveysAction: vi.fn(async () => ({ ok: true, surveys: [] })) }));
vi.mock("@/app/actions/grass-management", () => ({
  getGrassManagementDataAction: (...args: unknown[]) => getData(...args),
  recordGrassCoverObservationAction: (...args: unknown[]) => recordCover(...args),
  recordGrassGrowthObservationAction: (...args: unknown[]) => recordGrowth(...args),
}));
const SECOND_FIELD_ID = "55555555-5555-4555-8555-555555555555";
const secondField = {
  id: SECOND_FIELD_ID,
  farmId: FARM_ID,
  name: "River Field",
  areaHa: 6,
  centroid: [-8.0095, 53.0105],
  polygon: { type: "Polygon", coordinates: [[[-8.01,53.01],[-8.009,53.01],[-8.009,53.011],[-8.01,53.011],[-8.01,53.01]]] },
  fertility: {},
} as Field;
let storeFields: Field[] = [field];
vi.mock("@/store/farm-store", () => ({ useFarm: () => farm, useFields: () => storeFields }));
vi.mock("@/components/farm/MapHero", () => ({
  MapHero: (props: { fields: Field[]; getStatusLabel?: (f: Field) => string | undefined; getTone: (f: Field) => string }) => (
    <div data-testid="grass-map">{props.fields.map((f) => <span key={f.id}>{f.name}:{props.getStatusLabel?.(f)}:{props.getTone(f)}</span>)}</div>
  ),
}));
let gpsFix: { lat: number; lng: number; accuracyMeters: number } | null = null;
let capabilityDelay: Promise<void> | null = null;
const gpsStart = vi.fn();
const gpsStop = vi.fn();
vi.mock("@/lib/location/web-location-tracking-provider", () => ({
  createWebLocationTrackingProvider: () => ({
    getCapability: async () => {
      if (capabilityDelay) await capabilityDelay;
      return { activeTrackingSupported: gpsFix !== null, permissionState: "prompt" };
    },
    startActiveTracking: async (onPosition: (position: { lat: number; lng: number; accuracyMeters: number }) => void) => {
      gpsStart();
      if (gpsFix) onPosition(gpsFix);
    },
    stopActiveTracking: async () => { gpsStop(); },
  }),
}));

const empty = { status: "ok" as const, fields: [{ id: FIELD_ID, name: "Home Field", areaHa: 4 }], coverObservations: [], growthObservations: [], grazingSessions: [], openGrazingSessions: [] };

function isoDaysAgo(days: number): string { return new Date(Date.now() - days * 86_400_000).toISOString(); }

/** Grass V2 opens on the wedge; the map mounts the first time it's shown. */
function showFarmMap() {
  fireEvent.click(within(screen.getByRole("group", { name: "Grass view" })).getByRole("button", { name: "Farm map" }));
}

describe("GrassPageClient guided walk", () => {
  const twoFields = { ...empty, fields: [{ id: FIELD_ID, name: "Home Field", areaHa: 4 }, { id: SECOND_FIELD_ID, name: "River Field", areaHa: 6 }] };
  const saved = (fieldId: string, coverKgDmHa: number) => ({ status: "recorded", observation: { fieldId, coverKgDmHa } });
  const progress = () => document.querySelector("[data-grass-walk-progress]")?.textContent;
  const current = () => document.querySelector("[data-grass-walk-current]")?.textContent;

  beforeEach(() => {
    vi.clearAllMocks();
    storeFields = [field, secondField];
    gpsFix = null;
    capabilityDelay = null;
    getData.mockResolvedValue(twoFields);
  });
  afterEach(() => {
    cleanup();
    storeFields = [field];
    gpsFix = null;
    capabilityDelay = null;
  });

  async function startWalk() {
    render(<GrassPageClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Start guided walk" }));
  }

  async function saveReading(fieldName: string, cover: string) {
    fireEvent.change(screen.getByPlaceholderText("e.g. 1450"), { target: { value: cover } });
    fireEvent.click(screen.getByRole("button", { name: `Save reading for ${fieldName}` }));
  }

  it("starts a walk with real progress, without asking for the field from the dropdown", async () => {
    await startWalk();
    expect(progress()).toBe("0 of 2 measured · 2 remaining");
    expect(current()).toBe("Home Field");
    expect(screen.queryByRole("option", { name: "Choose field" })).toBeNull();
  });

  it("advances to the next unmeasured field only after a successful save", async () => {
    recordCover.mockResolvedValue(saved(FIELD_ID, 1450));
    await startWalk();
    await saveReading("Home Field", "1450");
    await waitFor(() => expect(current()).toBe("River Field"));
    expect(progress()).toBe("1 of 2 measured · 1 remaining");
    expect(recordCover).toHaveBeenCalledWith(expect.objectContaining({ fieldId: FIELD_ID, coverKgDmHa: 1450, method: "plate_meter" }));
    expect((screen.getByPlaceholderText("e.g. 1450") as HTMLInputElement).value).toBe("");
  });

  it("stays on the field when the save is rejected or fails", async () => {
    recordCover.mockResolvedValueOnce({ status: "rejected", reasonCode: "INVALID_COVER" });
    await startWalk();
    await saveReading("Home Field", "1450");
    await screen.findByText("Enter a valid grass cover in kg DM/ha.");
    expect(current()).toBe("Home Field");
    expect(progress()).toBe("0 of 2 measured · 2 remaining");

    recordCover.mockRejectedValueOnce(new Error("Connection lost"));
    await saveReading("Home Field", "1450");
    await screen.findByText("Connection lost");
    expect(current()).toBe("Home Field");
    expect(progress()).toBe("0 of 2 measured · 2 remaining");
  });

  it("keeps a slow save bound to its walk: nothing can finish, restart or move the walk until it resolves", async () => {
    gpsFix = { lat: 53.0105, lng: -8.0095, accuracyMeters: 5 };
    let resolveSave: (value: unknown) => void = () => undefined;
    recordCover.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    await startWalk();
    await screen.findByText("River Field", { selector: "strong" });
    await saveReading("Home Field", "1450");
    await screen.findByRole("button", { name: "Saving…" });

    for (const name of ["Finish walk", "Skip this field", "Measure this field", "River Field"]) {
      const control = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(control.disabled).toBe(true);
      fireEvent.click(control);
    }
    expect(screen.queryByRole("button", { name: "Start guided walk" })).toBeNull();
    expect(current()).toBe("Home Field");
    expect(progress()).toBe("0 of 2 measured · 2 remaining");

    resolveSave(saved(FIELD_ID, 1450));
    await waitFor(() => expect(progress()).toBe("1 of 2 measured · 1 remaining"));
    expect(current()).toBe("River Field");

    await waitFor(() => expect((screen.getByRole("button", { name: "Finish walk" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Finish walk" }));
    await screen.findByText("Walk finished: 1 of 2 fields measured.");
    fireEvent.click(screen.getByRole("button", { name: "Start guided walk" }));
    expect(progress()).toBe("0 of 2 measured · 2 remaining");
    expect(current()).toBe("Home Field");
  });

  it("won't start a walk while a single reading is saving, so that reading can't count towards it", async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    recordCover.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    render(<GrassPageClient initialFieldId={SECOND_FIELD_ID} />);
    const start = (await screen.findByRole("button", { name: "Start guided walk" })) as HTMLButtonElement;
    fireEvent.change(screen.getByPlaceholderText("e.g. 1450"), { target: { value: "1450" } });
    fireEvent.click(screen.getByRole("button", { name: "Record grass reading" }));
    await screen.findByRole("button", { name: "Saving…" });

    expect(start.disabled).toBe(true);
    fireEvent.click(start);
    expect(document.querySelector("[data-grass-walk]")).toBeNull();

    resolveSave(saved(SECOND_FIELD_ID, 1450));
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.click(start);
    expect(progress()).toBe("0 of 2 measured · 2 remaining");
  });

  it("suggests the live GPS field, and only moves when the farmer accepts", async () => {
    gpsFix = { lat: 53.0105, lng: -8.0095, accuracyMeters: 5 };
    await startWalk();
    await screen.findByText("River Field", { selector: "strong" });
    expect(current()).toBe("Home Field");
    fireEvent.click(screen.getByRole("button", { name: "Measure this field" }));
    expect(current()).toBe("River Field");
    expect(recordCover).not.toHaveBeenCalled();
  });

  it("offers no GPS field from a fix that isn't accurate enough", async () => {
    gpsFix = { lat: 53.0105, lng: -8.0095, accuracyMeters: 1000 };
    await startWalk();
    await screen.findByText(/Live fix/);
    expect(screen.queryByRole("button", { name: "Measure this field" })).toBeNull();
    expect(current()).toBe("Home Field");
  });

  it("can skip a field without counting it as measured, then come back to it", async () => {
    await startWalk();
    fireEvent.click(screen.getByRole("button", { name: "Skip this field" }));
    expect(current()).toBe("River Field");
    expect(progress()).toBe("0 of 2 measured · 2 remaining");
    fireEvent.click(screen.getByRole("button", { name: "Home Field (skipped)" }));
    expect(current()).toBe("Home Field");
  });

  it("finishes after the last field and returns to the normal workflow", async () => {
    recordCover.mockResolvedValueOnce(saved(FIELD_ID, 1450));
    await startWalk();
    await saveReading("Home Field", "1450");
    await waitFor(() => expect(current()).toBe("River Field"));
    recordCover.mockResolvedValueOnce(saved(SECOND_FIELD_ID, 1600));
    await saveReading("River Field", "1600");
    await screen.findByText("Every field measured");
    expect(progress()).toBe("2 of 2 measured · 0 remaining");

    fireEvent.click(screen.getByRole("button", { name: "Finish walk" }));
    await screen.findByText("Walk finished: 2 of 2 fields measured.");
    expect(document.querySelector("[data-grass-walk]")).toBeNull();
    expect(screen.getByRole("option", { name: "Choose field" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record grass reading" })).toBeTruthy();
  });

  it("cancels a pending GPS capability check when the walk finishes", async () => {
    gpsFix = { lat: 53.0105, lng: -8.0095, accuracyMeters: 5 };
    let releaseCapability: () => void = () => undefined;
    capabilityDelay = new Promise<void>((resolve) => { releaseCapability = resolve; });
    await startWalk();
    fireEvent.click(screen.getByRole("button", { name: "Finish walk" }));
    await screen.findByText("Walk finished: 0 of 2 fields measured.");
    releaseCapability();
    await waitFor(() => expect(gpsStop).toHaveBeenCalled());
    expect(gpsStart).not.toHaveBeenCalled();
    expect(screen.queryByText(/Live fix/)).toBeNull();
  });

  it("finishing early reports the true count", async () => {
    await startWalk();
    fireEvent.click(screen.getByRole("button", { name: "Finish walk" }));
    await screen.findByText("Walk finished: 0 of 2 fields measured.");
  });

  it("opens with a linked field already chosen, and ignores one that isn't on this farm", async () => {
    const linked = render(<GrassPageClient initialFieldId={SECOND_FIELD_ID} />);
    expect(((await screen.findByRole("option", { name: "River Field" })) as HTMLOptionElement).selected).toBe(true);
    linked.unmount();

    render(<GrassPageClient initialFieldId="not-this-farm" />);
    expect(((await screen.findByRole("option", { name: "Choose field" })) as HTMLOptionElement).selected).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. 1450"), { target: { value: "1450" } });
    fireEvent.click(screen.getByRole("button", { name: "Record grass reading" }));
    await screen.findByText("Choose the field this reading belongs to.");
    expect(recordCover).not.toHaveBeenCalled();
  });
});

describe("GrassPageClient", () => {
  beforeEach(() => { vi.clearAllMocks(); getData.mockResolvedValue(empty); });
  afterEach(() => cleanup());

  it("keeps an unmeasured farm honest and does not invent animal demand or forecasts", async () => {
    render(<GrassPageClient />);
    expect(await screen.findByText(/Animal demand: No cattle currently recorded in fields/i)).toBeTruthy();
    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "+3 days" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "+7 days" }).hasAttribute("disabled")).toBe(true);
    showFarmMap();
    expect(screen.getByTestId("grass-map").textContent).toMatch(/No cover/);
    expect(screen.getByText(/Farm Return will not assume zero growth/i)).toBeTruthy();
  });

  it("shows measured/estimated grass state and unlocks a growth-backed forecast", async () => {
    const observedAt = isoDaysAgo(1);
    getData.mockResolvedValue({
      ...empty,
      coverObservations: [{ id:"33333333-3333-4333-8333-333333333333", farmId:FARM_ID, fieldId:FIELD_ID, coverKgDmHa:1500, method:"plate_meter", observedAt, source:"Farmer", createdAt:observedAt }],
      growthObservations: [{ id:"44444444-4444-4444-8444-444444444444", farmId:FARM_ID, growthRateKgDmHaDay:50, origin:"farmer_entered", observedAt, source:"Farmer", createdAt:observedAt }],
    });
    render(<GrassPageClient />);
    await screen.findByText(/Animal demand: No cattle currently recorded in fields/i);
    expect(screen.getByRole("button", { name: "+3 days" }).hasAttribute("disabled")).toBe(false);
    showFarmMap();
    expect(screen.getByTestId("grass-map").textContent).toMatch(/kg DM\/ha/);
    fireEvent.click(screen.getByRole("button", { name: "+3 days" }));
    await waitFor(() => expect(screen.getAllByText(/projected/i).length).toBeGreaterThan(0));
    // Grass V2: the old fixed "display band" is gone; the wedge is read against the calculated target line.
    expect(screen.queryByText(/configurable visual reference/i)).toBeNull();
  });

  it("shows the farmer's entered rate and a distinct current county forecast", async () => {
    const observedAt = isoDaysAgo(1);
    getData.mockResolvedValue({
      ...empty,
      growthObservations: [{
        id: "44444444-4444-4444-8444-444444444444", farmId: FARM_ID,
        growthRateKgDmHaDay: 50, origin: "farmer_entered",
        observedAt, source: "Farmer", createdAt: observedAt,
      }],
      regionalGrowth: {
        status: "published", county: "Galway", growthKgDmHaDay: 34,
        validFrom: "2026-11-12", validTo: "2026-11-18", current: true,
        sourceUrl: "https://teagasc.ie/",
      },
    });
    render(<GrassPageClient />);
    const regional = await screen.findByRole("region", { name: "Regional grass growth" });
    expect(regional.textContent).toContain("Co. Galway");
    expect(regional.textContent).toContain("34");
    expect(screen.getByRole("region", { name: "Grass summary" }).textContent).toContain("50");
    expect(screen.getByText("Entered by you")).toBeTruthy();
  });

  it("keeps entered growth visible when no county data is published", async () => {
    const observedAt = isoDaysAgo(1);
    getData.mockResolvedValue({
      ...empty,
      growthObservations: [{
        id: "44444444-4444-4444-8444-444444444444", farmId: FARM_ID,
        growthRateKgDmHaDay: 50, origin: "farmer_entered",
        observedAt, source: "Farmer", createdAt: observedAt,
      }],
      regionalGrowth: { status: "not_published", county: "Galway" },
    });
    render(<GrassPageClient />);
    expect((await screen.findByRole("region", { name: "Regional grass growth" })).textContent).toContain("Awaiting county figures");
    expect(screen.getByRole("region", { name: "Grass summary" }).textContent).toContain("50");
  });

  it("automatically subtracts demand from a cattle movement using the recorded liveweight", async () => {
    const observedAt = isoDaysAgo(2);
    const startedAt = isoDaysAgo(1);
    const session = {
      sessionId: "session-1",
      fieldId: FIELD_ID,
      fieldName: "Home Field",
      livestockGroupId: "group-1",
      groupLabel: "Stores",
      category: "store" as const,
      headCountSnapshot: 20,
      startedAt,
      demand: {
        status: "resolved" as const,
        provider: "beef_liveweight_v1" as const,
        groupId: "group-1",
        category: "store" as const,
        headCount: 20,
        kgDmPerHeadDay: 10,
        dailyDemandKgDm: 200,
        confidence: "medium" as const,
        ruleId: "TEAGASC_BEEF_GRAZING_2PCT_LW",
        source: "Teagasc beef grazing guidance: herbage demand approximated at 2% of liveweight per head per day",
        evidence: [
          { key: "avg_weight_kg", label: "Average liveweight", value: 500, unit: "kg", source: "Farmer" },
          { key: "head_count", label: "Movement headcount", value: 20, unit: "head", source: "Recorded cattle movement" },
        ],
      },
    };
    getData.mockResolvedValue({
      ...empty,
      coverObservations: [{
        id: "33333333-3333-4333-8333-333333333333",
        farmId: FARM_ID,
        fieldId: FIELD_ID,
        coverKgDmHa: 1500,
        method: "plate_meter",
        observedAt,
        source: "Farmer",
        createdAt: observedAt,
      }],
      growthObservations: [{
        id: "44444444-4444-4444-8444-444444444444",
        farmId: FARM_ID,
        growthRateKgDmHaDay: 50,
        origin: "farmer_entered",
        observedAt,
        source: "Farmer",
        createdAt: observedAt,
      }],
      grazingSessions: [session],
      openGrazingSessions: [session],
    });

    render(<GrassPageClient />);
    expect(await screen.findByText(/Animal demand: 200 kg DM\/day/i)).toBeTruthy();
    showFarmMap();
    await waitFor(() => expect(screen.getByTestId("grass-map").textContent).toMatch(/1,550 kg DM\/ha/));
    expect(screen.getByText(/Automatically linked from Cattle movements/i)).toBeTruthy();
  });

  it("shows today's group count instead of a stale movement snapshot and explains the historical gap", async () => {
    const session = {
      sessionId: "s-stale", fieldId: FIELD_ID, fieldName: "Home Field",
      livestockGroupId: "g-stale", groupLabel: "Weanlings", category: "weanling" as const,
      headCountSnapshot: 12, currentHeadCount: 1,
      countObservedAt: isoDaysAgo(0), startedAt: isoDaysAgo(10),
      demand: {
        status: "unresolved" as const, groupId: "g-stale", category: "weanling" as const,
        headCount: 1, reason: "MISSING_AVG_WEIGHT" as const,
      },
    };
    getData.mockResolvedValue({
      ...empty, grazingSessions: [session], openGrazingSessions: [session],
    });
    render(<GrassPageClient />);
    expect(await screen.findByText(/Original movement: 12 head/)).toBeTruthy();
    expect(screen.getByText(/1 head · weanling/)).toBeTruthy();
    // The demand warning is present even when target settings or field use
    // prevents a separate wedge recommendation from being generated.
    expect(screen.getByText(/Animal demand: Unresolved/)).toBeTruthy();
  });

  it("records a cover reading only after the farmer chooses a field, then reloads real data", async () => {
    recordCover.mockResolvedValue({ status:"saved", observation:{ id:"55555555-5555-4555-8555-555555555555", farmId:FARM_ID, fieldId:FIELD_ID, coverKgDmHa:1420, method:"plate_meter", observedAt:new Date().toISOString(), source:"Farmer", createdAt:new Date().toISOString() } });
    render(<GrassPageClient />);
    await screen.findByText(/Animal demand: No cattle currently recorded in fields/i);
    fireEvent.change(screen.getByLabelText("Cover (kg DM/ha)"), { target: { value: "1420" } });
    fireEvent.click(screen.getByRole("button", { name: "Record grass reading" }));
    expect(await screen.findByText(/Choose the field/i)).toBeTruthy();
    expect(recordCover).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: FIELD_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Record grass reading" }));
    await waitFor(() => expect(recordCover).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getData.mock.calls.length).toBeGreaterThan(1));
  });
});
