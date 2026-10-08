#!/usr/bin/env bash
# Deterministic tests for scripts/agent-run. No real Claude/Codex call:
# each case builds a throwaway git repo holding copies of the REAL
# scripts/agent-{lib.sh,build,audit,fix,status,run,context.py,runstate.py},
# with fake `claude` and `codex` CLIs first on PATH that replay a scripted
# sequence and count their calls. A fake `git` records any push/reset/rebase/
# checkout/stash/clean; fake `supabase`, `vercel` and `psql` record any call;
# fake `npm`/`npx` log the verification commands the runner chose.
#
#   bash scripts/tests/agent-run.test.sh
set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_GIT="$(command -v git)"
PASSED=0; FAILED=0; FAILS=""
export AGENT_CLAUDE_TIMEOUT=20 AGENT_CODEX_TIMEOUT=20
# The operator's audit tier/model choice never leaks into the fixtures.
unset AGENT_AUDIT_TIER AGENT_CODEX_MODEL AGENT_CODEX_REASONING

# ── fixture ────────────────────────────────────────────────────────────
# setup "claude actions" "codex results" — one action/result per line.
setup() {
  T="$(mktemp -d "${TMPDIR:-/tmp}/agent-run-test.XXXXXX")"; R="$T/repo"; B="$T/bin"
  mkdir -p "$R/scripts" "$R/.agent/history" "$B"
  for f in agent-lib.sh agent-build agent-audit agent-fix agent-status agent-run agent-context.py agent-runstate.py; do
    cp "$SRC/scripts/$f" "$R/scripts/$f"
  done
  printf 'STATE.md\nhistory/*\n' > "$R/.agent/.gitignore"
  cat > "$R/.agent/CURRENT_TASK.md" <<'EOF'
# Task: Fixture task
Starting HEAD: auto
Verify command: `test ! -e verify-fail`
EOF
  # Fake quality gate: passes, or (per line of $FAKE_DIR/gate.seq) fails on tests alone with
  # Vitest-format output, exactly like the real gate (tail + QUALITY_GATE line + logs dir).
  cat > "$R/scripts/quality-gate.sh" <<'EOF'
#!/usr/bin/env bash
echo gate >> "$FAKE_DIR/gate.log"
n="$(wc -l < "$FAKE_DIR/gate.log" | tr -d ' ')"
act="$(sed -n "${n}p" "$FAKE_DIR/gate.seq" 2>/dev/null)"
TOOL='src/tooling/agent-run.test.ts > scripts/agent-run > passes the harness boundary/usage tests (agent-context.test.py)'
TIMEOUT_BODY='AssertionError: ...........E..
ERROR: test_timeout_cleanup_needs_no_process_enumeration (__main__.HarnessTests)
subprocess.TimeoutExpired: Command sleep 20 timed out after 4.99 seconds
FAILED (errors=1)
: expected 1 to be +0 // Object.is equality'
case "${act:-pass}" in
  pass) exit 0;;
  flaky1) targets=("$TOOL"); body="$TIMEOUT_BODY";;
  flaky2) targets=("$TOOL" 'src/domain/calc.test.ts > calc > adds'); body='Error: Test timed out in 5000ms.';;
  flaky3) targets=("$TOOL" 'src/a.test.ts > a > x' 'src/b.test.ts > b > y'); body="$TIMEOUT_BODY";;
  crash) targets=("$TOOL"); body="$TIMEOUT_BODY
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory";;
  product) targets=('src/domain/calc.test.ts > calc > adds'); body='AssertionError: expected 1 to be 2';;
  producttimeout) targets=('src/domain/calc.test.ts > calc > adds'); body='Error: Test timed out in 5000ms.';;
  suite) targets=('src/domain/calc.test.ts [ src/domain/calc.test.ts ]'); body='Error: boom';;
esac
d=".agent/history/quality-fake-$n"; mkdir -p "$d"
files="$(printf '%s\n' "${targets[@]}" | sed 's/ .*//' | sort -u | wc -l | tr -d ' ')"
{ echo " RUN  v4.1.11"; echo; echo "⎯⎯⎯⎯⎯⎯⎯ Failed Tests ${#targets[@]} ⎯⎯⎯⎯⎯⎯⎯"; echo
  for t in "${targets[@]}"; do echo " FAIL  $t"; printf '%s\n\n' "$body"; done
  echo " Test Files  $files failed | 277 passed (278)"
  echo "      Tests  ${#targets[@]} failed | 4814 passed (4815)"; } > "$d/test.log"
tail -n 60 "$d/test.log"
echo "QUALITY_GATE fail — tests fail, typecheck skipped, lint skipped, build skipped — logs: $d"
exit 1
EOF
  mkdir -p "$R/docs/farm-return-next"
  printf '# Contracts\n\n## Frozen contract inventory (`src/domain/*.ts`)\n\n| Concern | Modules |\n|---|---|\n| Evidence | `evidence.ts`, `nutrients.ts` |\n| Shared | `types.ts`, `units.ts` |\n\n## Frozen contract inventory (`src/lib/farm-data/*.ts`)\n' \
    > "$R/docs/farm-return-next/DOMAIN_CONTRACTS.md"
  echo base > "$R/work.txt"
  printf '%s\n' "$1" > "$T/claude.seq"; printf '%s\n' "$2" > "$T/codex.seq"
  : > "$T/forbidden"

  cat > "$B/claude" <<'EOF'
#!/usr/bin/env bash
# hold SIGNAL — announce "<tool> <call#>" in $FAKE_DIR/hanging, then block until interrupt_run
# releases it (the runner starts fakes as background jobs, so they never see its Ctrl+C).
hold() {
  echo "$1" > "$FAKE_DIR/hanging"
  for _ in $(seq 1 9000); do [[ -e "$FAKE_DIR/release" ]] && { rm -f "$FAKE_DIR/hanging"; exit 130; }; sleep 0.1; done
  rm -f "$FAKE_DIR/hanging"
}
n=$(( $(cat "$FAKE_DIR/claude.n" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_DIR/claude.n"
act="$(sed -n "${n}p" "$FAKE_DIR/claude.seq")"
if [[ "$act" == badjson ]]; then echo "change $n" >> work.txt; echo "Permission wrapper: unexpected EOF"; exit 1; fi
(
case "$act" in
  done) echo "change $n" >> work.txt; echo "BUILD_RESULT: DONE";;
  nomarker) echo "change $n" >> work.txt; echo "Work finished; background process ended oddly.";;
  doc) echo "note $n" >> notes.md; echo "BUILD_RESULT: DONE";;
  script) printf '#!/usr/bin/env bash\necho %s\n' "$n" > scripts/tool.sh; echo "BUILD_RESULT: DONE";;
  domain) mkdir -p src/domain; echo "export const x$n = $n;" >> src/domain/calc.ts; echo "BUILD_RESULT: DONE";;
  shared) mkdir -p src/lib/farm-data; echo "export const q$n = $n;" >> src/lib/farm-data/query.ts; echo "BUILD_RESULT: DONE";;
  migration) mkdir -p supabase/migrations; echo "select $n;" > supabase/migrations/0001_x.sql; echo "BUILD_RESULT: DONE";;
  blocked) echo "BUILD_RESULT: BLOCKED needs a product decision";;
  sciblocked) echo "BUILD_RESULT: BLOCKED SCIENTIFIC_DECISION_REQUIRED unsourced coefficient";;
  verifyfail) touch verify-fail; echo "BUILD_RESULT: DONE";;
  stop) echo "change $n" >> work.txt; printf 'STOP: scope question for the human\nBUILD_RESULT: DONE\n';;
  retask) touch verify-fail; sed -i.bak 's/^Verify command: .*/Verify command: `true`/' .agent/CURRENT_TASK.md; rm -f .agent/CURRENT_TASK.md.bak
    echo "change $n" >> work.txt; echo "BUILD_RESULT: DONE";;
  hang) hold "claude $n"; echo "BUILD_RESULT: DONE";;
  slowdone) echo "change $n" >> work.txt; hold "claude $n"; echo "BUILD_RESULT: DONE";;
  *) echo "unexpected claude call $n"; exit 9;;
esac
) | python3 -c 'import sys,json; print(json.dumps({"type":"result","result":sys.stdin.read()}))'
EOF
  cat > "$B/codex" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_DIR/codex.args"
out=""; while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && { out="$2"; shift; }; shift; done
cat >/dev/null
# hold SIGNAL — announce "<tool> <call#>" in $FAKE_DIR/hanging, then block until interrupt_run
# releases it (the runner starts fakes as background jobs, so they never see its Ctrl+C).
hold() {
  echo "$1" > "$FAKE_DIR/hanging"
  for _ in $(seq 1 9000); do [[ -e "$FAKE_DIR/release" ]] && { rm -f "$FAKE_DIR/hanging"; exit 130; }; sleep 0.1; done
  rm -f "$FAKE_DIR/hanging"
}
n=$(( $(cat "$FAKE_DIR/codex.n" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_DIR/codex.n"
set -- $(sed -n "${n}p" "$FAKE_DIR/codex.seq")
case "${1:-}" in
  malformed) echo "Looks fine to me." > "$out";;
  partial) printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0\n' > "$out";;
  raw) shift; printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: %s\n' "$*" > "$out";;
  status) shift; printf 'AUDIT_STATUS: %s\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n' "$*" > "$out";;
  dup) printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=0 LOW=0\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n' > "$out";;
  stray) touch stray.txt; shift; printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s\n' "$@" > "$out";;
  stop) shift; printf '### [MEDIUM] [F001] Needs a product decision\nSTOP: human review required\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s\n' "$@" > "$out";;
  prose) shift; printf '### [MEDIUM] [F001] Runner should stop earlier\n- PROBLEM: the loop does not stop before the audit; STOP markers are honoured.\nStop conditions in the task were respected.\nSTOPPED is not a marker.\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s\n' "$@" > "$out";;
  hang) hold "codex $n"; printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n' > "$out";;
  quota) printf '{"type":"thread.started"}\n{"type":"error","message":"You have hit your usage limit. Try again at 4:12 PM."}\n{"type":"turn.failed","error":{"message":"usage limit"}}\n'; exit 1;;
  quotatext) echo "ERROR: Quota exceeded. Check your plan and billing details."; exit 1;;
  limitprose) printf '{"type":"item.completed","item":{"type":"agent_message","text":"Checks the usage limit handling"}}\n{"type":"error","message":"stream disconnected"}\n'; exit 1;;
  [0-9]*) { printf 'AUDIT_RESULT: FINDINGS\n'
            i=0; while (( i < $2 )); do i=$((i + 1)); printf '### [HIGH] [F%s%s] Defect\n- FILE:LINE: work.txt:1\n- PROBLEM: CONFIRMED, REGRESSION — x\n- WHY_IT_MATTERS: y\n- REQUIRED_FIX: z\n' "$n" "$i"; done
            i=0; while (( i < $3 )); do i=$((i + 1)); printf '### [MEDIUM] [M%s%s] Advisory title\n' "$n" "$i"; done
            printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s\n' "$@"; } > "$out";;
  *) echo "unexpected codex call $n"; exit 9;;
esac
EOF
  cat > "$B/git" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in push|reset|rebase|checkout|clean|stash) echo "git \$*" >> "\$FAKE_DIR/forbidden"; exit 97;; esac; done
for a in "\$@"; do
  if [[ "\$a" == commit && -e "\$FAKE_DIR/fail-commit" ]]; then rm -f "\$FAKE_DIR/fail-commit"; echo "permission wrapper denied commit" >&2; exit 1; fi
done
exec "$REAL_GIT" "\$@"
EOF
  for t in supabase vercel psql; do
    printf '#!/usr/bin/env bash\necho "%s $*" >> "$FAKE_DIR/forbidden"; exit 97\n' "$t" > "$B/$t"
  done
  # Fake npm/npx log what verification ran. `npm run X` fails if $FAKE_DIR/fail-X exists.
  # `npx vitest run` (an isolated retry) replays $FAKE_DIR/retry.seq: pass | fail | none (no test ran);
  # `npx vitest related` fails with a timeout-flake for each "flaky" line of $FAKE_DIR/related.seq.
  for t in npm npx; do
    cat > "$B/$t" <<EOF
#!/usr/bin/env bash
case " \$* " in *" publish "*|*deploy*) echo "$t \$*" >> "\$FAKE_DIR/forbidden"; exit 97;; esac
echo "$t \$*" >> "\$FAKE_DIR/npm.log"
[[ "\$1" == run && -e "\$FAKE_DIR/fail-\$2" ]] && { echo "\$2 failed"; exit 1; }
if [[ "\$1 \$2" == "vitest run" ]]; then
  m=\$(( \$(cat "\$FAKE_DIR/retry.n" 2>/dev/null || echo 0) + 1 )); echo "\$m" > "\$FAKE_DIR/retry.n"
  case "\$(sed -n "\${m}p" "\$FAKE_DIR/retry.seq" 2>/dev/null)" in
    fail) printf ' FAIL  %s > x\\n Test Files  1 failed (1)\\n      Tests  1 failed | 3 skipped (4)\\n' "\$3"; exit 1;;
    none) printf ' Test Files  1 skipped (1)\\n      Tests  4 skipped (4)\\n';;
    *) printf ' Test Files  1 passed (1)\\n      Tests  1 passed | 3 skipped (4)\\n';;
  esac
fi
if [[ "\$1 \$2" == "vitest related" ]]; then
  k=\$(( \$(cat "\$FAKE_DIR/related.n" 2>/dev/null || echo 0) + 1 )); echo "\$k" > "\$FAKE_DIR/related.n"
  if [[ "\$(sed -n "\${k}p" "\$FAKE_DIR/related.seq" 2>/dev/null)" == flaky ]]; then
    printf '⎯⎯ Failed Tests 1 ⎯⎯\\n FAIL  src/domain/calc.test.ts > calc > adds\\nError: Test timed out in 5000ms.\\n\\n Test Files  1 failed | 3 passed (4)\\n      Tests  1 failed | 20 passed (21)\\n'
    exit 1
  fi
fi
exit 0
EOF
  done
  chmod +x "$B"/* "$R"/scripts/agent-* "$R/scripts/quality-gate.sh"

  ( cd "$R" && "$REAL_GIT" init -q -b work && "$REAL_GIT" config user.email t@example.invalid &&
    "$REAL_GIT" config user.name test && "$REAL_GIT" add -A && "$REAL_GIT" commit -qm init &&
    python3 scripts/agent-context.py pin >/dev/null ) || { echo "fixture failed"; exit 1; }
}
teardown() { rm -rf "$T"; }

# run_in_repo cmd... → RC and $T/out. An outer agent-run's environment never leaks in.
run_in_repo() {
  RC=0; ( cd "$R" && env -u AGENT_RUN_STATE -u AGENT_PHASE -u MAX_FIX_ROUNDS -u PYTHONDONTWRITEBYTECODE -u PYTHONPYCACHEPREFIX PATH="$B:$PATH" FAKE_DIR="$T" "$@" ) > "$T/out" 2>&1 || RC=$?
}
agent_run() { run_in_repo ./scripts/agent-run "$@"; }
# interrupt_run EXPECTED [args] — start agent-run and Ctrl+C it only once the fake CLI call EXPECTED
# ("claude N" / "codex N") is holding. If that exact stage is never reached, fail the case with
# diagnostics and stop the runner without a Ctrl+C, so the wrong stage is never interrupted.
INTERRUPT_WAIT_SECS="${AGENT_TEST_INTERRUPT_WAIT_SECS:-600}"
interrupt_run() {
  local expected="$1"; shift
  rm -f "$T/hanging" "$T/release"
  # A parent (CI, vitest worker, background job) may pass SIGINT down as ignored, and bash can
  # neither trap nor reset a signal ignored on entry: restore the default before exec.
  set -m
  ( cd "$R" && exec python3 -c 'import os,signal,sys; signal.signal(signal.SIGINT, signal.SIG_DFL); os.execvp(sys.argv[1], sys.argv[1:])' env -u AGENT_RUN_STATE -u AGENT_PHASE -u PYTHONDONTWRITEBYTECODE -u PYTHONPYCACHEPREFIX PATH="$B:$PATH" FAKE_DIR="$T" ./scripts/agent-run "$@" ) > "$T/out" 2>&1 &
  local pid=$!
  set +m
  local start=$SECONDS seen="" reached=false
  while (( SECONDS - start < INTERRUPT_WAIT_SECS )); do
    seen="$(cat "$T/hanging" 2>/dev/null || true)"
    [[ "$seen" == "$expected" ]] && { reached=true; break; }
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if $reached; then
    kill -INT -- "-$pid" 2>/dev/null; RC=0; wait "$pid" || RC=$?
  else
    local stage; stage="$(grep -E '^\[[A-Z]' "$T/out" 2>/dev/null | tail -n1)"
    local diag="interrupt_run: expected stage '$expected' not reached after $((SECONDS - start))s (limit ${INTERRUPT_WAIT_SECS}s); last fake signal '${seen:-none}'; last runner stage '${stage:-none}'; calls claude=$(calls claude) codex=$(calls codex)"
    kill -TERM -- "-$pid" 2>/dev/null; RC=0; wait "$pid" || RC=$?
    echo "$diag" >> "$T/out"; echo "    $diag"
    check "reached expected interrupt stage '$expected'" false
    RC=-1  # never mistaken for a clean Ctrl+C
  fi
  # Release any fake still holding and let it exit before the next run starts.
  touch "$T/release"
  for _ in $(seq 1 100); do [[ -e "$T/hanging" ]] || break; sleep 0.1; done
  rm -f "$T/release"
}

calls() { cat "$T/$1.n" 2>/dev/null || echo 0; }
summary_file() { ls -t "$R"/.agent/history/run-2*.json 2>/dev/null | head -n1; }
sj() { # sj KEY — value from the latest run summary JSON (dotted key)
  python3 - "$(summary_file)" "$1" <<'PY'
import json, sys
v = json.load(open(sys.argv[1]))
for k in sys.argv[2].split('.'): v = v[k] if isinstance(v, dict) else v[int(k)]
print(json.dumps(v) if isinstance(v, (list, dict)) else v)
PY
}
state_file() { ls "$R"/.agent/history/run-state-*.json 2>/dev/null | head -n1; }
lines() { [[ -f "$1" ]] && wc -l < "$1" | tr -d ' ' || echo 0; }

CASE=""; CASE_OK=true
check() { # check DESCRIPTION CONDITION...
  local d="$1"; shift
  if ! "$@"; then CASE_OK=false; echo "    ✗ $d"; fi
}
begin() { CASE="$1"; CASE_OK=true; echo "• $CASE"; }
end() {
  check "no forbidden command invoked" test ! -s "$T/forbidden"
  if $CASE_OK; then PASSED=$((PASSED + 1)); else FAILED=$((FAILED + 1)); FAILS="$FAILS\n  $CASE"; sed 's/^/      | /' "$T/out"; fi
  teardown
}
has() { grep -qF -- "$1" "$T/out"; }
hasnt() { ! grep -qF -- "$1" "$T/out"; }
eq() { [[ "$1" == "$2" ]]; }
contains() { [[ "$1" == *"$2"* ]]; }
commits() { "$REAL_GIT" -C "$R" rev-list --count HEAD; }
complete() { check "exit 0" eq "$RC" 0; check "COMPLETE" has "AGENT_RUN_RESULT: COMPLETE"; }
stopped() { # stopped REASON
  check "exit 1" eq "$RC" 1; check "HUMAN_DECISION_REQUIRED" has "AGENT_RUN_RESULT: HUMAN_DECISION_REQUIRED"
  check "reason $1" has "REASON: $1"; check "not COMPLETE" hasnt "AGENT_RUN_RESULT: COMPLETE"
  check "next action" has "NEXT_RECOMMENDED_ACTION:"
}

# ── 1–5: model-call budget ─────────────────────────────────────────────
begin "1 build clean + primary clean → 2 model calls, no final audit, COMPLETE"
setup "done" "0 0 0 0"; agent_run
complete; check "1 claude call" eq "$(calls claude)" 1; check "1 codex call" eq "$(calls codex)" 1
check "summary total 2" eq "$(sj model_calls.total)" 2; check "no final audit" eq "$(sj model_calls.final_audit)" 0
check "build DONE" eq "$(sj build_result)" DONE; check "pushed NO" eq "$(sj pushed)" NO
check "one checkpoint commit" eq "$(commits)" 2; check "stage CLOSEOUT_DONE" eq "$(sj stage)" CLOSEOUT_DONE
check "status receipt complete" grep -q '"status": "complete"' "$R"/.agent/history/status-*.json
agent_run
check "rerun exit 0" eq "$RC" 0; check "rerun makes no call" eq "$(calls claude)$(calls codex)" 11; check "already complete" has "already complete"
run_in_repo ./scripts/agent-status
check "status exit 0" eq "$RC" 0; check "status COMPLETE" has "State: COMPLETE"; check "status total" has "Total: 2"
check "status full suite" has "Full suite: PASS"; check "status pushed" has "Pushed: NO"
end

begin "2 primary High → fix → final clean → 4 model calls, COMPLETE"
setup $'done\ndone' $'0 1 0 0\n0 0 1 0'; agent_run
complete; check "2 claude" eq "$(calls claude)" 2; check "2 codex" eq "$(calls codex)" 2
check "summary total 4" eq "$(sj model_calls.total)" 4; check "final audit ran" has "scripts/agent-audit --final"
check "no remediation audit" test -z "$(grep -l 'REMEDIATION VERIFICATION' "$R"/.agent/history/audit-*.prompt)"
check "final prompt scoped to fix diff" grep -q 'FINAL TASK AUDIT after fixes' "$(ls "$R"/.agent/history/audit-*.prompt | tail -n1)"
check "primary prompt changed-files-first" grep -q 'Review only the task delta' "$(ls "$R"/.agent/history/audit-*.prompt | head -n1)"
check "fix got only open findings" test -n "$(ls "$R"/.agent/history/*.open-findings.md)"
check "open findings exclude Medium" test -z "$(grep -l MEDIUM "$R"/.agent/history/*.open-findings.md)"
check "build+fix commits" eq "$(commits)" 3; check "medium recorded" eq "$(sj findings.medium)" 1
end

begin "3 primary Medium only → 2 model calls, Medium logged, COMPLETE"
setup "done" "0 0 3 2"; agent_run
complete; check "2 calls" eq "$(sj model_calls.total)" 2; check "no fix" eq "$(calls claude)" 1
check "medium 3" eq "$(sj findings.medium)" 3; check "low 2" eq "$(sj findings.low)" 2
check "medium titles recorded" contains "$(sj open_medium_low)" "Advisory title"
end

begin "4 opt-in --max-fix-rounds 2: final finds new High → second fix → second final clean → 6 calls"
setup $'done\ndone\ndone' $'0 1 0 0\n0 1 0 0\n0 0 0 0'; agent_run --max-fix-rounds 2
complete; check "6 calls" eq "$(sj model_calls.total)" 6; check "2 fixes" eq "$(sj model_calls.fix)" 2
check "2 finals" eq "$(sj model_calls.final_audit)" 2
end

begin "5 opt-in: High remains after second final → 6 calls, HUMAN_DECISION_REQUIRED"
setup $'done\ndone\ndone' $'0 1 0 0\n0 1 0 0\n0 1 0 0'; agent_run --max-fix-rounds 2
stopped REPEATED_HIGH_FINDING; check "3 claude" eq "$(calls claude)" 3; check "3 codex" eq "$(calls codex)" 3
check "6 calls" eq "$(sj model_calls.total)" 6
agent_run
check "rerun makes no call" eq "$(calls claude)$(calls codex)" 33; check "rerun exit 1" eq "$RC" 1
run_in_repo ./scripts/agent-status
check "status exit 0" eq "$RC" 0; check "status human" has "State: HUMAN_DECISION_REQUIRED"; check "status total 6" has "Total: 6"
end

begin "5b --max-fix-rounds 1 → stop after first final with High (4 calls)"
setup $'done\ndone' $'0 1 0 0\n0 1 0 0'; agent_run --max-fix-rounds 1
stopped REPEATED_HIGH_FINDING; check "4 calls" eq "$(sj model_calls.total)" 4
end

# ── budget v2: at most two automatic Codex audits by default ───────────
begin "G default: High remains after the focused final → stop at 2 Codex audits, no audit #3"
setup $'done\ndone\ndone' $'0 1 0 0\n0 1 0 0\n0 0 0 0'; agent_run
stopped REPEATED_HIGH_FINDING; check "2 codex" eq "$(calls codex)" 2; check "no second fix" eq "$(calls claude)" 2
check "4 calls" eq "$(sj model_calls.total)" 4; check "explains explicit action" has "explicit human action"
check "names the opt-in" has "--max-fix-rounds 2"; check "state kept" test -n "$(state_file)"
check "default recorded" eq "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["options"]["max_fix_rounds"])' "$(state_file)")" 1
agent_run
check "plain rerun: exit 1" eq "$RC" 1; check "plain rerun makes no call" eq "$(calls claude)$(calls codex)" 22
agent_run --max-fix-rounds 1
check "rerun with 1: no call" eq "$(calls claude)$(calls codex)" 22
agent_run --max-fix-rounds 2
complete; check "authorised" has "additional remediation round authorised"
check "exactly one more fix" eq "$(calls claude)" 3; check "exactly one more audit" eq "$(calls codex)" 3
check "6 calls" eq "$(sj model_calls.total)" 6; check "build not repeated" eq "$(sj model_calls.build)" 1
end

begin "G2 Medium/Low in the focused final → COMPLETE, no further Codex call"
setup $'done\ndone' $'0 1 2 1\n0 0 3 2'; agent_run
complete; check "2 codex" eq "$(calls codex)" 2; check "medium recorded" eq "$(sj findings.medium)" 3
end

begin "T1 default tier → gpt-6.1-sol + medium, stated in preamble and artifact"
setup "done" "0 0 0 0"; agent_run
complete; check "model arg" grep -q -- '-m gpt-6.1-sol --config model_reasoning_effort=medium' "$T/codex.args"
check "read-only sandbox kept" grep -q -- '--sandbox read-only' "$T/codex.args"
check "preamble" has "tier=standard model=gpt-6.1-sol (tier) reasoning=medium (tier)"
check "artifact names auditor" grep -q 'auditor: codex tier=standard model=gpt-6.1-sol' "$R/$(sj audits.0.artifact)"
check "telemetry records effective model" grep -q '"requested_model": "gpt-6.1-sol", "requested_reasoning": "medium", "audit_tier": "standard"' "$R/.agent/history/usage.jsonl"
end

begin "T2 strict tier → gpt-6-astra + high"
setup "done" "0 0 0 0"; run_in_repo env AGENT_AUDIT_TIER=strict ./scripts/agent-run
complete; check "strict args" grep -q -- '-m gpt-6-astra --config model_reasoning_effort=high' "$T/codex.args"
check "preamble" has "tier=strict model=gpt-6-astra (tier) reasoning=high (tier)"
end

begin "T3 explicit AGENT_CODEX_MODEL / AGENT_CODEX_REASONING override the tier"
setup "done" "0 0 0 0"; run_in_repo env AGENT_AUDIT_TIER=strict AGENT_CODEX_MODEL=custom-model AGENT_CODEX_REASONING=low ./scripts/agent-run
complete; check "override args" grep -q -- '-m custom-model --config model_reasoning_effort=low' "$T/codex.args"
check "sources stated" has "tier=strict model=custom-model (AGENT_CODEX_MODEL) reasoning=low (AGENT_CODEX_REASONING)"
teardown; setup "done" "0 0 0 0"; run_in_repo env AGENT_CODEX_REASONING=high ./scripts/agent-run
complete; check "reasoning-only override keeps tier model" grep -q -- '-m gpt-6.1-sol --config model_reasoning_effort=high' "$T/codex.args"
end

for bad in "AGENT_AUDIT_TIER=bogus" "AGENT_AUDIT_TIER=STRICT" "AGENT_CODEX_REASONING=hi;gh" "AGENT_CODEX_MODEL=-oops"; do
  begin "T4 invalid audit config '$bad' → rejected before any model call"
  setup "done" "0 0 0 0"; run_in_repo env "$bad" ./scripts/agent-run
  stopped PRECHECK_FAILED; check "0 calls" eq "$(calls claude)$(calls codex)" 00; check "no run state" test -z "$(state_file)"
  run_in_repo env "$bad" ./scripts/agent-audit --primary
  check "agent-audit exit 2" eq "$RC" 2; check "no codex" eq "$(calls codex)" 0
  run_in_repo env "$bad" ./scripts/agent-run --dry-run
  check "dry run refused" eq "$RC" 1
  end
done

begin "T5 dry run states the effective tier and the 2-audit Codex budget"
setup "done" "0 0 0 0"; agent_run --dry-run
check "exit 0" eq "$RC" 0; check "tier" has "Codex audit: tier=standard model=gpt-6.1-sol (tier) reasoning=medium (tier)"
check "budget" has "Codex audit budget: max 2 automatic"; check "0 calls" eq "$(calls claude)$(calls codex)" 00
end

# ── quota-aware stopping ───────────────────────────────────────────────
begin "Q1 quota error in primary → QUOTA_EXHAUSTED, no retry, resumes at the same audit"
setup "done" $'quota\n0 0 0 0'; agent_run
stopped QUOTA_EXHAUSTED; check "one codex attempt, no retry" eq "$(calls codex)" 1; check "1 claude" eq "$(calls claude)" 1
check "reset message surfaced" has "Try again at 4:12 PM"; check "do-not-rerun guidance" has "do not rerun until"
check "not generic unassessed" hasnt "REASON: AUDIT_UNASSESSED"
check "artifact marked" grep -q 'QUOTA_EXHAUSTED: You have hit your usage limit' "$(ls "$R"/.agent/history/audit-*.md | head -n1)"
check "state resumable" grep -q '"resumable": true' "$(state_file)"
check "stage kept at build" eq "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["stage"])' "$(state_file)")" BUILD_DONE
agent_run
complete; check "build not repeated" eq "$(calls claude)" 1; check "audit retried once on operator rerun" eq "$(calls codex)" 2
check "build counted once" eq "$(sj model_calls.build)" 1
end

begin "Q2 quota (plain-text CLI error) in focused final → QUOTA_EXHAUSTED; rerun resumes at final, no refix"
setup $'done\ndone' $'0 1 0 0\nquotatext\n0 0 0 0'; agent_run
stopped QUOTA_EXHAUSTED; check "message surfaced" has "Quota exceeded"; check "2 claude" eq "$(calls claude)" 2
agent_run
complete; check "no refix" eq "$(calls claude)" 2; check "3 codex attempts" eq "$(calls codex)" 3
end

begin "Q3 agent message mentioning 'usage limit' on a generic failure → AUDIT_UNASSESSED, not quota"
setup "done" $'limitprose\n0 0 0 0'; agent_run
stopped AUDIT_UNASSESSED; check "not quota" hasnt "QUOTA_EXHAUSTED"
end

begin "5c Critical in primary → automatic fix threshold → final clean"
setup $'done\ndone' $'1 0 0 0\n0 0 0 0'; agent_run
complete; check "4 calls" eq "$(sj model_calls.total)" 4
end

# ── 6–7: stops before model calls are wasted ───────────────────────────
begin "6 build BLOCKED → 1 model call, no audit"
setup "blocked" ""; agent_run
stopped BUILD_BLOCKED; check "1 claude" eq "$(calls claude)" 1; check "no codex" eq "$(calls codex)" 0
end

begin "6b build BLOCKED naming a stable gate → that reason"
setup "sciblocked" ""; agent_run
stopped SCIENTIFIC_DECISION_REQUIRED; check "no codex" eq "$(calls codex)" 0
end

begin "6c builder STOP marker → stop, no audit"
setup "stop" ""; agent_run
stopped AGENT_STOP; check "no codex" eq "$(calls codex)" 0
end

begin "6d build verification failure → stop, no audit"
setup "verifyfail" ""; agent_run
stopped VERIFICATION_FAILED; check "no codex" eq "$(calls codex)" 0
end

begin "6e migration without authority → MIGRATION_APPROVAL_REQUIRED, no audit"
setup "migration" ""; agent_run
stopped MIGRATION_APPROVAL_REQUIRED; check "no codex" eq "$(calls codex)" 0
end

begin "6f builder rewrites CURRENT_TASK → stop, no audit"
setup "retask" "0 0 0 0"; agent_run
stopped TASK_SCOPE_EXPANSION_REQUIRED; check "no codex" eq "$(calls codex)" 0
end

begin "7 preflight: dirty tree → 0 model calls"
setup "done" "0 0 0 0"; echo stray > "$R/untracked.txt"; agent_run
stopped PRECHECK_FAILED; check "0 calls" eq "$(calls claude)$(calls codex)" 00; check "file untouched" test -f "$R/untracked.txt"
check "no run state" test -z "$(state_file)"
end

begin "7b preflight: missing TASK.json → 0 model calls"
setup "done" "0 0 0 0"; rm "$R/.agent/TASK.json"; agent_run
stopped PRECHECK_FAILED; check "0 calls" eq "$(calls claude)$(calls codex)" 00
end

begin "7c preflight: main branch → 0 model calls"
setup "done" "0 0 0 0"; "$REAL_GIT" -C "$R" branch -qm main; agent_run
stopped PRECHECK_FAILED; check "reason mentions main" has "main"; check "0 calls" eq "$(calls claude)$(calls codex)" 00
end

begin "7d preflight: task already has commits → 0 model calls"
setup "done" "0 0 0 0"; echo more >> "$R/work.txt"; "$REAL_GIT" -C "$R" commit -qam more; agent_run
stopped PRECHECK_FAILED; check "reason" has "already has commits"; check "0 calls" eq "$(calls claude)$(calls codex)" 00
end

begin "7e preflight: STATE.md shows manual work in progress → 0 model calls"
setup "done" "0 0 0 0"; printf 'task: Fixture task\nstage: fixed\n' > "$R/.agent/STATE.md"; agent_run
stopped PRECHECK_FAILED; check "0 calls" eq "$(calls claude)$(calls codex)" 00
end

for bad in "--max-fix-rounds 3" "--max-fix-rounds 0" "--max-fix-rounds" "--bogus"; do
  begin "7f usage '$bad' rejected"
  setup "done" "0 0 0 0"; agent_run $bad
  check "exit 2" eq "$RC" 2; check "0 calls" eq "$(calls claude)" 0
  end
done

begin "7g retired MAX_FIX_ROUNDS env rejected"
setup "done" "0 0 0 0"; run_in_repo env MAX_FIX_ROUNDS=4 ./scripts/agent-run
check "exit 2" eq "$RC" 2; check "message" has "--max-fix-rounds"; check "0 calls" eq "$(calls claude)" 0
end

# ── 8–9: restart never repeats a successful model call ─────────────────
begin "8 restart after successful build (audit UNASSESSED) → build not repeated"
setup "done" $'malformed\n0 0 0 0'; agent_run
stopped AUDIT_UNASSESSED; check "1 claude" eq "$(calls claude)" 1
agent_run
complete; check "still 1 claude" eq "$(calls claude)" 1; check "2 codex attempts" eq "$(calls codex)" 2
check "build counted once" eq "$(sj model_calls.build)" 1
end

begin "8b Ctrl+C during primary audit → resume skips the build"
setup "done" $'hang\n0 0 0 0'; interrupt_run "codex 1"
check "exit 130" eq "$RC" 130; check "interrupted" has "INTERRUPTED during PRIMARY AUDIT"; check "not COMPLETE" hasnt "RESULT: COMPLETE"
agent_run
complete; check "1 claude" eq "$(calls claude)" 1; check "2 codex" eq "$(calls codex)" 2; check "resumed" has "resuming"
end

begin "9 restart after primary audit (Ctrl+C mid-fix) → no repeated build/primary"
setup $'done\nslowdone' $'0 1 0 0\n0 0 0 0'; interrupt_run "claude 2"
check "exit 130" eq "$RC" 130; check "interrupted in fix" has "INTERRUPTED during FIX 1"
agent_run
complete; check "2 claude" eq "$(calls claude)" 2; check "2 codex" eq "$(calls codex)" 2
check "fix work recovered" has "DONE_RECOVERED"; check "3 commits" eq "$(commits)" 3
end

begin "9b Ctrl+C during build without changes → no second build call"
setup "hang" ""; interrupt_run "claude 1"
check "exit 130" eq "$RC" 130; check "interrupted in build" has "INTERRUPTED during BUILD"; check "no codex" eq "$(calls codex)" 0
agent_run
stopped AGENT_OUTPUT_AMBIGUOUS; check "no repeated build" eq "$(calls claude)" 1
end

# ── 10–12: verification policy ─────────────────────────────────────────
begin "10 docs-only task → minimal local verification, no full suite"
setup "doc" "0 0 0 0"; agent_run
complete; check "category A" eq "$(sj category)" A; check "no quality gate" test ! -e "$T/gate.log"
check "no npm/npx" test ! -e "$T/npm.log"; check "full suite not required" eq "$(sj verification.full_suite)" NOT_REQUIRED
check "diff check ran" eq "$(sj verification.diff_check)" PASS
check "production unchanged" eq "$(sj production_changed)" NO
end

begin "11 isolated non-production module → targeted tests + typecheck only"
setup "script" "0 0 0 0"; agent_run
complete; check "category B" eq "$(sj category)" B; check "no quality gate" test ! -e "$T/gate.log"
check "typecheck ran" grep -q 'npm run typecheck' "$T/npm.log"; check "no build" test -z "$(grep 'run build' "$T/npm.log")"
check "targeted PASS" eq "$(sj verification.targeted_tests)" PASS; check "full suite not required" eq "$(sj verification.full_suite)" NOT_REQUIRED
end

begin "11b production domain logic → targeted + typecheck + lint + build, no full suite"
setup "domain" "0 0 0 0"; agent_run
complete; check "category D" eq "$(sj category)" D; check "no quality gate" test ! -e "$T/gate.log"
check "vitest related" grep -q 'vitest related' "$T/npm.log"; check "build" grep -q 'npm run build' "$T/npm.log"
check "scoped eslint" grep -q 'eslint src/domain/calc.ts' "$T/npm.log"; check "production changed" eq "$(sj production_changed)" YES
end

begin "12 shared contract change → full verification path"
setup "shared" "0 0 0 0"; agent_run
complete; check "category E" eq "$(sj category)" E; check "full gate once" eq "$(lines "$T/gate.log")" 1
check "full suite PASS" eq "$(sj verification.full_suite)" PASS
end

begin "12b --full-tests forces the full path for a docs change"
setup "doc" "0 0 0 0"; agent_run --full-tests
complete; check "full gate ran" eq "$(lines "$T/gate.log")" 1
end

begin "12c cache: fix touching only docs does not rerun typecheck"
setup $'script\ndoc' $'0 1 0 0\n0 0 0 0'; agent_run
complete; check "typecheck ran once" eq "$(grep -c 'npm run typecheck' "$T/npm.log")" 1
check "typecheck reused" contains "$(sj verification_commands_reused)" "npm run typecheck"
end

# ── 13–15: locking, commit recovery, no push ───────────────────────────
begin "13 concurrent runner → 0 model calls from the second process"
setup "done" "0 0 0 0"
sleep 30 & holder=$!
python3 -c 'import json,socket,sys; json.dump(dict(pid=int(sys.argv[1]),host=socket.gethostname(),run_id="other"),open(sys.argv[2],"w"))' "$holder" "$R/.agent/history/agent-run.lock"
agent_run
check "exit 3" eq "$RC" 3; check "RUNNER_ACTIVE" has "RUNNER_ACTIVE"; check "0 calls" eq "$(calls claude)$(calls codex)" 00
check "live lock kept" grep -q "$holder" "$R/.agent/history/agent-run.lock"; check "no run state" test -z "$(state_file)"
kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
agent_run
complete; check "stale lock replaced deterministically" eq "$(calls claude)" 1; check "lock released" test ! -e "$R/.agent/history/agent-run.lock"
end

begin "14 permission wrapper blocks the harness commit → deterministic local recovery"
setup "done" "0 0 0 0"; touch "$T/fail-commit"; agent_run
complete; check "commit recovered" has "DONE_COMMIT_RECOVERED"; check "one checkpoint" eq "$(commits)" 2
check "verification reused, not rerun" eq "$(lines "$T/gate.log")" 1; check "1 claude" eq "$(calls claude)" 1
end

begin "14b no BUILD_RESULT (wrapper ended oddly) → DONE_RECOVERED, no extra model call"
setup "nomarker" "0 0 0 0"; agent_run
complete; check "recovered" eq "$(sj build_result)" DONE_RECOVERED; check "1 claude" eq "$(calls claude)" 1
end

begin "14c invalid CLI JSON with valid edits → DONE_RECOVERED"
setup "badjson" "0 0 0 0"; agent_run
complete; check "recovered" eq "$(sj build_result)" DONE_RECOVERED
end

begin "14d --no-auto-commit → ambiguous output needs a human"
setup "nomarker" "0 0 0 0"; agent_run --no-auto-commit
stopped AGENT_OUTPUT_AMBIGUOUS; check "edits kept" grep -q 'change 1' "$R/work.txt"; check "no audit" eq "$(calls codex)" 0
end

begin "15 no code path executes git push; dry run is inert"
setup "done" "0 0 0 0"
for f in agent-run agent-runstate.py agent-status; do
  code="$(grep -vE '^[[:space:]]*#' "$SRC/scripts/$f")"
  check "$f: no git push/reset/rebase/checkout/stash/clean" test -z "$(grep -E "git[^|;&]* (push|reset|rebase|checkout|stash|clean)|'(push|reset|rebase|checkout|stash|clean)'" <<<"$code")"
  check "$f: no deploy/migration tooling" test -z "$(grep -iE 'supabase |vercel|db push|psql' <<<"$code")"
done
before="$("$REAL_GIT" -C "$R" status --porcelain)"
agent_run --dry-run
check "dry run exit 0" eq "$RC" 0; check "budget shown" has "Model-call budget"; check "category shown" has "Verification category"
check "0 calls" eq "$(calls claude)$(calls codex)" 00; check "no run state" test -z "$(state_file)"
check "tree unchanged" eq "$("$REAL_GIT" -C "$R" status --porcelain)" "$before"
run_in_repo ./scripts/agent-build --dry-run
check "agent-build --dry-run still works" eq "$RC" 0
run_in_repo ./scripts/agent-status
check "status before any run" has "NOT_STARTED"; check "status wrote no STATE.md" test ! -e "$R/.agent/STATE.md"
check "tree still unchanged after status" eq "$("$REAL_GIT" -C "$R" status --porcelain)" "$before"
check "no bytecode cache written" test ! -e "$R/scripts/__pycache__"
end

begin "R1 no bytecode cache: fresh run passes preflight with Python cache writes enabled"
setup "done" "0 0 0 0"; agent_run
complete; check "no scripts/__pycache__" test ! -e "$R/scripts/__pycache__"
end

begin "R2 COMPLETE is not re-reported for a changed HEAD, branch or tree"
setup "done" "0 0 0 0"; agent_run
complete; closed="$("$REAL_GIT" -C "$R" rev-parse HEAD)"
echo later >> "$R/work.txt"; agent_run
stopped UNEXPECTED_STATE_CHANGE; check "dirty tree not COMPLETE" hasnt "already complete"
"$REAL_GIT" -C "$R" commit -qam later; agent_run
stopped UNEXPECTED_STATE_CHANGE; check "new HEAD named" has "not the audited closing HEAD"
run_in_repo ./scripts/agent-status
check "status flags moved HEAD" has "HEAD has since moved"
check "summary keeps audited HEAD" eq "$(cd "$R" && python3 -B -c 'import importlib.util as u, json, sys
s = u.spec_from_file_location("rs", "scripts/agent-runstate.py"); rs = u.module_from_spec(s); s.loader.exec_module(rs)
print(rs.summary(json.load(open(sys.argv[1])))["final_head"])' "$(state_file)")" "$closed"
check "state still COMPLETE" grep -q '"result": "COMPLETE"' "$(state_file)"
"$REAL_GIT" -C "$R" branch -q other "$closed"; "$REAL_GIT" -C "$R" symbolic-ref HEAD refs/heads/other; agent_run
stopped UNEXPECTED_STATE_CHANGE; check "branch named" has "now on other"
check "0 extra calls" eq "$(calls claude)$(calls codex)" 11
end

begin "R2b COMPLETE re-check covers .agent/: staged/unstaged governance changes are not COMPLETE"
setup "done" "0 0 0 0"; agent_run
complete
agent_run
complete; check "clean completed run re-reported" has "already complete"
echo "# note" >> "$R/.agent/.gitignore"; agent_run  # tracked, unstaged (CURRENT_TASK.md is guarded by the task lock)
stopped UNEXPECTED_STATE_CHANGE; check "unstaged .agent change named" has ".agent/.gitignore"
"$REAL_GIT" -C "$R" checkout -q -- .agent/.gitignore
echo "rule" > "$R/.agent/AUDIT_RULES.md"; agent_run
stopped UNEXPECTED_STATE_CHANGE; check "untracked .agent file named" has ".agent/AUDIT_RULES.md"
"$REAL_GIT" -C "$R" add .agent/AUDIT_RULES.md; agent_run
stopped UNEXPECTED_STATE_CHANGE; check "staged .agent change named" has ".agent/AUDIT_RULES.md"
"$REAL_GIT" -C "$R" rm -q --cached .agent/AUDIT_RULES.md; rm -f "$R/.agent/AUDIT_RULES.md"
echo scratch > "$R/.agent/history/ignored.txt"; agent_run
complete; check "gitignored .agent file ignored" has "already complete"
check "0 extra calls" eq "$(calls claude)$(calls codex)" 11
end

# reopen_at_primary — rewind a clean completed run to PRIMARY_DONE (accepted clean primary audit,
# closeout not yet run), as if interrupted between the audit and closeout.
# reopen_at STAGE — likewise, rewound to any saved stage (CLOSEOUT_DONE: closed, not yet finished).
reopen_at() {
  python3 - "$(state_file)" "$1" <<'PY2'
import json, sys
p = sys.argv[1]; st = json.load(open(p))
st.update(stage=sys.argv[2], result=None, reason=None, detail=None, next_action=None, finished_at=None)
json.dump(st, open(p, 'w'), indent=2)
PY2
}
reopen_at_primary() { reopen_at PRIMARY_DONE; }
# later_audit RANGE BODY [VERDICT] — a newer manual audit artifact (sorts after every run artifact).
later_audit() {
  local acc; acc="$R/$(sj audits.0.artifact)"; [[ -f "$acc" ]] || acc="$(sj audits.0.artifact)"
  { sed -n 1p "$acc"; echo "range: $1 · working-tree: false · codex exit: 0 · verdict: ${3:-ASSESSED}"; echo; printf '%s\n' "$2"; } \
    > "$R/.agent/history/audit-29991231T235959Z-99999.md"
}
HIGH1=$'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=0 LOW=0'
UNASSESSED=$'AUDIT_STATUS: UNASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0'
refused() { # refused — fail closed on a completion path with no extra model call
  stopped UNEXPECTED_STATE_CHANGE; check "names the newer audit" has "audit-29991231T235959Z-99999.md"
  check "0 extra calls" eq "$(calls claude)$(calls codex)" 11
}
task_range() { sed -n 2p "$R/$(sj audits.0.artifact)" 2>/dev/null | sed -n 's/^range: \([^ ]*\) .*/\1/p'; }

begin "F5a clean primary audit → resume at closeout → COMPLETE"
setup "done" "0 0 0 0"; agent_run; complete; reopen_at_primary; agent_run
complete; check "closed on the accepted audit" eq "$(sj audits.0.artifact)" "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["closure_audit"])' "$(ls "$R"/.agent/history/status-*.json)")"
check "no extra calls" eq "$(calls claude)$(calls codex)" 11
end

begin "F5b later same-HEAD audit with HIGH=1 → resume is not COMPLETE"
setup "done" "0 0 0 0"; agent_run; complete; reopen_at_primary
later_audit "$(task_range)" $'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=0 LOW=0'
agent_run
stopped UNEXPECTED_STATE_CHANGE; check "names the blocking audit" has "audit-29991231T235959Z-99999.md"
check "no extra calls" eq "$(calls claude)$(calls codex)" 11
end

begin "F5c later same-HEAD audit with a STOP marker → resume is not COMPLETE"
setup "done" "0 0 0 0"; agent_run; complete; reopen_at_primary
later_audit "$(task_range)" $'STOP: human review required\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0'
agent_run
stopped UNEXPECTED_STATE_CHANGE; check "names the STOP" has "STOP marker"
check "no extra calls" eq "$(calls claude)$(calls codex)" 11
end

begin "F5d later blocking audit of another HEAD or task → closeout unaffected"
setup "done" "0 0 0 0"; agent_run; complete; reopen_at_primary
base="$(task_range)"; base="${base%%..*}"
later_audit "$base..$("$REAL_GIT" -C "$R" rev-parse HEAD^)" $'STOP: other head\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=1 HIGH=1 MEDIUM=0 LOW=0'
cp "$R/.agent/history/audit-29991231T235959Z-99999.md" "$R/.agent/history/audit-29991231T235958Z-99998.md"
later_audit "0000000000000000000000000000000000000000..$("$REAL_GIT" -C "$R" rev-parse HEAD)" $'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=2 MEDIUM=0 LOW=0'
agent_run
complete; check "no extra calls" eq "$(calls claude)$(calls codex)" 11
end

begin "F5e A: completed clean run rerun unchanged → COMPLETE, no model call"
setup "done" "0 0 0 0"; agent_run; complete; agent_run
complete; check "re-reported" has "already complete"; check "0 extra calls" eq "$(calls claude)$(calls codex)" 11
end

begin "F5f B: after COMPLETE, newer same-HEAD HIGH=1 audit → rerun not COMPLETE"
setup "done" "0 0 0 0"; agent_run; complete; later_audit "$(task_range)" "$HIGH1"; agent_run
refused; check "completion re-checked" has "completion no longer valid"
end

begin "F5g C: after COMPLETE, newer same-HEAD UNASSESSED audit → rerun not COMPLETE"
setup "done" "0 0 0 0"; agent_run; complete; later_audit "$(task_range)" "$UNASSESSED" "UNASSESSED (codex exit 1)"; agent_run
refused; check "reason not ASSESSED" has "not ASSESSED"
end

begin "F5h D: CLOSEOUT_DONE resume + newer same-HEAD HIGH=1 audit → not COMPLETE"
setup "done" "0 0 0 0"; agent_run; complete; reopen_at CLOSEOUT_DONE; later_audit "$(task_range)" "$HIGH1"; agent_run
refused
end

begin "F5i E: CLOSEOUT_DONE resume + newer same-HEAD UNASSESSED audit → not COMPLETE"
setup "done" "0 0 0 0"; agent_run; complete; reopen_at CLOSEOUT_DONE; later_audit "$(task_range)" "$UNASSESSED" "UNASSESSED (codex exit 1)"; agent_run
refused
end

begin "F5j F: closeout + newer same-HEAD malformed summary → fail closed"
setup "done" "0 0 0 0"; agent_run; complete; reopen_at_primary
later_audit "$(task_range)" $'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0'; agent_run
refused; check "malformed named" has "no single canonical AUDIT_SUMMARY"
end

begin "F5k F: closeout + newer same-HEAD unavailable review (no markers) → fail closed"
setup "done" "0 0 0 0"; agent_run; complete; reopen_at_primary
later_audit "$(task_range)" "codex: service unavailable" "UNASSESSED (codex unavailable)"; agent_run
refused
end

begin "F5l G: after COMPLETE and at CLOSEOUT_DONE, other HEAD/task audits do not block"
setup "done" "0 0 0 0"; agent_run; complete
base="$(task_range)"; base="${base%%..*}"
later_audit "$base..$("$REAL_GIT" -C "$R" rev-parse HEAD^)" "$UNASSESSED" "UNASSESSED (codex exit 1)"
cp "$R/.agent/history/audit-29991231T235959Z-99999.md" "$R/.agent/history/audit-29991231T235958Z-99998.md"
later_audit "0000000000000000000000000000000000000000..$("$REAL_GIT" -C "$R" rev-parse HEAD)" "$HIGH1"
agent_run; complete; check "re-reported" has "already complete"
reopen_at CLOSEOUT_DONE; agent_run; complete
check "0 extra calls" eq "$(calls claude)$(calls codex)" 11
end

begin "R3 frozen domain modules → category E (full verification)"
setup "" ""
( cd "$R" && python3 - <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location('rs', 'scripts/agent-runstate.py')
rs = importlib.util.module_from_spec(spec); sys.argv = ['x']; spec.loader.exec_module(rs)
for f in ('src/domain/evidence.ts', 'src/domain/units.ts', 'src/domain/nutrients.ts', 'src/domain/types.ts'):
    assert rs.category(f) == 'E', f
    assert rs.plan([f], 'HEAD', False, {})['commands'][0]['name'] == 'quality_gate', f
assert rs.category('src/domain/calc.ts') == 'D'
assert rs.category('src/domain/evidence.test.ts') == 'B'
rs._frozen[:] = [None]  # inventory unreadable → every domain module is treated as frozen
assert rs.category('src/domain/calc.ts') == 'E'
PY
) > "$T/out" 2>&1; RC=$?
check "frozen modules classified E" eq "$RC" 0
end

# ── strict audit grammar and audit STOP markers (unchanged guarantees) ──
begin "N1 exact canonical CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0 → COMPLETE"
setup "done" "raw CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0"; agent_run
complete
end

for bad in "CRITICAL=0oops HIGH=0 MEDIUM=0 LOW=0" "CRITICAL=0 HIGH=0 MEDIUM=0" "CRITICAL=0 HIGH=0 LOW=0" \
           "CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0 HIGH=1" "CRITICAL=0 HIGH=-1 MEDIUM=0 LOW=0" \
           "CRITICAL=0 HIGH=00 MEDIUM=0 LOW=0" "xCRITICAL=0 HIGH=0 MEDIUM=0 LOW=0"; do
  begin "N2 malformed summary '$bad' → fail closed"
  setup "done" "raw $bad"; agent_run
  stopped AUDIT_UNASSESSED; check "no fix" eq "$(calls claude)" 1
  end
done

begin "N3 duplicate AUDIT_SUMMARY / partial summary → fail closed"
setup "done" "dup"; agent_run
stopped AUDIT_UNASSESSED; check "no fix" eq "$(calls claude)" 1
end

for st in "ASSESSEDX" "UNASSESSED"; do
  begin "N4 non-canonical AUDIT_STATUS '$st' → fail closed"
  setup "done" "status $st"; agent_run
  stopped AUDIT_UNASSESSED
  end
done

begin "N5 audit_counts helper grammar"
setup "" ""
( cd "$R" && source scripts/agent-lib.sh
  [[ "$(audit_counts 'CRITICAL=0 HIGH=12 MEDIUM=3 LOW=0')" == "0 12 3 0" ]] || exit 1
  for b in 'CRITICAL=0oops HIGH=0 MEDIUM=0 LOW=0' 'CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0 ' 'HIGH=0 CRITICAL=0 MEDIUM=0 LOW=0' \
           'CRITICAL=0 HIGH=99999 MEDIUM=0 LOW=0' ''; do
    audit_counts "$b" >/dev/null && exit 1
  done; exit 0 ) > "$T/out" 2>&1; RC=$?
check "canonical accepted, malformed rejected" eq "$RC" 0
end

begin "N6 zero-count audit with STOP marker → stop, no fix"
setup "done" "stop 0 0 1 0"; agent_run
stopped AUDIT_STOP; check "no fix" eq "$(calls claude)" 1; check "one audit" eq "$(calls codex)" 1
end

begin "N7 High audit with STOP marker → no automatic fix"
setup $'done\ndone' "stop 0 1 0 0"; agent_run
stopped AUDIT_STOP; check "no fix" eq "$(calls claude)" 1
end

begin "N8 final audit with STOP marker → no further round"
setup $'done\ndone\ndone' $'0 1 0 0\nstop 0 1 0 0'; agent_run
stopped AUDIT_STOP; check "one fix only" eq "$(calls claude)" 2
end

begin "N9 prose mentioning stop (no STOP marker) → COMPLETE"
setup "done" "prose 0 0 1 0"; agent_run
complete
end

begin "N10 unexpected working-tree change during audit → fail closed"
setup "done" "stray 0 0 0 0"; agent_run
stopped AUDIT_UNASSESSED; check "file kept" test -f "$R/stray.txt"
end

# ── harness v3: deterministic flaky-test recovery (no model call) ──────
seq_file() { local f="$1"; shift; printf '%s\n' "$@" > "$T/$f"; }
retried() { local n; n="$(grep -c 'npx vitest run' "$T/npm.log" 2>/dev/null)"; echo "${n:-0}"; }

begin "V1 single tooling timeout in the full gate → exact isolated retry passes → FLAKY_RECOVERED, committed, 1 Codex"
setup "shared" "0 0 0 0"; seq_file gate.seq flaky1; agent_run
complete; check "1 claude" eq "$(calls claude)" 1; check "1 codex" eq "$(calls codex)" 1
check "summary total 2" eq "$(sj model_calls.total)" 2
check "build checkpoint committed" eq "$(commits)" 2; check "build DONE (normal path)" eq "$(sj build_result)" DONE
check "tests FLAKY_RECOVERED" eq "$(sj verification.tests)" FLAKY_RECOVERED
check "one isolated retry" eq "$(sj verification.isolated_retries)" 1; check "exactly one vitest run" eq "$(retried)" 1
check "exact file + escaped test name" grep -qF 'npx vitest run src/tooling/agent-run.test.ts -t scripts\/agent-run passes the harness boundary\/usage tests \(agent-context\.test\.py\) --maxWorkers=1' "$T/npm.log"
check "skipped typecheck ran" grep -q '^npm run typecheck' "$T/npm.log"; check "skipped lint ran" grep -q '^npm run lint' "$T/npm.log"
check "skipped build ran" grep -q '^npm run build' "$T/npm.log"
check "typecheck PASS" eq "$(sj verification.typecheck)" PASS; check "lint PASS" eq "$(sj verification.lint)" PASS
check "build PASS" eq "$(sj verification.build)" PASS
check "report says flaky recovery" has "Flaky recovery: FLAKY_RECOVERED"; check "report tests" has "tests=FLAKY_RECOVERED"
check "report codex config" has "Codex: tier=standard model=gpt-6.1-sol reasoning=medium"
check "original failure log kept" grep -q 'tests fail, typecheck skipped' "$R/$(sj flaky_recovered.0.original_log)"
check "original test log kept" grep -q 'FAIL  src/tooling/agent-run.test.ts' "$R"/.agent/history/quality-fake-1/test.log
check "inner test named" contains "$(sj flaky_recovered.0.inner)" test_timeout_cleanup_needs_no_process_enumeration
check "gate ran once" eq "$(lines "$T/gate.log")" 1
run_in_repo ./scripts/agent-status
check "status shows tests" has "Tests: FLAKY_RECOVERED"; check "status shows retries" has "Isolated retries: 1"
end

begin "V2 isolated retry fails → VERIFICATION_FAILED, work kept, no audit, no extra model call"
setup "shared" "0 0 0 0"; seq_file gate.seq flaky1; seq_file retry.seq fail; agent_run
stopped VERIFICATION_FAILED; check "1 claude" eq "$(calls claude)" 1; check "no codex" eq "$(calls codex)" 0
check "one retry only" eq "$(retried)" 1; check "reason named" has "RETRY_FAILED"
check "skipped gates not run" test -z "$(grep 'run typecheck' "$T/npm.log")"
check "work kept uncommitted" test -f "$R/src/lib/farm-data/query.ts"; check "no checkpoint" eq "$(commits)" 1
end

begin "V3 three failing test files → no retry, VERIFICATION_FAILED"
setup "shared" "0 0 0 0"; seq_file gate.seq flaky3; agent_run
stopped VERIFICATION_FAILED; check "no retry" eq "$(retried)" 0; check "why" has "3 failing test files"
check "no codex" eq "$(calls codex)" 0
end

for kind in crash product suite; do
  begin "V4 deterministic failure '$kind' → no retry, VERIFICATION_FAILED"
  setup "shared" "0 0 0 0"; seq_file gate.seq "$kind"; agent_run
  stopped VERIFICATION_FAILED; check "no retry" eq "$(retried)" 0; check "NOT_ELIGIBLE" has "NOT_ELIGIBLE"
  check "1 claude, 0 codex" eq "$(calls claude)$(calls codex)" 10
  end
done

begin "V5 two failing files (product test timeout) → two exact retries → FLAKY_RECOVERED"
setup "shared" "0 0 0 0"; seq_file gate.seq flaky2; agent_run
complete; check "two retries" eq "$(retried)" 2; check "summary retries" eq "$(sj verification.isolated_retries)" 2
check "1 claude 1 codex" eq "$(calls claude)$(calls codex)" 11
end

begin "V6 retry that runs no test is not a pass"
setup "shared" "0 0 0 0"; seq_file gate.seq flaky1; seq_file retry.seq none; agent_run
stopped VERIFICATION_FAILED; check "RETRY_FAILED" has "RETRY_FAILED"
end

begin "V7 recovered flake but a skipped gate (build) then fails → VERIFICATION_FAILED"
setup "shared" "0 0 0 0"; seq_file gate.seq flaky1; touch "$T/fail-build"; agent_run
stopped VERIFICATION_FAILED; check "continued gates ran" grep -q '^npm run lint' "$T/npm.log"
check "reason" has "CONTINUED_GATE_FAILED"; check "no codex" eq "$(calls codex)" 0
end

begin "V8 fix verification flake → recovered, fix committed, focused final → 2 Codex, COMPLETE"
setup $'shared\nshared' $'0 1 0 0\n0 0 0 0'; seq_file gate.seq pass flaky1; agent_run
complete; check "2 claude" eq "$(calls claude)" 2; check "2 codex" eq "$(calls codex)" 2
check "build+fix commits" eq "$(commits)" 3; check "fix done" eq "$(sj fix_rounds)" 1
check "recovery during fix" eq "$(sj flaky_recovered.0.phase)" fix; check "one retry" eq "$(retried)" 1
end

begin "V9 targeted Vitest flake (category D) → FLAKY_RECOVERED, later commands continue"
setup "domain" "0 0 0 0"; seq_file related.seq flaky; agent_run
complete; check "one retry" eq "$(retried)" 1; check "targeted recovered" eq "$(sj verification.targeted_tests)" FLAKY_RECOVERED
check "build still ran" grep -q '^npm run build' "$T/npm.log"; check "1 codex" eq "$(calls codex)" 1
end

begin "V10 flake recovered, then quota in primary → resumable; rerun audits without rebuild or re-verify"
setup "shared" $'quota\n0 0 0 0'; seq_file gate.seq flaky1; agent_run
stopped QUOTA_EXHAUSTED; check "1 codex" eq "$(calls codex)" 1
agent_run
complete; check "no rebuild" eq "$(calls claude)" 1; check "gate not rerun" eq "$(lines "$T/gate.log")" 1
check "no second retry" eq "$(retried)" 1; check "report keeps recovery" has "Flaky recovery: FLAKY_RECOVERED"
end

begin "V11 recovery code path never invokes a model CLI"
setup "" ""
check "no claude/codex in recovery" test -z "$(sed -n '/^# ── deterministic flaky-test recovery/,/^def verify(/p' "$SRC/scripts/agent-runstate.py" | grep -E "'(claude|codex)'|agent-(build|fix|audit)")"
end

echo
echo "agent-run tests: $PASSED passed, $FAILED failed"
[[ $FAILED -eq 0 ]] || { printf "failed:$FAILS\n"; exit 1; }
