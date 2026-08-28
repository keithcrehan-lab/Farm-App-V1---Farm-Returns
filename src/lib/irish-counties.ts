/**
 * Real Farm V1 Phase 4 — the 26 counties of the Republic of Ireland with
 * an approximate county-town centroid, used only as an onboarding
 * starting point for a new farm's `location.centroid` before any real
 * field is mapped — same pattern `farm-store.tsx`'s `addField` already
 * uses ("No live geocoding/mapping engine yet ... placed at the farm
 * centroid rather than inventing a boundary"). This is public geography,
 * not an agronomic/regulatory/financial figure, so it isn't the kind of
 * "invented production number" CLAUDE.md's rule targets — but it is still
 * only approximate, and the UI must say so rather than imply a precise
 * farm location.
 */
export interface IrishCounty {
  name: string;
  /** [lng, lat] — approximate county-town coordinate. */
  centroid: [number, number];
}

export const IRISH_COUNTIES: IrishCounty[] = [
  { name: "Carlow", centroid: [-6.9261, 52.8365] },
  { name: "Cavan", centroid: [-7.3606, 53.9908] },
  { name: "Clare", centroid: [-8.9811, 52.8437] },
  { name: "Cork", centroid: [-8.4756, 51.8985] },
  { name: "Donegal", centroid: [-7.6921, 54.6538] },
  { name: "Dublin", centroid: [-6.2603, 53.3498] },
  { name: "Galway", centroid: [-9.0568, 53.2707] },
  { name: "Kerry", centroid: [-9.7028, 52.1545] },
  { name: "Kildare", centroid: [-6.9111, 53.1589] },
  { name: "Kilkenny", centroid: [-7.2448, 52.6541] },
  { name: "Laois", centroid: [-7.3319, 52.9931] },
  { name: "Leitrim", centroid: [-8.0006, 54.1247] },
  { name: "Limerick", centroid: [-8.6267, 52.6638] },
  { name: "Longford", centroid: [-7.7933, 53.7276] },
  { name: "Louth", centroid: [-6.4889, 53.9526] },
  { name: "Mayo", centroid: [-9.1548, 53.8008] },
  { name: "Meath", centroid: [-6.6564, 53.6055] },
  { name: "Monaghan", centroid: [-6.9683, 54.2492] },
  { name: "Offaly", centroid: [-7.7167, 53.2739] },
  { name: "Roscommon", centroid: [-8.1887, 53.6279] },
  { name: "Sligo", centroid: [-8.4694, 54.2766] },
  { name: "Tipperary", centroid: [-7.8944, 52.4736] },
  { name: "Waterford", centroid: [-7.1101, 52.2593] },
  { name: "Westmeath", centroid: [-7.4653, 53.5344] },
  { name: "Wexford", centroid: [-6.4633, 52.3369] },
  { name: "Wicklow", centroid: [-6.0672, 52.9808] },
];
