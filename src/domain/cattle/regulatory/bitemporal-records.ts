/**
 * Cattle C2 — generic append-only, bitemporal record collection and
 * as-of-knowledge resolution.
 *
 * C1's supersession machinery is private to the animal ledger/snapshot and
 * typed to animal assertions, so C2 (the first phase needing it for a
 * non-animal record) implements the generic form once here; later cattle
 * phases import it rather than copying it.
 *
 * - Collection: same id + identical content (caller-defined key, instants
 *   compared by instant) is idempotent, one spelling kept independently of
 *   input order; same id + different content fails closed; a record that
 *   supersedes itself is rejected. Nothing is deleted or rewritten.
 * - Resolution at a knowledge cutoff: only records with `receivedAt <=
 *   cutoff` exist, and only supersessions known by then apply, so an earlier
 *   cutoff is reproducible after later corrections. A link to a target not
 *   known by the cutoff, a link the caller's scope rule forbids, or a cycle
 *   is reported as invalid (never skipped). Each corrected target's branches
 *   are followed through corrections-of-corrections to their live terminal
 *   descendants; terminals that disagree in content compete and are reported
 *   with no winner — no latest-wins, no source precedence.
 */

import { canonicalizeValue } from "../../assessment-integrity";
import { compareInstants } from "../animal-ledger";
import { compareStrings } from "../integrity";

export interface BitemporalRecord {
  readonly recordId: string;
  /** Earlier record ids this record corrects/supersedes (sorted, unique). */
  readonly supersedes: readonly string[];
  /** KNOWLEDGE time: when Farm Return received the record (strict UTC). */
  readonly receivedAt: string;
}

export type BitemporalCollectIssueCode = "CATTLE_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT" | "CATTLE_RECORD_SELF_SUPERSESSION";

export interface BitemporalCollectIssue {
  code: BitemporalCollectIssueCode;
  recordId: string;
}

export type BitemporalCollectResult<R> =
  | { ok: true; records: R[]; idempotentDuplicateIds: string[] }
  | { ok: false; issues: BitemporalCollectIssue[] };

/**
 * Collects already-validated records. `contentKey` must compare every field
 * (instants by instant). Output is sorted by `recordId`.
 */
export function collectBitemporalRecords<R extends BitemporalRecord>(
  records: readonly R[],
  contentKey: (record: R) => string,
): BitemporalCollectResult<R> {
  const issues: BitemporalCollectIssue[] = [];
  const byId = new Map<string, { record: R; key: string }>();
  const duplicates = new Set<string>();
  const conflicted = new Set<string>();
  for (const record of records) {
    if (record.supersedes.includes(record.recordId)) {
      issues.push({ code: "CATTLE_RECORD_SELF_SUPERSESSION", recordId: record.recordId });
      continue;
    }
    const key = contentKey(record);
    const existing = byId.get(record.recordId);
    if (!existing) {
      byId.set(record.recordId, { record, key });
    } else if (existing.key === key) {
      duplicates.add(record.recordId);
      if (compareStrings(canonicalizeValue(record), canonicalizeValue(existing.record)) < 0) byId.set(record.recordId, { record, key });
    } else if (!conflicted.has(record.recordId)) {
      conflicted.add(record.recordId);
      issues.push({ code: "CATTLE_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT", recordId: record.recordId });
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues: issues.sort((a, b) => compareStrings(a.recordId, b.recordId) || compareStrings(a.code, b.code)) };
  }
  const sorted = [...byId.values()].map((e) => e.record).sort((a, b) => compareStrings(a.recordId, b.recordId));
  return { ok: true, records: sorted, idempotentDuplicateIds: [...duplicates].sort(compareStrings) };
}

export type BitemporalLinkIssueCode =
  | "CATTLE_RECORD_SUPERSESSION_TARGET_NOT_KNOWN"
  | "CATTLE_RECORD_SUPERSESSION_OUT_OF_SCOPE"
  | "CATTLE_RECORD_SUPERSESSION_CYCLE";

export interface BitemporalLinkIssue {
  code: BitemporalLinkIssueCode;
  /** The superseding record. */
  recordId: string;
  /** The named target. */
  targetId: string;
}

export interface BitemporalCompetition<R> {
  /** The corrected record whose live correction branches disagree. */
  targetId: string;
  /** Its live terminal descendants (sorted by id); no winner chosen. */
  terminals: R[];
}

export interface BitemporalResolution<R> {
  knowledgeCutoff: string;
  /** Records received by the cutoff, sorted by id. */
  known: R[];
  /** Known records no known record supersedes, sorted by id. */
  live: R[];
  /** Known record id -> the known records superseding it (sorted). */
  supersededBy: ReadonlyMap<string, readonly string[]>;
  linkIssues: BitemporalLinkIssue[];
  competitions: BitemporalCompetition<R>[];
}

/**
 * Resolves records as known at `knowledgeCutoff`. `linkAllowed(source,
 * target)` is the caller's scope rule for a supersession link (e.g. same
 * subject); a forbidden link is invalid. `competitionKey` is the content that
 * must agree for correction branches not to compete.
 */
export function resolveBitemporalRecords<R extends BitemporalRecord>(
  records: readonly R[],
  knowledgeCutoff: string,
  options: { linkAllowed: (source: R, target: R) => boolean; competitionKey: (record: R) => string },
): BitemporalResolution<R> {
  const known = records
    .filter((r) => compareInstants(r.receivedAt, knowledgeCutoff) <= 0)
    .sort((a, b) => compareStrings(a.recordId, b.recordId));
  const byId = new Map(known.map((r) => [r.recordId, r]));
  const linkIssues: BitemporalLinkIssue[] = [];
  const supersededBy = new Map<string, string[]>();
  for (const r of known) {
    for (const targetId of r.supersedes) {
      const target = byId.get(targetId);
      if (!target) linkIssues.push({ code: "CATTLE_RECORD_SUPERSESSION_TARGET_NOT_KNOWN", recordId: r.recordId, targetId });
      else if (!options.linkAllowed(r, target)) linkIssues.push({ code: "CATTLE_RECORD_SUPERSESSION_OUT_OF_SCOPE", recordId: r.recordId, targetId });
      else supersededBy.set(targetId, [...(supersededBy.get(targetId) ?? []), r.recordId]);
    }
  }
  for (const ids of supersededBy.values()) ids.sort(compareStrings);
  for (const [recordId, targetId] of cycleLinks(known, supersededBy)) {
    linkIssues.push({ code: "CATTLE_RECORD_SUPERSESSION_CYCLE", recordId, targetId });
  }
  const live = known.filter((r) => !supersededBy.has(r.recordId));
  const competitions: BitemporalCompetition<R>[] = [];
  for (const targetId of [...supersededBy.keys()].sort(compareStrings)) {
    const terminals = liveTerminals(targetId, supersededBy)
      .map((id) => byId.get(id)!)
      .sort((a, b) => compareStrings(a.recordId, b.recordId));
    if (new Set(terminals.map(options.competitionKey)).size > 1) competitions.push({ targetId, terminals });
  }
  linkIssues.sort((a, b) => compareStrings(a.recordId, b.recordId) || compareStrings(a.targetId, b.targetId) || compareStrings(a.code, b.code));
  return { knowledgeCutoff, known, live, supersededBy, linkIssues, competitions };
}

/** Live terminal descendants reachable from `target` (visited-set traversal; terminates on any graph). */
function liveTerminals(target: string, supersededBy: Map<string, string[]>): string[] {
  const live = new Set<string>();
  const visited = new Set<string>([target]);
  const stack = [...(supersededBy.get(target) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const next = supersededBy.get(id);
    if (next) stack.push(...next);
    else live.add(id);
  }
  return [...live];
}

/** Every known-link (source -> target) that lies on a supersession cycle. */
function cycleLinks<R extends BitemporalRecord>(known: R[], supersededBy: Map<string, string[]>): [string, string][] {
  const reaches = (from: string, to: string): boolean => {
    const visited = new Set<string>();
    const stack = [from];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === to) return true;
      if (visited.has(id)) continue;
      visited.add(id);
      stack.push(...(supersededBy.get(id) ?? []));
    }
    return false;
  };
  const links: [string, string][] = [];
  for (const r of known) {
    for (const targetId of r.supersedes) {
      // Link r -> target is on a cycle when target's supersession chain leads back to r.
      if ((supersededBy.get(targetId) ?? []).includes(r.recordId) && reaches(r.recordId, targetId)) links.push([r.recordId, targetId]);
    }
  }
  return links;
}
