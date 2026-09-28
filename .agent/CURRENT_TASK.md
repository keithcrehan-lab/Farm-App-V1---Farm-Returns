# Task: Campaign B evidence UX — preserve small positive values

Starting HEAD: 58b73f5

## Goal

Fix the remaining confirmed MEDIUM from:

`.agent/history/audit-20260928T153834Z.md`

Small positive regulatory evidence values must never display as explicit zero.

Current defect:

- `0.04 m³` can render as `0 m³`
- `0.004 ha` can render as `0 ha`

This makes a positive farmer declaration visually indistinguishable from an explicit
known zero.

## Required change

Fix display formatting in:

- `src/components/farm/NeatSlurryEvidenceCard.tsx`
- `src/components/farm/SpreadableAreaEvidencePanel.tsx`

Prefer the existing project `formatNonNegative` formatter if appropriate.

Requirements:

1. explicit zero still displays as zero;
2. small positive values remain visibly positive;
3. normal values retain sensible concise formatting;
4. do not alter stored numeric values;
5. do not alter regulatory/scientific calculations;
6. do not change evidence semantics;
7. do not change persistence;
8. do not change Campaign B canonical selectors.

## Regression tests

At minimum prove:

A. neat slurry `0` displays as explicit zero;

B. neat slurry `0.04` does not display as zero;

C. spreadable area `0` displays as explicit zero;

D. spreadable area `0.004` does not display as zero;

E. ordinary values still display correctly;

F. existing unknown/conflicting/not-up-to-date states remain unchanged.

## Scope exclusions

Do NOT:

- change Campaign B domain logic;
- change database/schema;
- apply migrations;
- change regulatory interpretation;
- alter downstream contracts;
- modify What Matters;
- redesign the cards.

This is a display-precision fix only.

## Documentation

Update repo state documentation only if required by existing conventions.

## Verification

Run the two affected component test files.

Then full:

`npm test`

Verify command: `npm run typecheck && npm run build`

Only report DONE if all tests and verification pass.

