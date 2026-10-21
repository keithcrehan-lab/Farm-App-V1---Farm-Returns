/**
 * Cattle C10 — the component boundary, enforced with the TypeScript checker
 * (not text search): farmer-facing cattle components must not interpret
 * domain absence, failure, uncertainty or provenance themselves. Those
 * distinctions are decided in `@/domain/cattle/presentation` and reach a
 * component only as explicit states (`view-state.ts`).
 *
 * Rules, over every non-test module in src/components/cattle:
 *
 *  R1 PROPS   — every exported component's props, walked through every type
 *               declared in src/domain or src/server: no plain (possibly
 *               empty) array — only `NonEmpty`, `Listing` or `Details` — and
 *               no nullable non-text value. `SealedInput` is not walked.
 *  R2 IMPORTS — the domain is imported only through `@/domain/cattle/presentation`.
 *  R3 SEALED  — no property read on a `SealedInput`, no `unseal` call.
 *  R4 FALLBACK — no `??` / `||` whose right side is component-written text.
 *  R5 EMPTINESS — no emptiness test (`.length === 0`, `> 0`, `!x.length`, …)
 *               on a domain-declared array other than a `Details` list.
 *  R6 WORDING — no component-written absence wording ("no …", "nothing …",
 *               "not recorded", …) outside the reviewed allowlist below.
 *
 * Each rule is first proven to fire on planted fixtures — including the
 * exact F005 bypass (`points.length === 0 → "No weights recorded"`) — so a
 * clean run can't be a vacuous one.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const DIR = path.join(ROOT, "src/components/cattle");
const FIXTURE_DIR = path.join(DIR, "__boundary_fixtures__");

/**
 * R4 / R6 allowlist: component-written text that is UI copy about the screen itself (a control
 * label, the demo session, the browser-local photo store) — never a claim about a domain read.
 * Each entry is reviewed; adding one needs the same justification.
 */
const ALLOWED_TEXT: readonly { file: string; text: RegExp; why: string }[] = [
  { file: "ui.tsx", text: /^Synthetic animals run through the real cattle engine\. Nothing you do here is saved; a reload starts again\.$/, why: "demo-session notice (UI copy), DemoNotice's default children" },
  { file: "AnimalPlanScreen.tsx", text: /^No assumption$/, why: "segmented-control option label (the farmer's own choice)" },
  { file: "AnimalPlanScreen.tsx", text: /^Not housed$/, why: "button that clears the farmer's planned housing date" },
  { file: "AnimalPlanScreen.tsx", text: /^Not saved$/, why: "save status of the farmer's own draft" },
  { file: "AnimalPlanScreen.tsx", text: /^Not included: /, why: "definition of direct profit (static copy)" },
  { file: "AnimalPlanScreen.tsx", text: /^Feed changes the cost only\./, why: "static explanation of the projection model" },
  { file: "WorkPanel.tsx", text: /No job is shown — that doesn't mean there's nothing to do\.$/, why: "UNAVAILABLE branch: says absence is NOT implied" },
  { file: "HerdScreens.tsx", text: /jobs are not — that doesn't mean nothing needs doing\.$/, why: "PLANNING_FAILED branch: says absence is NOT implied" },
  { file: "photos/AnimalPhotos.tsx", text: /^No photos of$/, why: "browser-tab photo store (local UI state, fully known; not a domain read)" },
  { file: "photos/AnimalPhotos.tsx", text: /^No photo yet$/, why: "browser-tab photo store (local UI state, fully known; not a domain read)" },
  { file: "HerdScreens.tsx", text: /^No animals$/, why: "demonstration-control link naming the EMPTY_HERD scenario" },
  { file: "CattleUnavailable.tsx", text: /^No canonical cattle records are connected to your farm yet\.$/, why: "real-account mode: no cattle data source is wired (product state, not a domain read)" },
  { file: "CattleUnavailable.tsx", text: /^Animal profiles, weights, work and plans appear here once your cattle records are connected\. Nothing is estimated or filled in for you in the meantime\.$/, why: "real-account mode: no cattle data source is wired" },
];

/** Absence words as prose (not CSS tokens like `leading-none`, not enum values like `NONE`). */
const ABSENCE = /(?<![-\w])(no|none|nothing|not recorded|never recorded|not any|zero)(?![-\w])/gi;
const hasAbsenceWording = (text: string) => [...text.matchAll(ABSENCE)].some((m) => m[0] !== m[0].toUpperCase());
const normalise = (text: string) => text.replace(/&apos;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').trim();

interface Violation {
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "R6";
  file: string;
  where: string;
}

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (p !== FIXTURE_DIR) out.push(...listSources(p));
    } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith(".css")) out.push(p);
  }
  return out;
}

const isDomainFile = (fileName: string) => /\/src\/(domain|server)\//.test(fileName);

function checkBoundary(files: readonly string[], virtual: Readonly<Record<string, string>> = {}): Violation[] {
  const cfg = ts.getParsedCommandLineOfConfigFile(path.join(ROOT, "tsconfig.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  if (!cfg) throw new Error("tsconfig not readable");
  const options: ts.CompilerOptions = { ...cfg.options, noEmit: true, incremental: false, tsBuildInfoFile: undefined };
  const host = ts.createCompilerHost(options, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (f) => virtual[f] ?? readFile(f);
  host.fileExists = (f) => f in virtual || fileExists(f);
  host.getSourceFile = (f, lang, onError, create) => (f in virtual ? ts.createSourceFile(f, virtual[f], lang, true, ts.ScriptKind.TSX) : getSourceFile(f, lang, onError, create));
  const program = ts.createProgram([...files, ...Object.keys(virtual)], options, host);
  const checker = program.getTypeChecker();
  const out: Violation[] = [];

  const declaredIn = (t: ts.Type): string[] => ((t.aliasSymbol ?? t.getSymbol())?.getDeclarations() ?? []).map((d) => d.getSourceFile().fileName);
  const isDomainType = (t: ts.Type) => declaredIn(t).some(isDomainFile);
  const brandOf = (t: ts.Type): string | null => {
    const b = t.getProperty("__presentation");
    if (!b) return null;
    const bt = checker.getTypeOfSymbol(b);
    return bt.isStringLiteral() ? bt.value : null;
  };
  const isNullish = (t: ts.Type) => (t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0;
  const isTextLike = (t: ts.Type) => (t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.BooleanLiteral)) !== 0 && (t.flags & ts.TypeFlags.BooleanLiteral) === 0;

  // R1 — walk a prop type.
  function walk(t: ts.Type, where: string, domain: boolean, file: string, seen: Set<ts.Type>): void {
    if (seen.has(t)) return;
    seen.add(t);
    if (t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
    if (t.getCallSignatures().length > 0) return;
    const brand = brandOf(t);
    if (brand === "SEALED_INPUT") return;
    if (t.isUnion()) {
      const rest = t.types.filter((p) => !isNullish(p));
      // `boolean` is the union true | false: fine. Nullable text ("no caption") is fine; any other nullable is not.
      if (domain && rest.length < t.types.length && !rest.every(isTextLike)) out.push({ rule: "R1", file, where: `${where}: nullable ${checker.typeToString(t)}` });
      for (const p of rest) walk(p, where, domain, file, seen);
      return;
    }
    if (brand === "DETAILS" && t.isIntersection()) {
      const arr = t.types.find((p) => checker.isArrayType(p));
      if (arr) walk(checker.getTypeArguments(arr as ts.TypeReference)[0], `${where}[]`, true, file, seen);
      return;
    }
    if (checker.isTupleType(t)) {
      for (const a of checker.getTypeArguments(t as ts.TypeReference)) walk(a, `${where}[]`, domain, file, seen);
      return;
    }
    if (checker.isArrayType(t)) {
      const el = checker.getTypeArguments(t as ts.TypeReference)[0];
      const elDomain = isDomainType(el);
      if (domain || elDomain) out.push({ rule: "R1", file, where: `${where}: plain array ${checker.typeToString(t)} (use Listing / NonEmpty / Details)` });
      walk(el, `${where}[]`, domain || elDomain, file, seen);
      return;
    }
    const dom = domain || isDomainType(t);
    // Library types (React nodes, Set, Date, …) aren't walked — except Record / Readonly maps, whose values are ours.
    if (declaredIn(t).some((f) => f.includes("/node_modules/"))) {
      for (const info of checker.getIndexInfosOfType(t)) walk(info.type, `${where}[key]`, dom, file, new Set(seen));
      return;
    }
    for (const prop of checker.getPropertiesOfType(t)) {
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!decl) continue;
      const pt = checker.getTypeOfSymbolAtLocation(prop, decl);
      walk(pt, `${where}.${prop.name}`, dom || isDomainFile(decl.getSourceFile().fileName), file, new Set(seen));
    }
    // Record<…> / index signatures: their values reach the component too.
    for (const info of checker.getIndexInfosOfType(t)) walk(info.type, `${where}[key]`, dom, file, new Set(seen));
  }

  const textOf = (n: ts.Node): string | null => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : ts.isTemplateExpression(n) ? n.head.text : null);
  const allowed = (file: string, text: string) => ALLOWED_TEXT.some((a) => file.endsWith(a.file) && a.text.test(normalise(text)));

  for (const sf of program.getSourceFiles()) {
    const file = sf.fileName;
    if (!(file.startsWith(DIR + "/") && !/\.test\.tsx?$/.test(file))) continue;
    const rel = path.relative(DIR, file);

    // R1
    const mod = checker.getSymbolAtLocation(sf);
    for (const ex of mod ? checker.getExportsOfModule(mod) : []) {
      if (!/^[A-Z]/.test(ex.name)) continue;
      const t = checker.getTypeOfSymbolAtLocation(ex, sf);
      for (const sig of t.getCallSignatures()) {
        const p0 = sig.getParameters()[0];
        if (p0) walk(checker.getTypeOfSymbolAtLocation(p0, sf), `${rel}#${ex.name}`, false, rel, new Set());
      }
    }

    const visit = (n: ts.Node): void => {
      // R2
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if ((spec.startsWith("@/domain/") || /(^|\/)domain\//.test(spec)) && spec !== "@/domain/cattle/presentation") out.push({ rule: "R2", file: rel, where: `imports ${spec}` });
      }
      // R3
      if (ts.isPropertyAccessExpression(n) && brandOf(checker.getTypeAtLocation(n.expression)) === "SEALED_INPUT") out.push({ rule: "R3", file: rel, where: `reads .${n.name.text} of a sealed input` });
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "unseal") out.push({ rule: "R3", file: rel, where: "calls unseal" });
      // R4
      if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
        const text = textOf(n.right);
        if (text !== null && !allowed(rel, text)) out.push({ rule: "R4", file: rel, where: `fallback text ${JSON.stringify(text)}` });
      }
      // R5
      const emptiness = (lenAccess: ts.Node) => {
        if (!ts.isPropertyAccessExpression(lenAccess) || lenAccess.name.text !== "length") return;
        const arrT = checker.getTypeAtLocation(lenAccess.expression);
        if (brandOf(arrT) === "DETAILS") return;
        const isTuple = checker.isTupleType(arrT);
        const el = checker.isArrayType(arrT) || isTuple ? checker.getTypeArguments(arrT as ts.TypeReference)[0] : null;
        if (el !== null && (isTuple || isDomainType(el))) out.push({ rule: "R5", file: rel, where: `emptiness test on ${checker.typeToString(arrT)}` });
      };
      if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.LessThanEqualsToken].includes(n.operatorToken.kind)) {
        const zeroOrOne = (x: ts.Node) => ts.isNumericLiteral(x) && (x.text === "0" || x.text === "1");
        if (zeroOrOne(n.right)) emptiness(n.left);
        if (zeroOrOne(n.left)) emptiness(n.right);
      }
      if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) emptiness(n.operand);
      // R6
      const literal = ts.isJsxText(n) ? n.text : ts.isStringLiteral(n) && !ts.isImportDeclaration(n.parent) && !ts.isJsxAttribute(n.parent) ? n.text : ts.isNoSubstitutionTemplateLiteral(n) ? n.text : ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) ? n.text : null;
      if (literal !== null && literal.trim() !== "" && hasAbsenceWording(literal) && !allowed(rel, literal)) out.push({ rule: "R6", file: rel, where: `component-written wording ${JSON.stringify(normalise(literal))}` });
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const FIXTURES: Record<string, string> = {
  // The F005 bypass exactly as it shipped: a naked point array, an emptiness test, component-written "no weights".
  "F005Chart.tsx": `import type { WeightChartVM } from "@/domain/cattle/presentation";
type Points = Extract<WeightChartVM, { state: "CHART" }>["points"][number][];
export function F005Chart({ points }: { points: Points }) {
  if (points.length === 0) return <div>No weights recorded yet — nothing to chart.</div>;
  return <div>{points.length}</div>;
}`,
  // Raw owner reads handed to a component unsealed: nullable valuation parts and naked cost-entry arrays.
  "UnsealedInputs.tsx": `import type { PlanInputs } from "@/domain/cattle/presentation";
export function UnsealedInputs({ inputs }: { inputs: PlanInputs }) {
  return <span>{inputs.asOfDate}</span>;
}`,
  "RawImport.tsx": `import { computeAnimalPlanEconomics } from "@/domain/animal-plan";
export function RawImport() {
  return <span>{typeof computeAnimalPlanEconomics}</span>;
}`,
  "ReadsSealed.tsx": `import { unseal, type PlanInputs, type SealedInput } from "@/domain/cattle/presentation";
export function ReadsSealed({ inputs }: { inputs: SealedInput<PlanInputs> }) {
  return <span>{inputs.__value.asOfDate}{unseal(inputs).asOfDate}</span>;
}`,
  "Fallback.tsx": `import type { FieldVM } from "@/domain/cattle/presentation";
export function Fallback({ f }: { f: FieldVM }) {
  return <span>{f.value ?? "Unknown breed"}</span>;
}`,
};

describe("cattle component boundary (TypeScript checker)", () => {
  let real: Violation[] = [];
  let planted: Violation[] = [];

  beforeAll(() => {
    const files = listSources(DIR);
    real = checkBoundary(files);
    planted = checkBoundary(files, Object.fromEntries(Object.entries(FIXTURES).map(([k, v]) => [path.join(FIXTURE_DIR, k), v]))).filter((v) => v.file.startsWith("__boundary_fixtures__"));
  }, 180_000);

  it("fires on every planted bypass (so a clean run isn't vacuous)", () => {
    if (process.env.BOUNDARY_DEBUG) console.log(JSON.stringify(planted, null, 1));
    const has = (file: string, rule: Violation["rule"], where?: RegExp) => planted.some((v) => v.file.endsWith(file) && v.rule === rule && (where === undefined || where.test(v.where)));
    // F005 shape: naked domain array prop, emptiness test on it, "No weights recorded" written by the component.
    expect(has("F005Chart.tsx", "R1", /plain array/)).toBe(true);
    expect(has("F005Chart.tsx", "R5")).toBe(true);
    expect(has("F005Chart.tsx", "R6", /No weights recorded/)).toBe(true);
    expect(has("UnsealedInputs.tsx", "R1", /nullable/)).toBe(true);
    expect(has("UnsealedInputs.tsx", "R1", /plain array/)).toBe(true);
    expect(has("RawImport.tsx", "R2", /@\/domain\/animal-plan/)).toBe(true);
    expect(has("ReadsSealed.tsx", "R3", /__value/)).toBe(true);
    expect(has("ReadsSealed.tsx", "R3", /unseal/)).toBe(true);
    expect(has("Fallback.tsx", "R4", /Unknown breed/)).toBe(true);
  });

  it("every farmer-facing cattle component receives only admitted presentation states (R1)", () => {
    expect(real.filter((v) => v.rule === "R1")).toEqual([]);
  });

  it("components reach the domain only through @/domain/cattle/presentation (R2)", () => {
    expect(real.filter((v) => v.rule === "R2")).toEqual([]);
  });

  it("no component reads a sealed owner input (R3)", () => {
    expect(real.filter((v) => v.rule === "R3")).toEqual([]);
  });

  it("no component writes its own fallback text (R4)", () => {
    expect(real.filter((v) => v.rule === "R4")).toEqual([]);
  });

  it("no component tests a domain collection for emptiness (R5)", () => {
    expect(real.filter((v) => v.rule === "R5")).toEqual([]);
  });

  it("no component writes absence wording outside the reviewed allowlist (R6)", () => {
    expect(real.filter((v) => v.rule === "R6")).toEqual([]);
  });
});
