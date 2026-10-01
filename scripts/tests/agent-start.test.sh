#!/usr/bin/env bash
# Deterministic tests for scripts/agent-start. No real Claude/Codex call: each case builds a
# throwaway git repo holding copies of the REAL harness scripts, with fake `claude`/`codex`
# CLIs first on PATH that only count calls, and scripts/agent-run wrapped so every runner
# invocation is recorded and a dry-run failure can be simulated.
#
#   bash scripts/tests/agent-start.test.sh
set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_GIT="$(command -v git)"
HOST="$(python3 -c 'import socket; print(socket.gethostname())')"
PASSED=0; FAILED=0; FAILS=""
DAY=20261001

# setup — a clean repo whose previous task "Old task" is recorded COMPLETE by agent-run.
setup() {
  T="$(mktemp -d "${TMPDIR:-/tmp}/agent-start-test.XXXXXX")"; R="$T/repo"; B="$T/bin"
  mkdir -p "$R/scripts" "$R/.agent/history" "$B"
  for f in agent-lib.sh agent-build agent-audit agent-fix agent-status agent-context.py agent-runstate.py agent-start; do
    cp "$SRC/scripts/$f" "$R/scripts/$f"
  done
  cp "$SRC/scripts/agent-run" "$R/scripts/agent-run.real"
  cat > "$R/scripts/agent-run" <<'EOF'
#!/usr/bin/env bash
echo "agent-run $*" >> "$FAKE_DIR/runner.calls"
if [[ "${1:-}" == --dry-run && -e "$FAKE_DIR/dryfail" ]]; then echo "simulated dry-run pre-flight failure"; exit 1; fi
exec "$(dirname "$0")/agent-run.real" "$@"
EOF
  for t in claude codex; do
    printf '#!/usr/bin/env bash\necho "%s $*" >> "$FAKE_DIR/model.calls"\necho "fake %s: no work"\nexit 9\n' "$t" "$t" > "$B/$t"
  done
  printf '#!/usr/bin/env bash\necho "git $*" >> "$FAKE_DIR/forbidden"; exit 97\n' > "$B/git-push-guard"
  chmod +x "$B"/* "$R"/scripts/agent-*
  printf '# AGENTS.md — Farm Return\n' > "$R/AGENTS.md"
  printf 'STATE.md\nhistory/*\n' > "$R/.agent/.gitignore"
  printf '# Task: Old task\n\nStarting HEAD: auto\nVerify command: `true`\n\nOld Campaign C brief.\n' > "$R/.agent/CURRENT_TASK.md"
  echo base > "$R/work.txt"
  ( cd "$R" && "$REAL_GIT" init -q -b work && "$REAL_GIT" config user.email t@example.invalid &&
    "$REAL_GIT" config user.name test && "$REAL_GIT" add -A && "$REAL_GIT" commit -qm init ) || { echo "fixture failed"; exit 1; }
  BASE0="$("$REAL_GIT" -C "$R" rev-parse HEAD)"
  cat > "$R/.agent/TASK.json" <<EOF
{
  "schema_version": 1,
  "task_id": "old-task",
  "title": "Old task",
  "base_sha": "$BASE0",
  "domains": ["campaign-c-science"],
  "expected_changed_files": ["src/domain/nutrients.ts"],
  "contracts": ["docs/farm-return-next/campaign-c/SOURCES_AND_CLAIMS.md"],
  "evidence": ["Teagasc Green Book tables"],
  "tests": ["src/domain/nutrients.test.ts"],
  "prohibited_areas": ["Campaign B"],
  "full_suite": true,
  "manifest_conventions": "kept"
}
EOF
  ( cd "$R" && "$REAL_GIT" add -A && "$REAL_GIT" commit -qm "old task" ) || exit 1
  HEAD0="$("$REAL_GIT" -C "$R" rev-parse HEAD)"
  prev_state '{"result": "COMPLETE", "stage": "CLOSEOUT_DONE"}'
}
teardown() { rm -rf "$T"; }
prev_state() { printf '%s\n' "$1" > "$R/.agent/history/run-state-old-task.json"; }
no_prev_state() { rm -f "$R/.agent/history/run-state-old-task.json"; }

# start ARGS... → RC and $T/out
start() {
  RC=0; ( cd "$R" && env -u AGENT_RUN_STATE -u AGENT_PHASE PATH="$B:$PATH" FAKE_DIR="$T" AGENT_START_DATE="$DAY" \
    ./scripts/agent-start "$@" ) > "$T/out" 2>&1 || RC=$?
}
BRIEF=(--title "CC-FU-B — correct slurry DM provenance labelling" --brief "Make the slurry DM label truthful.")
ID="cc-fu-b-correct-slurry-dm-provenance-labelling-$DAY"

check() { local d="$1"; shift; if ! "$@"; then CASE_OK=false; echo "    ✗ $d"; fi; }
begin() { CASE="$1"; CASE_OK=true; echo "• $CASE"; setup; : > "$T/out"; }
end() {
  check "no model call" eq "$(cat "$T/model.calls" 2>/dev/null)" ""
  if $CASE_OK; then PASSED=$((PASSED + 1)); else FAILED=$((FAILED + 1)); FAILS="$FAILS\n  $CASE"; sed 's/^/      | /' "$T/out"; fi
  teardown
}
has() { grep -qF -- "$1" "$T/out"; }
hasnt() { ! grep -qF -- "$1" "$T/out"; }
eq() { [[ "$1" == "$2" ]]; }
md() { cat "$R/.agent/CURRENT_TASK.md"; }
tj() { python3 -c 'import json,sys; v=json.load(open(sys.argv[1])); print(json.dumps(v[sys.argv[2]]) if sys.argv[2] in v else "ABSENT")' "$R/.agent/TASK.json" "$1"; }
files_hash() { cat "$R/.agent/CURRENT_TASK.md" "$R/.agent/TASK.json" | shasum | cut -d' ' -f1; }
refused() { # refused REASON — stopped before any change, no runner launched
  check "exit 1" eq "$RC" 1; check "HUMAN_DECISION_REQUIRED" has "AGENT_START_RESULT: HUMAN_DECISION_REQUIRED"
  check "reason $1" has "REASON: $1"; check "task files untouched" eq "$(files_hash)" "$BEFORE"
  check "runner not launched" test ! -e "$T/runner.calls"
}

begin "1 clean repo + title + brief → task files generated from HEAD, zero model calls"
start "${BRIEF[@]}"
check "exit 0" eq "$RC" 0; check "READY" has "AGENT_START_RESULT: READY"; check "Model calls: 0" has "Model calls: 0"
check "dry run passed" has "Dry run: PASS"; check "next step printed" has "./scripts/agent-run"
check "task id" eq "$(tj task_id)" "\"$ID\""; check "base is current HEAD" eq "$(tj base_sha)" "\"$HEAD0\""
check "md Starting HEAD" grep -qx "Starting HEAD: $HEAD0" "$R/.agent/CURRENT_TASK.md"
check "only the dry run was invoked" eq "$(cat "$T/runner.calls")" "agent-run --dry-run"
check "no backup left" test -z "$(ls -d "$R"/.agent/history/agent-start-backup-* 2>/dev/null)"
check "no stray temp files" test -z "$(ls -a "$R/.agent" | grep -E '^\.(CURRENT_TASK|TASK)')"
end

begin "2 --brief-file works"
printf '# Brief\n\nRelabel the DM provenance on `scripts/agent-run`.\n' > "$T/brief.md"
start --title "Brief file task" --brief-file "$T/brief.md"
check "exit 0" eq "$RC" 0; check "brief text in task" grep -q "Relabel the DM provenance" "$R/.agent/CURRENT_TASK.md"
check "existing path hint seeded" eq "$(tj expected_changed_files)" '["scripts/agent-run"]'
end

begin "3 --brief works; brief and brief-file are mutually exclusive and one is required"
start --title "Inline task" --brief "Inline brief text."
check "exit 0" eq "$RC" 0; check "brief text in task" grep -q "Inline brief text." "$R/.agent/CURRENT_TASK.md"
BEFORE="$(files_hash)"
start --title "X" --brief "a" --brief-file "$T/none.md"; check "both → usage exit 2" eq "$RC" 2
start --title "X"; check "neither → usage exit 2" eq "$RC" 2
check "files unchanged by usage errors" eq "$(files_hash)" "$BEFORE"
end

begin "4 task ID slug/date generation is stable"
start "${BRIEF[@]}"; first="$(tj task_id)"
check "documented example" eq "$first" "\"$ID\""
check "same title/date → same id" eq "$(cd "$R" && python3 -B -c 'import importlib.machinery as m, sys
mod = m.SourceFileLoader("s", "scripts/agent-start").load_module()
print(mod.task_id_for(sys.argv[1], sys.argv[2]))' "  CC-FU-B — correct   slurry DM provenance labelling!! " "$DAY")" "$ID"
end

begin "5 TASK.json stays valid and keeps schema-level fields"
start "${BRIEF[@]}"
check "valid JSON" python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$R/.agent/TASK.json"
check "schema_version kept" eq "$(tj schema_version)" 1; check "global field kept" eq "$(tj manifest_conventions)" '"kept"'
check "key order starts with schema" eq "$(head -3 "$R/.agent/TASK.json" | tail -1 | tr -d ' ')" "\"task_id\":\"$ID\","
end

begin "6 stale previous-task values are replaced; context is lean"
start "${BRIEF[@]}"
check "no Campaign C domain" eq "$(tj domains)" '["ui", "slurry"]'
check "default contracts only" eq "$(tj contracts)" '["AGENTS.md", ".agent/AUDIT_RULES.md", ".agent/PRODUCT_RULES.md"]'
check "generic evidence" eq "$(tj evidence)" '["task brief", "directly relevant repository files discovered by build agent"]'
check "generic tests" eq "$(tj tests)" '["task-required targeted tests", "verify command"]'
check "stale full_suite dropped" eq "$(tj full_suite)" ABSENT
check "no old expected file" eq "$(tj expected_changed_files)" '[]'
check "no stale brief text" test -z "$(grep 'Old Campaign C' "$R/.agent/CURRENT_TASK.md")"
check "migration never derived" test -z "$(grep -i migration <<<"$(tj domains)")"
end

begin "7 completed prior task (runner COMPLETE, or clean committed audit at HEAD) can be replaced"
start "${BRIEF[@]}"; check "runner COMPLETE → replaced" eq "$RC" 0
"$REAL_GIT" -C "$R" checkout -q -- .agent; no_prev_state; rm -f "$R/.agent/history/task-$ID.json"
printf '{"task_id":"old-task","base_sha":"%s","audits":[{"mode":"full","base_sha":"%s","head_sha":"%s","result":"PASS","snapshot":["false"]}],"status":"pending-final-audit"}\n' \
  "$BASE0" "$BASE0" "$HEAD0" > "$R/.agent/history/status-old-task.json"
start "${BRIEF[@]}"; check "clean committed primary at HEAD → replaced" eq "$RC" 0
"$REAL_GIT" -C "$R" checkout -q -- .agent
sed -i.bak 's/"snapshot":\["false"\]/"snapshot":["true"]/' "$R/.agent/history/status-old-task.json"
BEFORE="$(files_hash)"; start "${BRIEF[@]}"
check "working-tree audit is not completion evidence (HR-F007)" eq "$RC" 1; check "files untouched" eq "$(files_hash)" "$BEFORE"
end

begin "8 active (stopped, incomplete) task refuses replacement; RUNNING refuses even with --force-new-task"
prev_state '{"result": "HUMAN_DECISION_REQUIRED", "stage": "PRIMARY_DONE", "reason": "AUDIT_STOP"}'
BEFORE="$(files_hash)"; start "${BRIEF[@]}"; refused ACTIVE_TASK_EXISTS
no_prev_state; start "${BRIEF[@]}"; refused ACTIVE_TASK_EXISTS; check "not-started named" has "NOT_STARTED"
prev_state '{"result": null, "stage": "BUILD_DONE"}'
start "${BRIEF[@]}" --force-new-task; refused ACTIVE_TASK_EXISTS; check "running named" has "RUNNING"
prev_state '{"result": "HUMAN_DECISION_REQUIRED", "stage": "PRIMARY_DONE", "reason": "AUDIT_STOP"}'
start "${BRIEF[@]}" --force-new-task; check "inactive stopped task replaced with --force-new-task" eq "$RC" 0
end

begin "9 dirty working tree refuses before any edit"
echo dirty >> "$R/work.txt"; BEFORE="$(files_hash)"; start "${BRIEF[@]}"; refused DIRTY_WORKING_TREE
"$REAL_GIT" -C "$R" checkout -q -- work.txt; echo "# edit" >> "$R/.agent/CURRENT_TASK.md"; BEFORE="$(files_hash)"
start "${BRIEF[@]}"; refused DIRTY_WORKING_TREE
end

begin "10 live runner lock refuses"
printf '{"pid": %d, "host": "%s", "run_id": "r1"}\n' "$$" "$HOST" > "$R/.agent/history/agent-run.lock"
BEFORE="$(files_hash)"; start "${BRIEF[@]}"; refused RUNNER_ACTIVE
printf 'not json' > "$R/.agent/history/agent-run.lock"; start "${BRIEF[@]}"; refused LOCK_INDETERMINATE
end

begin "11 ambiguous previous state refuses"
no_prev_state
printf '{"task_id":"old-task","base_sha":"%s","audits":[{"mode":"full","base_sha":"%s","head_sha":"%s","result":"PASS","snapshot":["false"]}]}\n' \
  "$BASE0" "$BASE0" "$BASE0" > "$R/.agent/history/status-old-task.json"
BEFORE="$(files_hash)"; start "${BRIEF[@]}"; refused PREVIOUS_TASK_STATE_AMBIGUOUS
rm "$R/.agent/history/status-old-task.json"; prev_state '{"result": "SOMETHING_ELSE"}'
start "${BRIEF[@]}"; refused PREVIOUS_TASK_STATE_AMBIGUOUS
end

begin "12 dry-run failure restores previous task files exactly; no model calls"
touch "$T/dryfail"; BEFORE="$(files_hash)"; start "${BRIEF[@]}"
check "exit 1" eq "$RC" 1; check "reason" has "REASON: RUNNER_DRY_RUN_FAILED"; check "dry-run error shown" has "simulated dry-run pre-flight failure"
check "task files restored" eq "$(files_hash)" "$BEFORE"; check "tree clean" test -z "$("$REAL_GIT" -C "$R" status --porcelain)"
check "no backup left" test -z "$(ls -d "$R"/.agent/history/agent-start-backup-* 2>/dev/null)"
check "no new pin left" test ! -e "$R/.agent/history/task-$ID.json"
rm "$T/dryfail"; start "${BRIEF[@]}"; check "retry after the cause is fixed succeeds" eq "$RC" 0
end

begin "13 --run launches agent-run only after a passing dry run"
start "${BRIEF[@]}" --run
check "dry run then run" eq "$(cat "$T/runner.calls" | tr '\n' '|')" "agent-run --dry-run|agent-run |"
check "hand-off announced" has "AGENT_START_RESULT: RUNNING"; check "runner output follows" has "agent-run "
check "runner's own result propagated" has "AGENT_RUN_RESULT:"
rm -f "$T/model.calls"  # the runner itself (not agent-start) reached the fake model
end

begin "14 --run with dry-run failure never launches agent-run"
touch "$T/dryfail"; BEFORE="$(files_hash)"; start "${BRIEF[@]}" --run
check "exit 1" eq "$RC" 1; check "reason" has "REASON: RUNNER_DRY_RUN_FAILED"
check "only the dry run" eq "$(cat "$T/runner.calls")" "agent-run --dry-run"; check "restored" eq "$(files_hash)" "$BEFORE"
check "no hand-off" hasnt "AGENT_START_RESULT: RUNNING"
end

begin "15 --force-new-task cannot override a dirty tree or a live lock"
no_prev_state; echo dirty >> "$R/work.txt"; BEFORE="$(files_hash)"
start "${BRIEF[@]}" --force-new-task; refused DIRTY_WORKING_TREE
"$REAL_GIT" -C "$R" checkout -q -- work.txt
printf '{"pid": %d, "host": "%s", "run_id": "r1"}\n' "$$" "$HOST" > "$R/.agent/history/agent-run.lock"
start "${BRIEF[@]}" --force-new-task; refused RUNNER_ACTIVE
end

begin "16 CURRENT_TASK begins with '# Task:' and carries one Verify command"
start "${BRIEF[@]}"
check "first line" eq "$(head -1 "$R/.agent/CURRENT_TASK.md")" "# Task: CC-FU-B — correct slurry DM provenance labelling"
check "default verify" eq "$(grep -c '^Verify command: `npm run typecheck && npm run build`$' "$R/.agent/CURRENT_TASK.md")" 1
"$REAL_GIT" -C "$R" checkout -q -- .agent
start --title "Verify override" --brief "Brief." --verify "npm test -- x"
check "--verify override" grep -qx 'Verify command: `npm test -- x`' "$R/.agent/CURRENT_TASK.md"
check "harness parses it" eq "$(cd "$R" && bash -c 'source scripts/agent-lib.sh; task_verify_cmd')" "npm test -- x"
end

begin "17 structured brief sections are preserved, not duplicated"
cat > "$T/brief.md" <<'EOF'
# Task: Pasted title is ignored
Verify command: `npm run typecheck`

## Objective

Do the thing.

## Scope

Only the label.

## Out of scope

- Everything else.

## Acceptance criteria

- Label is right.

## Required tests

- label.test.ts

## STOP conditions

- Stop if unsure.
EOF
start --title "Structured" --brief-file "$T/brief.md"
check "exit 0" eq "$RC" 0
for h in "## Objective" "## Scope" "## Out of scope" "## Acceptance criteria" "## Required tests" "## STOP conditions"; do
  check "one '$h'" eq "$(grep -cx "$h" "$R/.agent/CURRENT_TASK.md")" 1
done
check "own content kept" grep -q "Stop if unsure." "$R/.agent/CURRENT_TASK.md"
check "standard tail not added" test -z "$(grep 'pushes/deployments' "$R/.agent/CURRENT_TASK.md")"
check "pasted title dropped" eq "$(grep -c '^# Task:' "$R/.agent/CURRENT_TASK.md")" 1
check "brief verify used" grep -qx 'Verify command: `npm run typecheck`' "$R/.agent/CURRENT_TASK.md"
end

begin "18 free-form brief is wrapped and gets the standard safety sections"
start --title "Free form" --brief "Just fix the label wording please."
check "wrapped" grep -qx "## Objective / Task brief" "$R/.agent/CURRENT_TASK.md"
for h in "## Scope" "## Out of scope" "## Acceptance criteria" "## Required tests" "## STOP conditions"; do
  check "adds '$h'" eq "$(grep -cx "$h" "$R/.agent/CURRENT_TASK.md")" 1
done
check "standard out-of-scope" grep -q -- "- pushes/deployments;" "$R/.agent/CURRENT_TASK.md"
check "standard STOP" grep -q "BUILD_RESULT: BLOCKED <reason>" "$R/.agent/CURRENT_TASK.md"
end

begin "19 agent-start has no git push code path"
check "no git push call" test -z "$(grep -nE "git['\", (]+push|'push'|\"push\"" "$SRC/scripts/agent-start")"
check "the only git subcommands used are read-only" test -z "$(grep -oE "git\('[a-z-]+'" "$SRC/scripts/agent-start" | grep -vE "'(rev-parse|branch|status)'")"
end

begin "20 agent-start never executes Claude or Codex directly"
check "no claude/codex command" test -z "$(grep -nE "['\"](claude|codex)['\"]|subprocess[^\n]*(claude|codex)" "$SRC/scripts/agent-start")"
start "${BRIEF[@]}"; check "setup ran" eq "$RC" 0
end

echo
echo "agent-start tests: $PASSED passed, $FAILED failed"
[[ $FAILED -eq 0 ]] || { printf "failed:$FAILS\n"; exit 1; }
