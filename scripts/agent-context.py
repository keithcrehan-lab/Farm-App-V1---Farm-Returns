#!/usr/bin/env python3
"""Deterministic task boundaries, scope inventory and CLI usage; no model calls."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
HISTORY = Path('.agent/history')
HISTORY.mkdir(parents=True, exist_ok=True)


def git(*args):
    return subprocess.check_output(['git', *args]).decode('utf-8', 'surrogateescape').strip()


def sha(ref):
    if not ref or ref.startswith('-'):
        raise ValueError('missing/invalid commit')
    return git('rev-parse', '--verify', ref + '^{commit}')


def write(path, obj):
    Path(path).write_text(json.dumps(obj, indent=2) + '\n')


def task():
    text = Path('.agent/CURRENT_TASK.md').read_text()
    title = re.search(r'^# Task: (.+)$', text, re.M).group(1)
    path = Path('.agent/TASK.json')
    if path.exists():
        data = json.loads(path.read_text())
        if data['title'] != title:
            raise ValueError('TASK.json title must match CURRENT_TASK.md; initialise the new task explicitly')
    else:
        pin = re.search(r'^Starting HEAD: (.+)$', text, re.M)
        base = pin.group(1).strip() if pin else 'auto'
        data = dict(task_id=hashlib.sha256(title.encode()).hexdigest()[:16], title=title,
                    base_sha=sha('HEAD' if base == 'auto' else base), domains=[],
                    expected_changed_files=[], contracts=[], evidence=[], tests=[], prohibited_areas=[])
        write(path, data)
    data['base_sha'] = sha(data['base_sha'])
    if not re.fullmatch(r'[A-Za-z0-9_-]+', data['task_id']):
        raise ValueError('invalid task_id')
    lock = HISTORY / ('task-' + data['task_id'] + '.json')
    boundary = dict(manifest=data, task_text_sha256=hashlib.sha256(text.encode()).hexdigest())
    # The task prose (scope/acceptance) and starting identity are immutable.
    # Dependency/context hints may expand without silently changing that scope.
    if lock.exists():
        pinned = json.loads(lock.read_text())
        keys = ('task_id', 'title', 'base_sha')
        if pinned['task_text_sha256'] != boundary['task_text_sha256'] or any(pinned['manifest'][k] != data[k] for k in keys):
            raise ValueError('task boundary changed after pinning; start a new task ID explicitly')
    if not lock.exists():
        write(lock, boundary)
    subprocess.run(['git', 'merge-base', '--is-ancestor', data['base_sha'], 'HEAD'], check=True)
    pin = re.search(r'^Starting HEAD: (.+)$', text, re.M)
    if pin and pin.group(1).strip() != 'auto' and sha(pin.group(1).strip()) != data['base_sha']:
        raise ValueError('Starting HEAD conflicts with TASK.json base_sha')
    return data


def inventory(base, head, working):
    args = [base] if working else [base, head]
    # No path allow-list: additions, deletions, renames, binary and governance files all count.
    names = subprocess.check_output(['git', 'diff', '--no-renames', '--name-only', '-z', *args]).split(b'\0')
    if working:
        names += subprocess.check_output(['git', 'diff', '--cached', '--no-renames', '--name-only', '-z', base]).split(b'\0')
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z']).split(b'\0') if working else []
    files = sorted(set(os.fsdecode(p) for p in names + untracked if p))
    digest = hashlib.sha256(subprocess.check_output(['git', 'diff', '--binary', '--no-ext-diff', *args]))
    if working:
        digest.update(subprocess.check_output(['git', 'diff', '--cached', '--binary', '--no-ext-diff', base]))
    for name in sorted(p for p in untracked if p):
        path = Path(os.fsdecode(name))
        digest.update(name)
        digest.update(os.fsencode(os.readlink(path)) if path.is_symlink() else path.read_bytes())
    stat = git('diff', '--numstat', *args)
    added = removed = 0
    for line in stat.splitlines():
        a, d, _ = line.split('\t', 2)
        if a.isdigit(): added += int(a)
        if d.isdigit(): removed += int(d)
    return dict(files=files, untracked=[os.fsdecode(p) for p in untracked if p],
                diff_fingerprint=digest.hexdigest(), tracked_lines_added=added, tracked_lines_removed=removed)


def telemetry(mode, base, head, raw, duration, result, output):
    data = task()
    usage = dict(input_tokens='UNKNOWN', cached_input_tokens='UNKNOWN', output_tokens='UNKNOWN', total_tokens='UNKNOWN')
    requested_model = os.environ.get('AGENT_CODEX_MODEL' if 'audit' in mode or mode == 'remediation' else 'AGENT_CLAUDE_MODEL', 'UNKNOWN')
    model = 'UNKNOWN'
    events = []
    for line in Path(raw).read_text(errors='replace').splitlines():
        try: events.append(json.loads(line))
        except (ValueError, TypeError): pass
    # Codex emits one cumulative turn.completed usage object for this one-shot run.
    completions = [e for e in events if isinstance(e, dict) and e.get('type') == 'turn.completed']
    if len(completions) == 1:
        u = completions[0].get('usage', {})
        for key in ('input_tokens', 'cached_input_tokens', 'output_tokens'):
            v = u.get(key)
            if type(v) is int and v >= 0: usage[key] = v
        if all(type(usage[k]) is int for k in ('input_tokens', 'output_tokens')):
            usage['total_tokens'] = usage['input_tokens'] + usage['output_tokens']
    # Claude's JSON result supplies aggregate usage; cache reads/creation are separate inputs.
    results = [e for e in events if isinstance(e, dict) and e.get('type') == 'result']
    if len(results) == 1:
        u = results[0].get('usage', {})
        keys = ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens')
        for key, source in (('output_tokens', 'output_tokens'), ('cached_input_tokens', 'cache_read_input_tokens')):
            if type(u.get(source)) is int and u[source] >= 0: usage[key] = u[source]
        if all(type(u.get(k)) is int and u[k] >= 0 for k in keys):
            usage.update(input_tokens=sum(u[k] for k in keys[:3]), cached_input_tokens=u[keys[1]],
                         output_tokens=u[keys[3]], total_tokens=sum(u[k] for k in keys))
        models = results[0].get('modelUsage', {})
        if len(models) == 1: model = next(iter(models))
    counts = re.search(r'AUDIT_SUMMARY: CRITICAL=(\d+) HIGH=(\d+) MEDIUM=(\d+) LOW=(\d+)', Path(output).read_text(errors='replace')) if Path(output).exists() else None
    record = dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(), model=model, requested_model=requested_model,
                  task_id=data['task_id'], task_base_sha=data['base_sha'], base_sha=base, head_sha=head,
                  mode=mode, duration_seconds=int(duration), result=result, **usage,
                  findings=dict(zip(('critical', 'high', 'medium', 'low'), map(int, counts.groups()))) if counts else 'UNKNOWN',
                  **inventory(base, head, mode in ('build', 'fix', 'working-audit')))
    with (HISTORY / 'usage.jsonl').open('a') as f: f.write(json.dumps(record) + '\n')


def main():
    cmd, *args = sys.argv[1:]
    if cmd == 'pin': print(task()['base_sha'])
    elif cmd == 'context':
        data = task()
        print('Read .agent/TASK.json and .agent/CURRENT_TASK.md. GLOBAL rules are AGENTS.md (already loaded by Codex; Claude imports them).')
        print('DOMAIN: read manifest contracts/evidence by relevant headings, then follow affected exports, callers, tests and schema. The manifest is a starting index, NEVER a file allow-list.')
        print('For application changes search docs/farm-return-next/DOMAIN_CONTRACTS.md by affected symbols and domains, inspect the frozen-table and change protocol as applicable; search docs/farm-return-next/BLOCKER_INDEX.md by affected area and read matching constraints; science changes also require SCIENTIFIC_RULES.md and sourced evidence. Expand context whenever dependencies cross domains; report missing context as blocked, never infer permission from an omitted manifest entry.')
        print('Read docs/farm-return-next/BLOCKERS.md for active constraints. Historical logs/archives only on demand; use rg and bounded sections, not wholesale reads. Do not read STATE.md or prior build reports as evidence.')
        for key in ('contracts', 'evidence', 'tests'): print(key + ': ' + json.dumps(data.get(key, [])))
    elif cmd == 'receipt':
        mode, base, head, result, artifact, *snapshot = args
        data = task()
        if mode == 'final':
            if sha(base) != data['base_sha'] or sha(head) != sha('HEAD') or (snapshot and snapshot[0] != 'false'):
                raise ValueError('final receipt must cover exact task base..current HEAD, committed only')
            if git('status', '--porcelain', '--untracked-files=all'):
                raise ValueError('final receipt requires a clean tree')
        path = HISTORY / ('status-' + data['task_id'] + '.json')
        status = json.loads(path.read_text()) if path.exists() else dict(task_id=data['task_id'], base_sha=data['base_sha'], audits=[])
        status.update(head_sha=head, status='complete' if mode == 'final' and result == 'PASS' else 'pending-final-audit', latest_result=result)
        status['audits'].append(dict(mode=mode, base_sha=base, head_sha=head, result=result, findings_artifact=artifact, snapshot=snapshot or ['committed']))
        write(path, status)
    elif cmd == 'final-preflight':
        data = task()
        path = HISTORY / ('status-' + data['task_id'] + '.json')
        status = json.loads(path.read_text()) if path.exists() else {}
        if not any(a['mode'] == 'full' and a['result'] in ('PASS', 'BLOCKED') for a in status.get('audits', [])):
            raise ValueError('final audit requires an assessed primary task audit first')
    elif cmd == 'status-path': print(str(HISTORY / ('status-' + task()['task_id'] + '.json')))
    elif cmd == 'inventory':
        base, head, working = args
        print(json.dumps(inventory(sha(base), sha(head), working == 'true'), indent=2))
    elif cmd == 'decode-claude':
        raw, out = args
        try:
            data = json.loads(Path(raw).read_text())
            if data.get('type') != 'result' or data.get('is_error'): raise ValueError('Claude returned an error')
            Path(out).write_text(data['result'] + '\n')
        except (ValueError, KeyError, AttributeError):
            Path(out).write_text('BUILD_RESULT: BLOCKED invalid CLI JSON; see ' + raw + '\n')
            raise
    elif cmd == 'telemetry': telemetry(*args)
    else: raise ValueError('unknown command')


if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, subprocess.CalledProcessError) as e:
        print('agent context: ' + str(e), file=sys.stderr)
        sys.exit(2)
