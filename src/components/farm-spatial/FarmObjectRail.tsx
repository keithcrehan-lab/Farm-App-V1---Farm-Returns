"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FarmObjectRailCounts } from "@/domain/farm-stats";
import type { Housing, LivestockGroup } from "@/domain/types";
import {
  FARM_OBJECT_UNAVAILABLE_NOTE,
  INDIVIDUAL_ANIMAL_FIELDS,
  cattleGroupRows,
  shedRows,
  type FarmObjectId,
} from "@/lib/farm-spatial-object-rail";

/**
 * Farm Spatial V2 — the persistent object rail: Cattle, Sheep, Sheds
 * (DESIGN_CONTRACT "Object rail"; IMPLEMENTATION_MAP §8). Sheds live here,
 * never as map markers.
 *
 * Counts come only from persisted groups/housing
 * (`calculateFarmObjectRailCounts`). Sheep have no category in the farm
 * model, so Sheep is an explicit "not yet supported" shell with no count.
 *
 * Phase 6 — object before form: selecting an object opens its inspection
 * panel (a disclosure, not a modal) instead of leaving the map. Cattle
 * lists the real groups (head count with provenance, housed shed or an
 * honest "field not recorded") and the planned individual animal detail
 * as information architecture only; Sheds lists real sheds with
 * `calculateShedOccupancy`; Sheep explains why nothing is shown. Rows come
 * from `farm-spatial-object-rail.ts`, which derives nothing itself.
 * Desktop: the panel opens over the map's right edge beside the rail.
 * Mobile: it opens under the three-column band. Escape or the close
 * button closes it; motion collapses under reduced motion.
 *
 * Asset strategy: no approved production silhouette asset exists yet
 * (IMPLEMENTATION_MAP §8). Rather than drawing crude animal SVGs or using
 * emoji, each object is typography-led with its domain colour rule
 * (plum for livestock, clay for housing). An approved silhouette set can
 * slot in beside each label later without changing this data contract.
 */
export function FarmObjectRail({
  counts,
  livestockGroups,
  housing,
  className,
}: {
  counts: FarmObjectRailCounts;
  livestockGroups: readonly LivestockGroup[];
  housing: readonly Housing[];
  className?: string;
}) {
  const [selected, setSelected] = useState<FarmObjectId | undefined>(undefined);
  const panelId = useId();
  const cattleDetail =
    counts.cattleGroupCount === 0
      ? "None recorded"
      : `${counts.cattleGroupCount} ${counts.cattleGroupCount === 1 ? "group" : "groups"}`;

  function toggle(id: FarmObjectId) {
    setSelected((current) => (current === id ? undefined : id));
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && selected) {
      event.stopPropagation();
      setSelected(undefined);
    }
  }

  const objectProps = (id: FarmObjectId) => ({
    selected: selected === id,
    onSelect: () => toggle(id),
    panelId,
  });

  return (
    <nav aria-label="Farm objects" onKeyDown={onKeyDown} className={cn("relative bg-fr-v2-paper", className)}>
      <div className="grid grid-cols-3 divide-x divide-fr-v2-rule lg:flex lg:flex-col lg:divide-x-0 lg:divide-y lg:px-3 lg:pt-5">
        <p className="hidden pb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted lg:block">On the farm</p>
        <RailObject {...objectProps("cattle")} label="Cattle" value={counts.cattleGroupCount === 0 ? undefined : String(counts.cattleHeadCount)} detail={cattleDetail} ruleClassName="bg-fr-v2-plum" />
        <RailObject {...objectProps("sheep")} label="Sheep" detail="Not yet supported" ruleClassName="bg-fr-v2-plum/40" />
        <RailObject
          {...objectProps("sheds")}
          label="Sheds"
          value={counts.shedCount === 0 ? undefined : String(counts.shedCount)}
          detail={counts.shedCount === 0 ? "None recorded" : counts.shedCount === 1 ? "shed" : "sheds"}
          ruleClassName="bg-fr-v2-clay"
        />
      </div>
      {selected ? (
        <FarmObjectPanel id={panelId} objectId={selected} livestockGroups={livestockGroups} housing={housing} onClose={() => setSelected(undefined)} />
      ) : null}
    </nav>
  );
}

function RailObject({
  label,
  value,
  detail,
  ruleClassName,
  selected,
  onSelect,
  panelId,
}: {
  label: string;
  /** Absent when there is no real count to show — never a fabricated 0. */
  value?: string;
  detail: string;
  ruleClassName: string;
  selected: boolean;
  onSelect: () => void;
  panelId: string;
}) {
  // Phase 02B: a left-aligned typographic row with a short domain-colour
  // rule beside the label — denser rhythm, no centred card stack. Phase 6:
  // the rule lengthens and the row lifts to white while selected.
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      aria-controls={selected ? panelId : undefined}
      data-rail-object={label.toLowerCase()}
      className={cn(
        "block min-w-0 px-3 py-3 text-left transition-colors duration-[160ms] hover:bg-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fr-v2-forest motion-reduce:transition-none lg:px-0 lg:py-3.5",
        selected && "bg-white",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-fr-v2-graphite">
        <span aria-hidden className={cn("w-[3px] shrink-0 transition-[height] duration-[160ms] motion-reduce:transition-none", selected ? "h-4" : "h-3", ruleClassName)} />
        {label}
      </span>
      {value !== undefined ? (
        <span className="mt-1.5 block font-display text-[28px] leading-none tabular-nums text-fr-v2-charcoal">{value}</span>
      ) : null}
      <span className={cn("mt-1 block text-[10.5px] leading-snug text-fr-v2-muted", value === undefined && "italic")}>{detail}</span>
    </button>
  );
}

const PANEL_TITLE: Record<FarmObjectId, string> = { cattle: "Cattle groups", sheep: "Sheep", sheds: "Sheds" };
const PANEL_RULE: Record<FarmObjectId, string> = { cattle: "bg-fr-v2-plum", sheep: "bg-fr-v2-plum/40", sheds: "bg-fr-v2-clay" };

function FarmObjectPanel({
  id,
  objectId,
  livestockGroups,
  housing,
  onClose,
}: {
  id: string;
  objectId: FarmObjectId;
  livestockGroups: readonly LivestockGroup[];
  housing: readonly Housing[];
  onClose: () => void;
}) {
  const groups = useMemo(() => cattleGroupRows(livestockGroups, housing), [livestockGroups, housing]);
  const sheds = useMemo(() => shedRows(housing, livestockGroups), [housing, livestockGroups]);
  return (
    <section
      id={id}
      aria-label={PANEL_TITLE[objectId]}
      data-object-panel={objectId}
      className="flex border-t border-fr-v2-rule bg-white transition-[opacity,translate] duration-[160ms] ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none lg:absolute lg:inset-y-0 lg:right-full lg:z-30 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:shadow-[var(--fr-v2-shadow-overlay)]"
    >
      <span aria-hidden className={cn("w-[3px] shrink-0", PANEL_RULE[objectId])} />
      <div className="min-w-0 flex-1 px-4 pb-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl leading-tight text-fr-v2-charcoal">{PANEL_TITLE[objectId]}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${PANEL_TITLE[objectId]}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-[2px] text-fr-v2-muted transition-colors duration-[160ms] hover:bg-fr-v2-paper hover:text-fr-v2-graphite focus-visible:outline-2 focus-visible:outline-fr-v2-forest motion-reduce:transition-none"
          >
            <X className="size-4" />
          </button>
        </div>

        {objectId === "cattle" ? (
          <>
            {groups.length === 0 ? (
              <p className="mt-2 text-sm text-fr-v2-muted">No cattle groups recorded.</p>
            ) : (
              <ul className="mt-2 divide-y divide-fr-v2-rule border-y border-fr-v2-rule">
                {groups.map((group) => (
                  <li key={group.id}>
                    <Link href={group.href} className="block py-2.5 transition-colors duration-[160ms] hover:bg-fr-v2-paper focus-visible:outline-2 focus-visible:outline-fr-v2-forest motion-reduce:transition-none">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-semibold text-fr-v2-graphite">{group.label}</span>
                        <span className={cn("shrink-0 text-sm font-semibold tabular-nums", group.headMissing ? "text-fr-v2-muted" : "text-fr-v2-charcoal")}>
                          {group.head}
                          {group.headBasis ? <span className="ml-1.5 text-[11px] font-medium text-fr-v2-muted">{group.headBasis}</span> : null}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-fr-v2-muted">
                        {group.category} · <span className={cn(group.locationMissing && "italic")}>{group.location}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4" data-individual-animal-ia>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">Individual animal detail · planned</p>
              <p className="mt-1 text-xs leading-snug text-fr-v2-muted">What an animal&apos;s detail will hold. No animal record is shown here.</p>
              <dl className="mt-2 divide-y divide-fr-v2-rule border-y border-fr-v2-rule">
                {INDIVIDUAL_ANIMAL_FIELDS.map((field) => (
                  <div key={field.label} className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="shrink-0 text-xs font-semibold text-fr-v2-graphite">{field.label}</dt>
                    <dd className={cn("min-w-0 text-right text-[11px] leading-snug", field.available ? "text-fr-v2-charcoal" : "italic text-fr-v2-muted")}>{field.status}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        ) : null}

        {objectId === "sheds" ? (
          sheds.length === 0 ? (
            <p className="mt-2 text-sm text-fr-v2-muted">No sheds recorded.</p>
          ) : (
            <ul className="mt-2 divide-y divide-fr-v2-rule border-y border-fr-v2-rule">
              {sheds.map((shed) => (
                <li key={shed.id} className="py-2.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-fr-v2-graphite">{shed.name}</span>
                    <span className="shrink-0 text-xs text-fr-v2-muted">{shed.type}</span>
                  </span>
                  <span className={cn("mt-0.5 block text-xs tabular-nums", shed.occupancyMissing ? "italic text-fr-v2-muted" : "text-fr-v2-charcoal")}>{shed.occupancy}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        <p className="mt-3 text-xs leading-snug text-fr-v2-muted">{FARM_OBJECT_UNAVAILABLE_NOTE[objectId]}</p>

        {objectId !== "sheep" ? (
          <p className="mt-3">
            <Link
              href={objectId === "cattle" ? "/livestock" : "/housing"}
              className="text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-forest/40 underline-offset-[3px] transition-colors duration-[160ms] hover:decoration-fr-v2-forest motion-reduce:transition-none"
            >
              {objectId === "cattle" ? "Livestock" : "Housing"} →
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
