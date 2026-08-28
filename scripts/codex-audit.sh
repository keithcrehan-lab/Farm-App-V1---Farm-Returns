#!/usr/bin/env bash
# Farm Return Next — independent Codex audit.
#
# Wraps the OpenAI Codex CLI's non-interactive review (`codex review`) as
# the second, independent-of-Claude reviewer docs/farm-return-next/
# BUILD_PLAN.md requires at every checkpoint boundary. Requires `codex`
# installed and authenticated (`codex login status`) — this script does
# not attempt to log in on its own.
#
# Usage:
#   scripts/codex-audit.sh                  # diff against the v1 baseline tag (default)
#   scripts/codex-audit.sh --uncommitted    # diff of staged/unstaged/untracked changes only
#   scripts/codex-audit.sh --base <branch>  # diff against an explicit base
#   scripts/codex-audit.sh --commit <sha>   # review one commit
#   scripts/codex-audit.sh --smoke-test     # trivial read-only connectivity check, no repo diff
#
# Exit code: 0 only if Codex ran AND reported zero Critical/High findings.
# Non-zero if Codex could not be reached (caller should retry per
# scripts/autopilot.sh, never treat "unreachable" as "passed") or if it
# reported >=1 Critical/High finding, or if it ran but did not return a
# parseable summary line (fails closed — an unparseable result is treated
# as a failure, never a silent pass).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BASELINE_TAG="v1-baseline-2026-08-29"
LOG_DIR="docs/farm-return-next/audit-logs"
mkdir -p "$LOG_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/${TIMESTAMP}.md"

REVIEW_ARGS=("--base" "$BASELINE_TAG")
SMOKE_TEST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uncommitted) REVIEW_ARGS=("--uncommitted"); shift ;;
    --base) REVIEW_ARGS=("--base" "$2"); shift 2 ;;
    --commit) REVIEW_ARGS=("--commit" "$2"); shift 2 ;;
    --smoke-test) SMOKE_TEST=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH — cannot audit. Do not treat this as a pass." >&2
  exit 3
fi

if $SMOKE_TEST; then
  echo "── codex-audit: connectivity smoke test (no repo diff) ──"
  if codex exec --sandbox read-only "Reply with exactly one line: CODEX_SMOKE_TEST_OK" \
      | tee "$LOG_FILE"; then
    if grep -q "CODEX_SMOKE_TEST_OK" "$LOG_FILE"; then
      echo "Smoke test passed. Log: $LOG_FILE"
      exit 0
    fi
    echo "Codex responded but did not echo the expected token — treat as failed, not passed." >&2
    exit 1
  else
    echo "codex exec failed — Codex unreachable. Retry, do not treat as a pass." >&2
    exit 1
  fi
fi

REVIEW_PROMPT="Review this diff against Farm Return Next's own rules in \
AGENTS.md and docs/farm-return-next/{DOMAIN_CONTRACTS.md,SCIENTIFIC_RULES.md,BUILD_PLAN.md} \
in this repository. Flag: any duplicated domain calculation outside src/domain/, \
any fabricated/invented number reaching a non-sample_data screen, any breaking \
change to a frozen contract made without following DOMAIN_CONTRACTS.md's \
protocol, any cross-farm data leakage risk, any change touching main or a \
production database, and ordinary correctness/simplification findings. \
Classify every finding as CRITICAL, HIGH, MEDIUM, or LOW per \
docs/farm-return-next/BUILD_PLAN.md's severity taxonomy. End your review \
with exactly one line, on its own, in this exact machine-parseable form \
(zeros if none found): \
AUDIT_SUMMARY: CRITICAL=<n> HIGH=<n> MEDIUM=<n> LOW=<n>"

echo "── codex-audit: codex review ${REVIEW_ARGS[*]} ──"
if ! codex review "${REVIEW_ARGS[@]}" "$REVIEW_PROMPT" | tee "$LOG_FILE"; then
  echo "codex review exited non-zero — Codex unreachable or errored. Retry, do not treat as a pass." >&2
  exit 1
fi

SUMMARY_LINE="$(grep -E '^AUDIT_SUMMARY:' "$LOG_FILE" | tail -n1 || true)"

if [[ -z "$SUMMARY_LINE" ]]; then
  echo "" >&2
  echo "No AUDIT_SUMMARY line found in Codex's output — result is unparseable." >&2
  echo "Failing closed: this counts as a failed audit, not a passed one. See $LOG_FILE." >&2
  exit 1
fi

CRITICAL="$(echo "$SUMMARY_LINE" | grep -oE 'CRITICAL=[0-9]+' | grep -oE '[0-9]+' || echo 0)"
HIGH="$(echo "$SUMMARY_LINE" | grep -oE 'HIGH=[0-9]+' | grep -oE '[0-9]+' || echo 0)"

echo ""
echo "══ codex-audit summary ══════════════════════════════════"
echo "  $SUMMARY_LINE"
echo "  log: $LOG_FILE"
echo "═══════════════════════════════════════════════════════════"

if [[ "$CRITICAL" -gt 0 || "$HIGH" -gt 0 ]]; then
  echo "BLOCKED: $CRITICAL Critical, $HIGH High finding(s) must be resolved before progressing (BUILD_PLAN.md)." >&2
  exit 1
fi

echo "Passed: 0 Critical, 0 High findings."
exit 0
