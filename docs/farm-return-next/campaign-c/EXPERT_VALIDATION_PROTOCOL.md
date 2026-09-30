# Campaign C — blinded prospective expert-validation protocol

Task `campaign-c-remaining-programme-20260930`. **This is a protocol only. No expert
validation has taken place.** Campaign C remains AI_SCIENTIFIC_ADJUDICATION,
EXPERT_VALIDATION_PENDING and DRAFT.

- Storage types and comparison arithmetic:
  `src/domain/campaign-c-expert-validation.ts`
  (`campaign_c_expert_validation_v0.1.0-draft`).
- Empty case-set template:
  [expert-validation-cases.template.json](expert-validation-cases.template.json).

Neither is wired into production.

## 1. Purpose

The protocol measures how far Farm Return's slurry agronomy outputs agree with an
independent qualified Irish agronomist (Teagasc adviser or equivalent). The expert works
blind, on the same raw inputs. The results inform rule-set approval (LIFECYCLE §4). They
do not replace it.

## 2. Case set

The initial target is **50 cases** (`EXPERT_VALIDATION_TARGET_CASE_COUNT`). Every stratum
in `EXPERT_VALIDATION_STRATA` must be covered, and one case may carry several strata:

- soil P Index 1–4;
- soil K Index 1–4;
- mixed P/K indices;
- slurry DM classes (2, 4, 6 and 7 % LESS rows; 4–10 % Table 9-8);
- LESS;
- splashplate;
- first-cut yield differences (including outside 5–6 t DM/ha);
- missing evidence (missing P or K index, unresolved composition, missing date or method);
- low-index organic-share situations (Index 1/2 with heavy slurry);
- regulatory constraints (Campaign B);
- weather and actionability constraints;
- economic prioritisation;
- cases where the correct output is BLOCKED / insufficient evidence.

Case construction rules:

- Seed cases from `reference-cases.slurry-agronomy-ie-2026-v1.json` where they fit, and
  add synthetic farms. Real farm data may be used only with consent and pseudonymised.
- `expertValidationCoverage` reports the case count, any duplicate IDs and any missing
  strata. The case set is frozen, with a SHA-256 of the canonical JSON, before either
  arm runs.

## 3. Farm Return arm (frozen before expert contact)

For each case, record `FarmReturnValidationArm`:

- the raw inputs;
- the recommendation and decision (`APPLY`, `DO_NOT_APPLY` or
  `BLOCKED_INSUFFICIENT_EVIDENCE`);
- the nutrient values;
- the rate, which is `null` while `RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL`
  applies;
- the blocked or allowed state;
- the evidence trail (rule and claim IDs);
- confidence;
- the rule-set version and the engine version.

Commit the arm file, with its fingerprint, before the expert receives any case.

## 4. Expert arm

The expert receives only `ExpertValidationCase.rawInputs`. They never see Farm Return's
answer, and the arm records `blinded: true`. The expert records:

- a recommendation and decision;
- a rate;
- N, P and K values, using `null` for "not given" and never 0;
- reasoning;
- confidence;
- whether the evidence is sufficient.

Experts work independently. The reviewer reference is pseudonymous (`expertRef`), and
no personal data is stored.

## 5. Blind comparison (`compareExpertValidationCase`)

| Measure | Definition |
|---|---|
| Exact agreement | Same decision, rate and N/P/K values (`null` equals `null`) |
| Directional agreement | Same decision |
| Numerical deviation | Farm Return minus expert, absolute and relative, per value. "Not comparable" when either value is missing. **No tolerance is defined here.** Any acceptance threshold must be agreed with the expert panel before unblinding and recorded in the case-set file |
| Safety disagreement | Farm Return `APPLY` where the expert would not apply |
| False blocking | Farm Return blocked where the expert judged the evidence sufficient and answered |
| Evidence-principle agreement | Both arms agree on whether the evidence is sufficient |
| Confidence calibration | Directional-agreement rate per Farm Return confidence level (`expertValidationCalibration`) |

The comparison rejects a case-ID mismatch and an unblinded expert arm.

## 6. Unblinding and outcome

- Unblind only after every expert arm is committed.
- Any safety disagreement or false blocking is logged as a CONF/GAP item in
  [CONFLICTS.md](CONFLICTS.md).
- Results are appended. They never edit the frozen arms.
- A rule moves from AI_PROVISIONAL to approved only through a new rule-set version
  with reviewer approval records (LIFECYCLE §4, §7).
