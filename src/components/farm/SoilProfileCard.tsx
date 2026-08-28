import { ChevronRight, Layers } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import type { MappedSoil } from "@/domain/types";

/**
 * Codex remediation Priority 2/8 — `soil` is now `MappedSoil | undefined`:
 * a field genuinely has no mapped soil until a real spatial lookup (or a
 * farmer override) resolves one — see `src/domain/soil-resolution.ts`.
 * This card shows that absence honestly instead of a fabricated "Pending
 * mapping" placeholder.
 */
export function SoilProfileCard({ soil }: { soil: MappedSoil | undefined }) {
  if (!soil) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={Layers} tone="neutral" />
            <CardTitle>Soil profile</CardTitle>
          </span>
          <Pill tone="neutral">Unavailable</Pill>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">
          This field&apos;s soil hasn&apos;t been mapped yet — no verified Irish soil dataset lookup has been run for
          it. Add a lab soil test on the Soil screen to record real P/K/pH values in the meantime.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Layers} tone="good" />
          <CardTitle>Soil profile</CardTitle>
        </span>
        <ChevronRight className="size-4 text-fr-ink-400" />
      </CardHeader>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-fr-ink-600">Mapped soil type</p>
          <p className="font-semibold text-fr-ink-900">{soil.dominantSeries}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Drainage</p>
          <p className="font-semibold capitalize text-fr-ink-900">{soil.drainage.replace(/_/g, " ")}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Source</p>
          <p className="font-semibold text-fr-ink-900">{soil.source}</p>
        </div>
      </div>
    </Card>
  );
}
