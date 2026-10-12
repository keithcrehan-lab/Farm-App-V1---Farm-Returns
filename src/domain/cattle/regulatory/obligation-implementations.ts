/**
 * Cattle C2 — trusted obligation rule implementations.
 *
 * Executable rule implementations are TRUSTED CODE BINDINGS, never caller
 * data: a catalogue (canonical plain data) names an implementation only by
 * the C0 `RuleImplementationRef` on its rule version (implementation id,
 * version and logic fingerprint). The executable itself comes from a
 * registry that trusted code builds with `createObligationImplementationRegistry`
 * and passes to the engine; C0 `evaluateCattleRule` then checks the
 * registered implementation's identity and recomputed logic fingerprint
 * against the rule version's binding exactly as C0 defines (a mismatch is
 * UNSUPPORTED), so approval stays bound to the exact logic.
 *
 * Only registries created here are honoured (identity-checked); anything
 * else resolves no implementation, so the obligation is UNSUPPORTED (fail
 * closed). The production registry is EMPTY — no real obligation logic.
 */

import type { CattleRuleImplementation } from "../evaluation";
import { compareStrings } from "../integrity";

export interface ObligationImplementationRegistry {
  /** Registered implementations, sorted by id then version (frozen). */
  readonly implementations: readonly CattleRuleImplementation[];
}

const REGISTRIES = new WeakSet<object>();

/**
 * Builds a registry from trusted implementations. Each entry's id, version
 * and predicate are captured once and frozen. A malformed entry, or one id
 * and version registered with two different predicates, is a programming
 * error in trusted code and throws (never silently resolved).
 */
export function createObligationImplementationRegistry(implementations: readonly CattleRuleImplementation[]): ObligationImplementationRegistry {
  const byKey = new Map<string, CattleRuleImplementation>();
  for (const entry of implementations) {
    const { implementationId, version, evaluate } = entry;
    if (typeof implementationId !== "string" || implementationId.length === 0 || !Number.isSafeInteger(version) || typeof evaluate !== "function") {
      throw new TypeError("createObligationImplementationRegistry: malformed implementation entry");
    }
    const key = `${implementationId}@v${version}`;
    const captured = Object.freeze({ implementationId, version, evaluate });
    const existing = byKey.get(key);
    if (existing && existing.evaluate !== evaluate) throw new TypeError(`createObligationImplementationRegistry: ${key} registered with two different predicates`);
    byKey.set(key, existing ?? captured);
  }
  const registry: ObligationImplementationRegistry = Object.freeze({
    implementations: Object.freeze(
      [...byKey.values()].sort((a, b) => compareStrings(a.implementationId, b.implementationId) || a.version - b.version),
    ),
  });
  REGISTRIES.add(registry);
  return registry;
}

/** The production registry: deliberately EMPTY (no real obligation logic). */
export const PRODUCTION_OBLIGATION_IMPLEMENTATIONS: ObligationImplementationRegistry = createObligationImplementationRegistry([]);

/** The registered implementation for an exact id and version; `null` for an unregistered id or an untrusted registry. */
export function findObligationImplementation(registry: unknown, implementationId: string, version: number): CattleRuleImplementation | null {
  if (registry === null || typeof registry !== "object" || !REGISTRIES.has(registry)) return null;
  return (registry as ObligationImplementationRegistry).implementations.find((i) => i.implementationId === implementationId && i.version === version) ?? null;
}
