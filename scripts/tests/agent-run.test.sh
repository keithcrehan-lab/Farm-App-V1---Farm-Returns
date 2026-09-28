#!/usr/bin/env bash
# Deterministic tests for scripts/agent-run. No real Claude/Codex call:
# each case builds a throwaway git repo holding copies of the REAL
# scripts/agent-{lib.sh,build,audit,fix,status,run}, with fake `claude` and
# `codex` CLIs first on PATH that replay a scripted sequence. Fake `git`,
# `supabase`, `vercel`, `psql`, `npx` and `npm` wrappers record any
# push/deploy/migration-style call so case M can assert there were none.
#
#   bash scripts/tests/agent-run.test.sh
set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_GIT="$(command -v git)"
PASSED=0; FAILED=0; FAILS=""
export AGENT_CLAUDE_TIMEOUT=20 AGENT_CODEX_TIMEOUT=20

# ── fixture ────────────────────────────────────────────────────────────
# setup "claude actions" "codex results" — one action/result per line.
setup() {
  T="$(mktemp -d "${TMPDIR:-/tmp}/agent-run-test.XXXXXX")"; R="$T/repo"; B="$T/bin"
  mkdir -p "$R/scripts" "$R/.agent/history" "$B"
  for f in agent-lib.sh agent-build agent-audit agent-fix agent-status agent-run; do cp "$SRC/scripts/$f" "$R/scripts/$f"; done
  printf 'STATE.md\nhistory/*\n' > "$R/.agent/.gitignore"
  cat > "$R/.agent/CURRENT_TASK.md" <<'EOF'
# Task: Fixture task
Starting HEAD: auto
Verify command: `test ! -e verify-fail`
EOF
  echo base > "$R/work.txt"
  printf '%s\n' "$1" > "$T/claude.seq"; printf '%s\n' "$2" > "$T/codex.seq"
  : > "$T/forbidden"

  cat > "$B/claude" <<'EOF'
#!/usr/bin/env bash
n=$(( $(cat "$FAKE_DIR/claude.n" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_DIR/claude.n"
act="$(sed -n "${n}p" "$FAKE_DIR/claude.seq")"
case "$act" in
  done) echo "change $n" >> work.txt; echo "BUILD_RESULT: DONE";;
  blocked) echo "BUILD_RESULT: BLOCKED needs a product decision";;
  verifyfail) touch verify-fail; echo "BUILD_RESULT: DONE";;
  stop) echo "change $n" >> work.txt; printf 'STOP: scope question for the human\nBUILD_RESULT: DONE\n';;
  retask) touch verify-fail; sed -i.bak 's/^Verify command: .*/Verify command: `true`/' .agent/CURRENT_TASK.md; rm -f .agent/CURRENT_TASK.md.bak
    echo "change $n" >> work.txt; echo "BUILD_RESULT: DONE";;
  hang) touch "$FAKE_DIR/hanging"; sleep 8; echo "BUILD_RESULT: DONE";;
  *) echo "unexpected claude call $n"; exit 9;;
esac
EOF
  cat > "$B/codex" <<'EOF'
#!/usr/bin/env bash
out=""; while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && { out="$2"; shift; }; shift; done
cat >/dev/null
n=$(( $(cat "$FAKE_DIR/codex.n" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_DIR/codex.n"
set -- $(sed -n "${n}p" "$FAKE_DIR/codex.seq")
case "${1:-}" in
  malformed) echo "Looks fine to me." > "$out";;
  partial) printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0\n' > "$out";;
  stray) touch stray.txt; shift; printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s\n' "$@" > "$out";;
  raw) shift; printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: %s\n' "$*" > "$out";;
  status) shift; printf 'AUDIT_STATUS: %s\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n' "$*" > "$out";;
  dup) printf 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=0 LOW=0\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n' > "$out";;
  stop) shift; printf '### [MEDIUM] Needs a product decision\nSTOP: human review required\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s\n' "$@" > "$out";;
  prose) shift; printf '### [MEDIUM] Runner should stop earlier\n- Evidence: the loop does not stop before the audit; STOP markers are honoured.\nStop conditions in the task were respected.\nSTOPPED is not a marker.\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s\n' "$@" > "$out";;
  [0-9]*) printf 'Findings...\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s\n' "$@" > "$out";;
  *) echo "unexpected codex call $n"; exit 9;;
esac
EOF
  cat > "$B/git" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in push|reset|rebase|checkout|clean|stash) echo "git \$*" >> "\$FAKE_DIR/forbidden"; exit 97;; esac; done
exec "$REAL_GIT" "\$@"
EOF
  for t in supabase vercel psql npx npm; do
    printf '#!/usr/bin/env bash\necho "%s $*" >> "$FAKE_DIR/forbidden"; exit 97\n' "$t" > "$B/$t"
  done
  chmod +x "$B"/* "$R"/scripts/agent-*

  ( cd "$R" && "$REAL_GIT" init -q -b work && "$REAL_GIT" config user.email t@example.invalid &&
    "$REAL_GIT" config user.name test && "$REAL_GIT" add -A && "$REAL_GIT" commit -qm init ) || { echo "fixture failed"; exit 1; }
}
teardown() { rm -rf "$T"; }

# run_in_repo cmd... → RC and $T/out
run_in_repo() {
  RC=0; ( cd "$R" && env PATH="$B:$PATH" FAKE_DIR="$T" "$@" ) > "$T/out" 2>&1 || RC=$?
}
agent_run() { # MFR set (even empty) → passed as MAX_FIX_ROUNDS; unset → default
  if [[ -n "${MFR+x}" ]]; then run_in_repo env "MAX_FIX_ROUNDS=$MFR" ./scripts/agent-run
  else run_in_repo env -u MAX_FIX_ROUNDS ./scripts/agent-run; fi
}

calls() { cat "$T/$1.n" 2>/dev/null || echo 0; }
record_file() { ls "$R"/.agent/history/run-*.md 2>/dev/null | head -n1; }

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
rec_has() { grep -qF -- "$1" "$(record_file)"; }
rec_hasnt() { ! grep -qF -- "$1" "$(record_file)"; }
eq() { [[ "$1" == "$2" ]]; }
commits() { "$REAL_GIT" -C "$R" rev-list --count HEAD; }

# ── cases ──────────────────────────────────────────────────────────────
begin "A build clean + first audit clean → exit 0, no fix"
setup "done" "0 0 0 0"; unset MFR; agent_run
check "exit 0" eq "$RC" 0; check "CLEAN" has "Status: CLEAN"; check "one claude call" eq "$(calls claude)" 1
check "one codex call" eq "$(calls codex)" 1; check "0 fix rounds" has "Fix rounds: 0"; check "record CLEAN" rec_has "status: CLEAN"
check "one new commit" eq "$(commits)" 2; check "default ceiling 4" has "Max fix rounds: 4"
end

begin "B 1 HIGH → first fix → verification clean"
setup $'done\ndone' $'0 1 0 0\n0 0 1 0'; agent_run
check "exit 0" eq "$RC" 0; check "CLEAN" has "Status: CLEAN"; check "1 fix round" has "Fix rounds: 1"
check "remaining line" has "Remaining: 0 Critical / 0 High / 1 Medium / 0 Low"; check "PASS verification" has "Tests/verification: PASS"
check "build+fix commits" eq "$(commits)" 3; check "verify audit ran" has "VERIFY AUDIT"
check "first fix has no --another-round" rec_hasnt "--another-round"
end

begin "C HIGH survives first fix → --another-round used"
setup $'done\ndone\ndone' $'0 1 0 0\n0 1 0 0\n0 0 0 0'; agent_run
check "exit 0" eq "$RC" 0; check "2 fix rounds" has "Fix rounds: 2"
check "round 2 uses --another-round" rec_has "FIX ROUND 2: \`scripts/agent-fix --another-round\`"
check "round 1 plain agent-fix" rec_has "FIX ROUND 1: \`scripts/agent-fix\`"
end

begin "D CRITICAL in audit → immediate STOP, no fix"
setup "done" "1 2 0 0"; agent_run
check "exit 4" eq "$RC" 4; check "no fix call" eq "$(calls claude)" 1; check "not CLEAN" hasnt "Status: CLEAN"
check "record STOPPED" rec_has "status: STOPPED"
end

begin "D2 CRITICAL surfacing in a verification audit → STOP"
setup $'done\ndone' $'0 1 0 0\n1 0 0 0'; agent_run
check "exit 4" eq "$RC" 4; check "no second fix" eq "$(calls claude)" 2
end

begin "E build failure (BLOCKED) → STOP, no audit/fix"
setup "blocked" ""; agent_run
check "exit 1" eq "$RC" 1; check "no codex call" eq "$(calls codex)" 0; check "one claude call" eq "$(calls claude)" 1
check "not DONE reason" has "BUILD not DONE"; check "not CLEAN" hasnt "Status: CLEAN"
end

begin "E2 builder reports a STOP condition → STOP, no audit"
setup "stop" ""; agent_run
check "exit 1" eq "$RC" 1; check "no codex call" eq "$(calls codex)" 0; check "STOP reason" has "STOP condition"
end

begin "F malformed audit → fail closed"
setup "done" "malformed"; agent_run
check "exit 3" eq "$RC" 3; check "UNASSESSED" has "UNASSESSED"; check "no fix" eq "$(calls claude)" 1
end

begin "F2 audit summary missing MEDIUM/LOW → fail closed"
setup "done" "partial"; agent_run
check "exit 3" eq "$RC" 3; check "UNASSESSED" has "UNASSESSED"; check "not CLEAN" hasnt "Status: CLEAN"
end

begin "G fix verification failure → STOP"
setup $'done\nverifyfail' "0 1 0 0"; agent_run
check "exit 1" eq "$RC" 1; check "verification failed" has "verification failed"; check "no verify audit" eq "$(calls codex)" 1
check "FAIL recorded" has "Tests/verification: FAIL"
end

begin "H maximum fix rounds exhausted → STOP"
setup $'done\ndone\ndone' $'0 1 0 0\n0 1 0 0\n0 1 0 0'; MFR=2; agent_run; unset MFR
check "exit 5" eq "$RC" 5; check "2 rounds" has "Fix rounds: 2"; check "3 claude calls" eq "$(calls claude)" 3
check "3 codex calls" eq "$(calls codex)" 3; check "reason" has "remain after 2 of 2"
# Manual commands keep their own safeguard: no third round without the flag.
run_in_repo ./scripts/agent-fix
check "manual agent-fix still demands --another-round" has "--another-round"
check "manual agent-fix refused" test "$RC" -ne 0; check "no extra claude call" eq "$(calls claude)" 3
run_in_repo ./scripts/agent-status
check "agent-status works" eq "$RC" 0
end

begin "H0 MAX_FIX_ROUNDS=0 with HIGH → STOP without fixing"
setup "done" "0 1 0 0"; MFR=0; agent_run; unset MFR
check "exit 5" eq "$RC" 5; check "no fix" eq "$(calls claude)" 1
end

begin "I Medium/Low only → CLEAN"
setup "done" "0 0 3 2"; agent_run
check "exit 0" eq "$RC" 0; check "CLEAN" has "Status: CLEAN"; check "remaining" has "0 Critical / 0 High / 3 Medium / 2 Low"
end

begin "J Ctrl+C does not claim CLEAN"
setup "hang" ""
set -m
( cd "$R" && exec env PATH="$B:$PATH" FAKE_DIR="$T" ./scripts/agent-run ) > "$T/out" 2>&1 &
pid=$!
set +m
for _ in $(seq 1 100); do [[ -e "$T/hanging" ]] && break; sleep 0.1; done
kill -INT -- "-$pid" 2>/dev/null; RC=0; wait "$pid" || RC=$?
check "exit 130" eq "$RC" 130; check "interrupted message" has "INTERRUPTED during: BUILD"
check "points to agent-status" has "agent-status"; check "not CLEAN" hasnt "Status: CLEAN"
check "record INTERRUPTED" rec_has "status: INTERRUPTED"; check "record not CLEAN" rec_hasnt "CLEAN"
check "no audit" eq "$(calls codex)" 0
end

for bad in abc -1 11 "" 1.5 " 2"; do
  begin "K invalid MAX_FIX_ROUNDS='$bad' rejected"
  setup "done" "0 0 0 0"; MFR="$bad"; agent_run; unset MFR
  check "exit 2" eq "$RC" 2; check "message" has "MAX_FIX_ROUNDS"; check "nothing run" eq "$(calls claude)" 0
  end
done

begin "L dirty tree before start → refused, guard not bypassed"
setup "done" "0 0 0 0"; echo stray > "$R/untracked.txt"; agent_run
check "exit 2" eq "$RC" 2; check "no claude call" eq "$(calls claude)" 0; check "file untouched" test -f "$R/untracked.txt"
check "reason" has "uncommitted changes"
end

begin "L2 unexpected working-tree change mid-run → STOP"
setup "done" "stray 0 0 0 0"; agent_run
check "exit 6" eq "$RC" 6; check "reason" has "unexpected working-tree changes"; check "file kept" test -f "$R/stray.txt"
end

begin "L3 task already in progress → refuse (no invented resume)"
setup "done" "0 0 0 0"; printf 'task: Fixture task\nstage: fixed\n' > "$R/.agent/STATE.md"; agent_run
check "exit 2" eq "$RC" 2; check "reason" has "does not resume"; check "no claude call" eq "$(calls claude)" 0
end

begin "L4 pinned Starting HEAD is not HEAD → refuse"
setup "done" "0 0 0 0"
first="$("$REAL_GIT" -C "$R" rev-parse --short HEAD)"; echo more >> "$R/work.txt"
sed -i.bak "s/^Starting HEAD: .*/Starting HEAD: $first/" "$R/.agent/CURRENT_TASK.md"; rm -f "$R/.agent/CURRENT_TASK.md.bak"
"$REAL_GIT" -C "$R" commit -qam more; agent_run
check "exit 2" eq "$RC" 2; check "reason" has "Starting HEAD"; check "no claude call" eq "$(calls claude)" 0
end

begin "L5 main branch → refused by the existing guard"
setup "done" "0 0 0 0"; "$REAL_GIT" -C "$R" branch -qm main; agent_run
check "exit 2" eq "$RC" 2; check "reason" has "main"; check "no claude call" eq "$(calls claude)" 0
end

begin "L6 builder rewrites CURRENT_TASK Verify command → STOP, no audit"
setup "retask" "0 0 0 0"; agent_run
check "exit 6" eq "$RC" 6; check "reason" has "CURRENT_TASK.md changed"; check "no codex call" eq "$(calls codex)" 0
check "not CLEAN" hasnt "Status: CLEAN"
end

# ── strict audit grammar and audit STOP markers ──
begin "N1 exact canonical CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0 → CLEAN"
setup "done" "raw CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0"; agent_run
check "exit 0" eq "$RC" 0; check "CLEAN" has "Status: CLEAN"
end

for bad in "CRITICAL=0oops HIGH=0 MEDIUM=0 LOW=0" "CRITICAL=0 HIGH=0oops MEDIUM=0 LOW=0" \
           "CRITICAL=0oops HIGH=0oops MEDIUM=0oops LOW=0oops" "CRITICAL=0 HIGH=0 MEDIUM=0" \
           "CRITICAL=0 HIGH=0 LOW=0" "CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0 HIGH=1" \
           "CRITICAL=0 HIGH=-1 MEDIUM=0 LOW=0" "CRITICAL=0 HIGH=1.5 MEDIUM=0 LOW=0" \
           "CRITICAL=0 HIGH=00 MEDIUM=0 LOW=0" "CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0 extra" \
           "xCRITICAL=0 HIGH=0 MEDIUM=0 LOW=0" "CRITICAL=0 HIGH=0x0 MEDIUM=0 LOW=0"; do
  begin "N2 malformed summary '$bad' → fail closed"
  setup "done" "raw $bad"; agent_run
  check "exit 3" eq "$RC" 3; check "UNASSESSED" has "UNASSESSED"; check "not CLEAN" hasnt "Status: CLEAN"
  check "no fix" eq "$(calls claude)" 1
  end
done

begin "N3 duplicate AUDIT_SUMMARY lines → fail closed"
setup "done" "dup"; agent_run
check "exit 3" eq "$RC" 3; check "not CLEAN" hasnt "Status: CLEAN"; check "no fix" eq "$(calls claude)" 1
end

for st in "ASSESSEDX" "ASSESSED maybe" "UNASSESSED"; do
  begin "N4 non-canonical AUDIT_STATUS '$st' → fail closed"
  setup "done" "status $st"; agent_run
  check "exit 3" eq "$RC" 3; check "not CLEAN" hasnt "Status: CLEAN"
  end
done

begin "N5 audit_counts helper grammar"
setup "" ""
( cd "$R" && source scripts/agent-lib.sh
  [[ "$(audit_counts 'CRITICAL=0 HIGH=12 MEDIUM=3 LOW=0')" == "0 12 3 0" ]] || exit 1
  for b in 'CRITICAL=0oops HIGH=0 MEDIUM=0 LOW=0' 'CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0 ' ' CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0' \
           'CRITICAL=0 HIGH=0 MEDIUM=0 LOW=+1' 'HIGH=0 CRITICAL=0 MEDIUM=0 LOW=0' 'CRITICAL=0 HIGH=99999 MEDIUM=0 LOW=0' ''; do
    audit_counts "$b" >/dev/null && exit 1
  done; exit 0 ) > "$T/out" 2>&1; RC=$?
check "canonical accepted, malformed rejected" eq "$RC" 0
end

begin "N6 zero-count audit with STOP marker → STOP, HUMAN REVIEW, no fix"
setup "done" "stop 0 0 1 0"; agent_run
check "exit 1" eq "$RC" 1; check "not CLEAN" hasnt "Status: CLEAN"; check "reason" has "HUMAN REVIEW"
check "record HUMAN REVIEW" rec_has "HUMAN REVIEW"; check "record STOPPED" rec_has "status: STOPPED"
check "no fix" eq "$(calls claude)" 1; check "one audit" eq "$(calls codex)" 1
end

begin "N7 HIGH audit with STOP marker → STOP, no automatic fix"
setup $'done\ndone' "stop 0 1 0 0"; agent_run
check "exit 1" eq "$RC" 1; check "reason" has "HUMAN REVIEW"; check "no fix" eq "$(calls claude)" 1
check "no fix round" has "Fix rounds: 0"; check "not CLEAN" hasnt "Status: CLEAN"
end

begin "N8 verification audit with STOP marker → STOP, no further round"
setup $'done\ndone\ndone' $'0 1 0 0\nstop 0 1 0 0'; agent_run
check "exit 1" eq "$RC" 1; check "reason" has "HUMAN REVIEW"; check "one fix only" eq "$(calls claude)" 2
end

begin "N9 prose mentioning stop (no STOP marker) → CLEAN"
setup "done" "prose 0 0 1 0"; agent_run
check "exit 0" eq "$RC" 0; check "CLEAN" has "Status: CLEAN"
end

begin "N10 prose mentioning stop with HIGH → normal fix path"
setup $'done\ndone' $'prose 0 1 0 0\n0 0 0 1'; agent_run
check "exit 0" eq "$RC" 0; check "1 fix round" has "Fix rounds: 1"
end

begin "M agent-run contains no push/deploy/migration command"
setup "" ""
code="$(grep -vE '^[[:space:]]*#' "$SRC/scripts/agent-run")"
check "no git push/reset/rebase/checkout/stash/clean" test -z "$(grep -E 'git[^|;&]* (push|reset|rebase|checkout|stash|clean)' <<<"$code")"
check "no deploy/migration tooling" test -z "$(grep -iE 'supabase|vercel|deploy|migrat|psql|db push' <<<"$code")"
run_in_repo ./scripts/agent-build --dry-run
check "agent-build --dry-run exit 0" eq "$RC" 0
end

echo
echo "agent-run tests: $PASSED passed, $FAILED failed"
[[ $FAILED -eq 0 ]] || { printf "failed:$FAILS\n"; exit 1; }
