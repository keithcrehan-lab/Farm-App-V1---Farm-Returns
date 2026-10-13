/**
 * Cattle C6 — goal → rule / target routing.
 *
 * A pure mapping from each ACTIVE declared goal to the rule / target ids an
 * explicitly supplied routing registry REGISTERS for it. The registry is data
 * (never executable), matched by exact goal type or exact goal id only, and
 * ships empty (`EMPTY_GOAL_ROUTING_REGISTRY`): no built-in science, no
 * inferred route (CAT-INV-016/027). An active goal with no registered route
 * is `NO_ROUTED_RULES`. Routing never evaluates a rule or a target — it only
 * names them for downstream phases.
 *
 * Registry entries are reference data with a knowledge time: an entry whose
 * readable `receivedAt` is after the cutoff is set aside before any other
 * read (CAT-INV-003/004); an unreadable one fails closed (CAT-INV-005);
 * identity (`entryId`) before validity — same id + identical content is
 * idempotent, different content fails closed (CAT-INV-008). An entry is
 * never retired by data: a changed registry is a new registry version, and
 * the result binds the registry id, version and every admitted entry.
 *
 * Precedence of the overall state: GOAL_INVALID > GOAL_INTENT_CONFLICT >
 * NO_ACTIVE_GOAL > ROUTED (some active goal has a route) > NO_ROUTED_RULES.
 * Unresolved goals are never routed (CAT-INV-009).
 */

import { canonicalizeValue, type AssessmentFingerprint } from "../../assessment-integrity";
import { compareInstants, deepFreezeAnimalValue, isOpaqueRef, isValidAnimalInstant } from "../animal-ledger";
import { compareStrings, type CattleHash } from "../integrity";
import { toCanonicalPlainData } from "../regulatory/canonical-input";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import { hasOnlyFields, isRecord, oneOf, rawIdentityKey } from "../health/health-input";
import { PRODUCTION_GOAL_TYPES, goalVersionRef, isGoalId, type GoalVersionRef, type ProductionGoalType } from "./goal-declaration";
import { CATTLE_GOAL_PAYLOAD_VERSION, computeGoalFingerprint } from "./goal-integrity";
import { projectCanonicalGoals, readGoalRequest, type GoalProjectionStatus, type GoalQuery, type GoalRequestIssue, type GoalSnapshotRef } from "./goal-projection";

export type GoalRouteMatch = { kind: "GOAL_TYPE"; goalType: ProductionGoalType } | { kind: "GOAL_ID"; goalId: string };

/** A rule is named by its exact C0 `RuleVersionRef`; a target by its C5 `targetId`. */
export type GoalRoute = { kind: "RULE"; ruleId: string; version: number } | { kind: "TARGET"; targetId: string };

export interface GoalRoutingEntry {
  entryId: string;
  /** KNOWLEDGE time (canonical spelling once admitted). */
  receivedAt: string;
  match: GoalRouteMatch;
  /** Non-empty; sorted and unique once admitted. */
  routes: GoalRoute[];
}

export interface GoalRoutingRegistry {
  registryId: string;
  version: string;
  entries: GoalRoutingEntry[];
}

/** The production default: nothing is registered. */
export const EMPTY_GOAL_ROUTING_REGISTRY: GoalRoutingRegistry = deepFreezeAnimalValue({ registryId: "CATTLE_GOAL_ROUTING_REGISTRY_EMPTY", version: "1", entries: [] });

export interface GoalRoutingRequest {
  declarations: readonly unknown[];
  query: GoalQuery;
  registry: GoalRoutingRegistry;
}

export type GoalRoutingState = "ROUTED" | "NO_ROUTED_RULES" | "NO_ACTIVE_GOAL" | "GOAL_INTENT_CONFLICT" | "GOAL_INVALID";

export interface RoutedGoal {
  goal: GoalVersionRef;
  goalType: ProductionGoalType;
  state: "ROUTED" | "NO_ROUTED_RULES";
  /** Matching admitted entries (sorted). */
  entryIds: string[];
  /** Union of their routes (sorted, unique). */
  routes: GoalRoute[];
}

export interface GoalRouting {
  goalPayloadVersion: typeof CATTLE_GOAL_PAYLOAD_VERSION;
  effectiveAt: string;
  knowledgeCutoff: string;
  snapshot: GoalSnapshotRef;
  goalStatus: GoalProjectionStatus;
  registry: { registryId: string; version: string };
  /** Entries known by the cutoff (sorted by id). */
  admittedEntries: GoalRoutingEntry[];
  state: GoalRoutingState;
  /** One per ACTIVE goal (empty unless the goal status is ACTIVE). */
  goals: RoutedGoal[];
  fingerprint: AssessmentFingerprint;
}

export type GoalRoutingIssueCode =
  | GoalRequestIssue["code"]
  | "CATTLE_GOAL_ROUTING_INVALID_REGISTRY"
  | "CATTLE_GOAL_ROUTING_INVALID_ENTRY"
  | "CATTLE_GOAL_ROUTING_ENTRY_INVALID_KNOWLEDGE_TIME"
  | "CATTLE_GOAL_ROUTING_ENTRY_DUPLICATE_DIFFERENT_CONTENT";

export interface GoalRoutingIssue {
  code: GoalRoutingIssueCode;
  ref: string | null;
}

export type GoalRoutingResult = { ok: true; routing: GoalRouting } | { ok: false; issues: GoalRoutingIssue[] };

// ---------------------------------------------------------------------------
// Registry readers (already-canonical data)
// ---------------------------------------------------------------------------

function matchOf(raw: unknown): GoalRouteMatch | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "GOAL_TYPE" && hasOnlyFields(raw, ["kind", "goalType"]) && oneOf(PRODUCTION_GOAL_TYPES, raw.goalType)) return { kind: "GOAL_TYPE", goalType: raw.goalType };
  if (raw.kind === "GOAL_ID" && hasOnlyFields(raw, ["kind", "goalId"]) && isGoalId(raw.goalId)) return { kind: "GOAL_ID", goalId: raw.goalId };
  return null;
}

function routeOf(raw: unknown): GoalRoute | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "RULE" && hasOnlyFields(raw, ["kind", "ruleId", "version"]) && isOpaqueRef(raw.ruleId) && Number.isSafeInteger(raw.version) && (raw.version as number) >= 1) {
    return { kind: "RULE", ruleId: raw.ruleId, version: raw.version as number };
  }
  if (raw.kind === "TARGET" && hasOnlyFields(raw, ["kind", "targetId"]) && isOpaqueRef(raw.targetId)) return { kind: "TARGET", targetId: raw.targetId };
  return null;
}

const compareRoutes = (a: GoalRoute, b: GoalRoute) => compareStrings(canonicalizeValue(a), canonicalizeValue(b));

function uniqueRoutes(routes: readonly GoalRoute[]): GoalRoute[] {
  const byKey = new Map(routes.map((r) => [canonicalizeValue(r), r]));
  return [...byKey.values()].sort(compareRoutes);
}

function entryOf(raw: unknown): GoalRoutingEntry | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["entryId", "receivedAt", "match", "routes"]) || !isOpaqueRef(raw.entryId) || !isValidAnimalInstant(raw.receivedAt)) return null;
  const match = matchOf(raw.match);
  if (match === null || !Array.isArray(raw.routes) || raw.routes.length === 0) return null;
  const routes: GoalRoute[] = [];
  for (const r of raw.routes) {
    const route = routeOf(r);
    if (route === null) return null;
    routes.push(route);
  }
  return { entryId: raw.entryId, receivedAt: canonicalObligationInstant(raw.receivedAt) as string, match, routes: uniqueRoutes(routes) };
}

function uniqueIssues(issues: readonly GoalRoutingIssue[]): GoalRoutingIssue[] {
  const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
  return [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

function admitRegistry(
  raw: unknown,
  knowledgeCutoff: string,
): { ok: true; registryId: string; version: string; entries: GoalRoutingEntry[] } | { ok: false; issues: GoalRoutingIssue[] } {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["registryId", "version", "entries"]) || !isOpaqueRef(raw.registryId) || !isOpaqueRef(raw.version) || !Array.isArray(raw.entries)) {
    return { ok: false, issues: [{ code: "CATTLE_GOAL_ROUTING_INVALID_REGISTRY", ref: null }] };
  }
  const issues: GoalRoutingIssue[] = [];
  // Knowledge time first: a readable later entry is never read further.
  const admitted = raw.entries.filter((e) => {
    const t = isRecord(e) ? e.receivedAt : undefined;
    return !(isValidAnimalInstant(t) && compareInstants(t, knowledgeCutoff) > 0);
  });
  // Identity before validity.
  const keysById = new Map<string, Set<string>>();
  const byId = new Map<string, GoalRoutingEntry>();
  for (const e of admitted) {
    const id = isRecord(e) && isOpaqueRef(e.entryId) ? e.entryId : null;
    const entry = entryOf(e);
    if (id !== null) keysById.set(id, (keysById.get(id) ?? new Set<string>()).add(entry ? `valid:${canonicalizeValue(entry)}` : `raw:${rawIdentityKey(e)}`));
    if (entry === null) {
      const t = isRecord(e) ? e.receivedAt : undefined;
      issues.push({ code: isValidAnimalInstant(t) ? "CATTLE_GOAL_ROUTING_INVALID_ENTRY" : "CATTLE_GOAL_ROUTING_ENTRY_INVALID_KNOWLEDGE_TIME", ref: id });
      continue;
    }
    byId.set(entry.entryId, entry);
  }
  for (const [id, keys] of keysById) if (keys.size > 1) issues.push({ code: "CATTLE_GOAL_ROUTING_ENTRY_DUPLICATE_DIFFERENT_CONTENT", ref: id });
  if (issues.length > 0) return { ok: false, issues: uniqueIssues(issues) };
  return { ok: true, registryId: raw.registryId, version: raw.version, entries: [...byId.values()].sort((a, b) => compareStrings(a.entryId, b.entryId)) };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function stateFor(status: GoalProjectionStatus, goals: readonly RoutedGoal[]): GoalRoutingState {
  if (status === "INVALID") return "GOAL_INVALID";
  if (status === "INTENT_CONFLICT") return "GOAL_INTENT_CONFLICT";
  if (status === "NONE") return "NO_ACTIVE_GOAL";
  return goals.some((g) => g.state === "ROUTED") ? "ROUTED" : "NO_ROUTED_RULES";
}

/**
 * Routes the subject's ACTIVE goals through the supplied registry at the
 * query's times. The complete request must be canonical plain data; a
 * malformed request or registry fails closed (`ok: false`). Detached and
 * deep-frozen.
 */
export function routeProductionGoals(request: GoalRoutingRequest, hash: CattleHash): GoalRoutingResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_GOAL_NON_CANONICAL_INPUT", ref: canonical.path }] });
  const read = readGoalRequest(canonical.value, ["registry"]);
  if (!read.ok) return deepFreezeAnimalValue({ ok: false, issues: read.issues });
  const registry = admitRegistry(read.req.registry, read.query.knowledgeCutoff);
  if (!registry.ok) return deepFreezeAnimalValue({ ok: false, issues: registry.issues });

  const projection = projectCanonicalGoals(read.declarations, read.query, hash);
  const goals: RoutedGoal[] = projection.activeGoals.map(({ declaration }) => {
    const matching = registry.entries.filter((e) => (e.match.kind === "GOAL_TYPE" ? e.match.goalType === declaration.goalType : e.match.goalId === declaration.goalId));
    const routes = uniqueRoutes(matching.flatMap((e) => e.routes));
    return { goal: goalVersionRef(declaration), goalType: declaration.goalType, state: routes.length > 0 ? "ROUTED" : "NO_ROUTED_RULES", entryIds: matching.map((e) => e.entryId), routes };
  });
  const content: Omit<GoalRouting, "fingerprint"> = {
    goalPayloadVersion: CATTLE_GOAL_PAYLOAD_VERSION,
    effectiveAt: read.query.effectiveAt,
    knowledgeCutoff: read.query.knowledgeCutoff,
    snapshot: projection.snapshot,
    goalStatus: projection.status,
    registry: { registryId: registry.registryId, version: registry.version },
    admittedEntries: registry.entries,
    state: stateFor(projection.status, goals),
    goals,
  };
  const routing: GoalRouting = { ...content, fingerprint: computeGoalFingerprint("CATTLE_GOAL_ROUTING", content, hash) };
  return deepFreezeAnimalValue({ ok: true, routing: structuredClone(routing) });
}
