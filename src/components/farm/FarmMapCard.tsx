"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { FieldMap } from "@/components/farm/FieldMap";
import { mockFields, mockSpreadingScores } from "@/data/mock-farm";
import { isHardStop } from "@/domain/types";
import { scoreTone } from "@/lib/status";

function fieldScore(fieldId: string): number {
  const entry = mockSpreadingScores.find((s) => s.fieldId === fieldId);
  return entry && !isHardStop(entry.slurryScore) ? entry.slurryScore.value : 0;
}

/** Dashboard hero map: fields tinted/badged by today's spreading score. */
export function FarmMapCard() {
  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="p-5 pb-0">
        <CardTitle>Farm at a Glance</CardTitle>
        <span className="text-sm text-fr-ink-600">All Fields ({mockFields.length})</span>
      </CardHeader>
      <div className="mx-5 mb-5 mt-4">
        <FieldMap
          fields={mockFields}
          getTone={(field) => scoreTone(fieldScore(field.id))}
          renderBadge={(field) => fieldScore(field.id)}
        />
      </div>
    </Card>
  );
}
