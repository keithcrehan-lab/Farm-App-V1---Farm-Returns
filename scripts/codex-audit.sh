#!/usr/bin/env bash
# Farm Return Next — independent Codex audit.
#
# Wraps the OpenAI Codex CLI's non-interactive agent (`codex exec`) as the
# second, independent-of-Claude reviewer docs/farm-return-next/
# BUILD_PLAN.md requires at every checkpoint boundary. Requires `codex`
# installed and authenticated (`codex login status`) — this script does
# not attempt to log in on its own.
#
# Deliberately uses `codex exec` with an explicit git-diff instruction
# rather than `codex review --uncommitted/--base/--commit <prompt>` --
# empirically (this repo, codex-cli 0.150.1), `codex review` rejects
# combining any of those three scope flags with a custom prompt argument
# ("the argument '--uncommitted' cannot be used with '[PROMPT]'"), so
# there is no way to get both explicit scope control and our required
# machine-parseable AUDIT_SUMMARY line through `codex review` alone.
# `codex exec` has shell access in its sandbox and can run the git diff
# itself, which sidesteps the incompatibility entirely and was proven
# working by this same command shape in --smoke-test.
#
# Every instruction below also tells Codex to separately enumerate and
# read untracked files in full — a real Checkpoint-1 audit run
# (docs/farm-return-next/audit-logs/20260829T001857Z.md, MEDIUM finding)
# found that `git diff` never shows untracked-file *contents* regardless
# of ref (only `git status --porcelain` lists their paths), so the first
# version of this script's default and --uncommitted modes would have
# silently omitted every new file from the review — in that real run, all
# of src/orchestration/. Codex self-corrected by enumerating them anyway
# that time; this script no longer depends on it doing so voluntarily.
#
# Usage:
#   scripts/codex-audit.sh                  # diff against the v1 baseline tag (default)
#   scripts/codex-audit.sh --uncommitted    # diff of staged/unstaged/untracked changes only
#   scripts/codex-audit.sh --base <ref>     # diff against an explicit base ref
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

# Appended to every mode except --commit (a real commit's `git show`
# already includes new-file contents natively): `git diff` never shows an
# untracked file's contents regardless of ref, only `git status
# --porcelain`'s `??` lines name its path -- read those files' full
# contents separately or the review silently omits every new file.
UNTRACKED_INSTRUCTION="Then run \`git status --porcelain\` and, for every line starting \`??\`: if it names a file, read that file's full contents; if it names a directory (git collapses an entirely-untracked directory to one \`?? dir/\` line, e.g. a new src/ subfolder), recursively list every file beneath it and read each one's full contents individually -- git diff never shows an untracked file's contents no matter what it's compared against, only its path (or its containing directory's path), so skipping this step would silently omit every new file, and possibly a whole new directory's worth of files, from the review."

DIFF_INSTRUCTION="Run \`git diff ${BASELINE_TAG}\` in the current repository to see changes to already-tracked files (this includes every committed change since the baseline tag plus any uncommitted working-tree changes to tracked files). ${UNTRACKED_INSTRUCTION}"
SMOKE_TEST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uncommitted)
      DIFF_INSTRUCTION="Run \`git diff HEAD\` in the current repository to see staged/unstaged changes to already-tracked files (ignore anything already committed). ${UNTRACKED_INSTRUCTION}"
      shift ;;
    --base)
      DIFF_INSTRUCTION="Run \`git diff $2\` in the current repository to see changes to already-tracked files since ref $2 (including uncommitted working-tree changes to tracked files). ${UNTRACKED_INSTRUCTION}"
      shift 2 ;;
    --commit)
      DIFF_INSTRUCTION="Run \`git show $2\` in the current repository to see the one commit to review (this already includes full contents of any file the commit added)."
      shift 2 ;;
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

REVIEW_PROMPT="${DIFF_INSTRUCTION} \
Review it against Farm Return Next's own rules in AGENTS.md and \
docs/farm-return-next/{DOMAIN_CONTRACTS.md,SCIENTIFIC_RULES.md,BUILD_PLAN.md} \
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

echo "── codex-audit: codex exec (git-diff instruction: ${DIFF_INSTRUCTION}) ──"
if ! codex exec --sandbox read-only "$REVIEW_PROMPT" | tee "$LOG_FILE"; then
  echo "codex exec exited non-zero — Codex unreachable or errored. Retry, do not treat as a pass." >&2
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
