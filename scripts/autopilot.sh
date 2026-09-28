#!/usr/bin/env bash
# Legacy entry point now requires one explicit CURRENT_TASK/TASK.json.
# Never follows stale BUILD_STATE.next_action or pushes automatically.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == --smoke-test ]]; then exec "$ROOT/scripts/agent-build" --smoke-test; fi
[[ $# -eq 0 ]] || { echo 'Use scripts/agent-run for one explicit task; iterations/auto-push retired.' >&2; exit 2; }
exec "$ROOT/scripts/agent-run"
