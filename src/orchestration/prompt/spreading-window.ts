/**
 * The second real Prompt producer (`BUILD_PLAN.md`'s Checkpoint 2,
 * Vertical B, second slice) — one real field's spreading-window status,
 * built on `src/domain/spreading-window-gate.ts`'s
 * `checkSpreadingWindowGate` (a genuinely new domain module — see its own
 * doc comment for the complete, honest account of how it reached its
 * final, calendar-only shape — that date-validates before delegating to
 * `src/domain/closed-period-calendar.ts`'s `checkClosedPeriodCalendar`).
 * This file only ever supplies presentation copy, the same division of
 * labour `buildPrompt` (`./index`) already enforces structurally — it
 * makes no decision about which `EngineOutcome` arm applies; that logic
 * lives entirely in the domain layer.
 *
 * **Why this is scoped as a binary legal-gate Prompt, not a
 * multi-factor "spreading suitability" Prompt** — investigated before
 * writing a line of this file, per this checkpoint's own explicit
 * instructions:
 *
 * - `spreading-legal-gate.ts`'s own header is explicit that step 5 of
 *   spec H ("agronomic opportunity") is deliberately NOT built anywhere
 *   in this codebase — "No unvalidated 'scientific 0-100 probability'."
 *   Inventing one here would be exactly the fabricated-score mistake
 *   `docs/real-mode-completion/BUILD_LOG.md` already removed once; this
 *   Prompt never does that.
 * - `spreading.ts`'s own header, and `src/app/(app)/spreading/page.tsx`'s
 *   own comment at its real `checkClosedPeriodCalendar` call site, both
 *   say the same thing independently: this app has no live per-field
 *   weather/ground-condition capture wired to any screen, so
 *   `assessWeatherHardStops` (SMD/soil-temp based) cannot be called for
 *   a real field today — only the statutory calendar (fully determined
 *   by county + date + material alone) is live. `src/domain/real-alerts.ts`
 *   independently reaches the same conclusion for its own farm-wide
 *   closed-period alert. This producer follows that same, already-
 *   established real/mock boundary rather than second-guessing it.
 *
 * **Why this producer never accepts caller-supplied ground/weather
 * conditions, even though `spreading-legal-gate.ts`'s frozen
 * `checkSpreadingLegalGate` can compose them** — the real, five-round
 * Codex audit account (`audit-logs/20260829T135101Z.md` through
 * `20260829T143333Z.md`) is preserved in full in
 * `src/domain/spreading-window-gate.ts`'s own header, not repeated here.
 * Short version: `SpreadingGroundConditions` (`spreading-legal-gate.ts`'s
 * own type) carries no observation timestamp or source field at all —
 * unlike `SoilTest`, which has its own real `sampleDate` — so neither a
 * positive nor a negative ground-derived claim can honestly be dated or
 * sourced from this app's own data today, and no other real call site in
 * this app (`real-alerts.ts`, `spreading/page.tsx`) ever supplies ground
 * data to this gate either. This Prompt matches that one real,
 * already-live precedent exactly: calendar-only.
 */
import { checkSpreadingWindowGate, SPREADING_WINDOW_GATE_VERSION } from "@/domain/spreading-window-gate";
import { CLOSED_PERIOD_CALENDAR_VERSION, COUNTY_ZONE, normaliseCountyForZoneLookup, type SpreadingMaterial } from "@/domain/closed-period-calendar";
import type { Farm, Field } from "@/domain/types";
import { buildPrompt, type Prompt } from "./index";

/** `Prompt.kind` for every Prompt this module produces. */
export const SPREADING_WINDOW_PROMPT_KIND = "spreading_window";

/**
 * The one real farm record this producer reads a county from — never a
 * bare `county: string` parameter on its own, which would let a caller
 * pass a field from one farm alongside another farm's county with
 * nothing binding them (the exact cross-farm/cross-field mismatch class
 * `soil-test-age.ts`'s own doc comment cites four real Codex audit
 * rounds fixing, `audit-logs/20260829T085255Z.md` through
 * `20260829T091854Z.md`). `promptForSpreadingWindow` asserts
 * `field.farmId === farm.id` before reading `farm.location.county` —
 * see the function's own doc comment.
 */
export type SpreadingWindowFarm = Pick<Farm, "id" | "location">;

/** The one real field record this producer reads identity from. County
 * is genuinely farm-level data (`Farm.location.county`, not on `Field`
 * at all — `types.ts`), so unlike `soil-test-age.ts` this producer
 * cannot avoid taking a second record; `SpreadingWindowFarm` above is
 * the deliberate, narrower way it does so safely. */
export type SpreadingWindowField = Pick<Field, "id" | "farmId" | "name">;

const MATERIAL_LABEL: Record<SpreadingMaterial, string> = {
  chemical_fertiliser: "chemical fertiliser",
  organic_fertiliser_other_than_FYM: "organic fertiliser (other than farmyard manure)",
  farmyard_manure: "farmyard manure",
};

/** Real ISO local date in `Europe/Dublin` — the statutory closed-period
 * calendar this Prompt checks is an Irish regulation (S.I. 588/2025)
 * evaluated against Irish calendar dates, so "today" must mean the real
 * Irish calendar date, not whatever date UTC happens to be at the same
 * instant. Codex audit HIGH (`audit-logs/20260829T143333Z.md`): the
 * first version defaulted via `new Date().toISOString().slice(0, 10)`
 * (plain UTC) — during Irish Summer Time (UTC+1), the hour between Irish
 * local midnight and 01:00 has UTC still showing the *previous* calendar
 * day, so a caller relying on the default around a closed-period
 * boundary (e.g. the 09-15 opening of the autumn closed period) could
 * get the wrong day's answer for up to an hour. Uses `Intl.DateTimeFormat`
 * with the real IANA `Europe/Dublin` zone (handling GMT/IST transitions
 * correctly via the JS engine's own timezone database, not hand-rolled
 * DST arithmetic — no new dependency, no invented rule) rather than
 * `Date`'s own UTC-only formatting. `en-CA` is used only for its
 * locale-formatting side effect (`YYYY-MM-DD` digit order), not for any
 * Canadian-specific meaning.
 *
 * This fixes only this producer's own default — `nutrients.ts`'s
 * `calculateNutrientPlan`, `real-alerts.ts`'s `deriveRealAlerts`, and
 * `spreading/page.tsx` all still default via plain UTC
 * (`new Date().toISOString().slice(0, 10)`), the same pattern this
 * producer's own first version used. That is a real, pre-existing,
 * app-wide inconsistency this one Prompt producer's fix does not
 * resolve — `nutrients.ts` is a frozen `DOMAIN_CONTRACTS.md` contract
 * this vertical cannot change unilaterally, the same escalation boundary
 * already applied elsewhere in this checkpoint. See `BLOCKERS.md`.
 */
function todayInIreland(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(new Date());
}

/** Real, honest copy for the one OK value `checkSpreadingWindowGate` can
 * ever produce (`"BASELINE_OPEN"` — its own doc comment: "never
 * 'compliant'/'permitted' — this is the CALENDAR check alone").
 * Deliberately does not say "safe to spread" or "spreading window is
 * open" unconditionally — narrowed to exactly what was checked, per the
 * same "narrow the copy to what the outcome itself proves" discipline
 * `soil-test-age.ts`'s own round-1 fix established
 * (`audit-logs/20260829T085255Z.md`). Never mentions ground/weather
 * conditions as checked or clear — this producer has no ground input at
 * all (see this module's own header) — and always names the evaluated
 * date explicitly rather than saying "currently" (Codex audit HIGH,
 * `audit-logs/20260829T142810Z.md`: `asOfDate` is a caller-supplied,
 * possibly historical/future parameter — `calculateNutrientPlan`'s own
 * `asOfDate` convention — so "currently" would imply knowledge this
 * function doesn't have).
 */
function describeSpreadingWindowOk(fieldName: string, material: SpreadingMaterial, asOfDate: string): { title: string; description: string } {
  const materialLabel = MATERIAL_LABEL[material];
  return {
    title: `Calendar open — ${fieldName}`,
    description: `As of ${asOfDate}, ${fieldName} is not inside the statutory closed period for ${materialLabel}. This checks the statutory closed-period calendar only — ground/weather conditions, buffer distances, commonage restrictions, LESS method requirements and soiled-water limits are separate checks this Prompt does not run; check ground conditions before spreading.`,
  };
}

/**
 * Throws when `field` doesn't belong to `farm` — a caller/programming
 * error, not a domain evidence gap (there is no honest `EngineOutcome`
 * arm for "you passed unrelated records"), the same class of invariant
 * `src/domain/field-boundary.ts`/`audit-trace.ts` already throw for
 * rather than silently proceeding. Every real call site in this
 * checkpoint's own scope (a farm and its own fields, read together the
 * same way `real-alerts.ts`'s `DeriveRealAlertsInput` already takes
 * them) satisfies this by construction; this only guards against a
 * genuine mismatch, not a normal code path.
 */
function assertSameFarm(field: SpreadingWindowField, farm: SpreadingWindowFarm): void {
  if (field.farmId !== farm.id) {
    throw new Error(
      `promptForSpreadingWindow: field "${field.id}" belongs to farm "${field.farmId}", not the farm "${farm.id}" passed in — cannot attach this farm's county to that field's Prompt.`,
    );
  }
}

/**
 * Builds a real `Prompt` for one field's current spreading-window
 * closed-period status. `farm.location.county` (normalised via
 * `normaliseCountyForZoneLookup`, the same real utility
 * `real-alerts.ts`/`src/app/(app)/spreading/page.tsx` already apply
 * before calling this gate) and `material`/`asOfDate` are passed
 * straight to `checkSpreadingWindowGate` — this function makes no
 * decision about which `EngineOutcome` arm applies; that logic lives
 * entirely in `src/domain/spreading-window-gate.ts`
 * (`closed-period-calendar.ts` underneath it).
 *
 * `material` is a required, explicit parameter — never hardcoded to
 * `"chemical_fertiliser"` the way `spreading/page.tsx`'s own per-field
 * row currently does for its own, narrower, single-screen reason ("the
 * material every field can meaningfully be asked about"). A general
 * Prompt producer has no way to know which material a given caller
 * actually cares about, so it asks rather than silently assuming.
 *
 * `asOfDate` (ISO date, defaults to today's real Irish calendar date via
 * `todayInIreland`, above) follows the same explicit-date-parameter
 * convention `soil-test-age.ts`/`nutrients.ts`'s `calculateNutrientPlan`
 * already use. A malformed or calendar-invalid `asOfDate` never silently
 * reaches the frozen calendar — `checkSpreadingWindowGate` validates it
 * and fails closed (`UNKNOWN_BLOCK`) first; see that module's own doc
 * comment. It does *not* validate that `asOfDate` falls within any
 * particular year the underlying calendar dataset was verified against —
 * a real, deliberately-deferred gap after a genuine, documented attempt
 * and reversion (`checkSpreadingWindowGate`'s own header, point 3; the
 * full four-round account, including why the fix was ultimately reverted
 * rather than shipped half-evidenced, is in `BLOCKERS.md`).
 *
 * `calculationVersion` combines the real, exported versions of both
 * domain modules that materially determine `basis`:
 * `SPREADING_WINDOW_GATE_VERSION` (this producer's date-validation guard)
 * and `CLOSED_PERIOD_CALENDAR_VERSION` (the calendar table itself) — the
 * same "cite every module that materially affects the result" discipline
 * `soil-test-age.ts`'s own `calculationVersion` doc comment establishes
 * (Codex audit HIGH, `audit-logs/20260829T100014Z.md`, on that
 * producer's first version).
 *
 * `inputsSnapshot` carries the real raw inputs `checkSpreadingWindowGate`
 * was actually fed — `county`/`normalisedCounty`/`zone` (the real
 * statutory zone `COUNTY_ZONE` resolves the normalised county to, when
 * recognised), `material`, `asOfDate`, and `rule` (a human-readable
 * statutory citation) — the same "which Estimate, which evidence, which
 * legal check" trace `soil-test-age.ts`'s own `inputsSnapshot`
 * establishes, surviving independently of a later, possibly-changed
 * `Farm`/`Field` lookup.
 *
 * `regulatory: "compliance_value"` — the closed-period calendar is a
 * S.I. 588/2025 legal requirement governing whether spreading is
 * currently permitted, not a general planning suggestion (matches
 * `closed-period-calendar.ts`'s own framing).
 *
 * For every non-OK arm (`BLOCKED_INSUFFICIENT_EVIDENCE` — an
 * unrecognised county, or a malformed/calendar-invalid date;
 * `LEGAL_PROHIBITION` — the closed period) `description` comes from
 * `buildPrompt`'s own call to `describeBlockedBasis`, not from any
 * string this function supplies — the real `consequence`/`reasonCode`
 * `checkSpreadingWindowGate` returned, never a hand-written paraphrase.
 */
export function promptForSpreadingWindow(
  farm: SpreadingWindowFarm,
  field: SpreadingWindowField,
  material: SpreadingMaterial,
  asOfDate: string | undefined,
  createdAt: string,
): Prompt {
  assertSameFarm(field, farm);
  const resolvedAsOfDate = asOfDate ?? todayInIreland();
  const normalisedCounty = normaliseCountyForZoneLookup(farm.location.county);
  const basis = checkSpreadingWindowGate({
    county: normalisedCounty,
    date: resolvedAsOfDate,
    material,
  });
  return buildPrompt({
    id: globalThis.crypto.randomUUID(),
    farmId: field.farmId,
    fieldId: field.id,
    kind: SPREADING_WINDOW_PROMPT_KIND,
    basis,
    createdAt,
    regulatory: "compliance_value",
    calculationVersion: `${SPREADING_WINDOW_GATE_VERSION}+${CLOSED_PERIOD_CALENDAR_VERSION}`,
    inputsSnapshot: {
      county: farm.location.county,
      normalisedCounty,
      zone: COUNTY_ZONE[normalisedCounty],
      material,
      asOfDate: resolvedAsOfDate,
      rule: "GFT057-GFT080 — statutory closed-period spreading calendar (S.I. 588/2025, rules_statutory/closed_periods_2026.csv)",
    },
    titleWhenBlocked: `Spreading window status needs review — ${field.name}`,
    describeOk: () => describeSpreadingWindowOk(field.name, material, resolvedAsOfDate),
  });
}
