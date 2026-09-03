/**
 * Wind-speed unit conversion — a real, cited physical-unit-of-measure
 * fact (1 m/s = 3.6 km/h exactly, by definition: 1 km/h = 1000m/3600s,
 * so 1 m/s = 3600/1000 km/h = 3.6 km/h), not an agronomic, regulatory or
 * advisory value.
 *
 * Final whole-session Codex audit (Strict Visual Reproduction phase,
 * `docs/farm-return-next/audit-logs/20260903T155348Z.md`, HIGH):
 * `FieldWindChip.tsx` performed this conversion inline in a UI
 * component — "AGENTS.md explicitly requires scientific calculations to
 * live in a pure, tested `src/domain/` module." Kept separate from
 * `units.ts`'s own `UNIT_REGISTRY`, which is documented as mirroring
 * `docs/scientific-engine/v3/implementation/unit_registry.csv` row for
 * row — wind speed isn't a scientific-engine-V3 quantity that CSV
 * publishes, and adding an un-cited row there would break that exact
 * mirror. A small, separately-cited module for exactly this one real
 * conversion is the honest fit.
 */
export function metresPerSecondToKmPerHour(mps: number): number {
  return mps * 3.6;
}
