"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { fieldWorkspaceHref } from "@/lib/farm-spatial-field-lens";
import {
  FARM_TODAY_EMPTY_CAVEAT,
  FARM_TODAY_INITIAL_VISIBLE,
  type FarmTodayFieldGroup,
  type FarmTodayTopic,
  type FarmTodayView,
} from "@/lib/farm-today-overview";
import type { Prompt } from "@/orchestration/prompt";
import type { TodayOpportunity } from "@/orchestration/prompt/today-opportunities";

/**
 * Farm Overview Phase 1 — the compact, expandable "Farm Today" panel shown
 * over the map while Overview is the active view
 * (`FARM_OVERVIEW_SMART_HYBRID_PHASE1_BRIEF_20261119.md` §"Farm Today UX").
 *
 * Renders the caller's already-built `FarmTodayView` (`farm-today-overview.ts`)
 * and derives nothing. Farm-wide topics say "Farm-wide" and open their
 * existing opportunity sheet; field actions name their own field and
 * select it on the map (the caller's existing selection/fly-to). The
 * selected field's own actions are marked here, so map → panel and
 * panel → map stay in step. Loading, unavailable and empty states are
 * distinct and honest; nothing is sampled or assumed.
 */
export interface FarmTodayPanelProps {
  view: FarmTodayView;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  selectedFieldId?: string;
  selectedFieldName?: string;
  onSelectField: (fieldId: string) => void;
  onOpenTopic: (opportunity: TodayOpportunity) => void;
  onViewBasis: (prompt: Prompt) => void;
  /** Opens the existing What matters disclosure (all topics and prompts). */
  onOpenDetails?: () => void;
  className?: string;
}

type ListItem =
  | { type: "topic"; key: string; topic: FarmTodayTopic; group: "attention" | "later" }
  | { type: "field"; key: string; group: FarmTodayFieldGroup };

const GROUP_HEADING: Record<"attention" | "field" | "later", string> = {
  attention: "Farm-wide",
  field: "Field actions",
  later: "On record · not urgent",
};

export function FarmTodayPanel({
  view,
  expanded,
  onExpandedChange,
  selectedFieldId,
  selectedFieldName,
  onSelectField,
  onOpenTopic,
  onViewBasis,
  onOpenDetails,
  className,
}: FarmTodayPanelProps) {
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items: ListItem[] = [
    ...view.attentionTopics.map((topic) => ({ type: "topic" as const, key: topic.key, topic, group: "attention" as const })),
    ...view.fieldGroups.map((group) => ({ type: "field" as const, key: `field:${group.fieldId}`, group })),
    ...view.laterTopics.map((topic) => ({ type: "topic" as const, key: topic.key, topic, group: "later" as const })),
  ];
  const visible = showAll ? items : items.slice(0, FARM_TODAY_INITIAL_VISIBLE);
  const hiddenCount = items.length - visible.length;
  const selectedGroup = selectedFieldId ? view.fieldGroups.find((g) => g.fieldId === selectedFieldId) : undefined;
  // A selected field further down the list is always shown.
  const selectedHidden = Boolean(selectedGroup && !visible.some((i) => i.type === "field" && i.group.fieldId === selectedGroup.fieldId));

  // Panel follows map selection: bring the selected field's actions into view.
  useEffect(() => {
    if (!expanded || !selectedFieldId) return;
    const node = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-farm-today-field]") ?? []).find((el) => el.dataset.farmTodayField === selectedFieldId);
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
  }, [expanded, selectedFieldId]);

  const ready = view.status === "ready";
  const empty = ready && view.attentionTopics.length === 0 && view.fieldActionCount === 0;

  return (
    <section
      aria-label="Farm Today"
      data-farm-today
      data-state={empty ? "empty" : view.status}
      data-expanded={expanded ? "true" : "false"}
      className={cn(
        "w-full overflow-hidden rounded-[14px] border border-white/12 bg-fr-v2-forest-deep/88 text-white shadow-[0_10px_28px_rgba(0,0,0,0.3)] backdrop-blur-md",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => onExpandedChange(!expanded)}
        className="flex min-h-11 w-full items-start gap-3 px-3.5 pb-2 pt-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fr-v2-straw"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-straw">Farm Today</span>
          <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-white" data-farm-today-summary aria-live="polite">
            {view.summary}
          </span>
        </span>
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8">
          <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-[180ms] motion-reduce:transition-none", expanded ? "rotate-180" : "rotate-0")} />
          <span className="sr-only">{expanded ? "Hide Farm Today actions" : "Show Farm Today actions"}</span>
        </span>
      </button>

      {!expanded ? (
        <CollapsedBody
          view={view}
          empty={empty}
          selectedGroup={selectedGroup}
          selectedFieldId={selectedFieldId}
          selectedFieldName={selectedFieldName}
        />
      ) : null}

      <div id={listId} hidden={!expanded} ref={listRef} className="max-h-[min(48dvh,420px)] overflow-y-auto overscroll-contain border-t border-white/10" data-farm-today-list>
        {expanded ? (
          <div className="flex flex-col px-3.5 pb-3 pt-2">
            {view.status === "loading" ? (
              <p className="py-2 text-xs text-white/70" aria-busy="true">Checking this farm&apos;s records…</p>
            ) : view.status === "unavailable" ? (
              <p className="py-2 text-xs text-white/75">{view.message}</p>
            ) : (
              <>
                {empty ? <p className="py-2 text-xs leading-snug text-white/75">{FARM_TODAY_EMPTY_CAVEAT}</p> : null}
                {[...visible, ...(selectedHidden && selectedGroup ? [{ type: "field" as const, key: `field:${selectedGroup.fieldId}`, group: selectedGroup }] : [])].map((item, index, all) => {
                  const groupKey = item.type === "field" ? "field" : item.group;
                  const previous = all[index - 1];
                  const previousKey = previous ? (previous.type === "field" ? "field" : previous.group) : undefined;
                  return (
                    <div key={item.key}>
                      {groupKey !== previousKey ? (
                        <p className="mb-1 mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                          {GROUP_HEADING[groupKey]}
                          {groupKey === "field" ? <span className="normal-case tracking-normal text-white/45">{" · by field name, not ranked"}</span> : null}
                        </p>
                      ) : null}
                      {item.type === "topic" ? (
                        <TopicRow topic={item.topic} quiet={item.group === "later"} onOpen={() => onOpenTopic(item.topic.opportunity)} />
                      ) : (
                        <FieldGroupRow
                          group={item.group}
                          selected={item.group.fieldId === selectedFieldId}
                          onSelect={() => onSelectField(item.group.fieldId)}
                          onViewBasis={onViewBasis}
                        />
                      )}
                    </div>
                  );
                })}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {hiddenCount > 0 ? (
                    <button type="button" onClick={() => setShowAll(true)} className="min-h-9 text-xs font-semibold text-white underline decoration-white/35 underline-offset-[3px] hover:decoration-white">
                      {`Show ${hiddenCount} more`}
                    </button>
                  ) : null}
                  {onOpenDetails ? (
                    <button type="button" onClick={onOpenDetails} className="min-h-9 text-xs font-semibold text-white/80 underline decoration-white/25 underline-offset-[3px] hover:text-white">
                      Details &amp; all prompts
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CollapsedBody({
  view,
  empty,
  selectedGroup,
  selectedFieldId,
  selectedFieldName,
}: {
  view: FarmTodayView;
  empty: boolean;
  selectedGroup?: FarmTodayFieldGroup;
  selectedFieldId?: string;
  selectedFieldName?: string;
}) {
  if (view.status === "loading") {
    return (
      <div className="px-3.5 pb-3" aria-busy="true">
        <div className="h-3 w-3/4 animate-pulse rounded bg-white/15 motion-reduce:animate-none" />
      </div>
    );
  }
  if (view.status === "unavailable") return <p className="line-clamp-2 px-3.5 pb-3 text-xs leading-snug text-white/72">{view.message}</p>;
  if (selectedFieldId && selectedFieldName) {
    return (
      <p className="line-clamp-2 px-3.5 pb-3 text-xs leading-snug text-white/85" data-farm-today-selected>
        {selectedGroup
          ? `${selectedFieldName} · ${selectedGroup.actions.map((a) => a.typeLabel).join(", ")} — ${selectedGroup.actions[0].title}`
          : `${selectedFieldName} · no field action on record`}
      </p>
    );
  }
  if (empty) return <p className="line-clamp-2 px-3.5 pb-3 text-xs leading-snug text-white/72">{FARM_TODAY_EMPTY_CAVEAT}</p>;
  const lead = view.lead;
  if (!lead) return null;
  return (
    <div className="px-3.5 pb-3" data-farm-today-lead>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
        {lead.kind === "topic" ? `${lead.topic.priorityLabel} · Farm-wide · ${lead.topic.categoryLabel}` : `Field action · ${lead.group.fieldName}`}
      </p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/88">
        {lead.kind === "topic" ? lead.topic.headline : lead.group.actions[0].title}
      </p>
    </div>
  );
}

function TopicRow({ topic, quiet, onOpen }: { topic: FarmTodayTopic; quiet: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-farm-today-topic={topic.category}
      className={cn(
        "flex w-full min-h-11 flex-col items-start gap-0.5 border-b border-white/8 py-2 text-left last:border-b-0 focus-visible:outline-2 focus-visible:outline-fr-v2-straw",
        quiet ? "opacity-80" : "",
      )}
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">{`Farm-wide · ${topic.categoryLabel} · ${topic.priorityLabel}`}</span>
      <span className="text-[13px] font-semibold leading-snug text-white">{topic.headline}</span>
      {topic.blocker ? <span className="text-[11.5px] leading-snug text-fr-v2-clay-tint">{`Blocked now: ${topic.blocker}`}</span> : null}
      {topic.evidence ? <span className="text-[11px] leading-snug text-white/55">{`Evidence: ${topic.evidence}`}</span> : null}
    </button>
  );
}

function FieldGroupRow({
  group,
  selected,
  onSelect,
  onViewBasis,
}: {
  group: FarmTodayFieldGroup;
  selected: boolean;
  onSelect: () => void;
  onViewBasis: (prompt: Prompt) => void;
}) {
  return (
    <div
      data-farm-today-field={group.fieldId}
      aria-current={selected ? "true" : undefined}
      className={cn("flex border-b border-white/8 py-2 last:border-b-0", selected && "-mx-1.5 rounded-[10px] bg-white/8 px-1.5")}
    >
      <span aria-hidden className={cn("mr-2 w-[3px] shrink-0 rounded-full", selected ? "bg-fr-v2-straw" : "bg-transparent")} />
      <div className="min-w-0 flex-1">
        {group.mapped ? (
          <button type="button" onClick={onSelect} className="flex min-h-9 w-full items-center gap-1.5 text-left text-[13px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-fr-v2-straw">
            <MapPin aria-hidden className="size-3.5 shrink-0 text-fr-v2-straw" />
            <span className="min-w-0 truncate">{`${group.fieldName} · show on map`}</span>
          </button>
        ) : (
          <Link href={fieldWorkspaceHref(group.fieldId)} className="flex min-h-9 items-center text-[13px] font-semibold text-white underline decoration-white/30 underline-offset-[3px]">
            {`${group.fieldName} · not mapped, open field`}
          </Link>
        )}
        <ul className="mt-0.5 flex flex-col gap-1.5">
          {group.actions.map((action) => (
            <li key={action.key} data-farm-today-action={action.kind}>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">{`${action.typeLabel} · this field`}</p>
              <p className="text-[12.5px] leading-snug text-white/90">{action.title}</p>
              <p className="text-[11px] leading-snug text-white/55">
                {action.evidence}
                {" · "}
                <button type="button" onClick={() => onViewBasis(action.prompt)} className="font-semibold text-white/80 underline decoration-white/30 underline-offset-2 hover:text-white">
                  View basis
                </button>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
