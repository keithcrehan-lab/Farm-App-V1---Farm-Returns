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
if (process.argv[3] && process.argv[3] !== "0" && failing.length === 0) unexpected.push(`(vitest exited ${process.argv[3]} with no failing test listed — unhandled error?)`);
const nowPassing = [...baseline].filter((b) => !failing.includes(b));
console.log(`Tests: ${report.numPassedTests} passed, ${report.numFailedTests} failed (${failing.length - unexpected.length} known).`);
for (const f of nowPassing) console.log(`::notice::Known failure now passes - remove from baseline: ${f}`);
if (unexpected.length) {
  for (const f of unexpected) console.log(`::error::New failing test: ${f}`);
  process.exit(1);
}
