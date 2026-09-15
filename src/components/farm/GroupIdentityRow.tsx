import Link from "next/link";
import { Beef, Map } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { livestockCategoryLabel } from "@/lib/status";
import type { LivestockGroup } from "@/domain/types";

export function GroupIdentityRow({ group }: { group: LivestockGroup }) {
  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F9) — the real category actually driving this group's own
  // N/LU stocking calculations, exposed alongside the farmer's own
  // free-text label rather than hidden behind it (a real audited group
  // labelled "weanlings" was stored as `category: "suckler_cow"`).
  // Always shown, never conditionally hidden when it happens to look
  // similar to the label — whether the two genuinely agree is the
  // farmer's own real judgement to make, not a string-matching guess.
  const categoryLabel = livestockCategoryLabel(group.category);
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-fr-green-700">
        <Beef className="size-6 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-title text-fr-ink-900">
          {formatNumber(group.count.value, 0)} {group.label}
        </h2>
        <p className="text-sm text-fr-ink-600">
          Cattle group <span className="text-fr-ink-400">· calculated as {categoryLabel}</span>
        </p>
      </div>
      <Link
        href="/livestock"
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-fr-green-700 px-3 py-1.5 text-sm font-medium text-fr-green-700"
      >
        <Map className="size-4" />
        View group
      </Link>
    </div>
  );
}
