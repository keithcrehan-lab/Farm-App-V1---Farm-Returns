# Cattle verification, conformance and finding classification

## Test classes

- **FAIL_TO_PASS.** These tests prove behaviour that is new or fixed in
  this phase or round.
  - They fail on the phase base, or on the pre-fix HEAD, and pass after
    the change.
  - Each brief lists a FAIL_TO_PASS matrix.
  - A remediation adds at least one FAIL_TO_PASS test for the finding it
    fixes. After the second reproduction in an invariant family, the
    remediation adds a matrix (see below).
- **PASS_TO_PASS.** These cover existing behaviour that must stay
  correct:
  - frozen C0–C2 suites;
  - earlier phase suites;
  - the conformance kit self-tests;
  - the directly affected predecessor integrity tests.

  They must pass before and after. A PASS_TO_PASS failure in frozen code
  is never "fixed" by editing frozen code. It stops at the frozen-contract
  gate.

## What to run

| Moment | Run |
|---|---|
| Normal implementation / narrow remediation | targeted phase tests; conformance tests for the invariants touched; directly affected predecessor tests; `npm run typecheck`; `npm run lint` (the manifest verify command covers this) |
| Phase freeze (orchestrator) | manifest verify (phase + `src/domain/cattle` + `src/tooling/cattle-conformance`), then the full quality gate (`npm test`, typecheck, lint, build), then the strict whole-phase audit |

Do not run the whole global suite after every narrow fix. The freeze
runs it once.

## Using the conformance kit

The kit is `src/tooling/cattle-conformance/cattle-conformance.ts`, and
it is for tests only. Production code never imports `src/tooling/`.

- **Adapt your engine to the kit's callbacks.** For example,
  `evaluate(records, knowledgeCutoff)` must run the phase's full
  authoritative path: canonical check → admission → validation →
  projection. Then assert `expect(verdict).toEqual(CONFORMS)`.
- **Use small tables, not Cartesian products.** Build the
  before/at/after cutoffs with `cutoffMatrix`, and use
  `MALFORMED_INSTANTS` and `equivalentInstantSpellings` for time inputs.
  `inputPermutations` gives a bounded set of input orders.
- **Pick the right check for each invariant:**

  | Check | Invariants it covers |
  |---|---|
  | `checkFutureKnowledgeInvisible` | CAT-INV-003, 004, 006 |
  | `checkMalformedKnowledgeTimeFailsClosed` | CAT-INV-005, 024 |
  | `checkDuplicateIdentity` | CAT-INV-008, 026 |
  | `checkUnresolvedEvidenceNotMasked` | CAT-INV-009, 022 (pass your phase's own forbidden-state list) |
  | `checkCorrectionPreservesHistory` | CAT-INV-013 |
  | `checkOrderIndependence` | CAT-INV-012 |
  | `checkDetachedResult` | CAT-INV-002, 021 |
  | `checkFingerprintStability` | CAT-INV-010, 021 |

- **Include late malformed records.** In `checkFutureKnowledgeInvisible`,
  put well-timestamped but content-malformed late records in `later`.
  This proves they do not contaminate earlier state.
- **Extending the kit.** Add a check only when it is generic, needing no
  phase domain semantics. Add it with self-tests in
  `cattle-conformance.test.ts`. This is a category-B tooling change.
  During a phase it lies outside the phase scope guard, so propose it as
  a separate tooling commit between phases.

## Audit findings map to invariants

Every audit finding should name the invariant it violates, for example:

> **Finding:** a medicine record received later changes historical
> withdrawal state.
> **Invariant:** CAT-INV-004, future knowledge is invisible.

Findings that fit no invariant are still valid. They are classified by
the AUDIT_RULES taxonomy as usual.

**Reproduction policy for an invariant family** (same CAT-INV id, same
phase):

1. **First reproduction:** confirm it, repair it, and add a FAIL_TO_PASS
   test.
2. **Second reproduction in the same family:** stop symptom patching.
   The remediation must then:
   - perform a root-cause analysis, naming the step in the admission
     order (`TEMPORAL_EVIDENCE.md`) or the boundary that is wrong;
   - repair the whole class at that step;
   - add a matrix test over the family, using the kit check for that
     invariant.
3. **The auditor's job.** It verifies the invariant: does the matrix
   cover the class? It does not hunt for more variants of an
   already-matrixed class. A new variant counts as a finding only if it
   escapes the matrix's stated class.

**Out-of-contract reproductions are not findings.** A reproduction that
needs input outside the canonical contract, such as getters, Proxies,
functions or class instances reaching the engine past the boundary, does
not count against the engine. The boundary must still reject that input
(CAT-INV-001).

## Freeze definition (every phase from C3 to C10)

A phase is frozen when all of the following hold:

- its targeted phase tests pass;
- every shared conformance check its brief requires is used and
  passes;
- the PASS_TO_PASS surface passes;
- the full quality gate passes: `npm test`, typecheck, lint and build;
- the strict whole-phase audit, run from the phase base to HEAD, finds
  CRITICAL = 0, HIGH = 0 and MEDIUM = 0;
- the orchestrator has written the receipt and committed the closure.
