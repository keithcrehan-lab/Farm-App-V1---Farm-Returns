/**
 * Cattle C10 — the presentation availability invariant:
 *
 *   C10 never collapses unavailable / unknown / unresolved / failed data into
 *   a known-empty state.
 *
 * Every view-model value that aggregates an owner output — a collection, a
 * membership, a count, a work list, a chart series, a cost summary — is an
 * `Availability`: KNOWN (the owner produced it; it may legitimately hold zero
 * items) or UNAVAILABLE (the owner produced nothing, with the display state
 * that says why). There is no third shape: no empty array, zero count or
 * `null` that a renderer could read as "none". Renderers branch on `state`
 * before they can reach the value.
 *
 * This is a presentation boundary only. Whether an owner output exists is the
 * owner's answer (`null` / `{ ok: false }` / an entry missing from its
 * result); C10 never re-derives or second-guesses owner semantics, and keeps
 * the owner's own, more specific states (e.g. `WEIGHT:NONE`, `GOAL:NONE`,
 * `MEMBERSHIP:UNKNOWN`) wherever the owner produced one.
 */

import { EVALUATION_UNAVAILABLE, type DisplayState } from "./display-states";

export type Availability<T> = { state: "KNOWN"; value: T } | { state: "UNAVAILABLE"; display: DisplayState };

export const known = <T>(value: T): Availability<T> => ({ state: "KNOWN", value });

export const unavailable = <T = never>(display: DisplayState = EVALUATION_UNAVAILABLE): Availability<T> => ({ state: "UNAVAILABLE", display });

/** The value when KNOWN, else `fallback` — for callers that only need it alongside an explicit unavailable branch. */
export const knownOr = <T, F>(a: Availability<T>, fallback: F): T | F => (a.state === "KNOWN" ? a.value : fallback);
