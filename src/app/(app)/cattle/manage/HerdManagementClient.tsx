"use client";

/**
 * Pilot Integration P3 — Cattle → Manage herd (`/cattle/manage`), DECISIONS D14. One source of truth per fact: this
 * screen edits only what the group record owns (name, breed, and the headcount while no animal is recorded
 * individually) and adds groups and animals. Location, housing, weight and production target are shown read-only from
 * their owning records (`manage-herd-view.ts`, loaded server-side) and changed in their own workflows — the group
 * workspace (`/cattle/groups/<id>`: moves, animals and weighings, production plan) and Housing. It writes through the
 * existing livestock actions, which resolve the farm server-side. Real (signed-in) mode only.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { LivestockHeroCard } from "@/components/farm/LivestockHeroCard";
import { LivestockGroupCard } from "@/components/farm/LivestockGroupCard";
import { finishingOptionsForGroup } from "@/domain/livestock";
import { AddAnimalCard } from "@/components/farm/AddAnimalCard";
import { BackLink } from "@/components/cattle/ui";
import { useFarm, useFarmActions, useHousingList, useLivestockGroups } from "@/store/farm-store";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { LivestockCategory } from "@/domain/types";
import type { ManageHerdContext, ManageHerdFact, ManageHerdGroupContext } from "@/server/cattle-real/manage-herd-view";

const LOCAL_TABS = ["Overview", "Groups"] as const;
export type Tab = (typeof LOCAL_TABS)[number];

const CATEGORY_LABEL: Record<LivestockCategory, string> = {
  suckler_cow: "Suckler cow",
  dairy_cow: "Dairy cow",
  bull: "Bull",
  calf: "Calf",
  weanling: "Weanling",
  store: "Store",
  steer: "Steer",
  heifer: "Heifer",
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as LivestockCategory[];

/** The older group-record goal, shown only as labelled legacy context (production targets live in the group's plan). */
const GOAL_LABEL: Record<string, string> = {
  maintain: "Maintain",
  grow: "Grow",
  breed: "Breed",
  sell_store: "Sell as store",
  finish_slaughter: "Finish to slaughter",
};

/**
 * Not farmer-entered: `livestock_groups.system` is required by the schema and the create action, so a new group takes
 * the form's long-standing baseline. Where the group actually is comes from its field movements (and Housing), recorded
 * in their own workflows; Manage herd labels this stored value as the group record's, never as a movement.
 */
const NEW_GROUP_BASELINE_SYSTEM = "grazing" as const;

const EMPTY_CONTEXT: ManageHerdContext = { state: "UNAVAILABLE", groups: {} };

export function HerdManagementClient({ farmId, initialTab, context = EMPTY_CONTEXT }: { farmId: string; initialTab: Tab; context?: ManageHerdContext }) {
  const farm = useFarm();
  const router = useRouter();
  const livestockGroups = useLivestockGroups();
  const housingList = useHousingList();
  const { addLivestockGroup } = useFarmActions();
  const [tab, setTab] = useState<Tab>(initialTab);

  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<LivestockCategory>("suckler_cow");
  const [newCount, setNewCount] = useState("");

  async function handleAddGroup(e: FormEvent) {
    e.preventDefault();
    const count = Number(newCount);
    if (!newLabel.trim() || !Number.isFinite(count) || count <= 0) return;
    // addLivestockGroup resolves a Promise — in real mode the new group's
    // id comes from Postgres, not a client-generated placeholder.
    await addLivestockGroup({
      label: newLabel.trim(),
      category: newCategory,
      count,
      system: NEW_GROUP_BASELINE_SYSTEM,
    });
    setNewLabel("");
    setNewCategory("suckler_cow");
    setNewCount("");
    setAddOpen(false);
    // Re-read the server context so the new group's records (none yet) are known, not "couldn't be read".
    router.refresh();
  }

  return (
    <>
      <BackLink href="/cattle" label="Cattle" />
      <PageHeader title="Manage herd" subtitle="Group records and new animals. Moves, weighings and production goals are recorded in each group's workspace." />
      <h1 className="mb-3 text-title text-fr-ink-900 lg:hidden">Manage herd</h1>

      <div className="mb-4 flex gap-5 border-b border-fr-border">
        {LOCAL_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 pb-2.5 text-sm font-medium transition-colors",
              tab === t
                ? "border-fr-green-700 text-fr-green-700"
                : "border-transparent text-fr-ink-400 hover:text-fr-ink-600",
            )}
          >
            {t}
          </button>
        ))}
        {/* Housing is its own screen (spec: "contextual" route), not a tab panel */}
        <Link
          href="/housing"
          className="border-b-2 border-transparent pb-2.5 text-sm font-medium text-fr-ink-400 hover:text-fr-ink-600"
        >
          Housing
        </Link>
      </div>

      {tab === "Overview" ? (
        <div className="flex flex-col gap-4">
          <LivestockHeroCard />
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
            {livestockGroups.map((group) => (
              <LivestockGroupCard
                key={group.id}
                group={group}
                hasEconomics={finishingOptionsForGroup(group).status === "OK"}
              />
            ))}
          </div>

          <AddAnimalCard farmId={farmId} groups={livestockGroups} />

          {addOpen ? (
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-fr-ink-900">Add livestock group</p>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="text-fr-ink-400 hover:text-fr-ink-600"
                  aria-label="Cancel"
                >
                  <X className="size-4" />
                </button>
              </div>
              <form onSubmit={handleAddGroup} className="flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-fr-ink-600">Group name</span>
                  <input
                    type="text"
                    required
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Spring Calves"
                    className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Category</span>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as LivestockCategory)}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Count</span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={newCount}
                      onChange={(e) => setNewCount(e.target.value)}
                      placeholder="e.g. 12"
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    />
                  </label>
                </div>
                <p className="text-xs text-fr-ink-400">
                  Count is confirmed by you. After adding, record moves, weighings and the production goal in the group&apos;s workspace.
                </p>
                <button
                  type="submit"
                  className="rounded-fr-control bg-fr-green-700 py-2.5 text-sm font-semibold text-white"
                >
                  Add group
                </button>
              </form>
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-3 text-sm font-semibold text-fr-green-700 hover:border-fr-green-700"
            >
              <Plus className="size-4" />
              Add New Group
            </button>
          )}
        </div>
      ) : (
        <GroupsTab groups={livestockGroups} housingList={housingList} farmerName={farm.ownerName} context={context} />
      )}
    </>
  );
}

type Group = ReturnType<typeof useLivestockGroups>[number];

const TRACKED_STATUS_LABEL: Record<string, string> = {
  verified: "confirmed",
  farmer_adjusted: "entered by hand",
  estimated: "estimate",
  mapped: "mapped",
  unavailable: "unavailable",
};

function SectionLabel({ children }: { children: string }) {
  return <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">{children}</p>;
}

function ReadRow({ label, value, detail, testId }: { label: string; value: string; detail?: string; testId?: string }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[150px_1fr] sm:gap-4" data-manage-fact={testId}>
      <dt className="text-xs text-fr-ink-600">{label}</dt>
      <dd>
        <p className="text-sm font-semibold text-fr-ink-900">{value}</p>
        {detail ? <p className="mt-0.5 text-xs text-fr-ink-400">{detail}</p> : null}
      </dd>
    </div>
  );
}

function factValue(fact: ManageHerdFact, notRecorded = "Not recorded"): { value: string; detail: string } {
  if (fact.state === "KNOWN") return { value: fact.value, detail: fact.detail };
  return { value: fact.state === "UNAVAILABLE" ? "Unavailable" : notRecorded, detail: fact.detail };
}

function ActionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-1.5 rounded-fr-control border border-fr-green-700 px-3 text-sm font-semibold text-fr-green-700">
      {children} <ArrowUpRight className="size-3.5" />
    </Link>
  );
}

/** The recorded group average, labelled as the group record's figure (never a weighing). */
function recordedAverageOf(group: Group): { value: string; detail: string } | null {
  const w = group.avgWeightKg;
  if (!w || !Number.isFinite(w.value)) return null;
  const status = TRACKED_STATUS_LABEL[w.status] ?? w.status;
  return { value: `${formatNumber(w.value, 0)} kg`, detail: `Recorded group average (older group record, ${status} · ${w.source}) — not a weighing` };
}

/**
 * Object-first group management. Each group opens to A) its own record (the only editable facts), B) its current
 * state and C) its production target — both read-only from their owning records, with links to where they change.
 * Not split/merge (that would divide one group's row while preserving history — a different feature).
 */
function GroupsTab({
  groups,
  housingList,
  farmerName,
  context,
}: {
  groups: ReturnType<typeof useLivestockGroups>;
  housingList: ReturnType<typeof useHousingList>;
  farmerName: string;
  context: ManageHerdContext;
}) {
  const { deleteLivestockGroup, updateLivestockGroup } = useFarmActions();
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [count, setCount] = useState("");
  const [breed, setBreed] = useState("");

  if (groups.length === 0) {
    return <p className="py-16 text-center text-sm text-fr-ink-400">No livestock groups yet — add one on the Overview tab.</p>;
  }

  function open(group: Group) {
    setOpenId(group.id);
    setDeleteConfirmId(null);
    setLabel(group.label);
    setCount(String(group.count.value));
    setBreed(group.breed ?? "");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-fr-border pb-4">
        <div>
          <SectionLabel>Livestock groups</SectionLabel>
          <p className="mt-1 text-sm text-fr-ink-600">Open a group to correct its record. Moves, weighings and goals are recorded in the group&apos;s workspace.</p>
        </div>
        <p className="text-xs text-fr-ink-400">{groups.length} group{groups.length === 1 ? "" : "s"}</p>
      </div>
      {context.state !== "OK" ? (
        <p className="text-xs text-fr-ink-400" data-manage-context={context.state}>
          Some linked records couldn&apos;t be read just now, so those details show as unavailable. The group records themselves are below.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {groups.map((group) => {
          const isOpen = openId === group.id;
          const ctx: ManageHerdGroupContext | undefined = context.groups[group.id];
          const individuals = ctx ? ctx.individuals : null;
          // Headcount is the group record's own fact only while no animal is recorded individually; unknown → not editable.
          const headcountEditable = individuals === 0;
          const workspace = `/cattle/groups/${encodeURIComponent(group.id)}`;
          const headline =
            individuals !== null && individuals > 0
              ? { value: formatNumber(individuals, 0), unit: individuals === 1 ? "animal recorded" : "animals recorded" }
              : { value: formatNumber(group.count.value, 0), unit: "head" };
          const linkedShed = group.housingId ? housingList.find((h) => h.id === group.housingId)?.shedName ?? "A shed (not found in Housing)" : null;
          const field = ctx ? factValue(ctx.currentField) : { value: "Unavailable", detail: "Field movements couldn't be read just now." };
          const hasField = ctx?.currentField.state === "KNOWN";
          const recordedAverage = recordedAverageOf(group);
          const target = ctx ? factValue(ctx.production.target, "No target set") : { value: "Unavailable", detail: "The production plan couldn't be read just now." };
          const adg = ctx ? factValue(ctx.production.requiredAdg) : null;
          const housedRelevant = group.system === "housed" || group.housingId !== undefined;

          return (
            <li key={group.id} className="overflow-hidden rounded-fr-card border border-fr-border bg-fr-surface" data-group-manage={group.id}>
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-fr-ink-900">{group.label}</p>
                    <span className="rounded-full bg-fr-surface-alt px-2.5 py-1 text-[11px] font-medium text-fr-ink-600">{CATEGORY_LABEL[group.category]}</span>
                  </div>
                  <p className="mt-2 text-sm">
                    <strong className="font-semibold text-fr-ink-900">{headline.value}</strong>
                    <span className="ml-1 text-fr-ink-600">{headline.unit}</span>
                    {hasField ? <span className="ml-4 text-fr-ink-600">{field.value}</span> : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => (isOpen ? setOpenId(null) : open(group))}
                  className={`flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-fr-control px-3 text-sm font-semibold ${
                    isOpen ? "border border-fr-border text-fr-ink-600" : "border border-fr-green-700 text-fr-green-700"
                  }`}
                >
                  {isOpen ? <X className="size-4" /> : <Pencil className="size-4" />}
                  {isOpen ? "Close" : "Open group"}
                </button>
              </div>

              {isOpen ? (
                <div className="flex flex-col gap-4 border-t border-fr-border p-4">
                  <section aria-label="Group details" data-manage-section="details">
                    <SectionLabel>A · Group details</SectionLabel>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs text-fr-ink-600">Group name</span>
                        <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-fr-ink-600">Breed</span>
                        <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="Not recorded" className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900" />
                      </label>
                      {headcountEditable ? (
                        <label className="block">
                          <span className="mb-1 block text-xs text-fr-ink-600">Headcount</span>
                          <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900" />
                          <span className="mt-1 block text-[11px] text-fr-ink-400">No animals are recorded individually, so the group record holds the count. Confirmed by you when saved.</span>
                        </label>
                      ) : (
                        <div data-manage-fact="headcount">
                          <span className="mb-1 block text-xs text-fr-ink-600">Headcount</span>
                          <p className="py-2.5 text-base font-semibold text-fr-ink-900">
                            {individuals !== null ? `${formatNumber(individuals, 0)} ${individuals === 1 ? "animal" : "animals"} recorded` : `${formatNumber(group.count.value, 0)} head (group record)`}
                          </p>
                          <span className="block text-[11px] text-fr-ink-400">
                            {individuals !== null
                              ? "Headcount comes from the animals recorded in this group. Add or move animals to change it."
                              : "Individual animal records couldn't be checked, so the headcount can't be edited right now."}
                          </span>
                          {ctx?.headcountNote ? <span className="mt-1 block text-[11px] font-medium text-fr-v2-gold">{ctx.headcountNote}</span> : null}
                        </div>
                      )}
                      <div>
                        <span className="mb-1 block text-xs text-fr-ink-600">Category</span>
                        <p className="py-2.5 text-base font-semibold text-fr-ink-900">{CATEGORY_LABEL[group.category]}</p>
                        <span className="block text-[11px] text-fr-ink-400">Set when the group was added.</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={!label.trim() || (headcountEditable && !(Number(count) > 0))}
                        className="min-h-10 rounded-fr-control bg-fr-green-700 px-4 text-sm font-semibold text-white disabled:opacity-40"
                        onClick={() => {
                          updateLivestockGroup(
                            group.id,
                            {
                              label: label.trim(),
                              ...(headcountEditable ? { count: Number(count) } : {}),
                              ...(breed.trim() ? { breed: breed.trim() } : {}),
                            },
                            farmerName,
                          );
                          setOpenId(null);
                        }}
                      >
                        Save group details
                      </button>
                    </div>
                  </section>

                  <section aria-label="Current state" className="border-t border-fr-border pt-4" data-manage-section="state">
                    <SectionLabel>B · Current state</SectionLabel>
                    <dl className="mt-2 divide-y divide-fr-border">
                      <ReadRow label="Current field" value={field.value} detail={field.detail} testId="current-field" />
                      {!hasField ? (
                        <ReadRow
                          label="Group record"
                          value={`${group.system === "housed" ? "Housed" : "Grazing"}${linkedShed ? ` · ${linkedShed}` : ""}`}
                          detail="Stored on the older group record, not a recorded move — it may be out of date."
                          testId="legacy-system"
                        />
                      ) : null}
                      <ReadRow
                        label="Live weight"
                        value={recordedAverage?.value ?? "Not recorded"}
                        detail={recordedAverage?.detail ?? "No group weight is recorded."}
                        testId="live-weight"
                      />
                      {individuals !== 0 ? (
                        <ReadRow label="Latest weighing" {...(ctx ? factValue(ctx.latestIndividualWeight) : { value: "Unavailable" })} testId="latest-weighing" />
                      ) : null}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionLink href={workspace}>Move group</ActionLink>
                      <ActionLink href={workspace}>Record or review weights</ActionLink>
                      {housedRelevant ? <ActionLink href="/housing">Housing</ActionLink> : null}
                    </div>
                  </section>

                  <section aria-label="Production" className="border-t border-fr-border pt-4" data-manage-section="production">
                    <SectionLabel>C · Production</SectionLabel>
                    <dl className="mt-2 divide-y divide-fr-border">
                      <ReadRow label="Target" value={target.value} detail={target.detail} testId="production-target" />
                      {ctx?.production.hasTarget && adg ? <ReadRow label="Required gain" value={adg.value} detail={adg.detail} testId="required-adg" /> : null}
                      {group.goal ? (
                        <ReadRow label="Older goal" value={GOAL_LABEL[group.goal] ?? group.goal} detail="From the older group record. The production plan's target replaces it." testId="legacy-goal" />
                      ) : null}
                    </dl>
                    <div className="mt-3">
                      <ActionLink href={workspace}>{ctx?.production.hasTarget ? "View feeding plan" : "Set production goal"}</ActionLink>
                    </div>
                  </section>

                  {deleteConfirmId === group.id ? (
                    <div className="border-t border-fr-risk/30 bg-fr-risk/5 p-4">
                      <p className="text-sm font-semibold text-fr-risk">Delete {group.label}?</p>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fr-ink-600">
                        This removes the group from herd totals and calculations, and deletes the field movements recorded for it. Fields that relied on those movements fall back to the farm-level stocking rate in the fertiliser plan. Any individual animals linked to this group are not deleted; they remain in Cattle but become ungrouped. This action cannot be undone.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setDeleteConfirmId(null)} className="min-h-10 rounded-fr-control border border-fr-border px-4 text-sm font-semibold text-fr-ink-600">Keep group</button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteLivestockGroup(group.id);
                            setDeleteConfirmId(null);
                            setOpenId(null);
                          }}
                          className="flex min-h-10 items-center gap-2 rounded-fr-control bg-fr-risk px-4 text-sm font-semibold text-white"
                        >
                          <Trash2 className="size-4" /> Delete group permanently
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-fr-border pt-4">
                    <button type="button" onClick={() => setDeleteConfirmId(group.id)} className="flex min-h-10 items-center gap-2 rounded-fr-control px-2 text-sm font-semibold text-fr-risk">
                      <Trash2 className="size-4" /> Delete group
                    </button>
                    <button type="button" onClick={() => setOpenId(null)} className="min-h-10 rounded-fr-control px-4 text-sm font-medium text-fr-ink-600">Close</button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
