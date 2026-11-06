import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listSchemeVersions } from "../../scheme-registry";

const ROOT = process.cwd();
const STANDARD_DOC = "docs/product/schemes/standard/SCHEME_IMPLEMENTATION_STANDARD.md";
const LEGACY_DOC = "docs/product/schemes/standard/LEGACY_MIGRATION_CONTRACT.md";
const STANDARD_SRC = "src/domain/schemes/standard";

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(ROOT, path)).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Modules the migration contract must map, by repository path. */
const MAPPED_MODULES = [
  "src/domain/scheme-registry.ts",
  "src/domain/scheme-eligibility.ts",
  "src/domain/support-opportunity.ts",
  "src/domain/support-profile.ts",
  "src/domain/farm-strategy.ts",
  "src/lib/scheme-farmer-text.ts",
  "src/app/actions/support-profile.ts",
  "src/lib/farm-data/support-profile.ts",
];

/**
 * The legacy modules are outside every phase's write boundary, so their
 * exports cannot change during the campaign. These directories are ones
 * later phases may write, so a new importer here is not a gap in the S0
 * map; anywhere else it is.
 */
const CAMPAIGN_WRITABLE = [
  "src/domain/schemes/",
  "src/app/(app)/",
  "src/components/",
  "src/lib/schemes/",
];

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*|\bvi\.mock\(\s*|\bimportActual\(\s*)["']([^"']+)["']/g;

function resolveSpecifier(importer: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? relative(ROOT, resolve(ROOT, dirname(importer), specifier))
      : null;
  if (base === null) return null;
  return MAPPED_MODULES.includes(`${base}.ts`) ? `${base}.ts` : null;
}

function actualImporters(): Map<string, Set<string>> {
  const importers = new Map(MAPPED_MODULES.map((path) => [path, new Set<string>()]));
  for (const file of walk("src")) {
    for (const match of read(file).matchAll(SPECIFIER)) {
      const target = resolveSpecifier(file, match[1]);
      if (target && target !== file) importers.get(target)?.add(file);
    }
  }
  return importers;
}

function actualExports(path: string): string[] {
  return [
    ...read(path).matchAll(
      /^export\s+(?:async\s+)?(?:const|function|type|interface)\s+([A-Za-z0-9_]+)/gm,
    ),
  ].map((match) => match[1]);
}

/** The body of the contract's section for one module. */
function sectionFor(doc: string, modulePath: string): string {
  const parts = doc.split(/^### /m);
  return parts.find((part) => part.startsWith(`\`${modulePath}\``)) ?? "";
}

function mapGaps(doc: string): string[] {
  const gaps: string[] = [];
  const importers = actualImporters();
  for (const path of MAPPED_MODULES) {
    const section = sectionFor(doc, path);
    if (!section) gaps.push(`no section: ${path}`);
    for (const name of actualExports(path)) {
      if (!section.includes(`\`${name}\``)) gaps.push(`export ${path}#${name}`);
    }
    for (const importer of importers.get(path) ?? []) {
      const listed = section.includes(`\`${importer}\``);
      if (!listed && !CAMPAIGN_WRITABLE.some((prefix) => importer.startsWith(prefix))) {
        gaps.push(`importer ${path} <- ${importer}`);
      }
    }
  }
  return gaps;
}

describe("legacy map is checked against actual imports", () => {
  const doc = read(LEGACY_DOC);

  it("names every export and every importer of each mapped module", () => {
    expect(mapGaps(doc)).toEqual([]);
  });

  it("names every importer present when the map was written, campaign directories included", () => {
    const importers = actualImporters();
    const existingAtS0 = [
      ["src/domain/support-profile.ts", "src/domain/schemes/support-profile-adapter.ts"],
      ["src/domain/support-profile.ts", "src/domain/schemes/scep-2026.ts"],
      ["src/domain/scheme-eligibility.ts", "src/app/(app)/schemes/page.tsx"],
      ["src/domain/scheme-registry.ts", "src/app/(app)/schemes/page.tsx"],
      ["src/lib/scheme-farmer-text.ts", "src/app/(app)/schemes/SchemesPageClient.tsx"],
      ["src/app/actions/support-profile.ts", "src/app/(app)/schemes/SchemesPageClient.tsx"],
      ["src/domain/farm-strategy.ts", "src/domain/support-opportunity.ts"],
    ];
    for (const [module, importer] of existingAtS0) {
      expect(importers.get(module)?.has(importer), `${module} <- ${importer}`).toBe(true);
      expect(sectionFor(doc, module)).toContain(`\`${importer}\``);
    }
    for (const path of MAPPED_MODULES) {
      for (const listed of sectionFor(doc, path).matchAll(/`(src\/[^`]+\.tsx?)`/g)) {
        expect(existsSync(join(ROOT, listed[1])), listed[1]).toBe(true);
      }
    }
  });

  it("detects a removed export and a removed importer (negative control)", () => {
    const withoutExport = doc.replaceAll("`assessAllSchemes`", "`removed`");
    expect(mapGaps(withoutExport)).toContain(
      "export src/domain/scheme-eligibility.ts#assessAllSchemes",
    );
    const withoutImporter = doc.replaceAll("`src/lib/farm-data/mappers.ts`", "`removed`");
    expect(mapGaps(withoutImporter)).toContain(
      "importer src/domain/support-profile.ts <- src/lib/farm-data/mappers.ts",
    );
  });

  it("assigns every legacy seeded version to the phase that cuts it over", () => {
    const expectedPhase: Record<string, string> = {
      biss: "S4P2",
      anc: "S7P2",
      "tams3-general": "S8P2",
      "tams3-yfcis": "S8P2",
      "national-reserve-young-farmer": "S10P2",
    };
    const seeded = listSchemeVersions();
    expect(seeded.map((version) => version.schemeId).sort()).toEqual(
      Object.keys(expectedPhase).sort(),
    );
    for (const version of seeded) {
      const row = doc
        .split("\n")
        .find((line) => line.startsWith(`| \`${version.schemeId}\` |`));
      expect(row, version.schemeId).toBeDefined();
      expect(row).toContain(`\`${version.version}\``);
      expect(row).toContain(version.verificationStatus);
      expect(row).toContain(expectedPhase[version.schemeId]);
    }
  });
});

describe("standard document", () => {
  const doc = read(STANDARD_DOC);

  it.each([
    "Requirement Register contract",
    "Source-pack contract",
    "Data ownership",
    "Value taxonomy",
    "Eligibility states",
    "AI trust boundary",
    "Version and update process",
    "Content pack and seed packet format",
    "Phase checklist",
  ])("has the section %s", (heading) => {
    expect(doc).toMatch(new RegExp(`^## \\d+\\. ${heading}$`, "m"));
  });

  it.each([
    "eligibility_condition",
    "obligation",
    "deadline",
    "payment_rule",
    "cap",
    "exception",
    "exclusion",
    "reduction",
    "penalty",
    "evidence_requirement",
    "IMPLEMENTED",
    "UNSUPPORTED",
    "NOT_APPLICABLE",
    "RECURRING_ANNUAL_SUPPORT",
    "CAPITAL_GRANT",
    "MAXIMUM",
    "CURRENT",
    "CONFIRMED",
    "ELIGIBLE_CONFIRMED",
    "EVIDENCE_CONFLICT",
    "REVIEW_REQUIRED",
  ])("defines %s", (term) => {
    expect(doc).toContain(`\`${term}\``);
  });
});

describe("standard module discipline", () => {
  const sources = walk(STANDARD_SRC).filter((path) => !path.endsWith(".test.ts"));

  it("reads no clock, no randomness and no Node API", () => {
    for (const path of sources) {
      const text = read(path);
      expect(text, path).not.toMatch(/Date\.now|new Date\(\s*\)|Math\.random|from "node:/);
    }
  });

  it("does not create a types.ts under the domain", () => {
    expect(sources.some((path) => path.endsWith("/types.ts"))).toBe(false);
  });

  it("uses no gate token as an identifier or in its documents", () => {
    const section = read(".agent/campaigns/schemes-adviser-v1/CAMPAIGN.md")
      .split("## Gate-token discipline")[1]
      .split("\n- ")[0];
    const tokens = [...section.matchAll(/`([A-Z_]+)`/g)].map((match) => match[1]);
    expect(tokens.length).toBeGreaterThan(10);
    for (const path of [...sources, STANDARD_DOC, LEGACY_DOC]) {
      const text = read(path);
      for (const token of tokens) {
        expect(text.includes(token), `${path}: ${token}`).toBe(false);
      }
    }
  });
});
