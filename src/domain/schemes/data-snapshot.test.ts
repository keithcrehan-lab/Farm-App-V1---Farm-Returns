import { describe, expect, it } from "vitest";
import { composeSchemeDataSnapshot } from "./data-snapshot";

describe("composeSchemeDataSnapshot", () => {
  it("preserves one canonical owner per data key", () => {
    const snapshot = composeSchemeDataSnapshot([
      {
        owner: "fields",
        points: [
          {
            key: "field.area_ha",
            owner: "fields",
            state: "KNOWN",
            value: 12.4,
            resolutionOwner: "farmer",
          },
        ],
      },
      {
        owner: "cattle",
        points: [
          {
            key: "cattle.animal.weight",
            owner: "cattle",
            state: "MISSING",
            resolutionOwner: "farmer",
          },
        ],
      },
    ]);

    expect(snapshot.get("field.area_ha")).toMatchObject({
      owner: "fields",
      state: "KNOWN",
      value: 12.4,
    });
    expect(snapshot.get("cattle.animal.weight")).toMatchObject({
      owner: "cattle",
      state: "MISSING",
    });
  });

  it("never chooses silently when two modules claim the same canonical key", () => {
    const snapshot = composeSchemeDataSnapshot([
      {
        owner: "fields",
        points: [
          {
            key: "shared.area",
            owner: "fields",
            state: "KNOWN",
            value: 10,
            resolutionOwner: "farmer",
          },
        ],
      },
      {
        owner: "schemes",
        points: [
          {
            key: "shared.area",
            owner: "schemes",
            state: "KNOWN",
            value: 11,
            resolutionOwner: "farmer",
          },
        ],
      },
    ]);

    expect(snapshot.get("shared.area")).toMatchObject({
      state: "REVIEW_REQUIRED",
      resolutionOwner: "system",
    });
  });

  it("rejects an adapter that lies about the owner of its own point", () => {
    expect(() =>
      composeSchemeDataSnapshot([
        {
          owner: "fields",
          points: [
            {
              key: "field.area_ha",
              owner: "cattle",
              state: "KNOWN",
              value: 12,
              resolutionOwner: "farmer",
            },
          ],
        },
      ]),
    ).toThrow(/SCHEME_DATA_ADAPTER_OWNER_MISMATCH/);
  });
});
