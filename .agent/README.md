# Agent workflow (V1)

A local build → audit → fix → verify loop with a human between every
stage, or, when the human opts in, a bounded run of that same loop via
`agent-run` (below). Nothing is ever pushed.

| File | Holds | Committed |
| --- | --- | --- |
| `PROJECT.md` | durable project context (read every session) | yes |
| `AUDIT_RULES.md` | the independent-review discipline | yes |
| `CURRENT_TASK.md` | the one task being worked (template) | yes, with the task's commits |
| `STATE.md` | transient per-worktree state, written by the scripts | no (gitignored) |
| `history/` | build/fix output, saved audit results, verify logs | no (gitignored) |

## Cycle

```sh
./scripts/agent-status     # where are we? (no AI)
./scripts/agent-build      # Claude implements CURRENT_TASK → independent verify → local commit
./scripts/agent-audit      # Codex full review of task_base..HEAD → history/audit-*.md
./scripts/agent-fix        # only if Critical/High: Claude fixes + regression tests → local commit
./scripts/agent-audit      # auto-selects focused verification of the fix range
```

After a verification audit that still has Critical/High findings, a
further fix round needs `agent-fix --another-round` (human approval, per
AGENTS.md). An `UNASSESSED` audit (timeout, error, no summary) never
counts as a pass, and nothing retries automatically.

## Bounded autonomous run (opt-in)

```sh
./scripts/agent-run                    # build → full audit → up to 4 fix/verify rounds
MAX_FIX_ROUNDS=2 ./scripts/agent-run   # 0–10; no unlimited mode
```

`agent-run` only calls `agent-build`, `agent-audit --full`, `agent-fix`
(round 1) and `agent-fix --another-round` (later rounds, approved by
invoking `agent-run`), with `agent-audit --verify` after each fix. Their
guards still apply, and a refusal from any of them stops the run. It
reads each audit result from `STATE.md` and cross-checks the saved audit
artifact (verdict, range, summary). It finishes CLEAN (exit 0) only when
an ASSESSED audit has 0 Critical and 0 High. Medium/Low findings are
reported but don't block.

It stops for human review, with a non-zero exit, when:

- the build/fix isn't DONE, its output has a `STOP:` line, or
  verification fails (1);
- pre-flight is refused (2): a bad `MAX_FIX_ROUNDS`, the task/tree/branch
  guards, HEAD not the pinned `Starting HEAD`, or STATE.md already shows
  this task in progress (it never resumes a partial run);
- an audit is UNASSESSED, unparseable or inconsistent (3);
- there is any Critical finding, which is never auto-fixed (4);
- High findings remain after `MAX_FIX_ROUNDS` (5);
- HEAD, the branch or the working tree changed unexpectedly (6);
- it's interrupted with Ctrl+C (130).

Each run writes `history/run-<timestamp>.md`, which records the phases,
commits, audit artifacts and results, the number of rounds, and the final
status and reason. Per-phase script output goes to `run-<timestamp>-*.log`.
After any stop, run `./scripts/agent-status` and decide.
Tests: `bash scripts/tests/agent-run.test.sh`, which uses fake
claude/codex and is also run by `npm test` via
`src/tooling/agent-run.test.ts`.

Starting a task: overwrite `CURRENT_TASK.md` (keep the `# Task:`,
`Starting HEAD:` and `Verify command:` line prefixes), set `next_task:` in
`STATE.md` if you like, make sure the tree is clean outside `.agent/`, and
run `agent-build`.

Checks: every script takes `--dry-run` (pre-flight plus the exact
command/prompt, no AI call). `agent-build --smoke-test` and
`agent-audit --smoke-test` make a tiny real CLI call with the exact flags.

Optional environment variables: `AGENT_CLAUDE_MODEL`, `AGENT_CODEX_MODEL`
(a fixed model, with no routing), `AGENT_CLAUDE_TIMEOUT` (default 3600s)
and `AGENT_CODEX_TIMEOUT` (default 1200s).

## Safety

- The scripts refuse to run on `main`, on a detached HEAD, or with
  uncommitted changes outside `.agent/`. They never discard work: a failed
  or blocked stage leaves the edits in the tree for you to review.
- Claude runs with `--permission-prompts none`: file edits plus an
  allow-list of test, lint and read-only git commands. `git
  commit/push/reset/checkout/stash/clean/rebase`, `rm`, web tools and
  subagents are denied. The scripts make the commit, and only after
  running the task's `Verify command` themselves.
- Commits refuse `.env*`, keys, `.claude/`, `.codex/`, STATE and history
  files, and credential-like strings.
- Codex runs `codex exec --sandbox read-only --ephemeral`.

## Jev

The Jev shadow router (`scripts/jev-router/`) is independent optional
tooling, and nothing here depends on it. It could later become an
optional provider or router that sets `AGENT_CLAUDE_MODEL` per task.
