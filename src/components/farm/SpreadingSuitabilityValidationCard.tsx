import { FlaskConical } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";

/**
 * Replaces the old mock 0-100 "spreading score" hero + forecast strip.
 *
 * `spreading.ts`'s own doc comment already explains why: the composite
 * score's six components (rainfall, SMD/trafficability, soil temp, crop
 * demand, drainage/topographic risk, wind) have no sourced weights —
 * `docs/agronomy-engine.md` itself flags them as "indicative," and
 * inventing weights to fill the gap would break CLAUDE.md's "never invent
 * a production scientific/regulatory number" rule. The mock score that
 * used to sit here (`mockSpreadingScores`/`mockSpreadingForecast`) looked
 * exactly as authoritative as the real, verified `CurrentConditionsCard`/
 * `NineDayForecastCard` above it — same ring, same "Very good"/"Marginal"
 * banding, same visual weight — with nothing to tell a farmer the
 * difference. This card replaces that with an honest, neutral status
 * instead of a fabricated verdict, while keeping the screen's intended
 * shape (see docs/evidence-register.md's Phase 5 capability-status table).
 *
 * `FlaskConical` matches the icon this app already uses for "estimated"
 * data status elsewhere (`StatusBadge.tsx`) — reused deliberately, not a
 * new visual vocabulary for the same idea.
 */
export function SpreadingSuitabilityValidationCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <FlaskConical className="size-4 text-fr-green-700" />
          Spreading suitability score
        </CardTitle>
        <Pill tone="neutral">Under validation</Pill>
      </CardHeader>
      <p className="text-sm text-fr-ink-600">
        We&apos;re validating the decision rules behind this score before making it available. Use the real current
        conditions and forecast above in the meantime.
      </p>
    </Card>
  );
}
