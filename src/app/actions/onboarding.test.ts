import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Map-led onboarding Server Actions: each resolves the signed-in user and farm itself (no farm id from the browser),
 * never creates a second farm, rejects anything that isn't a real farmer-confirmed location or drawn boundary, and
 * sends the farmer to Farm or Cattle once their first field exists.
 */

const state = vi.hoisted(() => ({
  user: { id: "user-a", email: "mary.walsh@example.ie" } as { id: string; email: string } | null,
  farm: null as null | { farm: Record<string, unknown>; completed: boolean },
  createFails: false,
  creates: [] as unknown[],
  fields: [] as { farmId: string; input: unknown }[],
  completed: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } })) }));
vi.mock("@/lib/farm-data/farms", () => ({
  getOnboardingStatusForCurrentUser: vi.fn(async () => state.farm),
  createFarmForCurrentUser: vi.fn(async (input: Record<string, unknown>) => {
    state.creates.push(input);
    if (state.createFails) {
      // The racing first submit already made the farm; the database rejects this second one.
      state.farm = { farm: { id: "farm-a", name: input.name }, completed: false };
      throw Object.assign(new Error('duplicate key value violates unique constraint "farms_user_id_unique"'), { code: "23505" });
    }
    const farm = { id: "farm-a", name: input.name, location: { county: input.county, centroid: input.centroid }, primaryEnterprises: input.primaryEnterprises, ownerName: input.ownerName };
    state.farm = { farm, completed: false };
    return farm;
  }),
  markOnboardingComplete: vi.fn(async (farmId: string) => {
    state.completed.push(farmId);
  }),
}));
vi.mock("@/lib/farm-data/fields", () => ({
  createField: vi.fn(async (farmId: string, input: { name: string; polygon: unknown }) => {
    state.fields.push({ farmId, input });
    return { id: `field-${state.fields.length}`, name: input.name, polygon: input.polygon };
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirectTo = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    redirectTo.value = to;
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  }),
}));

import { addOnboardingFieldStep, establishFarmStep, finishOnboardingStep, lookupExactEircodeStep } from "./onboarding";

const HERE: [number, number] = [-8.712, 53.318];
const square: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-8.712, 53.318],
      [-8.71, 53.318],
      [-8.71, 53.3195],
      [-8.712, 53.3195],
      [-8.712, 53.318],
    ],
  ],
};

beforeEach(() => {
  state.user = { id: "user-a", email: "mary.walsh@example.ie" };
  state.farm = null;
  state.createFails = false;
  state.creates = [];
  state.fields = [];
  state.completed = [];
  redirectTo.value = "";
  process.env.GOOGLE_MAPS_GEOCODING_API_KEY = "test-google-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


describe("lookupExactEircodeStep", () => {
  it("uses all seven Eircode characters and returns the exact position from Google Geocoding", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
      expect(url.searchParams.get("components")).toBe("postal_code:V95TY07|country:IE");
      expect(url.searchParams.get("key")).toBe("test-google-key");
      expect(init?.headers).toMatchObject({ "User-Agent": "Farm Return onboarding" });
      return {
        ok: true,
        json: async () => ({
          status: "OK",
          results: [
            {
              formatted_address: "Example Farm, Ennis, Co. Clare, V95 TY07, Ireland",
              address_components: [{ long_name: "V95 TY07", short_name: "V95 TY07", types: ["postal_code"] }],
              geometry: { location: { lat: 52.8431, lng: -8.9862 } },
            },
          ],
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await lookupExactEircodeStep("v95ty07");

    expect(r).toEqual({
      ok: true,
      value: {
        eircode: "V95 TY07",
        label: "Example Farm, Ennis, Co. Clare, V95 TY07, Ireland",
        center: [-8.9862, 52.8431],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never falls back to a routing-key centroid when exact Eircode lookup is unavailable", async () => {
    delete process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await lookupExactEircodeStep("V95 TY07")).toEqual({
      ok: false,
      error: "Exact Eircode lookup isn't available just now. Search by address, use your current location, or move the map to your farm.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a Google response that does not confirm the same full Eircode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          json: async () => ({
            status: "OK",
            results: [
              {
                formatted_address: "Wrong address",
                address_components: [{ long_name: "V95 ABC1", short_name: "V95 ABC1", types: ["postal_code"] }],
                geometry: { location: { lat: 52.84, lng: -8.98 } },
              },
            ],
          }),
        }) as Response,
      ),
    );

    expect(await lookupExactEircodeStep("V95 TY07")).toEqual({
      ok: false,
      error: "We couldn't find an exact match for that Eircode. Check it and try again.",
    });
  });
});

describe("establishFarmStep", () => {
  it("creates the farm at the confirmed point, with the chosen type and county — and only the account's email name as owner", async () => {
    const r = await establishFarmStep({ name: "  Back Avenue Farm ", farmTypes: ["suckler"], county: "Galway", centroid: HERE, grazingProductionSystem: "SUCKLER_CALF_TO_BEEF" });
    expect(r.ok).toBe(true);
    expect(state.creates).toEqual([{ name: "Back Avenue Farm", ownerName: "mary.walsh", county: "Galway", centroid: HERE, primaryEnterprises: ["suckler_beef"], grazingProductionSystem: { value: "SUCKLER_CALF_TO_BEEF", status: "farmer_adjusted", source: "mary.walsh" } }]);
  });

  it("records every concrete farm type the farmer selects", async () => {
    await establishFarmStep({ name: "Mixed Enterprise Farm", farmTypes: ["suckler", "sheep", "tillage"], county: "Galway", centroid: HERE, grazingProductionSystem: "SUCKLER_CALF_TO_WEANING" });
    expect((state.creates[0] as { primaryEnterprises: unknown }).primaryEnterprises).toEqual(["suckler_beef", "sheep", "tillage"]);
  });

  it("'Other' records no enterprise rather than a guessed one", async () => {
    await establishFarmStep({ name: "Hill Farm", farmTypes: ["other"], county: "Kerry", centroid: HERE });
    expect((state.creates[0] as { primaryEnterprises: unknown }).primaryEnterprises).toEqual([]);
  });

  it("never creates a second farm: an existing farm is returned as it is", async () => {
    state.farm = { farm: { id: "farm-a", name: "First" }, completed: false };
    const r = await establishFarmStep({ name: "Again", farmTypes: ["dairy"], county: "Cork", centroid: HERE });
    expect(r).toEqual({ ok: true, value: { id: "farm-a", name: "First" } });
    expect(state.creates).toEqual([]);
  });

  it("a racing double submit that hits the one-farm rule gets the farm the first submit made, not an error", async () => {
    state.createFails = true;
    const r = await establishFarmStep({ name: "Race Farm", farmTypes: ["dairy"], county: "Cork", centroid: HERE });
    expect(r).toEqual({ ok: true, value: { id: "farm-a", name: "Race Farm" } });
  });

  it("rejects a missing name, type, county or a point outside Ireland — with plain wording, nothing written", async () => {
    expect(await establishFarmStep({ name: " ", farmTypes: ["dairy"], county: "Cork", centroid: HERE })).toEqual({ ok: false, error: "Give your farm a name." });
    expect(await establishFarmStep({ name: "F", farmTypes: [], county: "Cork", centroid: HERE })).toEqual({ ok: false, error: "Choose one or more farm types." });
    expect(await establishFarmStep({ name: "F", farmTypes: ["suckler"], county: "Cork", centroid: HERE })).toEqual({ ok: false, error: "Choose your normal grazing production system." });
    expect(await establishFarmStep({ name: "F", farmTypes: ["mixed", "dairy"], county: "Cork", centroid: HERE })).toEqual({ ok: false, error: "Choose one or more farm types." });
    expect(await establishFarmStep({ name: "F", farmTypes: ["dairy"], county: "Antrim", centroid: HERE })).toEqual({ ok: false, error: "Choose your county." });
    expect(await establishFarmStep({ name: "F", farmTypes: ["dairy"], county: "Cork", centroid: [0, 0] })).toEqual({ ok: false, error: "Find your farm on the map first." });
    expect(state.creates).toEqual([]);
  });

  it("a signed-out request writes nothing", async () => {
    state.user = null;
    const r = await establishFarmStep({ name: "F", farmTypes: ["dairy"], county: "Cork", centroid: HERE });
    expect(r.ok).toBe(false);
    expect(state.creates).toEqual([]);
  });
});

describe("addOnboardingFieldStep", () => {
  it("saves the drawn boundary to the signed-in farmer's own farm (resolved server-side)", async () => {
    state.farm = { farm: { id: "farm-a" }, completed: false };
    const r = await addOnboardingFieldStep({ name: " Back Avenue Meadow ", polygon: square });
    expect(r.ok).toBe(true);
    expect(state.fields).toEqual([{ farmId: "farm-a", input: { name: "Back Avenue Meadow", polygon: square, fertility: {} } }]);
  });

  it("never saves a made-up or broken shape, or a field with no farm", async () => {
    state.farm = { farm: { id: "farm-a" }, completed: false };
    const open = { type: "Polygon", coordinates: [[[-8.7, 53.3], [-8.69, 53.3], [-8.69, 53.31]]] } as GeoJSON.Polygon;
    expect((await addOnboardingFieldStep({ name: "X", polygon: open })).ok).toBe(false);
    expect((await addOnboardingFieldStep({ name: "", polygon: square })).ok).toBe(false);
    state.farm = null;
    expect(await addOnboardingFieldStep({ name: "X", polygon: square })).toEqual({ ok: false, error: "Set up your farm first." });
    expect(state.fields).toEqual([]);
  });
});

describe("finishOnboardingStep", () => {
  it("Explore Farm Return marks setup complete and opens Farm", async () => {
    state.farm = { farm: { id: "farm-a" }, completed: false };
    await expect(finishOnboardingStep("explore")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.completed).toEqual(["farm-a"]);
    expect(redirectTo.value).toBe("/today");
  });

  it("Add cattle finishes setup and opens Manage herd (livestock is never compulsory)", async () => {
    state.farm = { farm: { id: "farm-a" }, completed: false };
    await expect(finishOnboardingStep("cattle")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTo.value).toBe("/cattle/manage");
  });

  it("an unknown destination or no farm does nothing", async () => {
    expect(await finishOnboardingStep("finance")).toEqual({ ok: false, error: "Choose where to go next." });
    expect(await finishOnboardingStep("explore")).toEqual({ ok: false, error: "Set up your farm first." });
    expect(state.completed).toEqual([]);
  });

  it("an already-finished farm isn't marked again", async () => {
    state.farm = { farm: { id: "farm-a" }, completed: true };
    await expect(finishOnboardingStep("explore")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.completed).toEqual([]);
  });
});
