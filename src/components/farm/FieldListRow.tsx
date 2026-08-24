"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { landUseLabel, landUseTone, toneClasses } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Field } from "@/domain/types";
import { formatHa } from "@/lib/format";

export function FieldListRow({
  field,
  selected,
  onSelect,
}: {
  field: Field;
  selected?: boolean;
  onSelect?: (fieldId: string) => void;
}) {
  const tone = landUseTone(field.plannedUse.value);
  const toneClass = toneClasses[tone === "silage" ? "info" : tone];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(field.id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-fr-control border px-3 py-3 text-left transition-colors",
        selected ? "border-fr-green-700 bg-fr-green-100/50" : "border-fr-border bg-fr-surface hover:bg-fr-surface-alt",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneClass.bg)}>
        <MapPin className={cn("size-4", toneClass.text)} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-fr-ink-900">{field.name}</span>
          <span className="shrink-0 text-xs text-fr-ink-400">{formatHa(field.areaHa)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="truncate text-xs text-fr-ink-600">{landUseLabel(field.plannedUse.value)}</span>
          <StatusBadge status={field.plannedUse.status} className="scale-90 origin-left" />
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-fr-ink-400" />
    </button>
  );
}
