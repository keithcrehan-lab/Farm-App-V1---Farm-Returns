# Farm Return Next — current implementation log

Historical record through frozen Campaign B: [unchanged archive](history/IMPLEMENTATION_LOG-through-b24c266.md).
Read historical sections only for a specific investigation. Rotate completed campaigns into
`history/` with their boundary SHA, retain a link here, and append one concise entry per task.
The archive and Git retain full provenance; no historical entry is deleted.

## Pilot Integration — manual acceptance repairs (2026-10-24)

The signed-in walkthrough found two defects and three pieces of farmer-facing wording to fix:
- a headcount-only group couldn't be opened;
- an unknown live weight showed as 0 kg;
- internal tooling wording appeared on Supports;
- Records showed raw field ids;
- Plan showed raw material codes.

All are repaired at `a0ba9d1`, with no schema or domain change. The full gate `quality-20261024T200613Z-7797` passed.
The manual check resumes with STATE.md steps A–G.

## Pilot Integration P4 — pilot completion (2026-10-24)

`/what-matters` is a real screen built on the existing audited evaluation, and it says when fertiliser price evidence
is missing. The pilot navigation is Farm, What Matters, Plan, Cattle and Records, with unfinished screens hidden but
kept. Sign-in lands on Farm, and Ask AI is hidden for signed-in farms (D15). Implementation `b6dba8b`. The final full
gate `quality-20261024T174644Z-84668` passed. The signed-in walkthrough is still outstanding (see STATE.md).

## Pilot Integration P3 — one cattle product (2026-10-24)

`/cattle` is the one cattle destination. The former Livestock management moved to Cattle → Manage herd
(`/cattle/manage`) using the existing forms and actions. `/livestock` redirects there and the Livestock nav entry is
removed. The livestock actions now resolve the farm server-side (D14). There is no schema change. Implementation
`e333a8d`. The full gate and Codex were not run, by design. Details are in
`docs/farm-return-next/pilot-integration/STATE.md`.

## Pilot Integration P2 — real cattle writes (2026-10-24)

Signed-in Record Weight on a real `/cattle` animal now writes, through the server action `recordRealCattleWeight`,
to the existing `livestock_weight_observations` table. The farm is resolved server-side, and the action revalidates
`/cattle` and `/livestock` so the frozen engines recompute from Supabase. There is no migration: the method is not
recorded (D12), and idempotency uses a client-generated primary key (D13). Implementation `867bdb2`. The full gate
passed once (`quality-20261024T155333Z-59710`). Details are in `docs/farm-return-next/pilot-integration/STATE.md`.

## Pilot Integration P1 — real cattle reads (2026-10-24)

Signed-in `/cattle` now reads the farm's own `livestock_*` rows through `cattle-source.ts` → `real-records.ts` →
`real-service.ts` → the frozen engines → the C10 view-builders. It is read-only, and demo mode is unchanged.
Implementation `ef9f12f`. State, verification and decisions are in `docs/farm-return-next/pilot-integration/`
(STATE.md, DECISIONS.md D11). The full gate and Codex were not run, by design (Tier 2).

## Cattle Engine v1, C10 close-out — Cattle UX — manually adopted at 510f003 (2026-10-24)

C10 was built by hand, not by `scripts/agent-campaign-run`; it is **frozen at `510f003ef252f6eff83f78ffd7617de2e8858a58` by separately authorised manual
adoption** (`.agent/campaigns/cattle-engine-v1/C10_MANUAL_ADOPTION.md`, assurance standard TIER2_APPLICATION). This record is not a runner build and claims no clean final whole-phase audit.

- Full strict baseline audit `audit-20261023T184003Z-94767.md` over `6e81831e60d902359ae8370a223960955fd45766..5aa207df12bfbcd3695d69021ab90c8ea7fcc57c`: CRITICAL=0 HIGH=2 MEDIUM=0 LOW=0.
- Bounded strict closure audit `audit-20261024T103926Z-13552.md` over `5aa207df12bfbcd3695d69021ab90c8ea7fcc57c..2fb2d20b0bb19b8696098ea672fed2d3f8a84203`: CRITICAL=0 HIGH=0 MEDIUM=1 LOW=0.
- Closure findings resolved: F020 (MEDIUM, closure audit): test-only remediation 4bb4dc5.
- Outstanding Low (recorded, not fixed): none.
- Verification: full suite `quality-20261024T090919Z-98651` passed at `510f003` (attestation `.agent/campaigns/cattle-engine-v1/adoption/C10-gate-quality-20261024T090919Z-98651.txt`); production unchanged to evidence head `9d03bba`.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C10.json` (origin `manual-adopted`, fingerprint `89e9237b37a5336e`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- Campaign complete.

## Campaign runner — manual adoption of a hand-built final phase (2026-10-24)

The separately authorised "C10 Adoption, Freeze and Campaign Closure" task adds `scripts/agent-campaign-run <id> --adopt <phase>`. It needs a
human `manual_adoption` pin in the manifest, which is allowed on the final phase only. It recomputes every pinned item of evidence and writes a receipt of origin
`manual-adopted` (`runner_built: false`, no `strict_audit`). Validation of such a receipt is separate from the strict CRITICAL=HIGH=MEDIUM=0
freeze, which every runner-built phase still needs. A pinned phase is never built by the runner. Documented in `.agent/README.md`
("Manual adoption of a hand-built final phase"). Tests: `scripts/tests/agent-campaign.test.py` test_60–test_64 (adoption, receipt bound to pin,
unsound evidence refused, pin digests/placement, never builds a pinned phase); the existing runner suite passes unchanged. No product code changed.

## Cattle Engine v1, C9 close-out — Plan Interface — frozen at c3e717d (2026-10-20)

C9 (task `cattle-c9-plan-interface-20261019`, base `91ef012`) is **frozen at `c3e717daf69ac4507686eec4bd0ab169419e425a`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261020T160112Z-2985897161.md` over `91ef012..c3e717d`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 1 Medium round(s), 2 High round(s): F004 (HIGH, audit-20261019T170520Z-623621139.md): Shared source-reference structure reaches Plan unchecked — sig 815b4a9abb920265; F003 (HIGH, audit-20261019T151706Z-612276544.md): Folding drops creation-origin provenance — sig 9f93a3d2b678b255; F002 (MEDIUM, audit-20261019T123404Z-1547146619.md): Timestamp precision can falsely complete weight work — sig ab8864175944918a; F001 (MEDIUM, audit-20261019T123404Z-1547146619.md): Valid matching Plan identities fail to merge — sig f28d12b7df4aba24.
- Outstanding Low (recorded, not fixed): none.
- Verification at `c3e717d`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Human-authorised amendments outside the phase scope (bound to exact blobs; never agent-editable): `src/domain/cattle/recommendations/recommendations.test.ts` 9ce65076d64e→17790adc45cb (human 2026-10-20: authorised frozen-C8 test-only reliability split of the recommendation mutation test (1160 mutations into 74 groups); zero semantic coverage loss, no assertion weakening, no C8 production change); `scripts/agent-campaign-run` 8e4b0303aefa→cc58f756c045 (human 2026-10-20: authorised campaign tooling repair supporting exact content-pinned frozen-phase amendments without widening build/fix-agent scope (aa4af97, 11c3b70, 095b51d)); `scripts/tests/agent-campaign.test.py` f212d7fa3672→7d01fcb4e547 (human 2026-10-20: authorised tests for the campaign amendment mechanism (aa4af97, 11c3b70, 095b51d)).
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C9.json` (fingerprint `6b30b6a48c2ef430`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C10 **not started**.

## Cattle Engine v1, C8P1 close-out — Plan Compatibility Amendment — frozen at 9480f22 (2026-10-17)

C8P1 (task `cattle-c8p1-plan-compatibility-amendment-20261017`, base `b66a318`) is **frozen at `9480f22e2b19656f95c7259d4f2cd105cca081d1`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261017T205750Z-2430244256.md` over `b66a318..9480f22`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 0 Medium round(s), 0 High round(s).
- Outstanding Low (recorded, not fixed): none.
- Verification at `9480f22`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C8P1.json` (fingerprint `6c030ed74bfd99a7`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C9 **not started**.

## Cattle Engine v1, C8 close-out — Recommendation Engine — frozen at 29234af (2026-10-17)

C8 (task `cattle-c8-recommendation-engine-20261015`, base `c3aa26d`) is **frozen at `29234afe1ba034227bb0cadf6b10cef6b2960208`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261017T115031Z-4216432885.md` over `c3aa26d..29234af`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 2 Medium round(s), 2 High round(s): F005 (MEDIUM, audit-20261015T224053Z-3771286038.md): Stored verification accepts deleted gate checks — sig 42e7c1c6718c29a7; F009 (MEDIUM, audit-20261016T084518Z-2633281737.md): Stored verifier skips the canonical input boundary — sig 6b01da929d9aa8d6; F002 (HIGH, audit-20261015T134819Z-2849804748.md): Generated gate collisions still bypass missing evidence — sig 96e3f4ab7d89b94a; F003 (HIGH, audit-20261015T124205Z-2735279885.md): Evidence packs omit provenance used to rank alternatives — sig c9661c00826e0861; F001 (HIGH, audit-20261015T124205Z-2735279885.md): Model claims escape version-bound approval — sig ce2d574bc7bc2832; F002 (HIGH, audit-20261015T124205Z-2735279885.md): Gate identifier collisions discard failing constraints — sig f7df492148f06dd7.
- Outstanding Low (recorded, not fixed): none.
- Verification at `29234af`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C8.json` (fingerprint `d6f583512c55c34d`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C9 **not started**.

## Cattle Engine v1, C7 close-out — Veterinary Health-Programme Engine — frozen at a5726a2 (2026-10-14)

C7 (task `cattle-c7-veterinary-health-programme-engine-20261013`, base `fea84ae`) is **frozen at `a5726a2f7600d9a2b0f18b932e5786ad39cee3ec`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261014T181412Z-70601634.md` over `fea84ae..a5726a2`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 1 Medium round(s), 2 High round(s): F005 (MEDIUM, audit-20261014T065818Z-4175390974.md): Distinct programme actions collide in hard-gate identity — sig 435db88182ade210; F001 (HIGH, audit-20261013T154917Z-2981225942.md): Counted completion masks unresolved evidence — sig b3b57ada9f862309; F002 (HIGH, audit-20261013T154917Z-2981225942.md): Result fingerprints omit completion and review provenance — sig bf877ddcfa9e0a63; F002 (HIGH, audit-20261013T164453Z-554782138.md): Animal-status and hard-gate fingerprints still omit programme provenance — sig c96dd64515e7b36c.
- Outstanding Low (recorded, not fixed): none.
- Verification at `a5726a2`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C7.json` (fingerprint `412e3eaa5eb64bd2`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C8 **not started**.

## Cattle Engine v1, C6 close-out — Production Goal Engine — frozen at 594755a (2026-10-13)

C6 (task `cattle-c6-production-goal-engine-20261013`, base `ffb6ad1`) is **frozen at `594755a639cab090640fa678b577ef02511ae47e`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261013T134135Z-3819286947.md` over `ffb6ad1..594755a`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 3 Medium round(s), 2 High round(s): F001 (HIGH, audit-20261013T062725Z-856363304.md): Fingerprint verification admits malformed C5 target evidence — sig 3b635cbfd7991043; F001 (HIGH, audit-20261013T075959Z-828681660.md): Fingerprint verification admits malformed C5 evidence — sig 48cf31257b748fcc; F002 (MEDIUM, audit-20261013T062725Z-856363304.md): Exported declaration shape is rejected as input — sig 84d6bdf190fe23f0; F002 (MEDIUM, audit-20261013T075959Z-828681660.md): Exported declaration cannot replay its own output — sig 9b3c8cb3f0f29029; F003 (MEDIUM, audit-20261013T085820Z-990744301.md): Malformed canonical weight throws during validation — sig a3c3bc74a0b9d99c.
- Outstanding Low (recorded, not fixed): none.
- Verification at `594755a`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C6.json` (fingerprint `63b7113053f0f810`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C7 **not started**.

## Cattle Engine v1, C5 close-out — Performance Engine — frozen at a1619cd (2026-10-13)

C5 (task `cattle-c5-performance-engine-20261013`, base `41ee7a1`) is **frozen at `a1619cd523362b280f26e27b58a9494bd6c76d58`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261013T043053Z-2985169734.md` over `41ee7a1..a1619cd`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 2 Medium round(s), 2 High round(s): F002 (HIGH, audit-20261013T022452Z-2936039979.md): Aggregate overflow remains unresolved — sig 5fd471e69f55ae87; F001 (HIGH, audit-20261013T012745Z-942558197.md): Applicability masks conflicting required evidence — sig 8791dd926785c986; F002 (HIGH, audit-20261013T012745Z-942558197.md): Finite inputs overflow into unhandled fingerprint exceptions — sig 9b000aa5a461146b; F005 (HIGH, audit-20261013T022452Z-2936039979.md): Policy resolution loses provenance and fingerprint bindings — sig c1da073e2fa20e23; F006 (MEDIUM, audit-20261013T033536Z-2013683531.md): Policy fingerprint regression assertions compare object identity — sig d10c5a85903bbe60; F003 (MEDIUM, audit-20261013T012745Z-942558197.md): Display references collide for distinct definition identities — sig dbd18beddac2bc81; F004 (MEDIUM, audit-20261013T012745Z-942558197.md): Animal fingerprint omits material target content — sig e333d09a2932a62c.
- Outstanding Low (recorded, not fixed): none.
- Verification at `a1619cd`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C5.json` (fingerprint `55cbaccb15255033`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C6 **not started**.

## Cattle Engine v1, C4 close-out — Weight Observations & Groups — frozen at 9ac75b8 (2026-10-13)

C4 (task `cattle-c4-weight-observations-and-groups-20261012`, base `e5b1b2a`) is **frozen at `9ac75b88d3be9c6724456c314473b4a14b01db84`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261012T232954Z-2162659402.md` over `e5b1b2a..9ac75b8`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 2 Medium round(s), 0 High round(s): F001 (MEDIUM, audit-20261012T203308Z-3588656109.md): Public helpers bypass the canonical input boundary — sig 45c7c1bdf24a8428; F001 (MEDIUM, audit-20261012T223607Z-59771749.md): Public weight helper still bypasses validation — sig b36712d9a8c04350.
- Outstanding Low (recorded, not fixed): none.
- Verification at `9ac75b8`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C4.json` (fingerprint `a125b14f63f66cd1`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C5 **not started**.

## Cattle Engine v1, C3 close-out — Health & Medicines Engine — frozen at c35748f (2026-10-12)

C3 (task `cattle-c3-health-and-medicines-engine-20261012`, base `4a23504`) is **frozen at `c35748f128d9eb305e0370a923f59221d8f27a52`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261012T183202Z-1695561237.md` over `4a23504..c35748f`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 2 Medium round(s), 2 High round(s): F001 (HIGH, audit-20261012T143603Z-3238652293.md): Projection verification permits provenance removal — sig 3f183c540b5faa7a; F004 (MEDIUM, audit-20261012T173545Z-3532160855.md): Malformed projections still throw during verification — sig 4fe7838e88c02976; F004 (MEDIUM, audit-20261012T163504Z-1396350258.md): Public validation paths throw on malformed canonical input — sig 873d813b8afbb8ad; F002 (HIGH, audit-20261012T143603Z-3238652293.md): Nested withdrawal qualifiers are silently discarded — sig a475c3a7e51d3c18; F003 (HIGH, audit-20261012T143603Z-3238652293.md): Public admission exports bypass the canonical boundary — sig afc6b3f36f0df900; F003 (HIGH, audit-20261012T153721Z-2253129957.md): Public withdrawal exports still bypass canonical validation — sig c3ff24c6afa223ea.
- Outstanding Low (recorded, not fixed): none.
- Verification at `c35748f`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C3.json` (fingerprint `6a072bd8d210c950`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C4 **not started**.

## Cattle Engine v1, C2 close-out — Regulatory Lifecycle Engine — frozen at 6a0a976 (2026-10-12)

C2 (task `cattle-c2-regulatory-lifecycle-engine-20261011`, base `3a7c0a6`) is **frozen at `6a0a976725b6ebd4f8f552d03f59e5bc773a1bbb`** by `scripts/agent-campaign-run`. This is the
functional freeze SHA; the documentation commit recording it is not.

- Strict full-phase audit `audit-20261012T115840Z-2033079710.md` over `3a7c0a6..6a0a976`: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0.
- Automatic remediation: 1 Medium round(s), 2 High round(s): F002 (HIGH, audit-20261011T221107Z-2260008195.md): Future definitions change historical obligation results — sig 392f60114f09a881; F008 (MEDIUM, audit-20261012T105632Z-2916327359.md): Evidence-log creation bypasses collection validation — sig 63e094bafb2dfb93; F002 (HIGH, audit-20261011T211434Z-1415219967.md): Future malformed definitions alter historical results — sig 7472cdfd3a9995f3; F001 (HIGH, audit-20261011T211434Z-1415219967.md): Unknown anchors can clear a hard gate — sig 7acf015479bca435; F001 (HIGH, audit-20261011T221107Z-2260008195.md): Conflicting interval anchors still clear hard gates — sig ee03645dc7e7be4f.
- Outstanding Low (recorded, not fixed): none.
- Verification at `6a0a976`: phase verify and full suite (`scripts/quality-gate.sh`) passed.
- Receipt `.agent/campaigns/cattle-engine-v1/receipts/C2.json` (fingerprint `80e8f12cc4c4550d`). Migrations: none. Frozen contracts: ADDITIVE_ALLOWED: docs/farm-return-next/DOMAIN_CONTRACTS.md. Nothing pushed or deployed.
- C3 **not started**.

## Cattle Engine v1 — campaign orchestrator — starting 9cc32b8 (2026-10-10)

Task `cattle-campaign-orchestrator-20261010`. Harness/tooling only; no cattle-domain, UI,
persistence, schema or migration change. `scripts/agent-campaign-run <id> [--dry-run|--status|
--resolve-stop --note]` runs a campaign manifest's phases in order above the one-task harness
(agent-start → agent-build → standard audit → bounded narrow remediation → strict full-phase
audit of phase_base..HEAD → freeze verification → receipt → docs-only closure commit → next
phase), with persisted resumable state, a fail-closed lock and deterministic triage: Critical
and every judgement gate stop; reproduced High ≤2 rounds; Medium ≤4 rounds; ≤2 attempts per
finding signature; Low recorded, never fixed. `agent-fix --only IDS --audit PATH
[--expect-head SHA]` is the backward-compatible narrow mode (Low never selectable);
AUDIT_RULES.md gains the `STOP: <REASON> [Fxxx]` gate marker. Manifest
`.agent/campaigns/cattle-engine-v1/campaign.json` binds C0/C1 as legacy-manual receipts
(operator attestations; HR-F007 applies) and C2–C10 as PLACEHOLDER briefs, so the campaign
refuses to start C2 until a READY brief exists. Tests: `scripts/tests/agent-campaign.test.py`
(fake CLIs), run by `agent-run.test.sh`. C2 **not started**. Nothing pushed or deployed.

## Cattle Engine v1, C1 close-out — Canonical animal lifecycle — frozen at c5b25f2 (2026-10-10)

C1 (task `cattle-c1-canonical-animal-lifecycle-20261009`, base `61c1124`) is accepted and
**frozen at `c5b25f23aefbd11267fc9ef53d235548de84cc27`**. This is the functional freeze
SHA; the documentation commit recording it is not.

- Built in `f1ad449`: pure non-frozen `src/domain/cattle/` animal ledger, identifier register
  and bitemporal snapshot (`effectiveAt` valid time separate from `knowledgeCutoff`
  knowledge time); immutable FarmReturnAnimalId; explicit UNKNOWN / CONFLICTING_EVIDENCE /
  INVALID_EVIDENCE; no source precedence. DOMAIN_CONTRACTS.md Cattle C1 section.
- Audit remediation: F001 (effective-time-scoped correction competition) and F002 (ledger
  header validation) in `b249e0e`; F003 (correction branches followed through
  corrections-of-corrections) in `1ee2da4`; F004 (instant-typed fields compared by instant,
  incl. duplicate-id idempotency) in `c5b25f2`. All four were Medium.
- Final task audit `audit-20261010T090912Z-74575` (strict) over `61c1124..c5b25f2`:
  0 Critical, 0 High, 0 Medium, 0 Low.
- Verification at `c5b25f2`: focused cattle/audit-trace/assessment-integrity tests 205/205;
  full `npm test` 5026/5026 across 293 files; typecheck, lint and build passed; working
  tree clean.
- No C0, frozen-contract, slurry/fertiliser, UI, persistence, schema or migration change.
  Nothing pushed or deployed.
- C2 **not started**. Next planned task: the cattle campaign orchestrator, before C2,
  as a separately authorised task.

## Cattle Engine v1, C0 — Evidence, rule & regulatory architecture — starting a15553e (2026-10-09)

New pure, non-frozen `src/domain/cattle/` (`cattle_evidence_v0.1.0`) with colocated Vitest suites and fictional `SYNTH-*` fixtures only. Canonicalisation and SHA-256 fingerprinting reuse `assessment-integrity.ts` unchanged, wrapped with a cattle payload kind and version; `evidence.ts`, `source-register.ts` and `audit-trace.ts` are unchanged (reasons in `DOMAIN_CONTRACTS.md`, "Cattle C0"). Cattle sources carry a stable id, version, content fingerprint and lifecycle, and any non-exact match with the catalogue is a change/review state. Rules are versioned with eight authority classes, effective windows, applicability, required inputs with accepted information classes and units, a fail-closed unknown/conflict policy, source bindings and supersession. Effective-date resolution fails closed on none or several versions, and superseded versions stay addressable. Scientific, legal and veterinary reviews are separate and bound to the rule's id, version and content fingerprint, so approving v1 never approves v2. A source change makes evaluation REVIEW_REQUIRED without touching the rule or its reviews. Missing input stays INSUFFICIENT_EVIDENCE and never reaches the predicate; conflicting input stays CONFLICTING_EVIDENCE. The Recommendation Evidence Pack derives its own outcome (a hard-gate FAIL is BLOCKED; unknown is INSUFFICIENT_EVIDENCE; review is REVIEW_REQUIRED; NO_RECOMMENDATION and ACTIONABLE also exist). Favourability never overrides a hard gate. The pack is fingerprinted excluding `generatedAt` and verified by rebuild. A test pins that production modules import only local domain modules and make no AI or network call. No frozen-contract, UI, persistence, schema, migration or scientific/legal/veterinary value change. C1 not started. Independent audit pending.

**Status correction (2026-10-10):** the forward-looking status above ("C1 not started.
Independent audit pending.") is superseded; the C0 build facts are unchanged. C0 is frozen at
`61c1124` on strict final audit `audit-20261009T204954Z-43182` over `a15553e..61c1124`
(0 Critical, 0 High, 0 Medium, 0 Low). C1 is frozen at `c5b25f2` (close-out entry above).

## Plan Operating System v1, Phase 0 — Plan kernel — starting 8e3f4f9 (2026-10-09)

New pure, non-frozen `src/domain/plan/` kernel (`plan_kernel_v0.1.0`) with colocated Vitest suites. Plan holds intent and work state only: targets are `SubjectRef`s (reused from `subject.ts`) and progress/completion are derived from `CanonicalEvidence` passed in, never stored. Status, readiness, system priority and farmer working order are separate types; tests prove changing one leaves the others unchanged. Readiness fails closed on unmet/unknown dependencies and active/unknown shared blockers. The four completion contracts are a discriminated union; unknown evidence is UNKNOWN, never zero, and only member-counted work reports numeric progress. Dynamic scope re-evaluation is deterministic and audited; under `FOLLOW_ON_WORK` a scope change can complete a job and separately propose follow-on work. Recommended windows and hard deadlines (with a required authority) are distinct types. A farmer override of an evidence-linked job needs acknowledgement and preserves the missing/unknown canonical members; re-evaluation keeps reporting the canonical gap. Typed action routes point only at existing workflows. `reevaluatePlanJob` is pure and idempotent. Contracts recorded in `DOMAIN_CONTRACTS.md` ("Plan kernel"). No frozen-contract, UI, persistence, schema, migration or scientific/regulatory/financial value change. Phase 1 not started. Independent audit pending.

## Farm Home visual refresh v1 — starting b5389a9 (2026-10-08)

Presentation-only refresh of `/today`. The map workspace runs edge to edge beside the navigation on desktop (`data-farm-workspace`, `AppShell` CSS `:has()`) and fills the viewport height; `MapHero` and every selection/lens/camera behaviour are unchanged. The full-width weather and spreading-calendar strip is replaced by the compact `FarmConditionsControl`: station temperature, name and freshness, and a restriction count derived by the pure `farmConditionsSummary` from the same real spreading-window counts (no assessed field reads "Calendar not assessed", never 0). Its keyboard-accessible disclosure keeps the regulatory calendar separate from weather freshness. `useFarmWeatherReading` is extracted from `WeatherHeroChip` unchanged. The lens control is a compact mode switcher; the object rail is narrower on warm stone; `DesktopSidebar` recedes onto deep forest graphite. Additive tokens `--fr-v2-shell` and `--fr-v2-stone`. No domain, science, schema or migration change (`IMPLEMENTATION_MAP.md` §17). Rendered viewport inspection not run in the build session. Independent audit pending.

## Farm Spatial V2 Phase 6 — capability placeholders and final QA — starting 823261d (2026-10-08)

The `/today` object rail is now object-before-form. Selecting Cattle, Sheep or Sheds opens an inspection panel (a disclosure; Escape, re-select or close dismisses it; one at a time) instead of navigating away. Desktop opens it over the map's right edge beside the rail; mobile opens it under the band. Cattle lists the store's real groups: head count with provenance (an unavailable count reads "Unknown"), category, and the housed shed or "field not recorded" (no field location is persisted). Each group links to `/livestock/<id>`. The individual animal detail is information architecture only: tag, age and weight live in Livestock, while target weight and location are "Not yet supported". No animal record is read. Sheds lists real sheds with the new pure `calculateShedOccupancy` (`farm-stats.ts`, additive; unknown head is `null`, never 0) and states that head capacity isn't recorded. Sheep is an honest shell with no count and no destination. Rows come from the presentation-only `src/lib/farm-spatial-object-rail.ts`. Motion collapses under reduced motion, and there are visible focus outlines. No schema, migration, science or frozen-signature change (`IMPLEMENTATION_MAP.md` §16). The rendered 1440×900 / 390×844 inspection and the Playwright visual suite were not run in this build session (they need a local dev server). Independent audit pending.

## Farm Spatial V2 Phase 5 — whole-farm nutrient plan and Market handoff — starting d265e72 (2026-10-08)

`/fertiliser-plan` is now the whole-farm nutrient plan. `getFertiliserPlanOverviewAction` passes `getFarmFertiliserDemandAction`'s canonical `aggregation` and `basket` through unchanged (the same single read; nothing recomputed). `whole-farm-nutrient-plan-presentation.ts` only selects from them. The largest product's `displayTonnes` leads a typographic outstanding-requirement composition, with the other products and the farm summary subordinate; the summary card grid is gone. Field rows pair each field's requirement status with its own canonical product contributions. The purchase/application plan keeps the canonical requirement and "still to buy after recorded applications" as separate concepts. Plan: Farm Return has no whole-farm plan record, so the Plan plane is labelled "Not saved" and hands off per field to the existing persisted "Plan this application" (`/nutrients?field=`). No persistence was invented and no migration was written. Market: "Prepare supplier quote" opens the existing `FertiliserQuoteRequestFlow` on a draft copied from the canonical basket. Requested quantities stay separate and cannot alter the requirement (tested through `setRequestedQuantity`). Reconciliation is tested through the real chain `calculateNutrientPlan` → aggregation → plan view → basket → request. `formatRemainingTonnes` moved to the shared basket presentation. No domain formula, constant, schema or migration changed (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §15). Independent audit pending.

## Farm Spatial V2 Phase 4 — real fertiliser field integration — starting 869d217 (2026-10-07)

The canonical per-field `NutrientPlan` now reaches the Farm Spatial surfaces. `NutrientsPageClient`'s input assembly moved unchanged into the shared `buildFieldNutrientPlan` (`src/orchestration/fertiliser-plan/field-nutrient-plan.ts`); `/nutrients` and the new `useFieldNutrientPlan` hook both call it, so the two screens cannot disagree. `fieldNutrientPlanView` (`src/lib/field-nutrient-plan-presentation.ts`) copies `fieldRequirement`, `availableNutrientByNutrient`, `fieldRemainingRequirement` and `purchasedProducts` (gated by `purchaseStatus`, tonnes via `roundKgUpToDisplayTonnes`, `costEur` stripped) and computes nothing. Tests prove it passes through a deliberately inconsistent remaining figure and never mutates the plan. In the Nutrients lens the field drawer shows remaining N/P/K (cobalt/harvest/plum) and the organic allocation (teal), with "Open nutrient plan" leading to `/today/field/[fieldId]`. That page shows requirement → organic contribution → remaining → fertiliser solution → legal status (`NapComplianceCard`) → evidence chain. Its return link restores the lens and field on `/today`. Unknown arms read "Unknown" with their reason, never 0. Tillage and no-livestock fields show only an honest message. The application window stays a placeholder. No domain formula, constant, schema or migration changed (`IMPLEMENTATION_MAP.md` §14).

## Farm Spatial V2 Phase 3 — field exploration and lenses — starting a361d2f (2026-10-07)

On `/today`, tapping a real mapped field now selects it in place instead of navigating. Its boundary strengthens, neighbours recede, and the camera flies to it (320ms, none under reduced motion). The new `FarmFieldDrawer` rises from the lens band with the field's real name and area. Its facts come from the active lens's `farmFieldLensView` (`src/lib/farm-spatial-field-lens.ts`), which reads persisted `Field` values and `resolveFieldSlurryAllocation` only. Non-lab values carry their provenance, and missing values read "Unknown". Grass and Conditions show honest notes, never a per-field value. The Nutrients requirement and purchase status wait for Phase 4 (`IMPLEMENTATION_MAP.md` §6.1). Re-tap, open ground, close or Escape deselects. New additive `MapHero` props: `neighbourDetailLabels`, `markerAccentColor`, `markerContentKey`, `onMapBackgroundClick` and `flyToDuration`. `/fields` is unchanged. New tests: `farm-spatial-field-lens.test.ts`, `FarmFieldDrawer.test.tsx` and Today Phase 3 cases. No domain, science, schema or migration change. Recorded in `IMPLEMENTATION_MAP.md` §13. Independent audit pending.

## Farm Spatial V2 Phase 02B — spatial shell visual refinement — starting a3dd0e9 (2026-10-07)

Presentation-only refinement of the `/today` Farm shell (`IMPLEMENTATION_MAP.md` §12). The global map veil is replaced by local scrims. Weather and calendar status are now a flat instrument strip. The five lenses form a flush architectural band with a domain-colour underline instead of a filled active button. Lens information is one editorial block. The object rail is denser and typographic. With the new opt-in `MapHero` `neighbourNameLabels`, every mapped field shows its real name. The desktop sidebar is narrower, and legacy destinations sit behind one "More" disclosure that still lists every `moreNavItems` entry. New `DesktopSidebar.test.tsx`; lens tests updated. No domain, science, regulatory, schema or migration change. The rendered visual comparison was not performed, because starting the app server was denied by session permissions. Independent audit pending.

## Farm Spatial V2 Phase 2 — spatial Farm shell — starting 9746a40 (2026-10-07)

`/today` is now composed as the Farm Spatial V2 shell. The real `MapHero` is the dominant canvas, with the identity hierarchy, weather and calendar status, and a five-lens control (`FarmLensControl`; copy and colours in `src/lib/farm-spatial-lenses.ts`). Lenses carry honest notes for grass, SMD and workability placeholders, and changing lens never moves the camera or marker state. The persistent object rail (`FarmObjectRail`) shows Cattle and Sheds counts from persisted data and Sheep as a "Not yet supported" shell. On desktop the What Matters pilot and farm-topic rail sit in a plane under the map. Primary nav is now Farm · What Matters (disabled placeholder) · Plan · Market (`/quotes`) · Finance, and Fields, Supports and Records moved to More. New pure helpers are `calculateActiveFarmAreaHa` and `calculateFarmObjectRailCounts` (`farm-stats.ts`). No producer or domain orchestration was removed. Placement is recorded in `IMPLEMENTATION_MAP.md` §11. No schema, migration or science change. The post-auth default is unchanged (`/dashboard`). Independent audit pending.

## Farm Spatial V2 — Today capability inventory reconciliation — starting 886e492 (2026-10-07)

Documentation only. `/today` and its directly rendered components were audited against `IMPLEMENTATION_MAP.md` §9. T1–T17 already covered contextual Ask AI, the mobile opportunity sheet, the secondary feed and map-tap drill-down. Added T18–T27: every field drill-down path; leading-Prompt map preselection; Prompt detail actions; the Prompt evidence trace and Prompt-scoped Ask AI; demo/real-mode gating; GPS plan-linked job start; secondary-feed entry points on both breakpoints; What Matters links and disclosures; hydration-safe first paint; and the mapped-field display gates. Regression test added in `farm-spatial-v2-implementation-map.test.ts`. **REFERENCE INTEGRITY PASS:** all four files listed in `CHECKSUMS.json` were independently rehashed with Python `hashlib`; SHA-256 and byte sizes matched exactly, so the §1 checksum open item is closed. No production source change.

## Farm Spatial V2 Phase 1 — design authority and implementation map — starting 9da6e44 (2026-10-07)

Documentation and additive tokens only: `docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` maps every approved UI element to its production source or `PLACEHOLDER / NOT IMPLEMENTED`; `design/design-system.md` makes the Farm Spatial V2 contract authoritative for migrated Farm/Fertiliser surfaces; `src/app/globals.css` adds `--fr-v2-*` tokens (legacy values pinned by `globals-tokens.test.ts`). No visible UI, domain, science, schema or migration change. Primary audit `audit-20261007T061701Z-80856` (0 Critical / 0 High / 4 Medium / 1 Low) remediated in the map: F001 "Still to buy" is the `stockColumns` shortfall, with not-recorded stock disclosed; F002 provisional notice follows `requirementCardPresentation`'s conditional rule; F003 canonical quote flow (session-only, undelivered) is separate from the Managed Quote Pilot (`/quotes`), and their bridge is NOT IMPLEMENTED; F004 slurry type comes from persisted `SlurryComposition.slurryType`; F005 this entry and `BUILD_STATE.json.farm_spatial_v2`. Regression test `farm-spatial-v2-implementation-map.test.ts`. Final audit pending.

## FV Session 5 close-out — Fertiliser Vertical v1 COMPLETE (2026-10-06)

Build `08306a6` (scenarios A–L + global invariants, F002, UI consistency, closure docs) closed by hand after the build session ended without a result marker (its recovery gate hit only the known-flaky `test_timeout_cleanup_needs_no_process_enumeration`, which passes alone). Primary audit F001 (Medium): commonage prohibition masked by the evidence guard — fixed `f3e0391`. Visual review (dev farm, desktop, read-only): slurry evaluation "No slurry planned", purchased fertiliser, farm requirement Ready €1,823, quote flow quantities = basket, F002 confirmed live; found and fixed "still to buy" nearest-rounding (1.48 t vs 1.49 t required) → round-up for recommended/remaining purchase tonnes in `toFarmFertiliserPurchaseRequirementTonnes` (`69070be`); planned/confirmed records keep nearest rounding. Populated slurry diagnostic: VISUAL_REVIEW_NOT_REPRODUCIBLE_WITH_CURRENT_DEV_DATA (no field has planned slurry; covered by component tests). Final audit `audit-20261006T115046Z-22124` over `2c58037..69070be`: 0 Critical / 0 High / 0 Medium / 1 Low (this documentation entry). Full gate pass (`quality-20261006T113240Z-81071`). **FERTILISER_VERTICAL_V1: COMPLETE.**

## FV Session 5 — end-to-end QA and v1 freeze — starting 2c58037 (2026-10-06)

New `src/domain/fertiliser-vertical.e2e.test.ts`: scenarios A–L and the global invariants over
the real chain `calculateNutrientPlan` → `aggregateFarmFertiliserPurchasing` →
`buildFarmFertiliserQuoteBasket` → `createFertiliserQuoteRequestDraft` →
`renderFertiliserQuoteRequestText`. No cross-layer quantity, status or warning defect found.
Fixes (UI only): Session 4 Medium **F002** reproduced (details → Back → review → Continue lost the
entered details) and fixed by holding the details form in `FertiliserQuoteRequestFlow` (flow keyed
by `requestId` in `FarmFertiliserPurchaseRequirementCard`), with a regression test; the field
`PurchasedFertiliserCard` now states NONE_NEEDED / PROHIBITED with the farm summary's wording
(`nothingToBuyMessage`) instead of an empty table and €0. Legacy paths classified, none removed
(`FERTILISER_VERTICAL_SLURRY_DESIGN.md` §9, which records `FERTILISER_VERTICAL_V1: COMPLETE`).
No science, statutory, schema or frozen-contract change; engine `nutrient_engine_v1.5.0`;
`contracts_frozen` stays `true`. Visual review left to the reviewer (§9).

## FV Session 4 close-out — final audited commit 0cadec0 (2026-10-06)

Closed by agent-run (5 model calls). The primary audit was UNASSESSED twice on Codex usage limits and retried (never skipped). Primary audit F001 (HIGH): a partial request containing provisional items lost the provisional warning in the supplier text and final review — fixed in `0cadec0`. Final audit `audit-20261006T070039Z-89410` over `1e92b1e..0cadec0`: 0 Critical, 0 High, 1 Medium. **Deferred Medium F002**: in `FertiliserQuoteRequestFlow`, Back from the final review to the details step discards entered delivery location, contact, note, delivery window and supplier (DetailsStep unmounts without lifting its state). No effect on quote correctness, quantities or the canonical basket; a small UI follow-up. `contracts_frozen` restored to `true`; engine `nutrient_engine_v1.5.0` unchanged.

## Fertiliser Vertical Completion — Session 4: quote request workflow — starting 1e92b1e (2026-10-05)

New `src/domain/fertiliser-quote-request.ts` (`fertiliser_quote_request_v1.0.0`) builds a quote
request from the canonical `FarmFertiliserQuoteBasket` only — no nutrient, slurry, product or
aggregation recalculation (tested: no `nutrients.ts` / statutory function called, basket and
aggregation unchanged). Canonical and requested quantities are separate fields; requested starts
at the basket's 0.01 t round-up, zero / negative / malformed input is rejected, a reduction below
the canonical requirement is disclosed. Lifecycle DRAFT / READY_TO_SEND / SENT / FAILED /
CANCELLED; SENT only through a successful, provider-referenced delivery attempt. An INCOMPLETE
basket proceeds only as an explicitly PARTIAL request. "Prepare quote" on the farm fertiliser
requirement card now opens a three-step workflow ending at READY_TO_SEND with the exact supplier
text; recipients can be picked from the farm's recorded supplier quotes (additive
`listSupplierNamesForFarm` on frozen `supplier-quotes.ts`, `listKnownSupplierNamesAction`) and
delivery prefilled from `farm_delivery_details`. No supplier delivery integration exists, so
nothing is sent; the request is not persisted (deferred); no migration. `contracts_frozen` set to
`false` for this audit cycle. Detail: `DOMAIN_CONTRACTS.md` (Session 4).

## FV Session 3b close-out — final audited commit ce1d3c9 (2026-10-05)

Closed by agent-run (7 model calls). The first build attempt (task `fv-session-3-farm-aggregation-and-quote-basket-20261003`) was cut off by the 3600 s `AGENT_CLAUDE_TIMEOUT` (partial work kept in `git stash` "FV Session 3 partial build", unused); rerun as Session 3b with `AGENT_CLAUDE_TIMEOUT=7200`. Primary audit F001 (HIGH, legacy adapter turned an unknown cost into €0) fixed in `e752084`; a final audit was UNASSESSED once (Codex usage limit) and retried; it found F002 (HIGH, unknown-cost fix discarded known costs from partially unpriced products) fixed in `ce1d3c9`. Final audit `audit-20261005T185737Z-56534` over `cd9b315..ce1d3c9`: 0 Critical, 0 High, 0 Medium, 0 Low. `contracts_frozen` restored to `true`; engine `nutrient_engine_v1.5.0` unchanged.

## Fertiliser Vertical Completion — Session 3b: farm aggregation and quote basket — starting cd9b315 (2026-10-03)

Canonical whole-farm purchasing layer, derived only from canonical field outputs (field `purchaseStatus` + `purchasedProducts` → farm aggregation → quote-ready basket). No nutrient science, product selection, price, statutory or schema change; engine `nutrient_engine_v1.5.0` unchanged. Additive frozen-contract change (`finance.ts` `FarmFertiliserRequirement.provisionalFieldCount`); `contracts_frozen` false for this audit cycle.

- **Canonical source:** `aggregateFarmFertiliserPurchasing` (`src/domain/fertiliser-plan.ts`, `farm_fertiliser_aggregation_v1.0.0`). Every field is classified, never silently omitted: `RECOMMENDED` → INCLUDED; `RECOMMENDED_CREDIT_NOT_COUNTED` → INCLUDED and provisional (reason preserved; planned slurry credit not counted); `NONE_NEEDED` → NO_PURCHASE; `PROHIBITED` / `NOT_APPLICABLE` → EXCLUDED (reason preserved, no reinterpretation); `UNKNOWN` / `WITHHELD_MIXED_EVIDENCE` → UNRESOLVED (no quantity, no D3 N-only purchasing). A sized blend with no products or a non-positive / non-finite quantity fails closed to UNRESOLVED.
- **Products:** merged by catalogue identity `name|npkAnalysis` (no product id exists; name alone is never the key); per product exact unrounded product-kg sum, field contributions (field → kg, cost, provisional), cost, provisional flag, `catalogueVerified` (`knownFertiliserProductComposition`), bag conversion `UNAVAILABLE` / `NO_VERIFIED_PACKAGE_SIZE` (no package size in the catalogue). Display tonnes round **up** to 0.01 t (`roundKgUpToDisplayTonnes`, `TONNES_ROUNDING_DECIMALS`), never below the aggregate; no commercial pack rule.
- **Cost:** sum of the fields' own `costEur` (existing CSO catalogue prices); a missing / invalid price is `null`, never €0 — product and farm totals become cost-unknown with the product named; the known subtotal stays visible.
- **Basket status:** READY (every field resolved, every product catalogue-verified); READY_WITH_PROVISIONAL_ITEMS (≥ 1 provisional contribution); INCOMPLETE (≥ 1 UNKNOWN / WITHHELD / malformed field, or an unsupported product). An INCOMPLETE basket keeps the known subtotal, flagged `isCompleteFarmRequirement: false`, with unresolved fields named. `buildFarmFertiliserQuoteBasket` (`farm_fertiliser_quote_basket_v1.0.0`): farmId, createdAt, EUR, engine / aggregation / basket versions, lines (identity, analysis, kg, display t, bag conversion, cost, field count, provisional), subtotal / total, excluded and unresolved field refs. Not persisted (no migration), no supplier, email, RFQ or payment behaviour.
- **Consumers:** `getFarmFertiliserDemand` returns `aggregation` (over every active field's plan) and derives its recommended column from it (`toFarmFertiliserProductTotals`); `aggregateFarmFertiliserRecommendation` is now a view of the same aggregation; `calculateFarmFertiliserRequirement` (Finance / Dashboard / Input Planner) sums through it and exposes `provisionalFieldCount` (Input Planner shows a provisional line). Planned / confirmed / remaining, `fieldsWithBlockedEvidence` (Prompt-based), quote-request prefill (`orchestration/quotes`), AI context and the slurry-value aggregate are retained unchanged. `getFarmFertiliserDemandAction` returns `aggregation` + `basket`.
- **Legacy defect fixed:** farm demand ignored recorded slurry composition (national-average DM%) while the Nutrients page and Prompt recompute use it, so farm totals could differ from the field plans the farmer sees. `getFarmFertiliserDemand` now takes `slurryCompositionRecords` and resolves them per field exactly as `recomputePromptByKind`; the demand action and AI context pass them.
- **UI:** `FarmFertiliserPurchaseRequirementCard` (Nutrients) shows status, per-product quantity / cost / field count with field drill-down, total or known subtotal, fields awaiting evidence ("N fields require more information before fertiliser can be included"), provisional, no-fertiliser and excluded groups, the retained "still to buy" lines, and a review-only "Prepare quote" sheet. Selection in the pure `src/lib/farm-fertiliser-basket-presentation.ts`.
- **Tests:** `fertiliser-plan.aggregation.test.ts` (required cases 1–20 incl. real-engine plans), presentation helper, card, orchestration (classification, composition), action, finance (provisional count); fixtures updated for the new required fields.
- **Audit F001 (HIGH) fixed:** unknown cost no longer becomes €0 / a silent partial in the legacy paths. `FarmFertiliserProductTotal.recommendedTotalCostEur` is now `number | null` (the canonical `estimatedCostEur`); `FarmFertiliserRequirement` `byProduct[].costEur` / `totalCostEur` are nullable, with new `knownCostSubtotalEur` and `productsWithUnknownCost`; `calculateFarmFertiliserCostEur` returns `productsWithUnknownCost` and status `unavailable` for a partial subtotal; the Input Planner fertiliser row's `estCost` is likewise `unavailable`. Dashboard, Finance, Input Planner and Input Summary name the unpriced products; `BreakdownToggle` renders an unknown price as unavailable. Tests: `finance.unknown-cost.test.ts`, legacy-view F001 case in `fertiliser-plan.aggregation.test.ts`.
- **Next:** independent audit and close-out; mixed-field purchasing (D3 b/c) not started; basket persistence / supplier submission need separate authorisation.
- **Logged, not fixed (agent-start limitation):** task IDs are truncated at 80 characters, so distinct long titles can collide; it fails safely with `TASK_ID_EXISTS`.

## FV Session 2b close-out — final audited commit ac50e14 (2026-10-03)

Closed by agent-run (build recovered and committed as `6322db1`; primary audit 0 Critical / 0 High / 1 Medium). Medium F001: the mixed-evidence purchase explanation claimed every recommended product carries both P and K, but Protected Urea is 46-0-0; wording corrected in `src/lib/purchase-status-presentation.ts` with a pinning test (`ac50e14`). Final audit `audit-20261003T074523Z-23978` over `2a24b10..ac50e14`: 0 Critical, 0 High, 0 Medium, 0 Low. `contracts_frozen` restored to `true`; engine `nutrient_engine_v1.5.0`.

## Fertiliser Vertical Completion — Session 2b: canonical product recommendation — starting 2a24b10 (2026-10-03)

Breaking frozen-contract change (full protocol; `contracts_frozen` false for this audit cycle, restored by the close-out commit after a clean audit). Engine `nutrient_engine_v1.4.0` → `nutrient_engine_v1.5.0`; stored records are not rewritten. `calculateNutrientPlan` now sizes `purchasedProducts` / `deliveredKgHa` / `estimatedFieldCostEur` in `buildFieldPurchase` from `fieldRemainingRequirement` (or, when slurry is planned but its credit cannot be assessed, the full `fieldRequirement` — the same no-credit figure the paired path produced) and returns the new `NutrientPlan.purchaseStatus` (`FieldPurchaseStatus`, `types.ts`): `RECOMMENDED`, `RECOMMENDED_CREDIT_NOT_COUNTED` (provisional), `NONE_NEEDED` (`REMAINING_ZERO` / `BELOW_PRODUCT_THRESHOLD`), `PROHIBITED` (commonage whatever the requirement; water buffer for a sized blend), `WITHHELD_MIXED_EVIDENCE` (D3 a), `UNKNOWN` (reason + inputs), `NOT_APPLICABLE` (tillage). `allocatePurchasedProducts`, the catalogue, prices, credit and requirement are unchanged. The paired blend stays internal as a LEGACY_COMPATIBILITY_PATH for the CC-B5 national buffer material and the NAP delivered-supply total only, so every statutory / NAP / buffer output is unchanged (D4, CC-B5).

Changed production outputs (before → after):
- Engine, tillage fields: products / delivered / cost from grassland tables → `[]` / 0 / 0, `NOT_APPLICABLE` (`TILLAGE_FIELD_NOT_SUPPORTED`). Paired `requirement` unchanged.
- Engine, grazing fields with no recorded livestock: clamped-35 kg N blend → `[]` / 0 / 0, `UNKNOWN` (`MISSING_LIVESTOCK_DATA`); on commonage `PROHIBITED`.
- Engine, grazing fields with no usable farm grassland area: blend from a 0 stocking rate → `[]` / 0 / 0, `UNKNOWN` (`MISSING_GRASSLAND_AREA`).
- Engine, every plan: `calculationVersion` v1.4.0 → v1.5.0; new `purchaseStatus`. Fully indexed grassland fields (incl. LATE_SUMMER / unsupported method / method conflict, now `RECOMMENDED_CREDIT_NOT_COUNTED`), mixed, no-index, silage-without-plan and unresolved-composition fields: products / delivered / cost unchanged.
- Fertiliser prompt (`fertiliser-recommendation.ts`): basis read from `purchaseStatus` (`basisFromPurchaseStatus`). No-grassland-area grazing: OK / `NO_FERTILISER_CURRENTLY_RECOMMENDED` → `BLOCKED (MISSING_GRASSLAND_AREA)`; no-livestock grazing with an empty legacy blend: `NO_FERTILISER_CURRENTLY_RECOMMENDED` → `BLOCKED (MISSING_LIVESTOCK_DATA)`; credit-not-counted: summary gains additive `provisional` {headline, detail} and the description a "Provisional — …" sentence. Farm demand (`getFarmFertiliserDemand`) follows the prompt: those fields leave Recommended / Planned and count in `fieldsWithBlockedEvidence`.
- `finance.ts`: `calculateFarmFertiliserRequirement` / `calculateFarmSlurryNutrientValueEur` count an `UNKNOWN` / `WITHHELD` purchase as blocked (before: no-grassland-area grazing products summed / € difference added) and skip `NOT_APPLICABLE`.
- `fertiliser-plan.ts` `aggregateFarmFertiliserRecommendation`: sums only `RECOMMENDED` / `RECOMMENDED_CREDIT_NOT_COUNTED` plans (signature now also picks `purchaseStatus`).
- CSV (`lib/reports.ts`) "Purchased products": `UNKNOWN` / `WITHHELD` → `INSUFFICIENT_EVIDENCE` (before: product list); credit-not-counted rows append ` (provisional: slurry nutrient credit not included)`.
- Evidence Report: `productAllocationKgField` absent for `UNKNOWN` / `WITHHELD` / `NOT_APPLICABLE` (before: `[]` or legacy list); Product allocation shows the reason instead of "No real product recommended." and a provisional line for credit-not-counted.
- `PurchasedFertiliserCard`: new required `purchaseStatus` prop; `UNKNOWN` / `WITHHELD` / `NOT_APPLICABLE` show the reason (before: table / €0). Nutrients page passes it and offers "Plan this application" only for a sized blend; the plan sheet's recommendation carries `provisional`.
- `slurry-direct-economic-assessment.ts`: a baseline or intervention plan whose purchase is `UNKNOWN` / `WITHHELD` / `NOT_APPLICABLE` blocks with `ECONOMIC_SLURRY_ASSESSMENT_PURCHASE_NOT_RECOMMENDABLE` (before: costed as a €0 plan).

Presentation selection lives in the pure `src/lib/purchase-status-presentation.ts`. Tests: `nutrients.purchase-status.test.ts` (76, real engine: published blend = legacy blend via the NAP delivered total for grazing / silage × Index 1–4 × no slurry / splashplate / spring and summer LESS; credit-not-counted equals the no-credit figures for LATE_SUMMER, unsupported timing, unsupported method, method conflict; composition UNKNOWN; mixed WITHHELD with the known remaining arm; no index, tillage, no livestock, no grassland area, silage without plan; NONE_NEEDED; commonage / buffer PROHIBITED; CC-B5 buffer isolation); 192-case digest baseline passes with `purchaseStatus` excluded and v1.5.0 normalised; prompt, finance, CSV, Evidence Report, card, fertiliser-plan aggregation, economic assessment and presentation-helper tests. Version assertions updated; two hand-built `NutrientPlan` fixtures gain `purchaseStatus`. One legacy prompt test (commonage, no livestock) still passes because commonage is a decided `PROHIBITED`.

## Fertiliser Vertical Completion — Session 1 (Increment 2d): farmer-facing slurry diagnostic — starting bcb625a (2026-10-02)

Read-only per-field planned slurry evaluation on the Nutrients page (D1 authorised; D2: evaluates the farmer's planned rate only, no rate generated). `NutrientsPageClient` builds `buildSlurryRateAllocation({ plan, plannedUse })` over its existing `plan`; new pure helper `src/lib/slurry-diagnostic-presentation.ts` selects states only (no arithmetic); new `SlurryDiagnosticCard` renders planned rate / total / DM% basis and, per N/P/K independently, slurry contribution, field requirement, remaining requirement and organic excess (unclamped; known 0 shown "None"); unknown values show "Unknown" with their own reason, never 0. No slurry → "No slurry planned for this field."; tillage → "Not evaluated" (also rendered beside the existing no-recommendation disclosure). Share caps, 90 kg K, external constraints and the deferred rate are not shown. `slurry-rate-allocation.ts` comment only (logic, version `v0.3.0-draft`, `affectsProductionOutput: false` unchanged). No `NutrientPlan`, statutory, purchasing or migration change. Tests: `SlurryDiagnosticCard.test.tsx` (12, real `calculateNutrientPlan` → allocation outputs: complete, none planned, P-only, K-only, neither, excess, no excess, tillage, unsupported method, unknown≠0, forbidden wording, canonical-value identity / no arithmetic) and 3 page tests in `NutrientsPageClient.test.tsx`. VISUAL_REVIEW_OUTSTANDING (build agent cannot drive a browser).

## Fertiliser Vertical Completion — Increment 2c: slurry rate-allocation layer on canonical requirement — starting 6e270cb (2026-10-02)

Draft layer only (`slurry-rate-allocation.ts`, still unwired; no production output, frozen module, Campaign C rule, cap or threshold changed). `buildSlurryRateAllocation` → `slurry_rate_allocation_v0.3.0-draft`, per design §2.2: reads `fieldRequirement` (soil index from its `p/k.soilIndex`) and `fieldRemainingRequirement` instead of `requirementByNutrient` / `netRequirementByNutrient` / `fertilityEvidenceByNutrient`. Differences from v0.2.0 for fully indexed fields, all pinned by tests: (1) version; (2) `cropRequirement` (rounded quantities) → `requirement` (canonical arms, unmodified, unrounded) and `remainingChemicalRequirement` → canonical `fieldRemainingRequirement` arms (each rounds to the paired figure); (3) new `plannedApplication` (`NONE_PLANNED` | `PLANNED` with rate, `totalM3`, `availableNutrientBasis`) and `organicExcessOverRequirement` (P/K = requirement-limit outputs; N same exact comparison, recorded only, no constraint record); (4) P/K requirement-limit and Index 3 share comparisons are exact against the unrounded requirement — the ±0.5 kg/ha interval and its UNDETERMINED band are removed, so excess values, share limits and the 90 kg K output use the unrounded requirement and available = requirement is NOT_BINDING with excess 0; (5) reason/unknown wording from canonical arms (`crop requirement UNKNOWN (<reasonCode>)`; an unknown available nutrient's reason). Tillage → P/K requirement limits, share limits and 90 kg K `NOT_EVALUATED` with `TILLAGE_FIELD_NOT_SUPPORTED`; grazing without livestock / grassland area → `UNDETERMINED`, limit unknown, never 0; mixed P/K evaluates only the known nutrient. Share caps, 90 kg K, external constraints, `organicAllocatedNutrient`, `finalAllowedRate` DEFERRED (name kept, design's `recommendedRate`) and `affectsProductionOutput: false` unchanged. Tests remapped plus tillage / no-livestock / no-grassland-area × method/timing × Index 1–4, mixed P-only/K-only, organic excess positive/zero, exact comparisons, equality boundary, table-level blocks, no-selector regression. Docs: `DOMAIN_CONTRACTS.md` Campaign C row, `RATE_ALLOCATION_ARCHITECTURE.md` §2 (source discrepancy from design §7 fixed; stale "withholds P and K together" corrected), design status, `BUILD_STATE.json`.

## Fertiliser Vertical Completion — Increment 2b: canonical remaining chemical requirement — starting 172d154 (2026-10-02)

Additive `NutrientPlan.fieldRemainingRequirement` (`FieldNutrientRemainingRequirement`, `field_nutrient_remaining_v1`, `types.ts`), built once in `calculateNutrientPlan` (`buildFieldNutrientRemainingRequirement`, `nutrients.ts`) from `fieldRequirement` and `organicApplication.availableNutrientByNutrient`, per design §2.1: requirement NOT_APPLICABLE / UNKNOWN pass through (`REQUIREMENT_UNKNOWN`); no slurry planned is a known zero credit (`NO_SLURRY_PLANNED`); an OK credit gives unrounded max(0, requirement − credit) with field total (`MISSING_FIELD_AREA` as `fieldRequirement`) and the weakest evidence state; any other credit is UNKNOWN (`SLURRY_CREDIT_UNKNOWN`), never 0. Nothing re-derived. Tests (`nutrients.test.ts`) from real engine output: rounding equality with `netRequirementByNutrient` for every Index 1–4 / grazing / silage / slurry method; P/K independence; LATE_SUMMER, unsupported method, unresolved composition, method conflict and missing own index → UNKNOWN; tillage NOT_APPLICABLE; no livestock / grassland area UNKNOWN; totals and `MISSING_FIELD_AREA`; excess floors to a known 0. Digest baseline excludes the new field; two hand-built `NutrientPlan` fixtures gain it with assertions unchanged. Additive change recorded in `DOMAIN_CONTRACTS.md`; engine stays `nutrient_engine_v1.4.0` (D8). No consumer reads it.

## Fertiliser Vertical Completion — Increment 2a: slurry recommendation design — starting af3036d (2026-10-02)

Documentation only: `FERTILISER_VERTICAL_SLURRY_DESIGN.md`. Traced every slurry module against the code (callers, frozen / production / draft / unwired status, where unknown becomes 0, rule evidence class). Findings: no engine ranks fields or chooses a rate (the rate is farmer volume ÷ area); Phase 6 and the Campaign C rate layer have no production caller; only `planned` allocations feed `calculateNutrientPlan`; no canonical (unrounded, `fieldRequirement`-based) remaining chemical requirement exists. Design: an additive `NutrientPlan.fieldRemainingRequirement` computed in `nutrients.ts`, the draft layer evolved to consume it, and staged increments 2b–2f. Only 2b and 2c need no decision; 2d–2f are gated on the recorded product-owner, Campaign B and Campaign C decisions (D1–D8, including CC-B5 and mixed P/K purchasing). No production code, test, contract or engine version changed.

## Fertiliser Vertical Completion — Increment 1: canonical per-field nutrient requirement — starting c2a6b38 (2026-10-02)

Additive `NutrientPlan.fieldRequirement` (`FieldNutrientRequirement`, `types.ts`; built in `calculateNutrientPlan`, `nutrients.ts`): independent N/P/K arms (`KNOWN` with unrounded kg/ha, field total, evidence state, Green Book table refs and limitations; `UNKNOWN` with reason, no number; `NOT_APPLICABLE` for tillage), each P/K arm with its own soil-index outcome, plus area, crop/use and target-yield context and engine version. Built from the same unrounded gross locals as `requirement` and released only where `requirementByNutrient`'s arm is OK, so it never reads the Index-1 placeholder (CC-B5 stays open). Complete data reproduces the published requirement for every Index 1–4 combination (grazing and silage); no existing output changed (192-case baseline, field excluded); engine stays v1.4.0. Legacy compatibility paths (tillage, no-livestock grazing, mixed paired outputs, silage N scaling) and unmigrated consumers recorded in `DOMAIN_CONTRACTS.md`. The build session ended without a result marker (CLI JSON failure) after the engine/type change; fixtures, tests and docs completed by hand: 9 new tests (complete-data equality, P/K independence and invariance, unknown never 0, totals, tillage, no livestock, silage without plan, missing area). Primary audit F001 (HIGH): a farm grassland area ≤ 0 floored the stocking rate to 0 and the canonical grazing arms read KNOWN 0; fixed — grazing N/P/K are `UNKNOWN` (`MISSING_GRASSLAND_AREA`), paired output unchanged, regression test added. Pre-existing, out of scope: a NaN `farmGrasslandAreaHa` throws inside the statutory P lookup (`napEnhancedPBuildUpKgHa`) before any requirement is built.

## Visual check — Nutrient requirement card header badges (2026-10-02)

Rendered bounds checked for the badge fix (`e49be34`, audit F001 Medium) on a temporary, uncommitted page (deleted afterwards), from real `calculateNutrientPlan` output: paired (both indices), mixed (P only) and insufficient-evidence (neither) headers. At 390 px every header's furthest content edge is 351 px inside a 372 px card (badges wrap under the title; header 102 px, or 72 px for insufficient evidence); at 1440 px every header stays on one row (36 px) with content at 1067 px inside a 1088 px card. Targeted card tests (7) and `npm run build` pass locally. Closes F001 of `audit-20261002T151*` and the header overflow noted in the Increment 5a visual check.

## Nutrient requirement card header badge overflow on mobile — starting c6745a6 (2026-10-02)

Layout only, follow-up to the 5a visual check. `NutrientRequirementCard.tsx` passes `flex-wrap` to its `CardHeader` in all three states and its badge group is now `min-w-0 flex-wrap` instead of `shrink-0`, so at 390 px the status and source badges wrap under the title inside the card; on desktop, where everything fits, the header renders as before. Shared `Card`/`CardHeader` unchanged. `OrganicNutrientsCard` checked: its header has no badges (the `SourceBadge` sits in the body's wrapping row), so no change. New component tests pin the wrap classes for the paired, mixed and insufficient-evidence states; the layout still needs a visual check at 390 px.

## Per-nutrient P/K Increment 5b completion — slurry basis for mixed fields (CC-B6) — starting 21ba183 (2026-10-02)

Resolves CC-B6 and the 5b final audit's F001/F002 (`.agent/history/audit-20261002T141848Z-19789.md`). Engine, additive and metadata only (product owner, 2026-10-02): `NutrientPlan.organicApplication.availableNutrientBasis` exposes the one shared slurry table selection's method, rate, DM%, date, timing (and whether assumed), `ruleId`, `source` and `scientificBasisNote`, independent of the soil indices; a table-level block or `NOT_APPLICABLE` is carried unchanged. With both indices it equals the paired assessment's basis fields. No value, status or reason code changed; engine version unchanged (`nutrient_engine_v1.4.0`); the 192-case baseline digests are unchanged with the new field excluded. `mixedRequirementReport` carries it into the Evidence Report's mixed section, whose page shows method, timing, rate/DM, rule/source and scientific basis. Tests: engine basis assertions across the Increment 2 matrix; orchestration and page matrices from real `calculateNutrientPlan` output for P-only, K-only, both, neither and tillage.

## Visual check — per-nutrient P/K Increment 5a and CC-FU-A (2026-10-02)

Mobile (390 px, rendered in a fixed-width frame) and desktop (1440 px) review of `NutrientRequirementCard`, `OrganicNutrientsCard` and `PurchasedFertiliserCard`, rendered from real `calculateNutrientPlan` output on a temporary, uncommitted dev page (deleted afterwards) for P-known/K-missing, K-known/P-missing, neither index and both indices (verified Index 2, 33 m³/ha spring LESS at 6% DM). D3 wording, "—" for the unknown nutrient, no NPK total in the mixed state, CC-FU-A's "N credit included" for the neither-index case, and unchanged fully indexed cards all render as specified at both sizes; text wraps cleanly at 390 px. This closes CC-FU-A's open Medium (visual review outstanding). Pre-existing, not caused by this work: at 390 px the requirement card header's source badge ("Teagasc Green Book (5th Ed., 2020)") overflows the card edge on every state, including the unchanged fully indexed card — a separate small layout follow-up.

## Per-nutrient P/K Increment 5b — known P or K in CSV, Evidence Report and prompt — starting 552e709 (2026-10-02)

Reporting/content only. New pure `mixedRequirementReport` (`src/lib/nutrient-card-presentation.ts`, reusing the 5a selection and D3 line) gives a mixed field's per-nutrient gross / organic offset / net, `null` for unknown or withheld values (the missing nutrient in every row). CSV (`src/lib/reports.ts`): mixed rows export the known P or K requirement and credit; the unknown keeps `INSUFFICIENT_EVIDENCE` (or `NOT_APPLICABLE` for tillage), never 0; N, products (D1 a) and NAP columns unchanged. Evidence Report: additive optional `ScientificEvidenceReport.mixedNutrientRequirement`, set only when `nutrientPlan` is absent and exactly one index is known; the page renders per-nutrient rows with "—" and the D3 line. `reportVersion` unchanged; fully indexed and no-index reports omit the key. Prompt verified, no change: the blocked basis lists only the missing index (`missingInputs`), pinned by new tests. No engine change.

## Per-nutrient P/K Increment 5a — show known P or K on the Nutrients cards — starting 7864c9e (2026-10-02)

UI/content only, D3 wording (product owner, 2026-10-02). New pure helper `src/lib/nutrient-card-presentation.ts` selects the card state from `fertilityEvidenceByNutrient`, `requirementByNutrient` and `availableNutrientByNutrient`; it derives no number. Mixed fields: known values, unknown "—", no NPK total, badges Green Book/estimated with the plan's calculation version. Any missing-index state: withheld P/K slurry credit "—". `OrganicNutrientsCard` gained a required `fertilityEvidenceByNutrient` prop (`NutrientsPageClient` passes it). CC-FU-A mixed-case test expectations moved to the D3 wording; neither-index and fully indexed output unchanged. No engine, contract or purchasing change.

## Per-nutrient P/K Increment 4 — remap slurry rate-allocation layer — starting 259f30c (2026-10-02)

`slurry-rate-allocation.ts` now reads `requirementByNutrient`, `availableNutrientByNutrient`, `netRequirementByNutrient` and `fertilityEvidenceByNutrient` instead of the paired fields; version `slurry_rate_allocation_v0.1.0-draft` → `v0.2.0-draft`; still unwired (`affectsProductionOutput: false`). Product-owner decision 2026-10-02: a table-blocked slurry credit makes the layer's remaining chemical requirement unknown (UNKNOWN is never zero) although the paired net counts it as 0. Mixed fields get the known nutrient's records (invariant to the other index); fully indexed records otherwise unchanged. The build session ended without a result marker and its recovery verification failed on three test expectations (a premise about paired net status that does not hold for unresolved composition; available slurry N compared with the rounded `offsetN` instead of the unrounded arm). Expectations corrected by hand; no engine or frozen module changed.

## Per-nutrient P/K Increment 3 — per-nutrient gross and net requirement — starting 418a440 (2026-10-02)

Product owner (2026-10-02) authorised releasing these figures beside the retained internal Index-1 placeholder (CP3 stays blocked on CC-B5), with safeguards: no placeholder-derived number in any arm, an invariance test, no consumer reads. Added `NutrientPlan.requirementByNutrient` / `netRequirementByNutrient` (`types.ts`, `nutrients.ts`). Gross arms are `Math.round` of the same `grossX` locals as `requirement`, released only from the nutrient's own index; N keeps `requirement`'s rule. Net arms come from one shared per-nutrient remaining calculation over `availableNutrientByNutrient` (`NOT_APPLICABLE` = zero credit; any other non-OK credit blocks), never the paired `remainingX` / `offset`. Legacy outputs unchanged. Engine `nutrient_engine_v1.3.0` → `nutrient_engine_v1.4.0`; stored records not rewritten; version assertions updated. Baseline digest test also excludes the new fields and maps v1.4.0 → v1.2.0; all 192 cases still match `b4d3c29`. New matrix: 11 slurry/silage scenarios × P/K × Index 1–4 × other index absent/1–4 (invariance, no-placeholder, fully-indexed equality), positive-credit mixed case, grazing and CC-B5 cases. Hand-built fixtures gained the fields. Design §4 re-decision and §6 status recorded; `DOMAIN_CONTRACTS.md` entry added (non-breaking carve-out, steps 1–3; `contracts_frozen` stays `true`).

## Per-nutrient P/K Increment 2 descope — restore Index-1 placeholder (F001) — starting 647677f (2026-10-02)

Audit F001 (HIGH): removing the placeholder changed `nationalBufferDistanceStatus`, because the placeholder-sized blend chooses the buffer material. Per the product owner's decision, Increment 2 is now CP4 only. `nutrients.ts` restores `pIndex ?? 1` / `kIndex ?? 1` and every placeholder-fed internal computation exactly as at `bfdad74`, and removes `purchaseRequirementUnknown`. `availableNutrientByNutrient` stays and reads only the real indices. Engine stays `nutrient_engine_v1.3.0`. New CC-B5 buffer regression tests (audited case and P-missing mirror). New blocker CC-B5; design doc CP3 marked blocked; `DOMAIN_CONTRACTS.md` Increment 2 entry corrected.

## Per-nutrient P/K Increment 2 — per-nutrient slurry credit and placeholder removal — starting bfdad74 (2026-10-02)

Added `organicApplication.availableNutrientByNutrient` (`types.ts`, `nutrients.ts`). The resolver body now runs one private table selection, and the paired assessment and the per-nutrient view are both derived from it. The resolver's export signature is unchanged. Removed the Index-1 placeholder. `offsetN` comes from the N arm. An unknown P or K requirement keeps the chemical-fertiliser buffer context. Engine `nutrient_engine_v1.2.0` → `nutrient_engine_v1.3.0`, because a new production figure is released for mixed fields; stored records are not rewritten. Version assertions in the tests were updated. The baseline digest test now also excludes the new field and normalises only `calculationVersion` (v1.3.0 → v1.2.0); all 192 cases still match `b4d3c29`. New per-nutrient matrix: 4 methods × 4 timings × 3 DM% × 25 P/K presence/index cases, plus block, no-placeholder and buffer cases. Non-breaking carve-out, steps 1–3; `contracts_frozen` stays `true`.

## Per-nutrient P/K Increment 1 — per-nutrient fertility evidence — starting b4d3c29 (2026-10-02)

Additive `NutrientPlan.fertilityEvidenceByNutrient` (`types.ts`, `nutrients.ts`); the paired `fertilityEvidence` is now derived from the two arms as their conjunction. Non-breaking carve-out, steps 1–3; `contracts_frozen` stays `true`; engine stays `nutrient_engine_v1.2.0`. Two hand-built test fixtures gained the field. New matrix test (4 methods × 4 presence cases × Index 1–4 × 3 statuses) checks each arm and compares a digest of every pre-existing field with `nutrients.fertility-evidence-baseline.json`, generated from the engine at `b4d3c29`. Index-1 placeholder and paired `missingInputs` unchanged.

## Per-nutrient P/K design — F002 increment sequencing — starting 2429004 (2026-10-02)

Docs only: `PER_NUTRIENT_PK_DESIGN.md` Increment 1 is now CP1 only, and CP3 placeholder removal moves to Increment 2 with CP4. CP2 gross+net is in Increment 3, so no figure is released beside the placeholder. Retained-N invariant added to the Tests column.

## Per-nutrient P/K architecture design — starting 6535b84 (2026-10-01)

Design only: added `campaign-c/PER_NUTRIENT_PK_DESIGN.md` (change points CP1–CP7 with
code-verified references, staged Increments 1–8, open decisions D1–D4) and a pointer from
`RATE_ALLOCATION_ARCHITECTURE.md` §5. No code, test, contract, engine-version
(`nutrient_engine_v1.2.0`) or BLOCKERS status change. GAP-04, CC-B2 and CC-B4A not reopened.

## CC-FU-B close-out — final audited commit 40cce09 (2026-10-01)

Closed by agent-run (2 model calls). Primary audit `audit-20261001T213452Z-78269` over
`5443257..40cce09`: 0 Critical, 0 High, 0 Medium, 0 Low — a clean primary audit of the
complete task delta at the closing HEAD, so it is the final audit. Runner verification
(category E) passed: task verify, targeted tests, typecheck, lint, build and full suite.
`contracts_frozen` restored to `true`; CC-FU-B resolved; CC-FU-C stays open.

## CC-FU-B slurry DM% provenance label — starting 5443257 (2026-10-01)

Labels/provenance only; no nutrient value, status, reason code or fail-closed path changed;
engine `nutrient_engine_v1.2.0`; no migration. CC-FU-C stays open.

- Frozen-contract change (product owner authorised 2026-10-01): `nutrients.ts`
  `resolveAvailableSlurryNutrients` gains a required `dmPctStatus`; its OK `evidenceState`
  is the weaker of the table/method state and the DM% state (`verified` → `MEASURED`,
  otherwise `IRISH_DEFAULT`). `EffectiveSlurryComposition.status` narrowed to what it
  already returned. `evidence.ts` now exports `weakestEvidenceState` (moved from
  `fertiliser-plan-cost.ts`). Only caller `calculateNutrientPlan` updated. See
  `DOMAIN_CONTRACTS.md` "CC-FU-B".
- **In-flight worktree agents: rebase before continuing.** `contracts_frozen` is `false`
  for this change's audit cycle; the close-out commit restores it.
- Consumers reviewed: economics, rate allocation, What Matters, UI and fertiliser prompt
  read `status`/values only; the audit export serialises the outcome unchanged in shape.
- Tests: `nutrients.test.ts` CC-FU-B block (resolver and plan; LESS spring/summer,
  splashplate spring; verified/farmer_adjusted/estimated); `evidence.test.ts`.

## CC-FU-A slurry nutrient-credit messaging — starting 29614a1 (2026-10-01)

UI wording only. No nutrient calculation, slurry engine, Campaign C rule or frozen contract
changed; engine `nutrient_engine_v1.2.0`; no migration.

- Trace: `requirementProvisional.headline` ("Slurry nutrient credit not included") is
  rendered only by `NutrientRequirementCard` and `PurchasedFertiliserCard`, and both show
  "Insufficient evidence" instead when a soil index is missing, so the headline never
  reached a missing-index farmer. The visible inaccuracy was `OrganicNutrientsCard`'s
  "Not yet assessed" beside the retained slurry N offset.
- Fix: `OrganicNutrientsCard` shows "N credit included" / "Slurry N credit is included.
  P and K credit isn't counted yet." when the assessment is `MISSING_SOIL_FERTILITY_INDEX`
  and `offsetN > 0`; all other cases unchanged.
- Tests: `slurry-credit-messaging.test.tsx` renders all three cards from real
  `calculateNutrientPlan` output (missing P, K, both; complete indices; unsupported method).
- Visual review outstanding: on 2026-10-01 no field on the signed-in dev farm had slurry
  allocated or a missing soil index, so the changed card state could not be captured at
  mobile/desktop sizes. Review it when a field reaches that state.

## Campaign C remaining programme close-out — final audited commit f1366c5 (2026-09-30)

The remaining programme is closed. Still no production output change; engine
`nutrient_engine_v1.2.0`; no frozen contract changed; no migration. Campaign C remains
AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING, DRAFT.

- Audit fixes to the unwired `slurry-rate-allocation.ts`:
  - F001 (`c7cbb09`): requirement and Index 3 share comparisons within ±0.5 kg/ha of the
    rounded `NutrientPlan` requirement are UNDETERMINED, not BINDING/NOT_BINDING.
  - F002 (`c7cbb09`): the 90 kg K first-cut guidance is evaluated only when `plannedUse` is
    `silage_1st_cut`; otherwise NOT_EVALUATED, with no remainder.
  - F003 (`f1366c5`): external rate constraints must supply, and keep, the upstream
    evaluated input and output.
- Final task audit `audit-20260930T130919Z-50109` over `465a523..f1366c5`: 0 Critical,
  0 High, 0 Medium, 0 Low. Full `npm test` (254 files, 4099 tests) and build passed on
  `f1366c5`.

## Campaign C remaining programme — starting 465a523 (2026-09-30)

Architecture, deferral and validation preparation. **No production output changed.** The
engine stays `nutrient_engine_v1.2.0`. No frozen contract changed, and there was no
migration. Campaign C remains AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING and
DRAFT.

- Follow-ups were logged as BLOCKERS `CC-FU-A` (card headline), `CC-FU-B` (LESS `MEASURED`
  label) and `CC-FU-C` (January as SPRING). No code changed for them.
- Added `slurry-rate-allocation.ts`, an unwired layer over a finished `NutrientPlan`.
  - It keeps requirement, available nutrient, share limit, allocated credit, remaining
    chemical requirement, rate constraints and final rate separate.
  - Every constraint carries full provenance.
  - Share caps are recorded, with binding UNDETERMINED on Index 1/2 (interaction
    provisional).
  - The 90 kg K guidance is recorded and NOT_ENFORCED.
  - `finalAllowedRate` is always DEFERRED, with no min(P, K).
- N yield scaling stays deferred: no stored source states a range.
- Per-nutrient P/K is deferred (architecture): it touches frozen shapes, about 11
  consumers, blend purchasing and statutory outputs.
- CC-B3 is designed (`CC_B3_PERSISTENCE_DESIGN.md`) and ready for a migration task.
- The blinded 50-case protocol, the `campaign-c-expert-validation.ts` types and
  comparison, and an empty template were added. Validation has not taken place.
- Record: `campaign-c/RATE_ALLOCATION_ARCHITECTURE.md` and `SOURCES_AND_CLAIMS.md` §8.
  Nothing was pushed.

## Campaign C verified rules within existing architecture — starting 942cc81 (2026-09-29)

Implementation review of the REPOSITORY_VERIFIED Teagasc rules against the existing engine.
**No production output changed**; engine stays `nutrient_engine_v1.2.0`; no migration.
Campaign C remains AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING, DRAFT.

- Organic share caps (P 50% / K 75%): IMPLEMENTATION_DEFERRED_ARCHITECTURE — they govern how
  much organic fertiliser to plan; the engine takes the planned slurry volume as an input and has
  no rate/allocation layer, and capping the credit would apply the AI_PROVISIONAL stacking reading.
- 90 kg K spring guidance: DEFERRED_EXACT_RULE_PROVISIONAL — no existing 90 kg rule; slurry-K
  counting is AI_PROVISIONAL; slurry K credit still not truncated.
- Yield scaling: P ±4 / K ±25 ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED (stored 5/6 t rows
  reproduced); N ±25 IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR (only 5/6 t rows, no stated
  range, no statement for the grazed-previous-year rate; silage plans mock-only in real mode).
- Rate principles: organic-before-chemical balance and nutrient-content determination
  ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED; rate-by-requirement IMPLEMENTATION_DEFERRED_ARCHITECTURE;
  `AI_PROVISIONAL_RATE_SELECTOR_V1` not implemented.
- Tests (`nutrients.test.ts`): over-cap LESS credit subtracted in full after the unchanged
  availability factors; P/K yield rows; N not yield-scaled; no rate selector; engine version.
- Record: `campaign-c/SOURCES_AND_CLAIMS.md` §7. Nothing pushed.

## Campaign C stored Teagasc evidence ingestion — starting 0c58a8c (2026-09-29)

Inspected the five frozen snapshots in
`docs/scientific-engine/v3/external_teagasc_2026-09-29/` directly (no web access) and recorded
sources, SHA-256, locators and classifications in SOURCES_AND_CLAIMS §6
([AI_ADJUDICATION §6](campaign-c/AI_ADJUDICATION_2026-09-29.md)).

- **REPOSITORY_VERIFIED / SOURCE_DIRECT, READY_FOR_IMPLEMENTATION_REVIEW:**
  - the 50% P / 75% K Index 1/2 share caps (kept separate from the × 0.50 / × 0.90 factors);
  - the 90 kg K spring text;
  - "February to April" wording;
  - N 25 kg per t DM (P 4 / K 25 already implemented).
- **Stay AI_PROVISIONAL / AI_REVIEW_ONLY (IMPLEMENTATION_DEFERRED_EXPERT_VALIDATION):**
  - the exact 1 Feb – 30 Apr boundary;
  - the slurry-K 90 kg reconciliation;
  - `AI_PROVISIONAL_RATE_SELECTOR_V1` (the cereal source is P-led and states no min(P, K));
  - the cap/availability interaction, downgraded from the earlier SOURCE_DIRECT label because
    the source does not state it.
- The consistency test now recomputes the snapshot SHA-256 values and checks every quoted
  locator against the stored page text.
- **Unchanged:** production code, engine `nutrient_engine_v1.2.0`, reference-case JSON,
  Campaign B. The rule set stays DRAFT with EXPERT_VALIDATION_PENDING.

## Campaign C AI scientific adjudication (evidence-gated) — starting 2b6da92 (2026-09-29)

Recorded the authorised AI external Teagasc review as `SRC-AI-REVIEW-2026-09-29`
(EXTERNAL_RETRIEVAL_PERFORMED_BY_AUTHORISED_AI_REVIEW; no fingerprint and no local copy
claimed). The record is
[campaign-c/AI_ADJUDICATION_2026-09-29.md](campaign-c/AI_ADJUDICATION_2026-09-29.md).
Claims `CLM-AIR-*` are in SOURCES_AND_CLAIMS §5.

- **Status:** AI_SCIENTIFIC_ADJUDICATION with EXPERT_VALIDATION_PENDING. CC-B1 is
  AI_ADJUDICATED_EXPERT_VALIDATION_PENDING. Nothing is expert-approved, and the rule set
  stays DRAFT.
- **Production evidence gate:** only REPOSITORY_VERIFIED rules may change production. The
  following are AI_REVIEW_ONLY and deferred for evidence ingestion:
  - the organic share caps;
  - the 90 kg K spring-constraint reconciliation;
  - the February spring start;
  - N yield scaling;
  - `AI_PROVISIONAL_RATE_SELECTOR_V1`.
- **Already implemented, now frozen by regression tests:**
  - 6% LESS P = 0.5 and 7% LESS P = 0.6;
  - the 50%/90% availability factors (crop requirement untouched);
  - slurry K credit not truncated at 90;
  - no DM interpolation (6.3% blocks);
  - timing labels unchanged;
  - P/K yield scaling.
- **Deferred:**
  - GAP-04 paired P/K architecture (CC-B4A retained);
  - GAP-05 Level B and GAP-07/08 inputs;
  - GAP-08 crop-cycle persistence (no migration).
- **Unchanged:** no production code, engine `nutrient_engine_v1.2.0`, reference-case JSON,
  Campaign B and statutory outputs. No migration, push or deploy.

## CC-B1 Campaign C science adjudication — starting 0a92745 (2026-09-29)

Evidence-review task using repository evidence only. No production code, reference-case
JSON, migration, UI or Campaign B change. The record is
[campaign-c/ADJUDICATION_CC-B1.md](campaign-c/ADJUDICATION_CC-B1.md).

- CONF-01 is RESOLVED_WITH_SCOPE (6% spring LESS P 0.5 kg/m³, Green Book Tables
  9-1/9-4/9-8 against a single non-retained quotation). CONF-04 is RESOLVED_WITH_SCOPE
  (Feb–Apr; January OUT_OF_SCOPE). Both are pending §4 re-verification and reviewer
  ratification.
- CONF-02 is UNRESOLVED_CONFLICT (internal to the Green Book). CONF-03, GAP-01 and
  GAP-02..08 are INSUFFICIENT_EVIDENCE.
- Corrected CONFLICTS.md's claim that CONF-01 was "confirmed from a primary read".
  Added claims `CLM-GB-9-11-TXT` and `CLM-GB-14-INTRO`.
- Campaign C remains DRAFT. CC-B1 remains open, narrowed to the evidence requests in the
  record.

## CC-B4A close-out — final audited commit b6f0aea (2026-09-29)

CC-B4 is **RESOLVED** through the narrow CC-B4A correction. Campaign C remains DRAFT and not
approved; CC-B1 and CC-B3 remain open; no CONF or GAP item is resolved.

- Implementation `1b3d126` (engine `nutrient_engine_v1.1.0` → `nutrient_engine_v1.2.0`);
  primary audit `audit-20260929T113853Z-31803`: 0 findings. Final audit F001 (HIGH, frozen
  contract flag not flipped) fixed in `b6f0aea`. Final task audit
  `audit-20260929T135623Z-55385` over `b5f90c3..b6f0aea`: 0 Critical, 0 High, 0 Medium,
  0 Low.
- `BUILD_STATE.json.contracts_frozen` restored to `true` in this bookkeeping commit
  (DOMAIN_CONTRACTS.md close sequence, commit B); this commit is audited afterwards like any
  other.
- Independent per-nutrient P/K evidence was intentionally not implemented; it remains a
  possible separate architecture task.
- Retrospective process note (recorded, not silently corrected): CC-B2 (`c5d64c4`..`65bdedb`)
  also changed `calculateNutrientPlan`'s fail-closed behaviour in frozen `nutrients.ts`
  (F001: missing index → blocked LESS assessment; F003: N kept) without flipping
  `contracts_frozen` to `false` during its audit cycle, and none of its audits flagged it.
  CC-B2 is closed and clean, so no live risk remains from that gap.

## CC-B4A splashplate missing-index guard — starting b5f90c3 (2026-09-29)

Narrow production correction following the blocked CC-B4 investigation; not Campaign C
implementation and not a per-nutrient P/K redesign. Status: fixed in code, awaiting
independent audit.

- Root cause: `calculateNutrientPlan` fills a missing P/K Soil Index with an Index-1
  placeholder; the CC-B2 guard blocked only LESS (`ruleId !== "SLURRY_TABLE_9_8"`), so the
  captured and assumed-method splashplate branches returned an OK assessment with
  placeholder-derived P/K and `soilIndexAdjustmentApplied: { p: true, k: true }`, which
  `slurry-direct-economic-assessment` treated as supported science.
- Correction: the guard now applies to every OK slurry assessment, so a missing P or K index
  gives `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` (no value, so no
  adjustment metadata). N is kept through the existing F003 path; P and K offsets stay
  withheld together as before (paired fertility evidence). Requirement, products, NAP,
  statutory value and report exports were already withheld and are unchanged. Complete-data
  splashplate and all LESS behaviour unchanged.
- Implementation correction (LIFECYCLE §8): `nutrient_engine_v1.1.0` (affected: OK
  splashplate assessment on a placeholder index) → `nutrient_engine_v1.2.0`; stored v1.1.0
  records are not rewritten and are identifiable by `calculationVersion`. No new science.
- Reachability: `CONFIRMED_PRODUCTION_PATH` (`calculateNutrientPlan` → Nutrients, Scientific
  Evidence Report, What Matters economics). Live user exposure: UNKNOWN.
- Tests: CC-B4A block in `nutrients.test.ts` (3 missing cases × captured/assumed method,
  8 complete-data index pairs, version) and a What Matters economics case in
  `slurry-direct-economic-assessment.test.ts`; 7 of them fail against the pre-fix guard.
- Independent per-nutrient P/K evidence intentionally not implemented. Campaign C remains
  DRAFT; CC-B1 and CC-B3 remain open.
- Contract change (audit F001, HIGH): this changes `calculateNutrientPlan`'s fail-closed
  behaviour in frozen `nutrients.ts`, so `BUILD_STATE.json.contracts_frozen` is set to `false`
  for the CC-B4A audit cycle; no new worktree tasks are delegated while it is `false`, and
  in-flight worktree agents must rebase before continuing. It returns to `true` only in a
  separate bookkeeping commit after a clean final audit (DOMAIN_CONTRACTS.md close sequence).

## CC-B2 close-out — final audited commit 65bdedb (2026-09-29)

CC-B2 / RISK-01 is **RESOLVED** as a narrow production correction. Campaign C remains
DRAFT and not approved; this close-out records no scientific approval.

- Production correction: spring and summer LESS credit apply the existing Index 1/2
  factors (P × 0.50 by P Index, K × 0.90 by K Index); N unchanged. Engine version
  `nutrient_engine_v1.0.0` → `nutrient_engine_v1.1.0` (implementation correction).
- Audit remediation: F001 (missing index → OK placeholder-adjusted LESS assessment) and
  F002 (engine version) in `cac1d01`; F003 (missing P/K index erased the LESS N credit;
  N now kept, P/K uncredited) in `48ecdd6`; F004 (Organic nutrients card showed the
  unsupported-DM explanation for a missing soil index; now names the missing P and/or K
  index) in `65bdedb`, reviewed at desktop and 390×844.
- Final task audit `audit-20260929T101524Z-8042` over `d38561c..65bdedb`: 0 Critical,
  0 High, 0 Medium, 0 Low. Full `npm test` (252 files, 4006 tests), typecheck and build
  passed on `65bdedb`.
- Follow-up CC-B4 opened for the pre-existing splashplate missing-index behaviour (not
  introduced by CC-B2). CC-B1 and CC-B3 remain open; CONF-01..04 and GAP-01..08 untouched.

## CC-B2 LESS low-index P/K correction — starting d38561c (2026-09-29)

Narrow production correction of RISK-01 / CC-B2; not Campaign C implementation.

- `resolveAvailableSlurryNutrients` spring and summer LESS branches now apply the
  existing Index 1/2 factors (P × 0.50 by P Index, K × 0.90 by K Index; N unchanged)
  through a shared `applyLowSoilIndexAvailability` helper that `slurryAvailableKgHa`
  (Table 9-8) also uses, unchanged in behaviour. `soilIndexAdjustmentApplied` now
  reports the real adjustment. Evidence: `CLM-OM-T2-NOTE`, `CLM-GB-9-8-FN3` (existing
  repository records only; no new retrieval or approval).
- LESS applicability unchanged (exact DM rows, SPRING/SUMMER only). Unknown soil index
  keeps its existing fail-closed plan semantics (placeholder index never reaches
  requirement/products/NAP/statutory outputs). Statutory manure value and NAP untouched.
  Per-nutrient index reading matches the existing Table 9-8 path; GAP-04 stays open.
- Reachability: `CONFIRMED_PRODUCTION_PATH` — `calculateNutrientPlan` →
  `NutrientsPageClient` (Nutrients), `orchestration/scientific-evidence-report`,
  `app/actions/what-matters-pilot` (What Matters economics), plus reports/finance/
  alerts/fertiliser-plan callers. Live user exposure: UNKNOWN.
- Tests: new CC-B2 regression block and plan-level cases in `nutrients.test.ts`.
- Audit `audit-20260929T081756Z-17754` remediation: F001 — `calculateNutrientPlan` now
  returns `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` for a LESS
  `availableNutrientAssessment` when a P or K index is missing (the Index-1 placeholder
  no longer yields an OK adjusted LESS credit; pre-existing Table 9-8 behaviour
  unchanged). F002 — implementation correction (LIFECYCLE §8): `NUTRIENT_ENGINE_VERSION`
  `nutrient_engine_v1.0.0` (affected; omitted the LESS Index 1/2 reduction) →
  `nutrient_engine_v1.1.0` (corrected); stored v1.0.0 records are not rewritten and are
  identifiable by that `calculationVersion`.
- Campaign C remains DRAFT; CC-B1 and CC-B3 remain open.

## Campaign C slurry science freeze — starting 29f787a (2026-09-28)

Research and specification only. No product, domain or schema change. Campaign B
behaviour is unchanged. Package: `campaign-c/`.

Campaign C used the repository's existing structured Teagasc evidence pack,
source-register metadata, recorded quotations and previously reviewed scientific
material. WebFetch and WebSearch were disabled for the run, so no fresh external-source
retrieval or independently verifiable source fingerprinting is claimed. External source
documents must be re-verified through an authorised evidence-ingestion workflow before
the rule set can become APPROVED.

- Froze DRAFT rule set `slurry-agronomy-ie-2026-v1`. Scope: cattle slurry, first-cut
  silage, spring (Feb–Apr) LESS, mineral soils, lab P/K, lab DM of exactly
  2/4/6/7%.
- Froze reference cases CC-001..018 with variants, plus the lifecycle contract.
- **Stopped for human review:** CONF-01, CONF-02, CONF-03 and GAP-01 (STOP 1, 2, 8).
- Found RISK-01/CC-B2: the existing LESS nutrient-credit path appears to omit the
  recorded Index 1/2 P/K availability reduction. Recorded for triage; not fixed.
- Added `src/domain/campaign-c-reference-cases.test.ts` (131 checks), covering the
  Campaign C draft reference-case data and relevant existing scientific functions.
- Production implementation remains **not authorised**.

## Agent harness token efficiency — starting b24c266 (2026-09-28)

Tooling/governance only. Campaign B remains frozen; Campaign C not started.
See `.agent/HARNESS_DIAGNOSIS.md` for the firsthand flow trace and measured context sizes.
Task manifest `.agent/TASK.json` pins the base. Replaced the implicit legacy baseline audit
and stale autopilot with the task workflow; retained independent primary/remediation/final
reviews, dependency expansion, all four quality checks and Critical/High blocking.
CLI JSON usage is recorded when exposed, otherwise UNKNOWN. Archived historical state/logs
byte-for-byte. Blocker index retains unresolved legacy constraints without declaring them closed.
Validation and audit outcome will be recorded at the final checkpoint.

Primary independent audit: one High (F001, conflicting mode flags could narrow final scope).
Fixed by rejecting conflicting modes, selecting the immutable task base for primary/final,
and validating final receipt base/head/clean state. Narrow independent before/after review
resolved F001 with 0 Critical/High; it did not repeat the primary audit.

Verification: 50 orchestration cases and 8 focused harness cases passed. Sandbox-independent
watchdog cleanup is covered directly. The expanded orchestration wrapper retains every case
with a 1180/1200-second allowance. An unchanged product test timed out under concurrent load
and passed all 15 tests in isolation; the final gate uses one test worker, with assertions and
product-test time limits unchanged. Final complete gate passed: 251 test files / 3846 tests; typecheck, lint and build PASS. Logs: `.agent/history/quality-20260928T195447Z-37358/`. Final independent audit is recorded after this commit in the task runtime receipt, which must match HEAD; no task may close without it.

## Shared Cattle Architecture & Conformance v1 — starting 1d84748 (2026-10-12)

This was a human-authorised setup between C2 closure and C3. It changes
documentation and test tooling only. C0, C1 and C2 are unchanged, C3 has
not started, and nothing has been migrated, pushed or deployed.

- **Shared docs.** Added `docs/farm-return-next/cattle/`:
  - `index.md`, the map;
  - `ARCHITECTURE.md`, `INVARIANTS.md` (CAT-INV-001…027) and
    `TEMPORAL_EVIDENCE.md`;
  - `PHASE_INTERFACES.md`, `NUMERIC_SEMANTICS.md`, `FINGERPRINTS.md` and
    `VERIFICATION.md`.
- **Conformance kit.** Added a tests-only kit in
  `src/tooling/cattle-conformance/`, with self-tests. It plugs into the
  frozen C2 bitemporal machinery without changing it.
- **Briefs and manifest.**
  - Each C3–C10 brief now opens with a phase contract.
  - The C3–C9 verify commands now also run the conformance kit.
  - `cattle/index.md` was added to the C3–C10 contracts.
  - CAMPAIGN.md and the cattle skill point to the shared area.

## Plan contract change opened — Cattle campaign phase C8P1 (2026-10-17)

Contract-change protocol (DOMAIN_CONTRACTS.md), steps 3–4. Human architecture decision
2026-10-17: the Plan kernel contract gains the smallest additive extension C9 needs to
represent cattle work truthfully — `SubjectType` `CATTLE_ANIMAL` / `CATTLE_GROUP`
(`src/domain/subject.ts`), `FARM_RETURN` creation reasons `OBLIGATION` / `RECOMMENDATION` /
`COMPOSITE` (`plan/job.ts`), priority tier `ROUTINE_MANAGEMENT` ordered last
(`plan/priority.ts`) and hard-deadline authority `VERSIONED_SOURCE` (`plan/timing.ts`). It is
registered as cattle campaign phase C8P1 between C8 and C9 (brief
`.agent/campaigns/cattle-engine-v1/C8P1_BRIEF.md`) and goes through the campaign's build,
audits, strict freeze and closure. `BUILD_STATE.json.contracts_frozen` is `false` from this
registration until a docs-only commit after C8P1's closure sets it back to `true`; no
parallel worktree task may rely on the Plan contract meanwhile. No code changes in this entry.

## Plan contract change closed — Cattle campaign phase C8P1 (2026-10-17)

Contract-change protocol (DOMAIN_CONTRACTS.md), step 4 close: C8P1 (Plan Compatibility Amendment)
froze at 9480f22 (closure b4e5440) on a clean standard audit (audit-20261017T205554Z-1423290734,
0/0/0/0) and a clean strict whole-phase audit (audit-20261017T205750Z-2430244256, 0/0/0/0), with
the phase verify and the full quality gate passing. The additive Plan contract — `SubjectType`
`CATTLE_ANIMAL` / `CATTLE_GROUP`, `FARM_RETURN` reasons `OBLIGATION` / `RECOMMENDATION` /
`COMPOSITE`, tier `ROUTINE_MANAGEMENT` (last) and hard-deadline authority `VERSIONED_SOURCE` — is
now part of the frozen Plan contract; `BUILD_STATE.json.contracts_frozen` is set back to `true`.
Docs only.
