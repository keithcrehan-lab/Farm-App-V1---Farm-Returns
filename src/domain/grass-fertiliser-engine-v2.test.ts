import { describe, expect, it } from "vitest";
import { tracked, type Field } from "./types";
import { createFarmerEvidence, type FieldProductionCycle } from "./fertiliser-field-evidence";
import { calculateGrassFertiliserV2 } from "./grass-fertiliser-engine-v2";

const field = (p: 1|2|3|4 = 2, k: 1|2|3|4 = 2): Pick<Field,"id"|"fertility"> => ({
  id:"f1", fertility:{ pIndex:tracked(p,"verified","Lab"), kIndex:tracked(k,"verified","Lab"), verifiedTest:{sampleDate:"2026-01-10",laboratory:"Lab",sampleRef:"S1",p:4,k:90,pH:6.2} }
});
const cycle = (cropSystem: FieldProductionCycle["cropSystem"], evidence: FieldProductionCycle["evidence"] = {}): FieldProductionCycle => ({
  id:"c1",fieldId:"f1",season:"2026",cropSystem,status:"active",
  evidence:{ cropSystem:createFarmerEvidence(cropSystem,"Farmer"), chemicalNAppliedKgHa:createFarmerEvidence(0,"Farmer"), chemicalPAppliedKgHa:createFarmerEvidence(0,"Farmer"), chemicalKAppliedKgHa:createFarmerEvidence(0,"Farmer"), ...evidence },
  createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z"
});

describe("grass fertiliser engine v2",()=>{
  it("uses organic-N stocking directly for grazing and never a chemical-N output as the P/K input",()=>{
    const result=calculateGrassFertiliserV2({field:field(2,1),cycle:cycle("GRASS_GRAZING"),grazingProductionSystem:"SUCKLER_CALF_TO_BEEF",annualOrganicNStockingRateKgHa:118});
    expect(result.status).toBe("READY");
    expect(result.grossRequirementKgHa).toEqual({n:75,p:17,k:68.5});
    expect(result.traces.n?.inputs.annualOrganicNStockingRateKgHa).toBe(118);
    expect(result.traces.k?.inputs.annualOrganicNStockingRateKgHa).toBe(118);
  });

  it("interpolates grazing N only between published organic-N rows and discloses the fraction",()=>{
    const result=calculateGrassFertiliserV2({field:field(3,3),cycle:cycle("GRASS_GRAZING"),grazingProductionSystem:"SUCKLER_CALF_TO_BEEF",annualOrganicNStockingRateKgHa:128});
    expect(result.status).toBe("READY");
    expect(result.grossRequirementKgHa!.n).toBeCloseTo(89,6);
    expect(result.traces.n?.method).toMatch(/interpolation/i);
  });

  it("requires an explicit grazing production system instead of borrowing another system's table",()=>{
    const result=calculateGrassFertiliserV2({field:field(),cycle:cycle("GRASS_GRAZING"),annualOrganicNStockingRateKgHa:118});
    expect(result.status).toBe("UNSUPPORTED_PATHWAY");
    expect(result.missingInputs).toContain("grazingProductionSystem");
  });

  it("uses the current 2026 first-cut 5 t DM/ha table",()=>{
    const result=calculateGrassFertiliserV2({field:field(1,2),cycle:cycle("GRASS_FIRST_CUT_SILAGE",{productionTargetTDMHa:createFarmerEvidence(5,"Farmer")})});
    expect(result.status).toBe("READY");
    expect(result.grossRequirementKgHa).toEqual({n:100,p:40,k:155});
  });

  it("does not invent first-cut N scaling outside the published 5 t DM/ha target",()=>{
    const result=calculateGrassFertiliserV2({field:field(),cycle:cycle("GRASS_FIRST_CUT_SILAGE",{productionTargetTDMHa:createFarmerEvidence(6,"Farmer")})});
    expect(result.status).toBe("UNSUPPORTED_PATHWAY");
  });

  it("fails closed on the unresolved later-cut source conflict",()=>{
    const result=calculateGrassFertiliserV2({field:field(),cycle:cycle("GRASS_SECOND_CUT_SILAGE",{productionTargetTDMHa:createFarmerEvidence(3,"Farmer")})});
    expect(result.status).toBe("SOURCE_CONFLICT");
  });

  it("subtracts organic and already-applied chemical nutrients only after gross agronomic requirement is established",()=>{
    const c=cycle("GRASS_FIRST_CUT_SILAGE",{productionTargetTDMHa:createFarmerEvidence(5,"Farmer"),chemicalNAppliedKgHa:createFarmerEvidence(10,"Farmer"),chemicalPAppliedKgHa:createFarmerEvidence(5,"Farmer"),chemicalKAppliedKgHa:createFarmerEvidence(20,"Farmer")});
    const result=calculateGrassFertiliserV2({field:field(3,3),cycle:c,organicCreditsKgHa:{n:20,p:5,k:30}});
    expect(result.remainingRequirementKgHa).toEqual({n:70,p:10,k:75});
  });
});
