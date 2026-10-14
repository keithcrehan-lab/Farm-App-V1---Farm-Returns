# Cattle shared invariant catalogue

These ids are stable: never renumber or reuse one. A later phase may add
new ids at the end. Changing the meaning of an existing id needs human
review.

Audit findings name the invariant they violate (see `VERIFICATION.md`).
The "Kit" column names the conformance check in
`src/tooling/cattle-conformance/cattle-conformance.ts`; "—" means the
phase tests the invariant directly.

| Id | Invariant | Kit |
|---|---|---|
| CAT-INV-001 | Canonical input boundary | phase test, boundary rejection |
| CAT-INV-002 | Detached input | `checkDetachedResult` |
| CAT-INV-003 | Knowledge cutoff first | `checkFutureKnowledgeInvisible` |
| CAT-INV-004 | Future knowledge is invisible | `checkFutureKnowledgeInvisible` |
| CAT-INV-005 | Malformed knowledge time fails closed | `checkMalformedKnowledgeTimeFailsClosed` |
| CAT-INV-006 | Historical relevance is cutoff-stable | `checkFutureKnowledgeInvisible` |
| CAT-INV-007 | Bitemporal separation | — |
| CAT-INV-008 | Identity before validity | `checkDuplicateIdentity` |
| CAT-INV-009 | Evidence state before business state | `checkUnresolvedEvidenceNotMasked` |
| CAT-INV-010 | Semantic equality | `equivalentInstantSpellings`, `checkFingerprintStability` |
| CAT-INV-011 | Source representation preserved | — |
| CAT-INV-012 | Ordering determinism | `checkOrderIndependence` |
| CAT-INV-013 | Append-only history | `checkCorrectionPreservesHistory` |
| CAT-INV-014 | Upstream ownership | review, plus the forbidden-dependency list |
| CAT-INV-015 | One evaluation context | — (C8) |
| CAT-INV-016 | Rule implementation binding | — |
| CAT-INV-017 | No AI authority | — |
| CAT-INV-018 | Canonical units | — |
| CAT-INV-019 | No decision rounding | — |
| CAT-INV-020 | Versioned economic input | — |
| CAT-INV-021 | Reproducible output | `checkFingerprintStability`, `checkDetachedResult` |
| CAT-INV-022 | Explicit unknown | `checkUnresolvedEvidenceNotMasked` |
| CAT-INV-023 | Canonical predecessor outputs | review, plus the forbidden-dependency list |
| CAT-INV-024 | Provenance validated before use | `checkMalformedKnowledgeTimeFailsClosed`, plus phase tests |
| CAT-INV-025 | Version-bound evidence and approval | — |
| CAT-INV-026 | No implicit precedence | `checkDuplicateIdentity`, plus phase tests |
| CAT-INV-027 | Empty production content | — |
| CAT-INV-028 | Downstream consumed-output validation | phase consumed-field schema + generated malformed-predecessor matrix |

## Definitions

### CAT-INV-001 — Canonical input boundary

Authoritative domain reasoning consumes canonical plain-data inputs only.

- **Check at entry.** Each public entry point checks the complete input
  with `toCanonicalPlainData`: the collection, its elements and nested
  values.
- **Reject before evaluating.** Non-canonical input is rejected before any
  evaluation.
- **Adapters materialise.** Turning arbitrary runtime objects into
  canonical data is the adapter's job.
- **Origin:** the human architecture decision after C2 (2026-10-12), and
  C2 finding F008, where only the elements were checked and a
  collection-level getter ran.

### CAT-INV-002 — Detached input

Authoritative evaluation uses inputs detached from mutable caller state.

- **Copy once, then freeze.** The input is copied once, validated, rebuilt
  from known fields and deep-frozen.
- **No caller references.** Caller objects are never retained or read
  again.
- **Outputs are frozen too.** Outputs are deep-frozen and share no
  references with caller input.

### CAT-INV-003 — Knowledge cutoff first

For records that carry a knowledge or received time, historical admission
(`receivedAt <= knowledgeCutoff`) is resolved before any semantic
processing of a record already known to be future.

- **What may run first.** Only the cutoff comparison itself may read such
  a record.
- **What must wait.** Content validation, relevance, identity counting,
  issue reporting and rule lookup happen after admission.
- **Origin:** C2's knowledge-time admission of catalogue and evidence
  records (`admitKnownCatalogue`, `admitKnownEvidence`).

### CAT-INV-004 — Future knowledge is invisible

A well-timestamped record received after `knowledgeCutoff` has zero effect
on that historical evaluation. That covers its output, issues, counts,
fingerprints, relevance and membership.

- **This holds even for malformed content.** It applies when the record's
  content is malformed, as long as its knowledge time is well formed and
  after the cutoff.

### CAT-INV-005 — Malformed knowledge time fails closed

If the engine cannot tell whether a relevant record existed by the cutoff,
it does not guess.

- **No guessing in either direction.** A malformed or missing knowledge
  time is never treated as before or after the cutoff.
- **The result:** the affected evaluation fails closed (invalid input,
  INVALID or UNKNOWN, as the phase defines).

### CAT-INV-006 — Historical relevance is cutoff-stable

At cutoff T, nothing first received after T may change evaluation
membership, interpretation or relevance.

- **That includes deciding what is relevant.** For example, which rule
  versions are "referenced", which implementations are needed, or which
  animals are in scope.
- **Origin:** C2 finding F002, non-monotonic catalogue relevance, fixed in
  `faf5119`. Rule versions count only when an admitted definition or
  review names them.

### CAT-INV-007 — Bitemporal separation

`effectiveAt` (valid time: when something is true on the farm) and
`knowledgeCutoff` (knowledge time: what Farm Return had received) are
distinct arguments, compared independently.

- **Never merge them.** One is never derived from or defaulted to the
  other.
- **No clock reads.** There is no clock read anywhere on the
  deterministic path.

### CAT-INV-008 — Identity before validity

Duplicate and collision detection happens before the rest of a record is
discarded as invalid, wherever stable identity can safely be established.

- **Same id, different content fails closed.** Two records with the same
  id but different content fail closed, even if one of them is otherwise
  invalid.
- **Origin:** C2 counted herd duplicate identity before validity
  filtering.

### CAT-INV-009 — Evidence state before business state

Unresolved required evidence (UNKNOWN, conflicting or INVALID) never
surfaces as a resolved-looking state, such as:

- NOT_APPLICABLE, SATISFIED or ELIGIBLE;
- ON_TRACK, ACTIONABLE or CLEAR;
- COMPLETED, or any equivalent.

For the precedence model, see `ARCHITECTURE.md`.

### CAT-INV-010 — Semantic equality

Equality is defined by domain meaning, not by raw text. For example,
`…:00Z` and `…:00.000Z` are the same instant.

- **Domain rules:** see `NUMERIC_SEMANTICS.md`.
- **Not evidence identity.** Semantic equality is not the same as
  source-evidence identity (see `FINGERPRINTS.md`).

### CAT-INV-011 — Source representation preserved

Normalising values for reasoning, such as instant keys or unit
conversion, never erases the original representation or provenance a
record arrived with. The original stays retrievable from the stored
record.

### CAT-INV-012 — Ordering determinism

Inputs in a different but equivalent order never change an authoritative
output, including:

- its ordering;
- which spelling is kept for idempotent duplicates;
- issue lists;
- fingerprints.

### CAT-INV-013 — Append-only history

Corrections and supersession are new records that reference earlier ids.

- **Nothing is deleted or rewritten.** An earlier cutoff reproduces after
  later corrections.
- **Stored records are pinned.** Records already stored keep their stored
  spelling (C2 `collectBitemporalRecords(records, key, stored)`).

### CAT-INV-014 — Upstream ownership

A downstream phase consumes the canonical outputs of its upstream phase.

- **No reinterpretation.** It never independently reinterprets that
  phase's raw evidence.
- **Who owns what:** see `PHASE_INTERFACES.md`.

### CAT-INV-015 — One evaluation context

One authoritative decision comes from one immutable evaluation context,
with one `effectiveAt` and one `knowledgeCutoff`.

- **No mid-evaluation reads.** Nothing is re-read or fetched during the
  evaluation.

### CAT-INV-016 — Rule implementation binding

Executable rules are trusted code bindings, identified by an approved id,
version and logic fingerprint (C0 `RuleImplementationRef`).

- **Never caller data.** They are never taken from arbitrary caller or
  catalogue data.
- **Unknown or untrusted fails closed.** An unknown or untrusted binding
  fails closed.

### CAT-INV-017 — No AI authority

AI-generated text or values never take part in an authoritative
scientific, regulatory, veterinary or financial calculation. That can
change only if an explicit governed contract later authorises it.

### CAT-INV-018 — Canonical units

Authoritative calculations use canonical internal units.

- **Units are explicit.** Every unit is explicit on the record.
- **Conversion is exact or refused.** Any conversion is explicit, exact
  and tested; otherwise the record is rejected or UNSUPPORTED. Details are
  in `NUMERIC_SEMANTICS.md`.

### CAT-INV-019 — No decision rounding

Authoritative comparisons use canonical, unrounded values.

- **Round only for display.** Rounding happens only at presentation
  boundaries.
- **The exception needs a source.** A documented source or rule may
  explicitly require regulatory or commercial rounding.

### CAT-INV-020 — Versioned economic input

Any price, cost or exchange rate used authoritatively is bound to a
specific observation: its source, version and time (`ARCHITECTURE.md`
§Economic context).

### CAT-INV-021 — Reproducible output

Every authoritative output can be reconstructed from:

- its bound inputs;
- versions and rule identities;
- `effectiveAt` and `knowledgeCutoff`.

Reconstruction is proven by a deterministic fingerprint.

### CAT-INV-022 — Explicit unknown

Missing information is never converted to zero, false, empty, a default or
plausible-looking data.

- **Missing:** becomes UNKNOWN or INSUFFICIENT_EVIDENCE.
- **Malformed:** fails closed.
- **Conflicting:** stays conflicting.

### CAT-INV-023 — Canonical predecessor outputs

C3–C10 never reach back into raw predecessor inputs when a canonical
predecessor output exists. Examples:

- C5 reads C4 series, not raw weights;
- C8 reads the C2 evaluation, not obligation catalogues.

### CAT-INV-024 — Provenance validated before use

Provenance is validated before any authoritative use.

- **Times:** knowledge and provenance times (`receivedAt`, `retrievedAt`,
  `checkedAt` and the like) are strict UTC instants under C1
  `isValidAnimalInstant`.
- **Fingerprints:** they match the assessment-integrity representation:
  the current schema version, `SHA-256` and 64 lowercase hex digits.
- **Malformed provenance fails closed.**
- **Origin:** C2 finding F007.

### CAT-INV-025 — Version-bound evidence and approval

Evidence, fulfilment and approval count only for the exact rule or source
version they name.

- **Approval does not carry over.** Approving v1 never approves v2.
- **Evidence does not carry over.** Evidence for another version gives
  REVIEW_REQUIRED, never SATISFIED.
- **A changed source is reviewed, not applied.** A changed source
  fingerprint produces a review-required or changed state, never a silent
  rule rewrite.
- **Origin:** C0 review lifecycle and C2 fulfilment evidence.

### CAT-INV-026 — No implicit precedence

Competing live corrections, or disagreeing sources, stay conflicting.

- **No implicit winner.** There is no latest-wins, no source precedence
  and no averaging.
- **The only exception:** an explicit, sourced precedence rule, and none
  exists in this campaign.
- **Choosing one is a human decision.** Choosing a precedence is a
  source-precedence human gate.

### CAT-INV-027 — Empty production content

The engines ship with empty production catalogues, registries and target
sets.

- **No real content in code.** No real legal duty, deadline, veterinary
  schedule, product fact, withdrawal period, dose, biological target,
  price or cost is ever encoded.
- **What an empty catalogue gives.** An empty catalogue yields explicit
  UNSUPPORTED or no-content states.
- **Tests use synthetic data.** Tests use `SYNTH-*` content only.
- **Origin:** C0–C2 constraint 11.

### CAT-INV-028 — Downstream consumed-output validation

Predecessor outputs are canonical plain data, but they are not trusted
domain data until the consuming phase validates the fields it consumes
(human architecture decision, 2026-10-14, after C7 finding F007).

- **Validate what you consume.** Before a phase uses a predecessor output
  authoritatively, it validates the schema / payload version / runtime type /
  vocabulary / identifier and instant format / nested structure of every
  predecessor field it reads, in one consumed-field schema at one
  predecessor-consumption boundary. No evaluator reads raw predecessor
  fields.
- **Fingerprints are not validity.** A fingerprint proves integrity and
  change binding only: an internally consistent, re-sealed object can still
  be malformed. Schema validity, allowed vocabulary, required presence and
  authenticity are never inferred from it.
- **Fail closed, exhaustively.** Unknown, malformed or unsupported
  predecessor values reject the input as invalid predecessor output. Every
  translation from a predecessor state to the phase's own states is
  exhaustive at runtime (never a throw, a fall-through or a resolved
  default), not only at compile time.
- **Prefer the owner's validator.** Where a frozen predecessor exports a
  runtime validator or materialiser that fully validates a consumed surface,
  call it; validate only what it does not. This is contract validation,
  never re-evaluation of the predecessor's business logic.
- **Test by class.** A generated matrix mutates every consumed field
  (missing, disallowed null, wrong type, malformed format, unknown
  vocabulary), re-seals the predecessor fingerprints and proves the input is
  rejected; a drift guard ties the schema to the fields actually read.
- **Check stated consistency.** Every relationship the frozen contract
  states between consumed fields (e.g. a status and the superseders that
  define it) is checked as a predicate; a self-contradictory output fails
  closed. This is never a recomputation of predecessor logic.
- **Every field read on the phase's behalf counts.** Fields a frozen
  predecessor function reads from supplied data for the phase (e.g. a
  hard-gate projector) are consumed fields too.
- **Trust bound (human decision).** Validation detects MALFORMED and
  SELF-CONTRADICTORY outputs. A fully consistent forged output cannot be
  authenticated by the consumer — authenticity belongs to the adapter / the
  C8 sealed context (BLOCKERS CAT-B1).
- **Scope.** Malformed plain data at an inter-phase boundary. Hostile
  JavaScript (getters, proxies, functions) stays outside the canonical
  plain-data contract (ARCHITECTURE.md §Canonical input boundary).
- **Origin:** C7 findings F003 / F007; binding for C7 and every later phase
  (C8 preflight).

## Interactions (no contradictions)

- **Admission versus malformed time** (CAT-INV-003/004 versus 005):
  - A record whose knowledge time is valid and after the cutoff is
    invisible, even if its content is malformed (CAT-INV-004).
  - A record whose knowledge time is malformed fails closed
    (CAT-INV-005).
  - A record whose knowledge time is valid and at or before the cutoff,
    with malformed content, fails closed when validated (CAT-INV-022).
- **Identity versus admission** (CAT-INV-008 versus 004): identity
  collisions are judged among admitted records. A future record cannot
  create a historical collision.
- **Semantic equality versus representation** (CAT-INV-010 versus 011):
  - Reasoning and semantic fingerprints compare by meaning.
  - Stored records and evidence fingerprints keep the original
    representation.
  - An idempotent duplicate keeps one spelling, chosen deterministically
    (CAT-INV-012) or pinned when already stored (CAT-INV-013).
