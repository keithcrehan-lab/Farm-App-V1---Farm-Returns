/**
 * Cattle C10 — the admitted presentation states every farmer-facing cattle
 * component consumes (the component boundary).
 *
 * The rule: a component never interprets domain absence, failure,
 * uncertainty or provenance. Empty vs unavailable, absent vs failed, measured
 * vs estimated, observed vs assumed, observed vs projected: each is decided
 * here, in the presentation layer, and arrives at the component as an
 * explicit state with its own wording.
 *
 * - `Listing<T>`: a domain collection. ITEMS is never empty (`NonEmpty`);
 *   known-empty (EMPTY) and unavailable (UNAVAILABLE) each carry their own
 *   display state, so a component has nothing to count and no "no records"
 *   sentence of its own to write.
 * - `Details<T>`: an explanatory detail list (evidence lines, sources, record
 *   ids) declared here as "empty means nothing further to show" — never a
 *   domain claim. Only `details()` makes one.
 * - `SealedInput<T>`: owner reads a component must hand back to a
 *   presentation function (the plan economics) without reading them.
 *
 * Enforced mechanically by `src/components/cattle/component-boundary.test.ts`
 * (TypeScript checker over every exported cattle component): no possibly-empty
 * plain array, no non-text nullable and no unsealed owner read reaches a
 * component prop; components import the domain only through this module's
 * package; no component reads inside a sealed input or writes its own
 * fallback or absence wording.
 */

import { EVALUATION_UNAVAILABLE, type DisplayState } from "./display-states";

export type NonEmpty<T> = readonly [T, ...T[]];

export function nonEmpty<T>(xs: readonly T[]): NonEmpty<T> | null {
  return xs.length > 0 ? (xs as unknown as NonEmpty<T>) : null;
}

export type Listing<T> =
  | { state: "ITEMS"; items: NonEmpty<T> }
  | { state: "EMPTY"; display: DisplayState }
  | { state: "UNAVAILABLE"; display: DisplayState };

/** A KNOWN collection: ITEMS when it has any, else EMPTY with the wording that says what "none" means here. */
export function listingOf<T>(items: readonly T[], empty: DisplayState): Listing<T> {
  const ne = nonEmpty(items);
  return ne === null ? { state: "EMPTY", display: empty } : { state: "ITEMS", items: ne };
}

export function unavailableListing<T = never>(display: DisplayState = EVALUATION_UNAVAILABLE): Listing<T> {
  return { state: "UNAVAILABLE", display };
}

/** The listed items, or none — for presentation code that only aggregates (never for rendering a claim). */
export function listedItems<T>(l: Listing<T>): readonly T[] {
  return l.state === "ITEMS" ? l.items : [];
}

/** A listing's first `n` items and the rest (layout: "show 8, disclose the earlier ones"). */
export function splitItems<T>(items: NonEmpty<T>, n: number): { head: NonEmpty<T>; rest: Details<T> } {
  const k = Math.max(1, n);
  return { head: items.slice(0, k) as unknown as NonEmpty<T>, rest: details(items.slice(k)) };
}

export type Details<T> = readonly T[] & { readonly __presentation: "DETAILS" };

/** Declares a list as explanatory detail: empty means nothing further to show, never "none recorded". */
export function details<T>(xs: readonly T[]): Details<T> {
  return xs as Details<T>;
}

export type SealedInput<T> = { readonly __presentation: "SEALED_INPUT"; readonly __value: T };

export function seal<T>(value: T): SealedInput<T> {
  return { __presentation: "SEALED_INPUT", __value: value } as SealedInput<T>;
}

/** Presentation-layer only: components never read a sealed input (component-boundary test). */
export function unseal<T>(s: SealedInput<T>): T {
  return s.__value;
}
