import { describe, expect, it } from "vitest";
import {
  HOME_GROWN, feedDiaryEntry, nitratesReadiness, pesticideDiaryEntries, sblasReadiness, sortDiary,
  validateFeedRecord, validatePesticideJob, validateSprayOperator,
  type FeedRecordInput, type PesticideApplication, type PesticideJobInput,
} from "./farm-records";

const TODAY = "2026-11-10";
const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

const feed: FeedRecordInput = {
  id: ID, receivedOn: "2026-11-02", supplierName: "Clare Co-op", supplierAddress: "Ennis, Co. Clare", product: "16% beef nut",
  feedType: "concentrate", batchNumber: "B2231", quantity: 2, unit: "tonnes", livestockGroupId: null, notes: null,
};

describe("feed records", () => {
  it("accepts a bought feed with the Bord Bia headings, and home-grown feed without an address", () => {
    expect(validateFeedRecord(feed, TODAY)).toBeNull();
    expect(validateFeedRecord({ ...feed, supplierName: HOME_GROWN, supplierAddress: null, homeGrown: true }, TODAY)).toBeNull();
  });
  it("asks for what an auditor needs", () => {
    expect(validateFeedRecord({ ...feed, supplierAddress: null }, TODAY)).toMatch(/address/);
    expect(validateFeedRecord({ ...feed, quantity: 0 }, TODAY)).toMatch(/how much/);
    expect(validateFeedRecord({ ...feed, receivedOn: "2026-12-01" }, TODAY)).toMatch(/future/);
  });
  it("reads as one plain diary line", () => {
    expect(feedDiaryEntry({ ...feed, homeGrown: false }, "Weanlings")).toMatchObject({
      book: "feed", date: "2026-11-02", title: "Feed in: 16% beef nut", detail: "2 tonnes · Clare Co-op · batch B2231 · for Weanlings",
    });
  });
});

const job: PesticideJobInput = {
  sprayJobId: ID, appliedOn: "2026-06-12", fields: [{ fieldId: ID, areaHa: 4.2 }, { fieldId: ID2, areaHa: 2.1 }],
  cropSituation: "Grassland", productName: "Doxstar Pro", pcsNumber: "05164", rate: 2, rateUnit: "l_ha", waterLHa: 200, reason: "Docks", operatorId: ID,
};

describe("pesticide records", () => {
  it("accepts a job across fields and insists on the PCS number from the label", () => {
    expect(validatePesticideJob(job, TODAY)).toBeNull();
    expect(validatePesticideJob({ ...job, pcsNumber: "Doxstar" }, TODAY)).toMatch(/PCS/);
    expect(validatePesticideJob({ ...job, fields: [] }, TODAY)).toMatch(/field/);
    expect(validatePesticideJob({ ...job, fields: [job.fields[0], job.fields[0]] }, TODAY)).toMatch(/twice/);
  });
  it("needs a PU number for whoever sprayed, and an address for a contractor", () => {
    expect(validateSprayOperator({ id: ID, name: "Keith", puNumber: "PU12345", isContractor: false, address: null, sprayerCert: null })).toBeNull();
    expect(validateSprayOperator({ id: ID, name: "Keith", puNumber: "", isContractor: false, address: null, sprayerCert: null })).toMatch(/PU/);
    expect(validateSprayOperator({ id: ID, name: "Ryan Agri", puNumber: "PU9", isContractor: true, address: null, sprayerCert: null })).toMatch(/address/);
  });
  it("makes one diary line per spray job", () => {
    const rows: PesticideApplication[] = job.fields.map((f, i) => ({
      id: `r${i}`, sprayJobId: ID, appliedOn: job.appliedOn, fieldId: f.fieldId, fieldName: i ? "Back Field" : "Home Field", lpisRef: null,
      cropSituation: "Grassland", productName: "Doxstar Pro", pcsNumber: "05164", areaHa: f.areaHa, rate: 2, rateUnit: "l_ha", waterLHa: 200, reason: "Docks", operatorId: ID,
    }));
    const lines = pesticideDiaryEntries(rows, () => "Keith");
    expect(lines).toHaveLength(1);
    expect(lines[0].detail).toBe("Home Field and Back Field · 6.3 ha · PCS 05164 · Keith");
  });
});

describe("audit readiness", () => {
  it("Bord Bia: complete, gaps, confirmed none, and records kept elsewhere", () => {
    const r = sblasReadiness({
      today: TODAY,
      dates: { medicines: ["2026-09-01"], movements: ["2026-10-01"], feed: ["2026-07-20"] },
      notUsed: { pesticides: "2026-11-01" },
    });
    expect(r.from).toBe("2026-05-12");
    const by = Object.fromEntries(r.items.map((i) => [i.key, i]));
    expect(by["remedy-purchases"].status).toBe("complete");
    expect(by.feed).toMatchObject({ status: "gap", detail: "Nothing recorded since 20 Jul" });
    expect(by.pesticides.status).toBe("not_used");
    expect(by["remedy-usage"].status).toBe("not_tracked");
    expect(by["herd-register"].status).toBe("outside_app");
  });
  it("Nitrates looks at the calendar year", () => {
    const r = nitratesReadiness({ today: TODAY, dates: { slurry: ["2025-12-01"] }, notUsed: {} });
    expect(r.from).toBe("2026-01-01");
    expect(r.items[0].status).toBe("gap");
  });
  it("sorts the diary newest first", () => {
    expect(sortDiary([
      { id: "a", book: "feed", date: "2026-11-01", title: "A", detail: "" },
      { id: "b", book: "grass", date: "2026-11-05", title: "B", detail: "" },
    ]).map((e) => e.id)).toEqual(["b", "a"]);
  });
});
