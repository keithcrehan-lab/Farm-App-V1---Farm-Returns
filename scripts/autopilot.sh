#!/usr/bin/env bash
# Farm Return Next — autonomous supervisor / autopilot.
#
# Drives docs/farm-return-next/BUILD_PLAN.md forward with minimal
# prompting: read state -> headless Claude does one unit of work -> this
# script independently verifies it (quality gate + Codex audit, never
# trusting Claude's own self-report) -> commit on a clean pass -> update
# state/log -> repeat. Never merges into main, never pushes unless
# explicitly enabled, never force-pushes.
#
# Usage:
#   scripts/autopilot.sh --smoke-test
#       Trivial, side-effect-free headless Claude invocation only. Proves
#       the `claude -p` mechanism works. Does not touch BUILD_STATE.json,
#       does not run the quality gate, does not edit any file. This is
#       the ONLY mode this repo's Checkpoint 0 actually runs.
#
#   scripts/autopilot.sh [--iterations N] [--auto-push]
#       The real loop (Checkpoint 1 onward, not this session). N defaults
#       to 1 -- an explicit, small number, never "run forever" by default.
#       --auto-push pushes farm-return-next (never main) after each
#       passing commit; omitted by default -- pushing stays a deliberate
#       opt-in even though it's a non-destructive, reversible action.
#
# Safety valve: create docs/farm-return-next/.autopilot-stop to halt the
# loop gracefully before its next iteration.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STATE_FILE="docs/farm-return-next/BUILD_STATE.json"
STOP_FILE="docs/farm-return-next/.autopilot-stop"
LOG_DIR="docs/farm-return-next/autopilot-logs"
mkdir -p "$LOG_DIR"

ITERATIONS=1
AUTO_PUSH=false
SMOKE_TEST=false
RATE_LIMIT_MAX_RETRIES=6
RATE_LIMIT_BASE_BACKOFF_S=30
RATE_LIMIT_MAX_BACKOFF_S=1800

while [[ $# -gt 0 ]]; do
  case "$1" in
    --smoke-test) SMOKE_TEST=true; shift ;;
    --iterations) ITERATIONS="$2"; shift 2 ;;
    --auto-push) AUTO_PUSH=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# --- rate-limit-aware retry wrapper -----------------------------------
# Retries a command when its output looks like a transient usage/rate
# limit (per BUILD_PLAN.md's autonomy rule: "wait and retry automatically
# once service becomes available"). Any other failure is NOT retried --
# it's a real error the loop must stop and report, not paper over.
run_with_retry() {
  local out_file="$1"; shift
  local attempt=0
  local backoff=$RATE_LIMIT_BASE_BACKOFF_S
  while true; do
    if "$@" >"$out_file" 2>&1; then
      cat "$out_file"
      return 0
    fi
    if grep -qiE 'rate.?limit|usage limit|429|quota exceeded|try again later|overloaded|resource_exhausted' "$out_file"; then
      attempt=$((attempt + 1))
      if [[ $attempt -gt $RATE_LIMIT_MAX_RETRIES ]]; then
        echo "Exceeded $RATE_LIMIT_MAX_RETRIES retries on a rate-limit-shaped failure. Giving up." >&2
        cat "$out_file"
        return 1
      fi
      echo "Rate-limit-shaped failure (attempt $attempt/$RATE_LIMIT_MAX_RETRIES). Backing off ${backoff}s..." >&2
      sleep "$backoff"
      backoff=$(( backoff * 2 ))
      [[ $backoff -gt $RATE_LIMIT_MAX_BACKOFF_S ]] && backoff=$RATE_LIMIT_MAX_BACKOFF_S
      continue
    fi
    echo "Non-rate-limit failure -- not retrying automatically." >&2
    cat "$out_file"
    return 1
  done
}

# --- smoke test ---------------------------------------------------------
if $SMOKE_TEST; then
  echo "── autopilot: claude -p smoke test (no repo changes) ──"
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  OUT_FILE="$LOG_DIR/smoke-${TS}.log"
  if run_with_retry "$OUT_FILE" claude -p "Reply with exactly one line and nothing else: CLAUDE_SMOKE_TEST_OK" \
      --permission-mode plan --output-format text; then
    if grep -q "CLAUDE_SMOKE_TEST_OK" "$OUT_FILE"; then
      echo "Smoke test passed. Log: $OUT_FILE"
      exit 0
    fi
    echo "claude -p responded but did not echo the expected token — treat as failed, not passed." >&2
    exit 1
  else
    echo "claude -p failed (see $OUT_FILE) — treat as failed, not passed." >&2
    exit 1
  fi
fi

# --- real loop (not exercised this session) -----------------------------
echo "── autopilot: real loop, up to $ITERATIONS iteration(s), auto-push=$AUTO_PUSH ──"

for ((i = 1; i <= ITERATIONS; i++)); do
  if [[ -f "$STOP_FILE" ]]; then
    echo "Stop file present ($STOP_FILE) — halting before iteration $i."
    rm -f "$STOP_FILE"
    break
  fi

  echo ""
  echo "═══ iteration $i/$ITERATIONS ═══"
  NEXT_ACTION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8')).next_action)")"
  CHECKPOINT="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8')).current_checkpoint)")"
  echo "Checkpoint: $CHECKPOINT"
  echo "Next action: $NEXT_ACTION"

  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  CLAUDE_OUT="$LOG_DIR/claude-${TS}.log"
  PROMPT="Continue Farm Return Next per docs/farm-return-next/BUILD_PLAN.md. \
Current checkpoint: ${CHECKPOINT}. Next action per BUILD_STATE.json: ${NEXT_ACTION}. \
Read AGENTS.md, docs/farm-return-next/{BUILD_PLAN.md,DOMAIN_CONTRACTS.md,SCIENTIFIC_RULES.md,BLOCKERS.md} \
before writing any code. Do the next concrete unit of work only -- do not \
attempt the whole checkpoint in one pass. Update docs/farm-return-next/IMPLEMENTATION_LOG.md \
with what you did. Do not run git commit yourself -- this script commits \
after independently verifying your work. Do not push. Do not touch main."

  if ! run_with_retry "$CLAUDE_OUT" claude -p "$PROMPT" \
      --permission-mode acceptEdits --output-format text; then
    echo "Claude invocation failed. Stopping loop -- see $CLAUDE_OUT." >&2
    exit 1
  fi

  echo "── verifying independently: quality gate ──"
  if ! ./scripts/quality-gate.sh --json; then
    echo "Quality gate failed after Claude's change. NOT committing. Stopping loop." >&2
    exit 1
  fi

  echo "── verifying independently: codex audit ──"
  if ! ./scripts/codex-audit.sh --uncommitted; then
    echo "Codex audit found a Critical/High finding or was unreachable. NOT committing. Stopping loop." >&2
    exit 1
  fi

  echo "── both checks passed — committing ──"
  git add -A
  git commit -m "Autopilot: ${CHECKPOINT} — ${NEXT_ACTION}

Quality gate and Codex audit both passed. See docs/farm-return-next/
IMPLEMENTATION_LOG.md for what changed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"

  if $AUTO_PUSH; then
    echo "── pushing farm-return-next (never main) ──"
    git push origin farm-return-next
  fi
done

echo "Autopilot run complete."
