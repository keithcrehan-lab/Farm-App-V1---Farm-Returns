import Link from "next/link";
import { cn } from "@/lib/cn";
import type { FarmObjectRailCounts } from "@/domain/farm-stats";

/**
 * Farm Spatial V2 — the persistent object rail: Cattle, Sheep, Sheds
 * (DESIGN_CONTRACT "Object rail"; IMPLEMENTATION_MAP §8). Sheds live here,
 * never as map markers.
 *
 * Counts come only from persisted groups/housing
 * (`calculateFarmObjectRailCounts`). Sheep have no category in the farm
 * model, so Sheep is an explicit "not yet supported" shell with no count.
 *
 * Asset strategy: no approved production silhouette asset exists yet
 * (IMPLEMENTATION_MAP §8). Rather than drawing crude animal SVGs or using
 * emoji, each object is typography-led with its domain colour rule
 * (plum for livestock, clay for housing). An approved silhouette set can
 * slot in above each label later without changing this data contract.
 *
 * Vertical column on desktop (beside the map), a three-column band under
 * the map on mobile.
 */
export function FarmObjectRail({ counts, className }: { counts: FarmObjectRailCounts; className?: string }) {
  const cattleDetail =
    counts.cattleGroupCount === 0
      ? "None recorded"
      : `${counts.cattleGroupCount} ${counts.cattleGroupCount === 1 ? "group" : "groups"}`;
  return (
    <nav
      aria-label="Farm objects"
      className={cn(
        "grid grid-cols-3 divide-x divide-fr-v2-rule bg-fr-v2-paper lg:flex lg:flex-col lg:divide-x-0 lg:divide-y lg:px-2.5 lg:pt-28",
        className,
      )}
    >
      <RailObject href="/livestock" label="Cattle" value={counts.cattleGroupCount === 0 ? undefined : String(counts.cattleHeadCount)} detail={cattleDetail} ruleClassName="bg-fr-v2-plum" />
      <RailObject label="Sheep" detail="Not yet supported" ruleClassName="bg-fr-v2-plum/40" />
      <RailObject
        href="/housing"
        label="Sheds"
        value={counts.shedCount === 0 ? undefined : String(counts.shedCount)}
        detail={counts.shedCount === 0 ? "None recorded" : counts.shedCount === 1 ? "shed" : "sheds"}
        ruleClassName="bg-fr-v2-clay"
      />
    </nav>
  );
}

function RailObject({
  href,
  label,
  value,
  detail,
  ruleClassName,
}: {
  /** Absent for a capability shell with no destination yet. */
  href?: string;
  label: string;
  /** Absent when there is no real count to show — never a fabricated 0. */
  value?: string;
  detail: string;
  ruleClassName: string;
}) {
  const body = (
    <>
      <span className="block text-[11px] font-semibold text-fr-v2-graphite">{label}</span>
      {value !== undefined ? (
        <span className="mt-1 block font-display text-2xl leading-none tabular-nums text-fr-v2-charcoal">{value}</span>
      ) : null}
      <span className={cn("mt-1 block text-[10px] leading-snug", value !== undefined ? "text-fr-v2-muted" : "text-fr-v2-muted italic")}>{detail}</span>
      <span aria-hidden className={cn("mx-auto mt-2.5 block h-[3px] w-10 opacity-75", ruleClassName)} />
    </>
  );
  const className = "block px-2 py-4 text-center lg:py-5";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors duration-[160ms] hover:bg-white motion-reduce:transition-none")}>
      {body}
    </Link>
  ) : (
    <div className={cn(className, "opacity-80")} aria-disabled="true">
      {body}
    </div>
  );
}
