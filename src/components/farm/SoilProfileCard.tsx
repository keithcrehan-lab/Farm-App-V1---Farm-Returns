import { ChevronRight, Layers } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import type { MappedSoil } from "@/domain/types";

export function SoilProfileCard({ soil }: { soil: MappedSoil }) {
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
