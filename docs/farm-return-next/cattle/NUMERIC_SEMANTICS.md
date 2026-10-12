# Cattle numeric semantics and semantic equality

Covers invariants CAT-INV-010, 011, 018, 019, 020 and 022.

## Canonical units

| Quantity | Canonical authoritative unit | Notes |
|---|---|---|
| Live weight | kg | Values are recorded with an explicit unit from a closed enumeration. Conversion to kg is exact and explicit, otherwise the record is rejected or UNSUPPORTED. The recorded value and unit are preserved. |
| Gain | kg | later − earlier, using live C4 observations |
| ADG / growth rate | kg/day | gain ÷ elapsed days, under the day convention below |
| Elapsed time | exact instant difference | from the C1/C2 instant model; never by calendar date or local time |
| Money | amount + ISO currency code | always an explicit currency; no implicit EUR |
| Exchange rate | from-currency, to-currency, rate | a versioned observation with source and time |
| Withdrawal period | a duration as supplied in a product record | its unit and exactness come from the supplied record and are never assumed |

## Phase-level decisions required before authoritative calculation

Each of these is decided and documented by the owning phase in its
DOMAIN_CONTRACTS.md section, and tested. Where a decision needs a source,
a placeholder is not acceptable. The phase stops at the relevant human
gate instead.

- **Number representation.** C4 and C5 decide how values are held: a
  JavaScript double, with the documented precision limits, or an exact
  decimal or integer, such as grams or nanoseconds. Whatever is chosen
  must stay deterministic across platforms.
- **Day convention.** C5 defines the ADG elapsed-days convention, for
  example exact seconds ÷ 86 400.
- **Weight conversion.** C4 decides the conversion table, if any, for
  non-kg units. It must be exact and explicit. If no exact conversion is
  documented, the record is UNSUPPORTED.
- **Money representation.** C8 decides how money amounts are held,
  for example as minor units or a decimal string. No floating-point
  currency arithmetic is allowed without a documented error bound.
- **Tolerances.** Any comparison tolerance (C5 target bands, C8 ties) is
  supplied with provenance as part of the target or policy. There is
  never an undocumented epsilon.

## Precision and rounding

- **Decisions use full precision.** Authoritative comparisons such as
  thresholds, target bands, ranking and gates use canonical, unrounded
  values (CAT-INV-019).
- **Round at presentation only.** Rounding happens only at presentation
  (C10 view-models), and that rounding is never fed back into domain
  calls.
- **The sourced exception.** Regulatory or commercial rounding, such as a
  sourced rule that rounds a period up to whole days, is applied only
  where that sourced rule requires it. It is applied as an explicit,
  traced calculation step.
- **No float magic.** A tolerance must come from a documented, supplied
  policy.
- **Non-finite numbers are invalid.** NaN and ±Infinity are invalid
  input. `canonicalizeValue` already refuses them for fingerprints.

## Semantic equality (CAT-INV-010)

| Kind | Equal when | Not |
|---|---|---|
| Instant | Same C1 `animalInstantKey` (e.g. `…:00Z` ≡ `…:00.000Z`) | Spelling, offsets (not admitted), local time |
| Calendar date | Same `YYYY-MM-DD` value (C0 `isValidCalendarDate`) | An instant; time-zone conversion |
| Identifier | Exact string per its documented identifier contract (opaque refs are case- and whitespace-significant unless the contract says otherwise) | Fuzzy, case-folded or trimmed matching by convenience |
| Weight / number | Same canonical numeric value in the canonical unit | Formatting, trailing zeros, display rounding |
| Money | Same amount + same currency + same applicable economic context (observation/version) | Same digits in different currencies; amounts converted at an unbound rate |

- **Equality is not evidence identity.** Two semantically equal records
  may still be different evidence: they can have different record ids,
  sources or received times. Semantic equality decides reasoning and
  idempotence of content. Record identity and evidence fingerprints
  decide provenance (see `FINGERPRINTS.md`).
- **The original representation is kept.** Semantic normalisation never
  replaces the stored representation (CAT-INV-011).
