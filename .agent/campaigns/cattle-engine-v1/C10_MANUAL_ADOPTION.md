# C10 — manual adoption record (Cattle UX)

**Manual, separately authorised adoption. C10 was NOT built by `scripts/agent-campaign-run`, has no runner receipt
of origin `campaign`, and did NOT receive a final clean whole-phase Codex audit after its last production change.**
This record states the evidence it was accepted on. The receipt `receipts/C10.json` (origin `manual-adopted`,
`runner_built: false`) is written by `scripts/agent-campaign-run --adopt C10` from the manifest pin, which binds
every item below by commit SHA and sha256.

| | |
|---|---|
| Campaign / phase | `cattle-engine-v1` / C10 "Cattle UX" (final planned phase; there is no C11) |
| Adoption type | manual — "C10 Adoption, Freeze and Campaign Closure" brief, human-authorised 2026-10-24 |
| Assurance standard | `TIER2_APPLICATION` (C10 only; C0–C9 keep their strict runner freeze) |
| Phase base | `6e81831e60d902359ae8370a223960955fd45766` (docs-only above the C9 freeze `c3e717d` / closure `5c5832e`) |
| **Adopted production SHA** | **`510f003ef252f6eff83f78ffd7617de2e8858a58`**, the only production implementation adopted |
| Test-only remediation | `4bb4dc5` (closure-audit M1) |
| Pre-adoption evidence head | `9d03bba` (documentation/audit evidence only) |
| Full gate | `quality-20261024T090919Z-98651` at `510f003`: HEAD before and after = `510f003`, exit 0; 320 files / 6,233 tests, typecheck, lint (0 errors), build. Attestation: `adoption/C10-gate-quality-20261024T090919Z-98651.txt` |
| Full strict baseline audit | `audit-20261023T184003Z-94767`, `6e81831..5aa207d`: **0C / 2H / 0M / 0L, FAILED** (F019, F020). Historical result unchanged |
| Bounded strict closure audit | `audit-20261024T103926Z-13552`, `5aa207d..2fb2d20` (includes `510f003`): **0C / 0H / 1M / 0L, FAIL as run**. Historical result unchanged |
| Closure Medium | M1 (audit label F020): multi-target performance provenance lacked rendered regression coverage. This was test coverage only: production renders every target. Repaired test-only in `4bb4dc5`. Record: `C10_CLOSURE_13552_M1_REMEDIATION.md` |
| Production after gate | unchanged: `510f003..9d03bba` touches only docs and `src/components/cattle/c10-audit-94767.test.tsx` |
| Frozen C0–C9 | no frozen C0–C9 production file changed. The runner's scope check over `6e81831..510f003` passes: every product path lies inside C10's scope, and the only shared path (`docs/farm-return-next/DOMAIN_CONTRACTS.md`) is additive |
| Pushed / deployed / migrations | no / no / none |

## Why C10 is adopted without a final clean whole-phase audit
1. A full strict C10 audit was completed (`94767`, the whole phase `6e81831..5aa207d`).
2. Its two production Highs (F019 retained-job current state, F020 performance provenance) were repaired in `510f003`.
3. A bounded independent strict closure audit (`13552`) reviewed those repairs and their direct regression surface.
4. That closure audit found no production defect. F019 reconciliation, F001 origin preservation, proposal/job matching, completed-job behaviour, field ownership and F020 rendering all raised no finding.
5. Its only Medium was a test-coverage deficiency.
6. That deficiency was repaired with tests only (`4bb4dc5`).
7. Mutation testing proved the new rendered tests fail when only the first target is rendered, and when the first target's provenance is shown for every target.
8. Production remained unchanged at `510f003`.
9. The full deterministic production gate on `510f003` therefore remains valid for the adopted SHA. The test-only commit was not part of that gate. It was verified separately: the `c10-audit-94767` file 20/20, the C10 suite 34 files / 1,358 tests, typecheck, and lint on the test file.
10. Repeated whole-phase audits were intentionally discontinued. They were consuming disproportionate audit quota while re-reviewing unchanged Tier-2 application/UI code.

## Assurance classification
C10 is an application / presentation / integration phase over the frozen C0–C9 decision engines. C0–C9 keep their
existing strict frozen status. C10 is accepted under the authorised Tier-2 application assurance standard, on this basis:
- frozen upstream domain contracts preserved;
- strong deterministic regression coverage;
- mutation and adversarial testing;
- full typecheck, lint and build;
- the full deterministic quality gate;
- an independent full-audit baseline and an independent bounded closure audit;
- every known production Critical/High repaired, and the closure-audit test deficiency repaired;
- no known unresolved blocking production defect.

This classification does not alter C0–C9 governance.

## Known non-blocking limitations carried forward
- **Product (not connected):** C10 is NOT production-connected to real farmer cattle data. It runs on the demonstration
  herd and an in-browser demo session. Connecting it to real `/livestock` data and persistence (Supabase) is the separate
  Pilot Integration programme, which has not started.
- **Demo / fixture:** the target definitions and sources are synthetic fixtures (`SYNTH-TARGET-*`, `SYNTH-SRC-*`), shown
  with their recorded labels and never presented as independent validation. Prices, herd and records are demonstration data.
- **Design boundary (by decision, audit 94767 repair):** a retained Plan job keeps its timing, window and hard deadline
  from when it was raised. The frozen Plan kernel has no audited mutation for them, and no demo path changes them.
- **Known Low technical issues (Claude audit `claude-audit-20261022-1`, accepted follow-up):** CL-010 undated non-medicine
  health records are not listed; CL-012 future-dated cost entries are not surfaced; CL-013 remainder: timeline and
  plan-timeline dates omit the year. The Codex audits `94767` and `13552` raised no Low.
- **Pre-existing lint warnings:** 2 unused-symbol warnings in frozen C8 `recommendation-engine.ts`. These are untouched,
  because C8 is frozen.
- **Future Pilot Integration work:** real data adapters, persistence, auth-bound farm scope, and a production-readiness
  review of C10 against real records.
