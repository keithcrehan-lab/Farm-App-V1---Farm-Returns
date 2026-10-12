# Cattle temporal and evidence model

Covers invariants CAT-INV-003 to 008, 013, 024, 025 and 026. Read this
before handling `effectiveAt`, `knowledgeCutoff`, corrections, or late or
malformed records.

## Two times

| Concept | Meaning | Source on a record | Query argument |
|---|---|---|---|
| Valid / effective time | When something is true or happened on the farm | the record's own effective fields (observation instant, administration instant, `validFrom`/`validTo`, declaration period) | `effectiveAt` |
| Knowledge time | When Farm Return received or knew it | `receivedAt` (or the phase's equivalent provenance time) | `knowledgeCutoff` |

- **Both times are explicit.** Every projection takes both arguments, and
  neither defaults to the other or to a clock.
- **Instants are strict UTC.** They are compared through C1
  `animalInstantKey` / `compareInstants`, never by spelling, locale or
  timezone conversion.
- **Exact arithmetic.** UTC arithmetic uses the exact nanosecond helpers
  in C2 `obligation-time.ts`, such as `addObligationOffset`,
  `obligationInstantJustBefore` and `utcCalendarDateOf`.
- **Calendar dates are not instants.** Calendar dates (`YYYY-MM-DD`, C0
  `isValidCalendarDate`) carry no time zone. A date is turned into an
  instant only through a documented rule, such as C2's UTC start of the
  date of birth.

## Admission order at a cutoff (normative)

1. **Canonical boundary.** Run `toCanonicalPlainData` on the whole input
   (CAT-INV-001).
2. **Read knowledge times only.** For each record, read only its knowledge
   time:
   - malformed or missing: the record is unadmittable and fails closed
     (CAT-INV-005);
   - well formed and after the cutoff: set the record aside, and never
     read its content again (CAT-INV-003/004);
   - well formed and at or before the cutoff: admit it.
3. **Identity among admitted records.** Duplicates and same-id conflicts
   are found before content validity (CAT-INV-008).
4. **Content validation.** Malformed content fails closed (CAT-INV-022),
   and provenance is validated (CAT-INV-024).
5. **Supersession resolution at the cutoff.** Only links known by the
   cutoff apply. An unknown target, an out-of-scope link or a cycle is
   invalid and never skipped. Disagreeing live terminals compete, with no
   winner (CAT-INV-026).
6. **Relevance and semantic evaluation,** using only admitted, valid,
   resolved records (CAT-INV-006).
7. **Output.** It is rebuilt, sorted, deep-frozen and fingerprinted
   (CAT-INV-002/012/021).

A record that names no knowledge time at all, because its type has none,
is admitted on its other terms. Its type must be documented as
timeless, and any timeless type must be immutable reference data, for
example a trusted code registry.

## Append-only records

- **Collection reuses C2 generics.** Reuse the C2 generic machinery,
  `collectBitemporalRecords` and `resolveBitemporalRecords`, for any
  record type with `recordId`, `supersedes` and `receivedAt`.
- **Duplicates.** The same id with identical content (instants compared
  by instant) is idempotent, and the same id with different content fails
  closed. The kept spelling is independent of input order, and stored
  records are pinned.
- **Corrections are new records.** A correction is a new record whose
  `supersedes` names earlier ids. Nothing is deleted. Self-supersession is
  rejected.
- **History is reportable.** Superseded history stays in projections, as
  history views, so an audit can reconstruct what was known.

## Catalogue and definition data

- **Same cutoff model as evidence.** Rule definitions, programme
  definitions, targets, product records and reviews follow the same model
  as evidence. Each carries the time it was known: a source's
  `retrievedAt`/`checkedAt`, or a declaration's `receivedAt`.
- **Set aside at evaluation.** At evaluation, definitions known only
  after the cutoff are set aside before any relevance computation.
- **Precedent:** C2 `admitKnownCatalogue`.
- **Revised definitions:**
  - a revision received later cannot change historical state;
  - a revision whose knowledge time is malformed fails closed.

## Proven C2 patterns to reuse (not copy)

| Need | C2 export |
|---|---|
| Canonical check / safe field read | `toCanonicalPlainData`, `canonicalField` |
| Instant validity / ordering | `isValidAnimalInstant`, `animalInstantKey`, `compareInstants` (C1) |
| Canonical instant spelling / arithmetic | `canonicalObligationInstant`, `addObligationOffset`, `obligationInstantJustBefore` |
| Append-only collection and as-of-cutoff resolution | `collectBitemporalRecords`, `resolveBitemporalRecords` |
| Trusted executable registry pattern | `createObligationImplementationRegistry` (pattern; a phase owns its own registry) |
| Hard-gate projection shape for C0 packs | `projectObligationHardGates` |
