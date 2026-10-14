# C7 architecture review — predecessor composition (2026-10-14)

Read-only review at the C7 stop on F008 (HEAD `f28eac0`, C7 `REPEATED_HIGH_FINDING`, C8 not
started, no C7 receipt). Question: should C7 obtain C2/C3 results by invoking their frozen
engines over canonical inputs instead of accepting supplied derived outputs?

## 1. C7 predecessor surface (at `f28eac0`)

| Predecessor | Canonical inputs | Derived output C7 uses | Authoritative engine | C7 calls it? | Derived object crosses into C7? | Provenance | CAT-INV-028 checks today |
|---|---|---|---|---|---|---|---|
| C1 animal facts | `AnimalLedger` (assertions) | `AnimalSnapshot` sex / date of birth, snapshot fingerprint | `rematerialiseAnimalLedger`, `projectAnimalSnapshot`, `computeAnimalSnapshotFingerprint` | **Yes** | No | snapshot fingerprint (computed in-process) | schema only |
| C4 group membership | the same C1 ledger | `ScopeResolution` (per-animal state, `CATTLE_GROUP_SCOPE` fingerprint) | `resolveGroupScope` | **Yes** | No | scope fingerprint (in-process) | schema only |
| C3 health | health records, authorised-product records, food products, ledger | `AnimalHealthProjection`: timeline, medicine ledger + product bindings, withdrawal gate | `projectAnimalHealth`; gates via `projectWithdrawalHardGates` | **No** — the projection is supplied | **Yes** (`request.health`) | three view fingerprints, re-verifiable but recomputable | schema + 9 consistency predicates + membership / cross-view checks |
| C2 obligations | ledger, fulfilment evidence, obligation catalogue (+ trusted implementation registry) | `AnimalObligationEvaluation` records | `evaluateAnimalObligations` / `evaluateHerdObligations`; gates via `projectObligationHardGates` | **No** — the evaluation is supplied | **Yes** (`request.obligations`) | per-record fingerprints, recomputable | schema + 4 consistency predicates + per-record membership |

## 2. Failure pattern (F003, F007, F008 are one defect)

1. A **derived** predecessor output (C2 evaluation, C3 projection) crosses into C7 as caller data.
2. Its fingerprints prove only that the object is self-consistent with itself — anyone can
   recompute ("re-seal") them. They do not prove the object was derived from any evidence.
3. C7 therefore tried to establish authenticity by **reconstructing predecessor semantics**:
   per-record membership (F003), field validity (F007), cross-field consistency (pre-gate
   review H1–H4), completeness (F008).
4. Every derivation relationship not restated is a new forgery surface; restating all of them
   is reimplementing C2/C3 inside C7 — forbidden by phase ownership. The defence can never be
   complete, and each omission is a High. F008 (a gate omitting a live administration) is the
   completeness case of the same reconstruction.

C1 and C4 never had this defect: C7 composes them from canonical input.

## 3. CAT-INV-023 versus CAT-INV-028

CAT-INV-023 ("never reach back into raw predecessor inputs when a canonical predecessor output
exists") targets **reinterpretation**: a downstream phase reading raw evidence with its own
logic. It does not forbid delegation, and C7 already calls C1 and C4 engines. Clarification
adopted (additive to CAT-INV-023):

> Invoking a frozen predecessor engine over that predecessor's canonical inputs is delegation
> to the authoritative interpreter and is not reinterpretation of the predecessor's evidence by
> the consuming phase. The consuming phase must never independently reimplement predecessor
> derivation rules.

CAT-INV-028 stays (validate consumed fields; fingerprints are not validity). Its consistency
predicates were a workaround for accepting supplied derived outputs; with composition the
derived output is authoritative by construction and those predicates are removed. CAT-B1's
"consistent forgery" limit no longer applies to C7.

## 4. Target boundary

```
canonical upstream evidence (ledgers, health records, product records, obligation evidence,
                             obligation catalogue) + trusted C2 implementation registry
        ↓  programme-predecessors.ts (the one composition boundary)
frozen engines: C1 rematerialise/project · C4 resolveGroupScope · C3 projectAnimalHealth ·
                C2 evaluateHerdObligations · C2/C3 hard-gate projectors
        ↓
authoritative predecessor results (in-process, never caller-supplied)
        ↓  consumed-field schema (typed internal representation; drift guard)
C7 evaluation
```

## 5. Request contract

| Field | Change |
|---|---|
| `health: AnimalHealthProjection[]` (derived) | **Removed.** Replaced by `health: {foodProducts, productRecords, animals: [{animalId, healthRecords}]} \| null` — C3's canonical inputs; `null` = no C3 evidence supplied |
| `obligations: AnimalObligationEvaluation[]` (derived) | **Removed.** Replaced by `obligations: {catalogue, obligationIds, evidence} \| null` — C2's canonical inputs; `null` = none supplied |
| C2 implementation registry | New trusted, non-canonical **parameter** (`options.obligationImplementations`), exactly C2's own precedent (a `createObligationImplementationRegistry` registry, authenticated by C2) |
| `definitions`, `reviews`, `completions`, `ledgers`, `query` | Unchanged (C7-owned canonical inputs and C1 ledgers) |

Fingerprints after composition: C3 view fingerprints and C2 record fingerprints are computed
in-process by the frozen engines and remain the **result binding** of the evidence C7 used
(they hash the full records, product versions and food products); they are provenance and
replay identity, no longer an authenticity claim about caller data. Completeness of the
canonical evidence supplied remains the adapter's responsibility (the C3 / C2 precedent).

## 6. Where composition happens

In C7's existing predecessor boundary (`programme-predecessors.ts`), once per request: one
`projectAnimalHealth` per animal with C3 evidence, one `evaluateHerdObligations` for the
request. No cycle (C2/C3 never import C7); no nondeterminism (pure engines of canonical input +
`hash`); no ownership violation (delegation, §3); no recursion beyond one level. Computation is
not repeated within C7. C8 will call C7 as an engine too; C8 recomputing C2/C3 alongside C7 is
deterministic duplicate work, not a correctness issue (optimisation left to C8 design).

## 7. Rule C8 inherits

C8's sealed `CattleEvaluationContext` is **constructed** from canonical evidence by invoking the
frozen C1–C7 engines in one construction boundary; it never accepts a caller-supplied derived
predecessor output as authoritative and never restates predecessor derivation semantics.
CAT-INV-028 schema validation applies to every engine output it consumes.

## 8. Decision

**PROCEED.** No circular dependency, ownership or determinism problem: C7 already composes
C1/C4 this way, the C3/C2 engines are frozen pure exports taking canonical data, and the only
non-canonical C2 input (the implementation registry) has an established trusted-parameter
precedent in C2 itself. The migration is bounded to C7's request contract, its predecessor
boundary, its tests and documentation.
