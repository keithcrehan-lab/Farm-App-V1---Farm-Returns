# Task: Campaign B regulatory interpretation — home-produced grazing manure and Table 15a phosphorus

Starting HEAD: 0ebf687

## Goal

Resolve the outstanding Campaign B regulatory blocker concerning how home-produced
grazing-livestock manure interacts with the phosphorus maximum rates in Table 15a.

Do not infer the answer from old Teagasc guidance or prior implementation.

Verify the CURRENT Irish legal position first from authoritative sources, then make
the smallest production change only if the interpretation is unambiguous.

## Authoritative starting evidence

The current base regulation is:

S.I. No. 588/2025 — European Union (Good Agricultural Practice for Protection of Waters) Regulations 2025.

Article 15(8) states that:

"The nitrogen and phosphorus maximum rates in Tables 13, 15a, 15b, 16 and 17 are
in addition to the nitrogen and phosphorus contained in grazing livestock manure
produced on the holding."

The same regulation contains:

- Table 15a — annual maximum fertilisation rates of phosphorus on grassland;
- Table 8 — nutrient content of cattle slurry;
- Table 10 — nutrient availability in livestock manure;
- the existing provisions governing Index 4, organic matter, stocking rate and
  livestock-manure limits.

However, S.I. 588/2025 has subsequently been amended in 2026.

Before implementing anything, verify whether the current amending legislation,
including S.I. No. 119/2026 if applicable, changes Article 15(8), Table 15a,
or any directly relevant provision.

## A. Mandatory legal/repository investigation

Trace:

- `src/domain/nutrients.ts`
- `src/domain/statutory-manure-value.ts`
- `src/domain/slurry-regulatory-context.ts`
- NAP compliance types and calculations
- existing regulatory tests
- current evidence/source register
- `docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`
- any existing implementation of Table 15a / phosphorus ceiling logic

Establish exactly what production currently assumes.

Then verify from authoritative CURRENT sources:

1. whether Article 15(8) remains in force unchanged;
2. whether Tables 15a/15b remain the relevant grassland P maximum-rate tables;
3. whether those rates are additional to N/P contained in grazing-livestock manure
   produced on the holding;
4. the distinction between:
   - home-produced grazing-livestock manure;
   - imported organic manure;
   - chemical fertiliser;
   - concentrate-feed phosphorus;
5. whether any current provision requires home-produced grazing manure P to be
   deducted from the Table 15a rate;
6. whether the special Index 4 surplus-manure provision changes the interpretation;
7. whether the answer differs for non-grazing-livestock holdings or cut-for-sale land.

Do not generalise one holding type into another.

## B. Decision rule

Only implement production logic if the current authoritative legal text is clear.

If Article 15(8) remains current and unmodified in substance, production must reflect
that the Table 15a/15b N/P maximum rates are additional to N/P contained in grazing
livestock manure produced on the holding.

Do NOT therefore calculate:

`remaining Table 15a P = Table 15a P maximum - all home-produced grazing-manure P`

unless another current authoritative provision explicitly requires that.

Keep separate ledgers for:

1. statutory livestock-manure accounting;
2. Table 15a/15b fertilisation-rate entitlement;
3. imported organic fertiliser;
4. chemical fertiliser;
5. agronomic nutrient supply.

Do not merge these concepts.

## C. Preserve other statutory constraints

This interpretation must NOT remove or weaken:

- livestock-manure N limits;
- Index 4 restrictions;
- soil-test validity rules;
- >20% organic-matter restrictions;
- stocking-rate rules;
- concentrate-feed phosphorus accounting;
- imported/exported manure accounting;
- derogation-specific conditions;
- any current statutory P availability factors.

The fact that Table 15a P may be additional to home-produced grazing manure does not
mean home-produced manure is legally unlimited.

## D. Required regression scenarios

At minimum cover:

A. grazing-livestock holding, home-produced cattle slurry, valid P Index 2:
   home-produced grazing-manure P does not reduce the Table 15a P rate solely by
   virtue of being produced on the holding;

B. same field with imported organic manure:
   do not automatically apply the home-produced-manure exemption to imported manure;

C. chemical P remains counted against the applicable Table 15a/15b maximum;

D. concentrate-feed P continues to be accounted for under the current statutory rule;

E. P Index 4 retains the existing surplus-home-produced-manure restriction;

F. >20% organic-matter/peat handling remains unchanged;

G. non-grazing-livestock or cut-for-sale scenarios do not incorrectly inherit the
   grazing-holding interpretation;

H. livestock-manure N limits remain unchanged;

I. unavailable evidence remains UNKNOWN rather than zero;

J. existing valid compliance cases not affected by this interpretation remain unchanged.

## E. STOP conditions

STOP rather than guessing if:

1. S.I. 119/2026 or another current amendment changes Article 15(8) materially;
2. authoritative current sources conflict;
3. the repo lacks enough distinction between home-produced and imported manure to
   implement the rule safely;
4. implementation requires inventing a legal interpretation not explicit in current law;
5. one field value is being used for both agronomic and statutory purposes and cannot
   be separated safely within this task.

If stopped, document the precise blocker and source.

## Scope exclusions

Do NOT:

- alter slurry recommendation rates;
- implement Campaign C agronomic science;
- optimise whole-farm slurry allocation;
- wire What Matters;
- add farmer-facing forms;
- change persistence schema unless the legal rule cannot be represented without it;
- apply migrations to Farm Return V1 Dev;
- revisit the now-clean persistence/temporal-integrity logic unless directly required.

## Documentation/state

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`
- relevant evidence/source documentation if the interpretation is resolved

Record the exact authoritative legal basis and applicability boundary.

Do not describe a legal interpretation as scientific evidence.

Campaign B remains PARTIAL until the later UX/downstream wiring work is complete.

## Verification

Run targeted regulatory/nutrient/slurry tests.

Then full `npm test`.

Verify command: `npm run typecheck && npm run build`

Only report DONE if the legal interpretation was verified from current authoritative
sources and all tests/verification pass.

