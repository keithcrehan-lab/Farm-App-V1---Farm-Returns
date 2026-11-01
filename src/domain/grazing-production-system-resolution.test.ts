import { describe, expect, it } from "vitest";
import { resolveGrazingProductionSystem } from "./grazing-production-system-resolution";
import type { Farm } from "./types";
import type { FieldProductionCycle } from "./fertiliser-field-evidence";
import type { GrazingFieldSession } from "./grazing-field-pressure";

const farm: Farm = { id:"farm", name:"Farm", location:{county:"Galway",centroid:[0,0]}, primaryEnterprises:["suckler_beef"], units:"metric", ownerName:"Farmer", grazingProductionSystem:{ value:"SUCKLER_CALF_TO_WEANING", status:"farmer_adjusted", source:"Farmer" } };
const cycle: FieldProductionCycle = { id:"c", fieldId:"f", season:"2026", cropSystem:"GRASS_GRAZING", status:"active", evidence:{ cropSystem:{value:"GRASS_GRAZING",method:"FARMER_DECLARED",source:"Farmer"} }, createdAt:"2026-01-01", updatedAt:"2026-01-01" };
const session = (category: GrazingFieldSession["livestockCategorySnapshot"]): GrazingFieldSession => ({ id:category, farmId:"farm", livestockGroupId:category, fieldId:"f", startedAt:"2026-04-01", endedAt:"2026-05-01", headCountSnapshot:10, livestockCategorySnapshot:category, livestockUnitsPerHeadSnapshot:1, source:"Recorded", createdAt:"2026-04-01" });

describe("resolveGrazingProductionSystem", () => {
  it("uses the farm baseline when movement evidence is ambiguous", () => {
    expect(resolveGrazingProductionSystem({farm,fieldId:"f",cycle,sessions:[session("suckler_cow"),session("calf")]})).toMatchObject({value:"SUCKLER_CALF_TO_WEANING",basis:"FARM_BASELINE"});
  });
  it("lets clear drystock movement evidence override the farm baseline", () => {
    expect(resolveGrazingProductionSystem({farm,fieldId:"f",cycle,sessions:[session("store")]})).toMatchObject({value:"OTHER_DRYSTOCK",basis:"FIELD_MOVEMENTS"});
  });
  it("lets suckler cows plus retained store cattle resolve calf-to-beef", () => {
    expect(resolveGrazingProductionSystem({farm,fieldId:"f",cycle,sessions:[session("suckler_cow"),session("store")]})).toMatchObject({value:"SUCKLER_CALF_TO_BEEF",basis:"FIELD_MOVEMENTS"});
  });
  it("uses an explicit field exception before the farm baseline when movements do not resolve", () => {
    const withOverride={...cycle,evidence:{...cycle.evidence,grazingProductionSystem:{value:"OTHER_DRYSTOCK" as const,method:"FARMER_DECLARED" as const,source:"Field exception · Farmer"}}};
    expect(resolveGrazingProductionSystem({farm,fieldId:"f",cycle:withOverride,sessions:[]})).toMatchObject({value:"OTHER_DRYSTOCK",basis:"FIELD_OVERRIDE"});
  });
});
