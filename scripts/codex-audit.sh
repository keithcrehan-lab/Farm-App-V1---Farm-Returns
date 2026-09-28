#!/usr/bin/env bash
# Compatibility entry point. No implicit V1 baseline; shared fail-closed parser.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "${1:-}" in
  --base) shift; base="${1:?explicit base required}"; shift; exec "$ROOT/scripts/agent-audit" --campaign "$base" --working-tree "$@";;
  --uncommitted) shift; exec "$ROOT/scripts/agent-audit" --campaign HEAD --working-tree "$@";;
  --commit) shift; ref="${1:?commit required}"; shift
    [[ "$(git -C "$ROOT" rev-parse "$ref^{commit}")" == "$(git -C "$ROOT" rev-parse HEAD)" ]] || { echo 'checkout the commit on a work branch before reviewing it' >&2; exit 2; }
    exec "$ROOT/scripts/agent-audit" --campaign "$ref^" "$@";;
  *) exec "$ROOT/scripts/agent-audit" "$@";;
esac
