"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { FieldMap } from "@/components/farm/FieldMap";
import { useFields } from "@/store/farm-store";
import { landUseTone } from "@/lib/status";

/**
 * Dashboard hero map. Was tinted/badged by the mock daily spreading score
 * (`mockSpreadingScores`) — see `SpreadingSuitabilityValidationCard`'s doc
 * comment for why that's no longer presented as a real figure. Now tinted
 * by each field's real planned land use instead (`landUseTone`, already
 * used for this exact purpose on the Fields/map screens) — real field
 * data, not a fabricated daily verdict — and shows no numeric badge, since
 * there's no sourced per-field number to badge it with.
 */
export function FarmMapCard() {
  const fields = useFields();
  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="p-5 pb-0">
        <CardTitle>Farm at a Glance</CardTitle>
        <span className="text-sm text-fr-ink-600">All Fields ({fields.length})</span>
      </CardHeader>
      <div className="mx-5 mb-5 mt-4">
        <FieldMap fields={fields} getTone={(field) => landUseTone(field.plannedUse.value)} />
      </div>
    </Card>
  );
}
