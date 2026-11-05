/**
 * A group's current liveweight for production context — the weight analogue of
 * the "individual animals own the headcount" rule (0850ca1): where animals are
 * recorded individually, the group's current weight comes from THEIR latest
 * weights (each read from the frozen C4 series by `latestWeightOf`, never
 * recomputed here), with explicit coverage. The stored group average
 * (`livestock_groups.avg_weight_kg`) is the group's own fact only while no
 * animal is recorded individually; it is never overwritten to "synchronise".
 *
 * Coverage rule (fail closed): only a FULL individual coverage (every recorded
 * animal has a latest weight) yields a usable group mean for calculations that
 * need the whole group's current average (feed sizing, grass demand, required
 * gain). A partial coverage is shown as a clearly labelled "covered average"
 * (k of N weighed) and is never passed on as the group mean. No staleness rule
 * is applied (none is evidenced); the oldest and newest weighing dates are
 * always shown so an old weight is visible as old.
 */

import type { GroupAnimalFacts } from "./production-advisory";
import { formatDate, formatKgNumber } from "./format";

export type GroupLiveweight =
  /** Every individually recorded animal has a latest weight: the mean is the group's current average. */
  | { state: "INDIVIDUAL_FULL"; meanKg: number; weighed: number; members: number; oldestAt: string; newestAt: string }
  /** Some (not all) are weighed: the mean covers only the weighed animals and is never used as the group mean. */
  | { state: "INDIVIDUAL_PARTIAL"; coveredMeanKg: number; weighed: number; members: number; oldestAt: string; newestAt: string }
  /** Animals are recorded individually but none is weighed yet. */
  | { state: "INDIVIDUAL_NONE"; members: number }
  /** Animals are recorded individually but their records couldn't be read. */
  | { state: "INDIVIDUAL_UNAVAILABLE" }
  /** No animal is recorded individually: the group record's own stored average. */
  | { state: "GROUP_RECORD"; kg: number; source: string }
  /** No animal is recorded individually and the group record holds no average. */
  | { state: "NOT_HELD" };

export interface StoredGroupWeight {
  kg: number;
  source: string;
}

const byInstant = (a: string, b: string) => Date.parse(a) - Date.parse(b);

/**
 * `animals`: the group's individually recorded members (absent = none recorded individually).
 * `stored`: the group record's stored average, used only when no animal is recorded individually.
 */
export function groupLiveweightOf(animals: GroupAnimalFacts | undefined, stored: StoredGroupWeight | undefined): GroupLiveweight {
  if (animals?.state === "UNAVAILABLE") return { state: "INDIVIDUAL_UNAVAILABLE" };
  const members = animals?.state === "KNOWN" ? animals.animals : [];
  if (members.length === 0) {
    return stored && Number.isFinite(stored.kg) && stored.kg > 0 ? { state: "GROUP_RECORD", kg: stored.kg, source: stored.source } : { state: "NOT_HELD" };
  }
  const weighed = members.flatMap((m) => (m.latestWeightKg !== null && m.latestWeighedAt !== null && Number.isFinite(m.latestWeightKg) && m.latestWeightKg > 0 ? [{ kg: m.latestWeightKg, at: m.latestWeighedAt }] : []));
  if (weighed.length === 0) return { state: "INDIVIDUAL_NONE", members: members.length };
  const mean = weighed.reduce((sum, w) => sum + w.kg, 0) / weighed.length;
  const oldestAt = weighed.reduce((min, w) => (byInstant(w.at, min) < 0 ? w.at : min), weighed[weighed.length - 1].at);
  const newestAt = weighed.reduce((max, w) => (byInstant(w.at, max) > 0 ? w.at : max), oldestAt);
  const span = { weighed: weighed.length, members: members.length, oldestAt, newestAt };
  return weighed.length === members.length ? { state: "INDIVIDUAL_FULL", meanKg: mean, ...span } : { state: "INDIVIDUAL_PARTIAL", coveredMeanKg: mean, ...span };
}

/** The group mean a calculation may use: only a full individual coverage or the group record's own average. */
export function usableGroupMeanKg(weight: GroupLiveweight): number | undefined {
  if (weight.state === "INDIVIDUAL_FULL") return weight.meanKg;
  if (weight.state === "GROUP_RECORD") return weight.kg;
  return undefined;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function dateSpan(oldestAt: string, newestAt: string): string {
  const oldest = formatDate(oldestAt);
  const newest = formatDate(newestAt);
  return oldest === newest ? `weighed ${newest}` : `weighed ${oldest} – ${newest}`;
}

/** Farmer-facing wording for the weight tile and the advisory (decided here, never in a component). */
export interface GroupLiveweightWords {
  /** The tile's value, or `null` when no usable figure is shown. */
  value: string | null;
  /** Shown when `value` is null. */
  stateLabel: string;
  /** One line of coverage and provenance, always present. */
  detail: string;
}

export function groupLiveweightWords(weight: GroupLiveweight): GroupLiveweightWords {
  switch (weight.state) {
    case "INDIVIDUAL_FULL":
      return {
        value: formatKgNumber(weight.meanKg),
        stateLabel: "Recorded",
        detail: `Mean of the latest individual weights · all ${plural(weight.members, "animal", "animals")} weighed, ${dateSpan(weight.oldestAt, weight.newestAt)}`,
      };
    case "INDIVIDUAL_PARTIAL":
      return {
        value: null,
        stateLabel: `${weight.weighed} of ${weight.members} weighed`,
        detail: `Partial: ${weight.weighed === 1 ? "the one weighed animal is" : `the ${weight.weighed} weighed animals average`} ${formatKgNumber(weight.coveredMeanKg)} kg (${dateSpan(weight.oldestAt, weight.newestAt)}). That isn't the group's average, so feed and grass figures wait until every animal is weighed.`,
      };
    case "INDIVIDUAL_NONE":
      return {
        value: null,
        stateLabel: `0 of ${weight.members} weighed`,
        detail: "Animals are recorded individually but none has a weight yet. Weigh them on their own records; the group's weight comes from those records.",
      };
    case "INDIVIDUAL_UNAVAILABLE":
      return { value: null, stateLabel: "Weights couldn't be read", detail: "The animal records couldn't be read just now, so the group's weight isn't shown. Try again shortly." };
    case "GROUP_RECORD":
      return { value: formatKgNumber(weight.kg), stateLabel: "Recorded", detail: `Group average from the group record · ${weight.source}` };
    case "NOT_HELD":
      return {
        value: null,
        stateLabel: "Group average not recorded",
        detail: "Add the animals individually and weigh them; the group's weight then comes from their records.",
      };
  }
}
