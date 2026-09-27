# Task: Fix slurry Confirm Actual quantity and unit validation
Starting HEAD: 73881e2

## Context

Live browser validation exposed a separate pre-existing Job Mode defect.

This is NOT the Phase 1B slurry allocation lifecycle flow.

The failing path is:

`ConfirmActualSheet`
→ `confirmJobSessionActualAction`
→ `validateJobActualInput`

Observed server error:

`invalid Actual payload — a positive quantity is required; quantityUnit must be one of "m3", "gallons"`

Root cause confirmed in:

`src/components/next/ConfirmActualSheet.tsx`

The component currently initialises:

`quantityUnit = "kg"`

for every activity.

For `slurry_spreading`, however, the rendered select only offers:

- `m3`
- `gallons`

This can leave React state as `"kg"` while the slurry select visually appears to show an allowed option.

The sheet also allows Confirm Actual to submit without a positive slurry quantity.

Do not change the Phase 1B allocation lifecycle implementation.

---

## Objective

Make slurry Job Mode → Confirm Actual truthful and impossible to submit with an invalid or silently assumed quantity unit.

No unit may be inferred merely because a select visually displays its first option.

---

## Slurry quantity unit

For `slurry_spreading`:

- do NOT default to `kg`;
- do NOT silently default to `m3`;
- require an explicit farmer choice between:
  - m³
  - gallons.

Use an explicit empty state such as:

`Select unit`

until the farmer chooses one.

A farmer-entered number without an explicitly selected slurry unit is incomplete.

---

## Quantity

For slurry spreading where completion is not `did_not_happen`:

- quantity must be a finite positive number;
- zero is invalid;
- negative values are invalid;
- blank is invalid.

Do not invent or prefill an actual quantity from unrelated data.

---

## Validation

Prefer using the existing canonical `validateJobActualInput(...)` client-side before deciding online/offline submission rather than implementing a second independent validation rule.

The server must continue to revalidate exactly as it does today.

Client validation is UX protection, not a replacement for the server trust boundary.

Do not weaken server validation.

---

## Farmer-facing errors

Invalid input must be caught before calling `confirmJobSessionActualAction`.

Use plain language.

For example:

Quantity missing/invalid:

> Enter the amount of slurry you actually spread.

Unit missing:

> Choose whether that amount is in m³ or gallons.

If multiple fields are invalid, make the missing requirements clear without exposing:

- `validateJobActualInput`
- enum names
- server action names
- SQL/internal error text.

Do not rely on a console exception as the farmer-facing validation mechanism.

---

## Completion = Did not happen

If the farmer selects:

`Did not happen`

then slurry quantity and unit must not be required merely for having slurry as the activity type.

Preserve the existing canonical validator semantics for this case.

---

## Other activity types

Do not regress:

- fertiliser spreading;
- silage;
- field inspection;
- livestock work;
- soil sampling;
- other Job Mode activities.

In particular, fertiliser may continue using its valid fertiliser unit handling.

Do not globally change every activity to an empty quantity unit unless required by its own contract.

---

## State transitions

If the activity/session changes while this component remains mounted, ensure quantity-unit state cannot carry an invalid unit from one activity type into another.

Do not allow:

- `kg` to survive into slurry;
- `m3` or `gallons` to survive into fertiliser;

unless explicitly valid for that activity.

---

## Tests

Add regression coverage at minimum for:

A. slurry Confirm Actual initially has no silently selected canonical unit;

B. slurry quantity entered but no unit selected does not call the server;

C. slurry unit selected but quantity blank does not call the server;

D. slurry quantity zero does not call the server;

E. slurry negative quantity does not call the server;

F. valid positive quantity + m3 calls the server with `quantityUnit: "m3"`;

G. valid positive quantity + gallons calls the server with `quantityUnit: "gallons"`;

H. `did_not_happen` does not require slurry quantity/unit if canonical validation allows it;

I. no raw/internal validation message is shown to the farmer;

J. fertiliser Confirm Actual still behaves correctly;

K. online invalid submissions are blocked client-side rather than generating the server console error;

L. server validation remains unchanged and still rejects malformed direct callers.

Run the existing ConfirmActualSheet tests plus relevant job-session tests.

---

## Scope

Do not change:

- Phase 1A SQL;
- Phase 1B slurry lifecycle UI;
- slurry allocation completion;
- store reconciliation;
- scientific rules;
- recommendation rules;
- job-actual database semantics.

No migration.

This is a narrow Job Mode Confirm Actual UI/validation fix.

---

## Definition of done

- slurry quantity unit is never silently `kg`;
- m3/gallons choice is explicit;
- positive quantity is required when applicable;
- invalid payloads are stopped before the online server call;
- server remains authoritative and revalidates;
- farmer sees plain-language validation;
- other activity types do not regress;
- targeted tests pass;
- full tests pass;
- typecheck passes;
- build passes.

Verify command: `npm run typecheck && npm run build`
