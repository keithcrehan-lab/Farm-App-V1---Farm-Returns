/**
 * Cattle C10 — presentation view-models over frozen C1–C9 outputs and the
 * Plan kernel (display structures with honest states; no calculation beyond
 * documented display formatting). See DOMAIN_CONTRACTS.md, "Cattle C10".
 *
 * This is the ONLY domain module a farmer-facing cattle component imports
 * (component-boundary test): the plan form's draft types and its date
 * stepping are re-exported here so no component reaches into the domain.
 */

export * from "./animal-profile";
export * from "./availability";
export * from "./cattle-outputs";
export * from "./cost-view";
export * from "./display-states";
export * from "./format";
export * from "./herd-view";
export * from "./numeric-input";
export * from "./plan-timeline";
export * from "./plan-view";
export * from "./timeline";
export * from "./view-state";
export * from "./weight-view";
export * from "./work-view";

export { addDays, isPlanDate, type AnimalPlanAssumptions, type HousingAssumption, type MarketScenario } from "../../animal-plan";
