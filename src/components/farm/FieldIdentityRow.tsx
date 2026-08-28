import Link from "next/link";
import { Map } from "lucide-react";
import type { Field } from "@/domain/types";
import { landUseLabel } from "@/lib/status";
import { formatHa } from "@/lib/format";

/**
 * Field header used at the top of detail screens (Nutrient Planner, Silage
 * Planning) reached from a field: thumbnail, name, area, planned use, and
 * a "View map" link back to /fields.
 *
 * Used to also show a colored score badge on the thumbnail from
 * `mockSpreadingScores` — an unsourced mock spreading score, on screens
 * that aren't even about spreading. See
 * `SpreadingSuitabilityValidationCard`'s doc comment for why that's gone.
 */
export function FieldIdentityRow({ field }: { field: Field }) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#5a7a4e] via-[#3c5c3f] to-[#25381f]">
        <span className="absolute inset-x-0 top-1 text-center text-[11px] font-semibold text-white">
          {field.name.replace(" Field", "")}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-title text-fr-ink-900">{field.name}</h2>
        <p className="text-sm text-fr-ink-600">
          {formatHa(field.areaHa)} · {landUseLabel(field.plannedUse.value)}
        </p>
      </div>
      <Link
        href="/fields"
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-fr-green-700 px-3 py-1.5 text-sm font-medium text-fr-green-700"
      >
        <Map className="size-4" />
        View map
      </Link>
    </div>
  );
}
