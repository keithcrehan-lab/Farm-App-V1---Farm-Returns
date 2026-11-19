"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { FarmObjectPanel } from "@/components/farm-spatial/FarmObjectRail";
import type { FarmObjectRailCounts } from "@/domain/farm-stats";
import type { Housing, LivestockGroup } from "@/domain/types";

/**
 * Farm Overview mobile — "Your Farm" (owner decision 2026-11-19, Option B
 * with parts of C). A compact, collapsible summary panel that sits on the
 * map directly above the lens switcher on a phone, replacing the object
 * strip that used to sit below the map (invisible until the farmer
 * scrolled). Desktop keeps the persistent `FarmObjectRail` beside the map,
 * so this panel is `lg:hidden` and the two never show together.
 *
 * Renders the caller's already-computed real figures only:
 *  - fields: the active field list's own length, mapped count and area
 *    (`calculateActiveFarmAreaHa`);
 *  - cattle/sheds: `calculateFarmObjectRailCounts` — the same counts the rail
 *    shows. No recorded group/shed is "None recorded", never a fabricated 0;
 *  - grass: the Grass view's own farm average cover, only when that view has
 *    real loaded records; otherwise no figure at all.
 *
 * Cattle and Sheds open the rail's own `FarmObjectPanel` (the identical real
 * group/shed detail, with its links to /cattle and /housing). Fields and
 * Grass go to their canonical screens. Escape closes an open detail first,
 * then the panel. Motion collapses under reduced motion.
 */
export interface FarmYourFarmPanelProps {
  counts: FarmObjectRailCounts;
  /** Active (non-archived) field count. */
  fieldCount: number;
  /** Active fields with a real boundary. */
  mappedFieldCount: number;
  /** `calculateActiveFarmAreaHa` — `null` when there is no active field. */
  farmAreaHa: number | null;
  livestockGroups: readonly LivestockGroup[];
  housing: readonly Housing[];
  /** The Grass view's real farm average cover, when it has been loaded. */
  grassAverageCoverKgDmHa?: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
}

type DetailId = "cattle" | "sheds";

/** The collapsed one-line summary: real counts, honest "none recorded". */
export function yourFarmSummaryParts({
  counts,
  fieldCount,
}: Pick<FarmYourFarmPanelProps, "counts" | "fieldCount">): string[] {
  return [
    fieldCount === 0 ? "No fields yet" : `${fieldCount} ${fieldCount === 1 ? "field" : "fields"}`,
    counts.cattleGroupCount === 0 ? "No cattle recorded" : `${formatNumber(counts.cattleHeadCount, 0)} cattle`,
    counts.shedCount === 0 ? "No sheds recorded" : `${counts.shedCount} ${counts.shedCount === 1 ? "shed" : "sheds"}`,
  ];
}

export function FarmYourFarmPanel({
  counts,
  fieldCount,
  mappedFieldCount,
  farmAreaHa,
  livestockGroups,
  housing,
  grassAverageCoverKgDmHa,
  expanded,
  onExpandedChange,
  className,
}: FarmYourFarmPanelProps) {
  const bodyId = useId();
  const detailId = useId();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [detail, setDetail] = useState<DetailId | undefined>(undefined);
  const summary = yourFarmSummaryParts({ counts, fieldCount });

  function setExpanded(next: boolean) {
    if (!next) setDetail(undefined);
    onExpandedChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    if (detail) {
      event.stopPropagation();
      setDetail(undefined);
      return;
    }
    if (expanded) {
      event.stopPropagation();
      setExpanded(false);
      toggleRef.current?.focus();
    }
  }

  const fieldsDetail =
    fieldCount === 0
      ? "None recorded"
      : [
          mappedFieldCount === fieldCount ? `${mappedFieldCount} mapped` : `${mappedFieldCount} of ${fieldCount} mapped`,
          farmAreaHa !== null ? `${formatNumber(farmAreaHa, 1)} ha` : undefined,
        ]
          .filter(Boolean)
          .join(" · ");
  const cattleDetail =
    counts.cattleGroupCount === 0 ? "None recorded" : `head · ${counts.cattleGroupCount} ${counts.cattleGroupCount === 1 ? "group" : "groups"}`;
  const shedsDetail = counts.shedCount === 0 ? "None recorded" : counts.shedCount === 1 ? "shed" : "sheds";

  return (
    <section
      aria-label="Your Farm"
      data-your-farm
      data-expanded={expanded ? "true" : "false"}
      onKeyDown={onKeyDown}
      className={cn(
        "w-full overflow-hidden rounded-[14px] border border-white/12 bg-fr-v2-forest-deep/88 text-white shadow-[0_10px_28px_rgba(0,0,0,0.3)] backdrop-blur-md",
        className,
      )}
    >
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fr-v2-straw"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-straw">Your Farm</span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold leading-snug tabular-nums text-white" data-your-farm-summary>
            {summary.join(" · ")}
          </span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8">
          <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-[180ms] motion-reduce:transition-none", expanded ? "rotate-180" : "rotate-0")} />
          <span className="sr-only">{expanded ? "Hide farm summary" : "Show farm summary"}</span>
        </span>
      </button>

      <div
        id={bodyId}
        hidden={!expanded}
        className="max-h-[min(50dvh,420px)] overflow-y-auto overscroll-contain border-t border-white/10"
        data-your-farm-body
      >
        {expanded ? (
          <div className="flex flex-col gap-2 px-2.5 pb-2.5 pt-2.5">
            <ul className="grid grid-cols-2 gap-2" aria-label="Farm summary">
              <li>
                <SummaryCard href="/fields" label="Fields" value={fieldCount === 0 ? undefined : String(fieldCount)} detail={fieldsDetail} ruleClassName="bg-fr-v2-straw" />
              </li>
              <li>
                <SummaryCard
                  label="Cattle"
                  value={counts.cattleGroupCount === 0 ? undefined : formatNumber(counts.cattleHeadCount, 0)}
                  detail={cattleDetail}
                  ruleClassName="bg-fr-v2-plum"
                  pressed={detail === "cattle"}
                  controls={detailId}
                  onPress={() => setDetail((current) => (current === "cattle" ? undefined : "cattle"))}
                />
              </li>
              <li>
                <SummaryCard
                  label="Sheds"
                  value={counts.shedCount === 0 ? undefined : String(counts.shedCount)}
                  detail={shedsDetail}
                  ruleClassName="bg-fr-v2-clay"
                  pressed={detail === "sheds"}
                  controls={detailId}
                  onPress={() => setDetail((current) => (current === "sheds" ? undefined : "sheds"))}
                />
              </li>
              <li>
                <SummaryCard
                  href="/grass"
                  label="Grass"
                  value={grassAverageCoverKgDmHa === undefined ? undefined : formatNumber(grassAverageCoverKgDmHa, 0)}
                  detail={grassAverageCoverKgDmHa === undefined ? "Cover, growth & walks" : "kg DM/ha avg."}
                  ruleClassName="bg-fr-v2-forest"
                />
              </li>
            </ul>
            {detail ? (
              <div className="overflow-hidden rounded-[10px]" data-your-farm-detail={detail}>
                <FarmObjectPanel id={detailId} objectId={detail} livestockGroups={livestockGroups} housing={housing} onClose={() => setDetail(undefined)} className="border-t-0" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  ruleClassName,
  href,
  pressed,
  controls,
  onPress,
}: {
  label: string;
  /** Absent when there is no real figure — never a fabricated 0. */
  value?: string;
  detail: string;
  ruleClassName: string;
  href?: string;
  pressed?: boolean;
  controls?: string;
  onPress?: () => void;
}) {
  const className = cn(
    "flex min-h-[60px] w-full min-w-0 items-center gap-2 rounded-[10px] border border-white/10 bg-white/6 px-3 py-2 text-left transition-colors duration-[160ms] hover:bg-white/12 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fr-v2-straw motion-reduce:transition-none",
    pressed && "border-white/30 bg-white/14",
  );
  const content: ReactNode = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
          <span aria-hidden className={cn("h-3 w-[3px] shrink-0", ruleClassName)} />
          {label}
        </span>
        <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
          {value !== undefined ? <span className="font-display text-[22px] leading-none tabular-nums text-white">{value}</span> : null}
          <span className={cn("min-w-0 truncate text-[10.5px] leading-snug text-white/65", value === undefined && "italic")}>{detail}</span>
        </span>
      </span>
      {href ? (
        <ChevronRight aria-hidden className="size-4 shrink-0 text-white/55" />
      ) : (
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-white/55 transition-transform duration-[160ms] motion-reduce:transition-none", pressed && "rotate-180")} />
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className} data-your-farm-card={label.toLowerCase()}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onPress} aria-expanded={pressed} aria-controls={pressed ? controls : undefined} className={className} data-your-farm-card={label.toLowerCase()}>
      {content}
    </button>
  );
}
