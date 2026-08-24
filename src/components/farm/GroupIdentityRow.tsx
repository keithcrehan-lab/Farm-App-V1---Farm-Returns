import Link from "next/link";
import { Beef, Map } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { LivestockGroup } from "@/domain/types";

export function GroupIdentityRow({ group }: { group: LivestockGroup }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-fr-green-700">
        <Beef className="size-6 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-title text-fr-ink-900">
          {formatNumber(group.count.value, 0)} {group.label}
        </h2>
        <p className="text-sm text-fr-ink-600">Cattle group</p>
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
