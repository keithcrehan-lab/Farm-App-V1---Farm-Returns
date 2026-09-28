# Shared helpers for scripts/agent-{status,build,audit,fix}. Source only.
#
# bash 3.2 compatible (macOS default): no associative arrays, no mapfile.
# Nothing in this file, or in the scripts that source it, ever runs
# `git push`, `git reset --hard`, `git clean`, `git checkout -- .` or
# `git stash`. Local commits only.

set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "agent: not inside a git repository" >&2; exit 2; }
cd "$REPO_ROOT"

AGENT_DIR=".agent"
STATE_FILE="$AGENT_DIR/STATE.md"
TASK_FILE="$AGENT_DIR/CURRENT_TASK.md"
HISTORY_DIR="$AGENT_DIR/history"
mkdir -p "$HISTORY_DIR"

die() { echo "agent: $*" >&2; exit 1; }
note() { echo "agent: $*"; }
now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
stamp() { date -u +%Y%m%dT%H%M%SZ; }
short() { git rev-parse --short "$1"; }

# ── STATE.md: a "key: value" block, one key per line ──────────────────
state_init() {
  [[ -f "$STATE_FILE" ]] && return 0
  cat > "$STATE_FILE" <<'EOF'
# Agent state (local, per worktree — updated by scripts/agent-*)

branch:
head:
stage: idle
task:
task_base:
fix_base:
last_completed_task:
last_build:
last_audit:
last_audit_kind:
last_audit_result:
last_verify:
blockers: none
frozen: v1-baseline-2026-08-29 (9c8a952b); Jev shadow router Phase 1A (89eb12cb)
next_task:
updated:
EOF
}

state_get() {
  state_init
  sed -n "s/^$1: \{0,1\}//p" "$STATE_FILE" | head -n1
}

state_set() {
  state_init
  local tmp; tmp="$(mktemp "${STATE_FILE}.XXXXXX")"
  K="$1" V="$2" awk '
    BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; done = 0 }
    index($0, k ":") == 1 { print k ": " v; done = 1; next }
    { print }
    END { if (!done) print k ": " v }
  ' "$STATE_FILE" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

# Record the live branch/HEAD and a timestamp after any state change.
state_touch() {
  state_set branch "$(git branch --show-current)"
  state_set head "$(git rev-parse HEAD)"
  state_set updated "$(now_utc)"
}

# ── CURRENT_TASK.md fields ─────────────────────────────────────────────
task_title() { sed -n 's/^# Task: *//p' "$TASK_FILE" | head -n1; }
task_start_head() { sed -n 's/^Starting HEAD: *//p' "$TASK_FILE" | head -n1 | tr -d '[:space:]'; }
task_verify_cmd() {
  sed -n 's/^Verify command: *`\(.*\)`.*$/\1/p' "$TASK_FILE" | head -n1
}

require_task() {
  [[ -f "$TASK_FILE" ]] || die "missing $TASK_FILE"
  local t; t="$(task_title)"
  [[ -n "$t" && "$t" != \(none* ]] || die "fill in $TASK_FILE (the '# Task:' title is still the template placeholder)"
  [[ -n "$(task_verify_cmd)" ]] || die "$TASK_FILE needs a 'Verify command: \`...\`' line"
}

# ── Git safety ─────────────────────────────────────────────────────────
# Changes outside .agent/ count as "unrelated work" we must not touch.
dirty_paths() { git status --porcelain --untracked-files=all -- . ":(exclude)$AGENT_DIR"; }

require_clean() {
  local d; d="$(dirty_paths)"
  if [[ -n "$d" ]]; then
    echo "$d" >&2
    die "working tree has uncommitted changes outside $AGENT_DIR/. Commit or set them aside yourself; agent scripts never discard work."
  fi
  git rev-parse --verify -q HEAD >/dev/null || die "no HEAD commit"
  [[ -z "$(git ls-files -u)" ]] || die "unresolved merge conflicts"
}

require_not_main() {
  local b; b="$(git branch --show-current)"
  [[ -n "$b" ]] || die "detached HEAD. Check out a working branch first."
  case "$b" in main|master) die "refusing to work on '$b' (CLAUDE.md: never commit to main)";; esac
}

# Stage everything the agent changed, refuse to commit anything that looks
# like a secret or tool config, then make a LOCAL commit. Returns 1 if
# there was nothing to commit.
checkpoint_commit() {
  local msg="$1"
  git add -A -- .
  if git diff --cached --quiet; then return 1; fi

  local bad
  bad="$(git diff --cached --name-only | grep -E '(^|/)\.env|\.pem$|\.key$|id_rsa|(^|/)\.claude/|(^|/)\.codex/|^\.agent/(STATE\.md|history/.+)' || true)"
  if [[ -n "$bad" ]]; then
    git restore --staged -- . >/dev/null 2>&1 || true
    echo "$bad" >&2
    die "refusing to commit secret/config paths above (left unstaged in the working tree for you to review)"
  fi
  if git diff --cached -U0 | grep -qE '^\+.*(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-[A-Za-z0-9-]{10,}|BEGIN [A-Z ]*PRIVATE KEY|(API_KEY|SECRET|TOKEN)[A-Z_]*=[^$[:space:]]{8,})'; then
    git restore --staged -- . >/dev/null 2>&1 || true
    die "staged diff contains a credential-like string; nothing committed (changes left unstaged for review)"
  fi
  git commit -q -m "$msg" || die "git commit failed (changes remain staged)"
}

# ── Tooling ────────────────────────────────────────────────────────────
require_cli() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' CLI not found on PATH. Install/authenticate it first. Nothing was run."
}

# run_with_timeout SECS STDIN_FILE OUT_FILE cmd... → the command's exit
# status, or 124 on timeout. macOS has no coreutils `timeout`. The explicit
# stdin redirect matters: bash would otherwise give a background job
# /dev/null.
run_with_timeout() {
  local secs="$1" in="$2" out="$3"; shift 3
  local flag; flag="$(mktemp)"; rm -f "$flag"
  "$@" <"$in" >"$out" 2>&1 &
  local pid=$! rc=0
  ( sleep "$secs" && touch "$flag" && kill -TERM "$pid" 2>/dev/null && sleep 10 && kill -KILL "$pid" 2>/dev/null ) >/dev/null 2>&1 &
  local watchdog=$!
  wait "$pid" 2>/dev/null || rc=$?
  pkill -P "$watchdog" 2>/dev/null || true
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  if [[ -e "$flag" ]]; then rc=124; rm -f "$flag"; fi
  return $rc
}

# Run the task's verify command ourselves: the builder's report is never
# trusted. Records the result in STATE.md.
run_verify() {
  local cmd log rc=0
  cmd="$(task_verify_cmd)"
  log="$HISTORY_DIR/verify-$(stamp).log"
  note "verifying independently: $cmd"
  bash -c "$cmd" >"$log" 2>&1 || rc=$?
  if [[ $rc -eq 0 ]]; then
    state_set last_verify "PASS \`$cmd\` @ $(short HEAD)+wt $(now_utc)"
  else
    tail -n 30 "$log" >&2
    state_set last_verify "FAIL (exit $rc) \`$cmd\` $(now_utc) — $log"
  fi
  return $rc
}

# Claude CLI invocation shared by build and fix. Print mode, file edits
# auto-accepted, and only the listed read-only/test shell commands
# allowed. `--permission-prompts none` auto-denies anything else instead of
# hanging, including git commit/push/reset.
CLAUDE_ALLOWED_TOOLS=(
  Read Edit Write Glob Grep
  "Bash(npm test)" "Bash(npm test *)" "Bash(npm run typecheck*)" "Bash(npm run lint*)"
  "Bash(npm run build*)" "Bash(npx vitest *)" "Bash(npx tsc *)" "Bash(npx eslint *)"
  "Bash(git status*)" "Bash(git diff*)" "Bash(git log*)" "Bash(git show*)"
  "Bash(rg *)" "Bash(grep *)" "Bash(ls *)"
)
CLAUDE_DENIED_TOOLS=(
  "Bash(git push*)" "Bash(git commit*)" "Bash(git reset*)" "Bash(git checkout*)"
  "Bash(git clean*)" "Bash(git stash*)" "Bash(git rebase*)" "Bash(rm *)"
  WebFetch WebSearch Agent
)

# run_claude PROMPT OUT_FILE [extra claude args...]
run_claude() {
  local prompt="$1" out="$2"; shift 2
  run_with_timeout "${AGENT_CLAUDE_TIMEOUT:-3600}" /dev/null "$out" \
    claude -p "$prompt" \
      --permission-mode acceptEdits \
      --permission-prompts none \
      --allowedTools "${CLAUDE_ALLOWED_TOOLS[@]}" \
      --disallowedTools "${CLAUDE_DENIED_TOOLS[@]}" \
      --output-format text \
      --no-session-persistence \
      "$@"
}

# Last "KEY: value" line in a file.
last_marker() { { grep -E "^$1:" "$2" 2>/dev/null || true; } | tail -n1 | sed "s/^$1: *//"; }
# Number of "KEY:" lines in a file (0 if none or no file).
marker_count() { local n; n="$(grep -cE "^$1:" "$2" 2>/dev/null || true)"; echo "${n:-0}"; }

# A STOP condition: a line starting "STOP:" or "STOP " (build, fix and
# audit output alike). Prose merely mentioning "stop" does not match.
has_stop_marker() { grep -qE '^STOP[: ]' "$1" 2>/dev/null; }
first_stop_marker() { { grep -E '^STOP[: ]' "$1" 2>/dev/null || true; } | head -n1; }

# The canonical AUDIT_SUMMARY: all four counts, in order, as bounded
# non-negative base-10 integers, and nothing else. Anything else is
# malformed — never read as zero.
AUDIT_COUNT_RE='(0|[1-9][0-9]{0,3})'
AUDIT_SUMMARY_RE="^CRITICAL=$AUDIT_COUNT_RE HIGH=$AUDIT_COUNT_RE MEDIUM=$AUDIT_COUNT_RE LOW=$AUDIT_COUNT_RE\$"
# audit_counts SUMMARY → prints "C H M L"; returns 1 if not canonical.
audit_counts() {
  [[ "$1" =~ $AUDIT_SUMMARY_RE ]] || return 1
  echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]} ${BASH_REMATCH[3]} ${BASH_REMATCH[4]}"
}
# audit_output_valid FILE — exactly one AUDIT_STATUS line, exactly
# "ASSESSED", and exactly one canonical AUDIT_SUMMARY line.
audit_output_valid() {
  [[ "$(marker_count AUDIT_STATUS "$1")" == 1 && "$(last_marker AUDIT_STATUS "$1")" == ASSESSED &&
     "$(marker_count AUDIT_SUMMARY "$1")" == 1 ]] && audit_counts "$(last_marker AUDIT_SUMMARY "$1")" >/dev/null
}
