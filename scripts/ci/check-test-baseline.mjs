// Fails the release pipeline on any failing test that isn't in the known-failing baseline.
// Baseline: .github/known-failing-tests.txt — one "file :: full test name" per line, each
// recorded in docs/farm-return-next/BLOCKERS.md. Fixed tests should be removed from the list.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const baseline = new Set(
  readFileSync(".github/known-failing-tests.txt", "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")),
);
const failing = [];
for (const file of report.testResults ?? []) {
  const rel = relative(process.cwd(), file.name);
  const failed = (file.assertionResults ?? []).filter((t) => t.status === "failed");
  if (!failed.length && file.status === "failed") failing.push(`${rel} :: (file failed to run)`);
  for (const t of failed) failing.push(`${rel} :: ${[...(t.ancestorTitles ?? []), t.title].join(" > ")}`);
}
const unexpected = failing.filter((f) => !baseline.has(f));
// Fail closed on anything the per-test list can't see: no tests collected, or a suite-level
// failure (unhandled error/rejection) that isn't attributed to a listed test.
if (!report.numTotalTests) unexpected.push("(no tests were collected)");
if (process.argv[3] && process.argv[3] !== "0" && failing.length === 0) unexpected.push(`(vitest exited ${process.argv[3]} with no failing test listed)`);
// Unhandled errors/rejections are never in the baseline: vitest prints a banner for them.
// Each must be listed as "<file> :: (unhandled error)"; one with no named origin always fails.
if (process.argv[4]) {
  const log = readFileSync(process.argv[4], "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  const count = Number(log.match(/caught (\d+) unhandled error/)?.[1] ?? (/Unhandled (Errors?|Rejection)/.test(log) ? 1 : 0));
  const origins = [...log.matchAll(/originated in "([^"]+)"/g)].map((m) => `${m[1]} :: (unhandled error)`);
  if (origins.length < count) unexpected.push(`(vitest reported ${count} unhandled error(s), ${count - origins.length} with no named test file)`);
  for (const o of new Set(origins)) {
    if (!baseline.has(o)) unexpected.push(o);
    else failing.push(o);
  }
}
// With the suite split across machines (--shard), each part only sees its own share of
// the baseline, so "now passes" is reported only for tests whose file ran in this part.
const ranFiles = new Set((report.testResults ?? []).map((file) => relative(process.cwd(), file.name)));
const nowPassing = [...baseline].filter((b) => !failing.includes(b) && ranFiles.has(b.split(" :: ")[0]));
console.log(`Tests: ${report.numPassedTests} passed, ${report.numFailedTests} failed (${failing.length - unexpected.length} known).`);
for (const f of nowPassing) console.log(`::notice::Known failure now passes - remove from baseline: ${f}`);
if (unexpected.length) {
  for (const f of unexpected) console.log(`::error::New failing test: ${f}`);
  process.exit(1);
}
