# Harness diagnosis — inspected at b24c266

## Actual old flow (not the historical assumed workflow)

| Stage | Actual invocation/context |
| --- | --- |
| Build | agent-build → Claude print/acceptEdits, CLI default or AGENT_CLAUDE_MODEL; read PROJECT/STATE/CURRENT_TASK, auto-loaded CLAUDE rules; targeted checks → independent task Verify command → local commit |
| Primary | agent-audit → Codex exec read-only/ephemeral, CLI config or AGENT_CODEX_MODEL; AUDIT_RULES/PROJECT/CURRENT_TASK + task base..HEAD; relevant surrounding code |
| Remediation | agent-fix → fresh Claude call; PROJECT/STATE/CURRENT_TASK + last findings; targeted fix/tests → Verify command → commit |
| Second audit | agent-audit after fixed → fix_base..HEAD + earlier findings; explicit instruction not to re-review whole task |
| Clean verification | zero Critical/High in primary OR verification marked task completed; agent-run stopped CLEAN, with no final task-wide audit |
| Full mode | agent-audit --full meant task-wide, not repository-wide |
| Legacy audit | codex-audit.sh default git diff v1-baseline-2026-08-29 plus untracked reads; wholesale DOMAIN_CONTRACTS/SCIENTIFIC_RULES/BUILD_PLAN instruction; weaker separate summary parser |
| Legacy autopilot | next_action from BUILD_STATE → broad BUILD_PLAN/DOMAIN_CONTRACTS/SCIENTIFIC_RULES/BLOCKERS read → quality gate → legacy audit --uncommitted → commit; optional push |

Saved local prompts audit-20260928T162058Z and audit-20260928T183706Z confirm task
4f61f07..4e81938 followed by narrow 167a743..b24c266. Therefore the repeated full-audit
risk was NOT the current agent-run default. It was already partially solved.

## Confirmed context costs and causes

Sizes at inspection (bytes, not measured tokens):

| File | Bytes | Actual ingestion risk |
| --- | ---: | --- |
| IMPLEMENTATION_LOG | 750269 | self-described resume context, append/update instruction; large historical retrieval |
| DOMAIN_CONTRACTS | 358559 | explicit wholesale legacy audit/autopilot reads; current agent prompts already relevance-scoped |
| FERTILISER_VERTICAL_ARCHITECTURE | 217952 | available large domain reference; no automatic current harness wholesale read confirmed |
| evidence-register | 199658 | domain reference, no universal read confirmed |
| BLOCKERS | 129063 | legacy autopilot wholesale read; open/resolved/decision narratives mixed |
| BUILD_STATE | 76888 | current machine fields mixed with many historical campaign/audit narratives; stale next_action explicitly disclaimed itself |

CLAUDE/AGENTS/PROJECT repeated safety and source hierarchy; severity was repeated in
AUDIT_RULES/BUILD_PLAN with a missing frozen-contract HIGH in the former. Current task was
still a 300+ line Campaign B closure instruction. Models were fresh per invocation; no
measured cache savings existed. quality-gate streamed all four commands' successful output;
agent-lib's Verify command already captured output, but standalone quality calls did not.

No evidence supports a claim that normal agents always read every large document, re-search
all source, or use a frontier model for git status: agent-status was already deterministic.
We preserve and extend those existing efficiencies rather than claiming them as new savings.

Jev: no scripts/jev-router files in the current working tree or tracked inventory. Historical
commit 89eb12cb contains shadow log allow-listing; PROJECT/README references were stale.
No current prompt path calls it; no real token saving attributable to Jev is demonstrated.

## New flow and tradeoffs

Single shared GLOBAL authority → immutable TASK.json/CURRENT_TASK → domain discovery by
symbols/dependencies → implementation/independent verification/full gate → PRIMARY task
review → fix-only REMEDIATION with related regression checks → FINAL complete task audit.
Explicit campaign/release bases retain broad review. Repository mode explicitly reviews
the current tree as well. No manifest file allow-list can omit actual changes. Working-tree
mode includes index/working/untracked content; final mode refuses dirty trees.

Archives preserve original records byte-for-byte. Active blockers are separate from the on-demand conservative legacy index; legacy entries are references,
not unsupported closure decisions. Registers remain authoritative and searchable; no scientific
content is rewritten. Scope pins, inventory, telemetry and summaries use deterministic scripts.
Model selection remains unchanged. Primary/final independent reviews never reuse a builder's
reasoning or completion claims as evidence.

Risks controlled: dependency expansion prevents artificially narrow reviews; final review
checks the whole task after narrow repairs; strict parser/STOP/unavailable gates fail closed;
immutable pins and snapshot fingerprints detect scope drift; archived blockers preserve caveats.
An audit still relies on the independent reviewer actually examining supplied scope; prompts
and enumeration cannot mathematically guarantee semantic coverage.

## Savings estimates (not measured billed tokens)

- Removing baseline default: proportional to unrelated diff avoided; task-specific, no honest universal percentage.
- State rotation: compare current BUILD_STATE bytes with 76888; roughly 98% less document text.
- Implementation-log rotation: roughly 99% less routine document text versus 750269 bytes.
- Legacy wholesale contracts/blockers loading: avoid roughly 0.5 MB per affected legacy invocation;
  domain excerpts still required, so actual savings depend on task.
- Global deduplication and shorter CURRENT_TASK: measurable source-byte reduction; CLI auto-context
  and caches mean billed token savings cannot be inferred directly.
- Successful quality output: unrestricted command stdout replaced by one summary, logs retained; token savings depend on actual command output.
- Remediation: no claimed new savings for existing agent-run (already narrow). Final review adds
  a deliberate review cost to close a quality gap.

Usage JSONL enables future measured tokens per accepted task / resolved finding. UNKNOWN
means unavailable, not zero. Do not report estimates as observed model usage.

## Verification-runtime adjustment

The expanded orchestration loop retains all 50 existing shell cases and now executes final
review fixtures too. Two full-gate runs hit the tooling wrapper's 580-second subprocess limit,
while the standalone 50-case suite passed and all 3845 other product assertions passed in the
first run. `src/tooling/agent-run.test.ts` is harness-only: its subprocess/test limits are now
1180/1200 seconds. No test is removed or skipped. The watchdog also uses direct child-PID
cleanup (covered by success/real-timeout tests) instead of sandbox-blocked process enumeration.

The task's scope prose, ID/title and base remain pinned. Manifest dependency/context hints
can expand without a new task identity; the discovered tooling test wrapper is explicitly
listed. No product/application/domain source change is authorised by that expansion.
