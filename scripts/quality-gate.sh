#!/usr/bin/env bash
# Farm Return Next — full quality gate.
#
# Runs the same four checks every checkpoint in docs/farm-return-next/
# BUILD_PLAN.md requires green before a commit: tests, typecheck, lint,
# production build. Exits non-zero on the first failure (fail fast) with
# a clear summary of what failed; exits 0 only if all four passed.
#
# Written for plain POSIX/bash-3.2 portability (macOS ships bash 3.2, no
# associative arrays) — deliberately avoids bash-4+-only features.
#
# Usage: scripts/quality-gate.sh [--json]
#   --json   also write a machine-readable summary to
#            docs/farm-return-next/.quality-gate-last.json (for
#            scripts/autopilot.sh to read back into BUILD_STATE.json)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

JSON_OUT=""
if [[ "${1:-}" == "--json" ]]; then
  JSON_OUT="docs/farm-return-next/.quality-gate-last.json"
fi

LOG_DIR=".agent/history/quality-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$LOG_DIR"
step() {
  local name="$1"; shift
  if "$@" >"$LOG_DIR/$name.log" 2>&1; then return 0; fi
  echo "QUALITY_GATE FAIL — $name; full diagnostics: $LOG_DIR/$name.log" >&2
  tail -n 60 "$LOG_DIR/$name.log" >&2
  return 1
}

RESULT_TEST="skipped"
RESULT_TYPECHECK="skipped"
RESULT_LINT="skipped"
RESULT_BUILD="skipped"
DUR_TEST=0
DUR_TYPECHECK=0
DUR_LINT=0
DUR_BUILD=0
OVERALL="pass"

# Each step is written out explicitly below (bash 3.2 — the version macOS
# ships — has no associative arrays or namerefs to loop this generically).

# test
start=$(date +%s)
if step test npm test -- --run --maxWorkers=1; then RESULT_TEST="pass"; else RESULT_TEST="fail"; OVERALL="fail"; fi
DUR_TEST=$(( $(date +%s) - start ))

# typecheck (only if test passed — fail fast)
if [[ "$RESULT_TEST" == "pass" ]]; then
  start=$(date +%s)
  if step typecheck npm run typecheck; then RESULT_TYPECHECK="pass"; else RESULT_TYPECHECK="fail"; OVERALL="fail"; fi
  DUR_TYPECHECK=$(( $(date +%s) - start ))
fi

# lint (only if typecheck passed)
if [[ "$RESULT_TYPECHECK" == "pass" ]]; then
  start=$(date +%s)
  if step lint npm run lint; then RESULT_LINT="pass"; else RESULT_LINT="fail"; OVERALL="fail"; fi
  DUR_LINT=$(( $(date +%s) - start ))
fi

# build (only if lint passed)
if [[ "$RESULT_LINT" == "pass" ]]; then
  start=$(date +%s)
  if step build npm run build; then RESULT_BUILD="pass"; else RESULT_BUILD="fail"; OVERALL="fail"; fi
  DUR_BUILD=$(( $(date +%s) - start ))
fi

echo "QUALITY_GATE $OVERALL — tests $RESULT_TEST, typecheck $RESULT_TYPECHECK, lint $RESULT_LINT, build $RESULT_BUILD — logs: $LOG_DIR"

if [[ -n "$JSON_OUT" ]]; then
  cat > "$JSON_OUT" <<EOF
{
  "run_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "result": "$OVERALL",
  "test": "$RESULT_TEST",
  "typecheck": "$RESULT_TYPECHECK",
  "lint": "$RESULT_LINT",
  "build": "$RESULT_BUILD"
}
EOF
  echo "Summary written to $JSON_OUT"
fi

[[ "$OVERALL" == "pass" ]]
