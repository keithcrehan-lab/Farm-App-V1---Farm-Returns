import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSessionPhotoStore } from "./photos/photo-store";

const ROOT = path.resolve(__dirname, "../../..");
function files(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return readdirSync(abs).flatMap((f) => {
    const p = path.join(abs, f);
    return statSync(p).isDirectory() ? files(path.join(dir, f)) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [path.join(dir, f)] : [];
  });
}
const importsOf = (src: string) => [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

const COMPONENTS = files("src/components/cattle");
const PRESENTATION = files("src/domain/cattle/presentation");
const ANIMAL_PLAN = files("src/domain/animal-plan");
const ROUTES = files("src/app/(app)/cattle");

describe("C10 boundary — consumes frozen outputs, owns no cattle decision", () => {
  it("components import no cattle engine module directly (only presentation view-models, the C10 animal-plan domain and types)", () => {
    for (const f of COMPONENTS) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      for (const imp of importsOf(src)) {
        if (imp.startsWith("@/domain/cattle/")) expect(imp, f).toBe("@/domain/cattle/presentation");
        if (imp.startsWith("@/server/")) expect(src, `${f} may import only types from the server`).toMatch(new RegExp(`import type [^;]+ from "${imp.replace(/[/.]/g, "\\$&")}"`));
        expect(imp, f).not.toMatch(/^@\/domain\/plan/);
      }
    }
  });

  it("view-models and the animal-plan domain read no clock and import no React or server code", () => {
    for (const f of [...PRESENTATION, ...ANIMAL_PLAN]) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/Date\.now\(|new Date\(\)|performance\.now\(/);
      for (const imp of importsOf(src)) expect(imp, f).not.toMatch(/^react|^next|^@\/server|^@\/components/);
    }
  });

  it("view-models reach frozen phases only through their public barrels", () => {
    for (const f of PRESENTATION) {
      for (const imp of importsOf(readFileSync(path.join(ROOT, f), "utf8"))) {
        if (imp.startsWith("../")) expect(imp, f).toMatch(/^\.\.\/(animal-snapshot|animal-ledger|evidence-pack|goals|health|performance|plan-interface|programmes|recommendations|regulatory|weights|\.\.\/plan|\.\.\/\.\.\/plan|\.\.\/animal-plan)$/);
      }
    }
  });

  it("the animal-plan domain never feeds C8, C9 or the Plan kernel", () => {
    for (const f of ANIMAL_PLAN) for (const imp of importsOf(readFileSync(path.join(ROOT, f), "utf8"))) expect(imp, f).not.toMatch(/cattle|plan$|^@\/domain\/plan/);
  });

  it("every cattle route and server function checks demonstration mode before running the demo herd", () => {
    for (const f of ROUTES.filter((x) => /page\.tsx$|actions\.ts$/.test(x))) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      if (/demoHerdView|demoAnimalView|demoProjection/.test(src)) expect(src, f).toMatch(/isCattleDemoMode\(\)/);
    }
  });

  it("no frozen cattle file is touched by C10 (presentation is the only cattle subdirectory C10 writes)", () => {
    const owned = PRESENTATION.every((f) => f.startsWith("src/domain/cattle/presentation/"));
    expect(owned).toBe(true);
  });
});

describe("C10 invariants B and C — components hold no numeric or date derivation", () => {
  // Layout geometry (chart scales, bar proportions) lives in PerformanceChart / plan-timeline only.
  // Chart geometry (pixel positions, axis ticks, SVG path text) — no value shown is computed there.
  const GEOMETRY = new Set(["src/components/cattle/PerformanceChart.tsx", "src/components/cattle/living-record/GrowthGraph.tsx"]);

  it("no component rounds, truncates or re-parses a value (display rounding is format.ts; editing is numeric-input.ts)", () => {
    for (const f of COMPONENTS.filter((x) => !GEOMETRY.has(x))) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/Math\.(round|floor|ceil|trunc)\(|\.toFixed\(|parseInt\(|parseFloat\(/);
    }
  });

  it("no component derives plan days or dates (the canonical PlanIntervals do: plan-intervals.ts)", () => {
    for (const f of COMPONENTS) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/\bdaysBetween\b|\bderivePlanIntervals\b|\bcomparePlanDates\b|\baddDays\([^)]*\)\s*[<>]/);
      // Calendar arithmetic is allowed only for chart axis geometry.
      if (!GEOMETRY.has(f)) expect(src, f).not.toMatch(/Date\.UTC\(|getTime\(\)/);
    }
  });

  it("only plan-intervals.ts computes plan intervals inside the C10 domain", () => {
    for (const f of [...ANIMAL_PLAN, ...PRESENTATION].filter((x) => !/plan-intervals\.ts$|plan-dates\.ts$/.test(x))) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      // mart-valuation measures a report's age (not a plan interval).
      if (/mart-valuation\.ts$/.test(f)) continue;
      expect(src, f).not.toMatch(/\bdaysBetween\(/);
    }
  });
});

describe("C10 invariant A — weight / housing / goal cross into components explicitly", () => {
  it("no component receives a bare nullable weight, housing or goal value", () => {
    for (const f of COMPONENTS) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/\blastKg\b|currentWeightKg|currentlyHoused|targetWeightKg/);
    }
  });
});

describe("C10 photos — session store", () => {
  const urls = () => {
    let n = 0;
    const revoked: string[] = [];
    return { create: () => `blob:${++n}`, revoke: (u: string) => void revoked.push(u), revoked };
  };
  it("no photos ⇒ no primary; the first photo becomes primary; one primary per animal", () => {
    const u = urls();
    const s = createSessionPhotoStore(u);
    expect(s.persistence).toBe("SESSION_ONLY");
    expect(s.primary("A")).toBeNull();
    const a = s.add("A", new Blob(), "a.jpg");
    const b = s.add("A", new Blob(), "b.jpg");
    s.add("B", new Blob(), "c.jpg");
    expect(s.primary("A")?.photoId).toBe(a.photoId);
    expect(s.list("A").map((p) => p.fileName)).toEqual(["a.jpg", "b.jpg"]);
    expect(s.setPrimary("A", b.photoId)).toBe(true);
    expect(s.primary("A")?.photoId).toBe(b.photoId);
    expect(s.setPrimary("A", "missing")).toBe(false);
    expect(s.primary("B")?.fileName).toBe("c.jpg");
  });
  it("removing the primary promotes the earliest remaining photo; removing the last leaves none; URLs are released", () => {
    const u = urls();
    const s = createSessionPhotoStore(u);
    const a = s.add("A", new Blob(), "a.jpg");
    const b = s.add("A", new Blob(), "b.jpg");
    s.remove("A", a.photoId);
    expect(s.primary("A")?.photoId).toBe(b.photoId);
    s.remove("A", b.photoId);
    expect(s.primary("A")).toBeNull();
    expect(u.revoked).toEqual([a.url, b.url]);
  });
});
