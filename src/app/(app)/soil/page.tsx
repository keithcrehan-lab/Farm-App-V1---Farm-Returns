import { redirect } from "next/navigation";

/**
 * The standalone Soil screen is retired: soil tests are entered on each field,
 * guided sampling starts from the field, the Farm map's Nutrients view shows
 * every field's P, K and pH, and the fertiliser plan lists fields still
 * needing a test. Old links land on the fertiliser plan.
 */
export default function SoilPage() {
  redirect("/fertiliser-plan");
}
