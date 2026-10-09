import { describe, expect, it } from "vitest";
import { subjectRef } from "../subject";
import { normaliseSubjects, resolveScope, scopeChanged, type TargetScope } from "./scope";
import { A1, A2, A3, A4, GROUP_SELECTOR } from "./test-fixtures";

const followOn: TargetScope = { kind: "DYNAMIC", selector: GROUP_SELECTOR, additions: "FOLLOW_ON_WORK" };
const absorb: TargetScope = { kind: "DYNAMIC", selector: GROUP_SELECTOR, additions: "ABSORB_INTO_JOB" };
const known = (members: (typeof A1)[]) => [{ selector: GROUP_SELECTOR, membership: { status: "KNOWN" as const, members } }];

describe("resolveScope", () => {
  it("drops removed members and absorbs additions under ABSORB_INTO_JOB", () => {
    const r = resolveScope(absorb, [A1, A2, A3], [], known([A1, A3, A4]));
    expect(r.status).toBe("KNOWN");
    expect(r.members).toEqual([A1, A3, A4]);
    expect(r.removed).toEqual([A2]);
    expect(r.added).toEqual([A4]);
    expect(r.handedOff).toEqual([]);
  });

  it("hands additions to follow-on work under FOLLOW_ON_WORK, once", () => {
    const first = resolveScope(followOn, [A1, A2, A3], [], known([A1, A2, A4]));
    expect(first.members).toEqual([A1, A2]);
    expect(first.removed).toEqual([A3]);
    expect(first.handedOff).toEqual([A4]);
    const second = resolveScope(followOn, first.members, first.handedOffRetained, known([A1, A2, A4]));
    expect(second.handedOff).toEqual([]);
    expect(scopeChanged(second)).toBe(false);
  });

  it("keeps last members when membership is unknown — never an empty group", () => {
    const r = resolveScope(followOn, [A1, A2], [], [{ selector: GROUP_SELECTOR, membership: { status: "UNKNOWN", reason: "OFFLINE" } }]);
    expect(r.status).toBe("UNKNOWN");
    expect(r.members).toEqual([A1, A2]);
    expect(r.unknownReason).toBe("OFFLINE");
    expect(resolveScope(followOn, [A1], [], []).unknownReason).toBe("MEMBERSHIP_NOT_SUPPLIED");
  });

  it("ignores members of other subject types and is order-independent", () => {
    const field = subjectRef("FIELD", "f1");
    const a = resolveScope(absorb, [], [], known([A3, field, A1]));
    const b = resolveScope(absorb, [], [], known([A1, A3]));
    expect(a).toEqual(b);
    expect(normaliseSubjects([A2, A1, A2])).toEqual([A1, A2]);
  });
});
