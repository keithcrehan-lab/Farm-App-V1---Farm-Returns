#!/usr/bin/env python3
"""Deterministic state, lock, verification policy and reporting for scripts/agent-run.

No model calls, no network, never pushes. Every decision here is a pure function of
git/file state: path categories, content fingerprints, JSON run state. Standalone
agent-build/agent-fix are unaffected unless AGENT_RUN_STATE points at a run state.
"""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
HISTORY = Path('.agent/history')
LOCK = HISTORY / 'agent-run.lock'
sys.dont_write_bytecode = True  # importing the helper must not leave an untracked scripts/__pycache__/
_spec = importlib.util.spec_from_file_location('agent_context', str(ROOT / 'scripts/agent-context.py'))
ctx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ctx)
git = ctx.git

CALL_KEYS = ('build', 'primary_audit', 'fix', 'final_audit')
# Stable human-gate reasons an agent/auditor STOP or BLOCKED line may name.
GATE_REASONS = ('SCIENTIFIC_DECISION_REQUIRED', 'EXTERNAL_EVIDENCE_REQUIRED', 'EXPERT_VALIDATION_REQUIRED',
                'MIGRATION_APPROVAL_REQUIRED', 'FROZEN_CONTRACT_CHANGE_REQUIRED',
                'REGULATORY_INTERPRETATION_REQUIRED', 'PUSH_OR_DEPLOY_REQUIRED',
                'DESTRUCTIVE_GIT_ACTION_REQUIRED', 'TASK_SCOPE_EXPANSION_REQUIRED', 'REPEATED_HIGH_FINDING',
                'AGENT_OUTPUT_AMBIGUOUS', 'CONFLICTING_EVIDENCE')


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def write_json(path, obj):
    tmp = Path(str(path) + '.tmp')
    tmp.write_text(json.dumps(obj, indent=2) + '\n')
    os.replace(str(tmp), str(path))


# ── task (read-only view; agent-context.py pin remains the only writer) ──
def read_task():
    text = Path('.agent/CURRENT_TASK.md').read_text()
    title = re.search(r'^# Task: (.+)$', text, re.M).group(1)
    data = json.loads(Path('.agent/TASK.json').read_text())
    if data.get('title') != title:
        raise ValueError('TASK.json title must match CURRENT_TASK.md')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', str(data.get('task_id', ''))):
        raise ValueError('invalid task_id')
    data['base_sha'] = ctx.sha(data['base_sha'])
    lock = HISTORY / ('task-' + data['task_id'] + '.json')
    if lock.exists():
        pinned = json.loads(lock.read_text())
        if pinned['task_text_sha256'] != hashlib.sha256(text.encode()).hexdigest() or any(
                pinned['manifest'][k] != data[k] for k in ('task_id', 'title', 'base_sha')):
            raise ValueError('task boundary changed after pinning')
    return data


def state_path(data=None):
    return HISTORY / ('run-state-' + (data or read_task())['task_id'] + '.json')


def load(path=None):
    p = Path(path or os.environ.get('AGENT_RUN_STATE') or state_path())
    return (json.loads(p.read_text()) if p.exists() else None), p


def lookup(obj, key):
    for part in key.split('.'):
        if not isinstance(obj, dict) or part not in obj:
            return None
        obj = obj[part]
    return obj


def assign(obj, key, value):
    parts = key.split('.')
    for part in parts[:-1]:
        obj = obj.setdefault(part, {})
    obj[parts[-1]] = value


def show(value):
    if value is None: return ''
    if isinstance(value, bool): return 'true' if value else 'false'
    if isinstance(value, (dict, list)): return json.dumps(value)
    return str(value)


# ── path categories and verification plan ──────────────────────────────
E_FILES = {'docs/farm-return-next/DOMAIN_CONTRACTS.md', 'package.json', 'package-lock.json', 'tsconfig.json',
           'next.config.ts', 'next.config.js', 'next.config.mjs', 'vitest.config.ts', 'eslint.config.mjs',
           'src/proxy.ts', 'src/middleware.ts', 'middleware.ts'}
CATEGORY_NAMES = dict(A='DOCS_ONLY', B='ISOLATED_NON_PRODUCTION', C='UI_ONLY', D='PRODUCTION_DOMAIN_LOGIC',
                      E='SHARED_OR_FROZEN_CONTRACT', F='MIGRATION_OR_SCHEMA')
CONTRACTS_DOC = 'docs/farm-return-next/DOMAIN_CONTRACTS.md'
_frozen = []


def frozen_domain_modules():
    """src/domain modules named in DOMAIN_CONTRACTS.md's frozen inventory; None (fail closed) if unreadable."""
    if not _frozen:
        names = None
        try:
            section = re.search(r'^## Frozen contract inventory \(`src/domain/\*\.ts`\)\n(.*?)^## ',
                                Path(CONTRACTS_DOC).read_text(), re.M | re.S)
            if section:
                names = {'src/domain/' + n for n in re.findall(r'`([A-Za-z0-9_.-]+\.ts)`', section.group(1))} or None
        except OSError:
            pass
        _frozen.append(names)
    return _frozen[0]


def category(p):
    """A docs · B isolated non-production · C UI · D production logic · E shared/frozen/unbounded · F migration."""
    if p.startswith('supabase/migrations/') or p.endswith('.sql'): return 'F'
    if (p in E_FILES or p.startswith(('src/lib/farm-data/', 'src/types/')) or p.endswith('database.types.ts')
            or re.match(r'^src/domain/(.+/)?types\.ts$', p)): return 'E'
    if (p.startswith('src/domain/') and not re.search(r'\.(test|spec)\.[cm]?[jt]sx?$', p)
            and p in (frozen_domain_modules() or {p})): return 'E'  # frozen contract; unknown inventory → all
    if p.startswith(('.agent/', 'docs/')) or p.endswith('.md') or p == 'LICENSE': return 'A'
    if re.search(r'\.(test|spec)\.[cm]?[jt]sx?$', p) or p.startswith(('scripts/', 'src/tooling/', 'test/', 'tests/')):
        return 'B'
    if (p.startswith(('src/domain/', 'src/lib/', 'src/server/', 'src/orchestration/', 'src/store/', 'src/data/'))
            or re.match(r'^src/app/(.+/)?(route|actions)\.[jt]sx?$', p)): return 'D'
    if p.startswith(('src/components/', 'src/app/', 'public/')) or p.endswith('.css'): return 'C'
    return 'E'  # dependency impact cannot be bounded confidently


def delta_files(base, head=None):
    """Task delta: base..head, or base..working tree (tracked + untracked) when head is None."""
    args = [base, head] if head else [base]
    out = subprocess.check_output(['git', 'diff', '--no-renames', '--name-only', '-z', *args]).split(b'\0')
    if not head:
        out += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z']).split(b'\0')
    return sorted(set(os.fsdecode(p) for p in out if p))


def is_shell(p):
    if p.endswith('.sh'): return True
    try:
        with open(p, 'rb') as f: return re.match(rb'#!.*\b(ba)?sh\b', f.readline()) is not None
    except OSError: return False


def plan(files, base, full, data):
    cat = max([category(f) for f in files] or ['A'])
    if full or data.get('full_suite') is True: cat = max(cat, 'E')
    gate = None
    if cat == 'F' and not any('migration' in str(d).lower() for d in data.get('domains', [])):
        gate = 'MIGRATION_APPROVAL_REQUIRED'
    present = [f for f in files if os.path.isfile(f)]
    q = lambda fs: ' '.join(shlex.quote(f) for f in fs)
    cmds = []
    if cat == 'A':
        cmds.append(('diff_check', "git diff --check %s -- . ':(exclude).agent'" % base, 'all'))
        js = [f for f in present if f.endswith('.json')]
        if js: cmds.append(('json_check', 'for f in %s; do python3 -m json.tool "$f" >/dev/null || exit 1; done' % q(js), 'all'))
    elif cat in 'BCD':
        code = [f for f in present if category(f) != 'A']
        js_ts = [f for f in code if re.search(r'\.[cm]?[jt]sx?$', f)]
        targeted = []
        sh = [f for f in code if is_shell(f)]
        if sh: targeted.append(' && '.join('bash -n ' + shlex.quote(f) for f in sh))
        py = [f for f in code if f.endswith('.py')]
        if py: targeted.append('python3 -m py_compile ' + q(py))
        if any(f.startswith(('scripts/agent-', 'scripts/tests/')) or f == 'src/tooling/agent-run.test.ts' for f in files):
            targeted.append('bash scripts/tests/agent-run.test.sh && python3 scripts/tests/agent-context.test.py')
        src = [f for f in js_ts if f.startswith('src/')]
        if src: targeted.append('npx vitest related --run --maxWorkers=1 ' + q(src))
        if targeted: cmds.append(('targeted_tests', ' && '.join(targeted), 'all'))
        cmds.append(('typecheck', 'npm run typecheck', 'code'))
        if js_ts: cmds.append(('lint', 'npx eslint ' + q(js_ts), 'code'))
        if cat == 'D' or (cat == 'C' and any(f.startswith('src/app/') for f in files)):
            cmds.append(('build', 'npm run build', 'code'))
    elif not gate:
        cmds.append(('quality_gate', 'bash scripts/quality-gate.sh', 'all'))  # full suite, typecheck, lint, build
    return dict(category=cat, category_name=CATEGORY_NAMES[cat], gate=gate,
                commands=[dict(name=n, cmd=c, scope=s) for n, c, s in cmds])


def fingerprint(scope):
    """Content hash of the working tree (as git would stage it); 'code' ignores docs-only paths."""
    index = git('rev-parse', '--git-path', 'index')
    with tempfile.TemporaryDirectory() as d:
        tmp = os.path.join(d, 'index')
        if os.path.exists(index): shutil.copy(index, tmp)
        env = dict(os.environ, GIT_INDEX_FILE=tmp)
        subprocess.run(['git', 'add', '-A', '--', '.'], env=env, check=True, capture_output=True)
        tree = subprocess.check_output(['git', 'write-tree'], env=env).decode().strip()
    digest = hashlib.sha256(scope.encode())
    for entry in subprocess.check_output(['git', 'ls-tree', '-r', '-z', tree]).split(b'\0'):
        if not entry: continue
        path = os.fsdecode(entry.split(b'\t', 1)[1])
        if path.startswith('.agent/history/') or path == '.agent/STATE.md': continue
        if scope == 'code' and category(path) == 'A': continue
        digest.update(entry + b'\0')
    return digest.hexdigest()


def verify(phase, verify_cmd):
    st, path = load()
    if st is None: raise ValueError('AGENT_RUN_STATE does not name a run state')
    data = read_task()
    p = plan(delta_files(data['base_sha']), data['base_sha'], st['options']['full_tests'], data)
    st['verify_plan'] = p
    st['category'] = p['category']
    st['verify_gate'] = p['gate']
    if p['gate']:
        write_json(path, st)
        print('agent-run verify: %s — category %s changes need explicit authority' % (p['gate'], p['category']), file=sys.stderr)
        return 5
    rc = 0
    for c in [dict(name='task_verify', cmd=verify_cmd, scope='all')] + p['commands']:
        fp = fingerprint(c['scope'])
        base = dict(phase=phase, name=c['name'], cmd=c['cmd'], scope=c['scope'], fingerprint=fp, at=now())
        if any(r['cmd'] == c['cmd'] and r['fingerprint'] == fp and r['result'] == 'PASS' and not r.get('reused')
               for r in st['verification']):
            st['verification'].append(dict(base, result='PASS', reused=True))
            print('agent-run verify: reused %s (relevant files unchanged since it passed)' % c['name'])
            continue
        log = HISTORY / ('verify-%s-%s-%s.log' % (st['run_id'], phase, c['name']))
        with open(log, 'w') as f:
            rc = subprocess.run(['bash', '-c', c['cmd']], stdout=f, stderr=subprocess.STDOUT).returncode
        st['verification'].append(dict(base, result='PASS' if rc == 0 else 'FAIL', reused=False, log=str(log)))
        write_json(path, st)
        if rc:
            print('agent-run verify: %s FAILED (exit %d) — %s' % (c['name'], rc, log), file=sys.stderr)
            sys.stderr.write(''.join(log.read_text(errors='replace').splitlines(True)[-30:]))
            break
    write_json(path, st)
    return 1 if rc else 0


def verification_summary(st):
    records, p = st.get('verification', []), st.get('verify_plan')
    latest = {}
    for r in records: latest[r['name']] = r['result']
    if not p: return dict(task_verify=latest.get('task_verify', 'NOT_RUN'), targeted_tests='NOT_RUN', typecheck='NOT_RUN',
                          lint='NOT_RUN', build='NOT_RUN', full_suite='NOT_RUN')
    names = [c['name'] for c in p['commands']]
    out = dict(task_verify=latest.get('task_verify', 'NOT_RUN'))
    if 'quality_gate' in names:
        gate = latest.get('quality_gate', 'NOT_RUN')
        out.update(targeted_tests=gate, typecheck=gate, lint=gate, build=gate, full_suite=gate)
    else:
        for key in ('targeted_tests', 'typecheck', 'lint', 'build'):
            out[key] = latest.get(key, 'NOT_RUN') if key in names else 'NOT_REQUIRED'
        out['full_suite'] = 'NOT_REQUIRED'
    for key in ('diff_check', 'json_check'):
        if key in names: out[key] = latest.get(key, 'NOT_RUN')
    return out


# ── lock ───────────────────────────────────────────────────────────────
def alive(pid):
    try: os.kill(pid, 0)
    except ProcessLookupError: return False
    except PermissionError: return True
    return True


def lock_acquire(pid, run_id):
    host = socket.gethostname()
    for _ in range(3):
        try:
            fd = os.open(str(LOCK), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
        except FileExistsError:
            try:
                info = json.loads(LOCK.read_text())
                other, other_host = int(info['pid']), info['host']
            except (ValueError, KeyError, TypeError, OSError):
                print('lock %s is unreadable; its owner cannot be established' % LOCK); return 4
            if other_host != host:
                print('lock %s is held by pid %d on host %s; liveness cannot be established here' % (LOCK, other, other_host)); return 4
            if alive(other):
                print('agent-run %s (pid %d) is live' % (info.get('run_id', '?'), other)); return 3
            try: LOCK.unlink()  # owner process is gone on this host: deterministically stale
            except FileNotFoundError: pass
            continue
        with os.fdopen(fd, 'w') as f:
            json.dump(dict(pid=int(pid), host=host, run_id=run_id, started_at=now()), f)
        return 0
    print('lock %s could not be acquired' % LOCK); return 4


def lock_release(pid):
    try:
        if int(json.loads(LOCK.read_text())['pid']) == int(pid): LOCK.unlink()
    except (OSError, ValueError, KeyError, TypeError): pass


# ── reporting ──────────────────────────────────────────────────────────
def engine_versions(ref, files):
    out = {}
    for f in files:
        if not (f.startswith('src/domain/') and re.search(r'\.tsx?$', f)) or category(f) == 'B': continue
        try: text = subprocess.check_output(['git', 'show', '%s:%s' % (ref, f)], stderr=subprocess.DEVNULL).decode(errors='replace')
        except subprocess.CalledProcessError: continue
        for m in re.finditer(r'export const (\w*ENGINE_VERSION)\s*=\s*"([^"]+)"', text): out[m.group(1)] = m.group(2)
    return out


def minor_titles(artifact):
    if not artifact or not Path(artifact).exists(): return []
    return [l.strip('# ').strip() for l in Path(artifact).read_text(errors='replace').splitlines()
            if re.match(r'^#{2,4} \[(MEDIUM|LOW)\]', l)]


def usage_records(st):
    path = HISTORY / 'usage.jsonl'
    if not path.exists(): return []
    out = []
    for line in path.read_text(errors='replace').splitlines()[st.get('usage_offset', 0):]:
        try: r = json.loads(line)
        except ValueError: continue
        if r.get('task_id') != st['task_id']: continue
        out.append({k: r.get(k, 'UNKNOWN') for k in ('mode', 'model', 'input_tokens', 'output_tokens', 'cached_input_tokens')})
    return out


def summary(st):
    # A completed run reports the HEAD it closed at, never whatever HEAD is now.
    head = st['head'] if st.get('result') == 'COMPLETE' else git('rev-parse', 'HEAD')
    files = delta_files(st['base_sha'], head) if st['base_sha'] != head else []
    before, after = engine_versions(st['base_sha'], files), engine_versions(head, files)
    records = st.get('verification', [])
    last = st['audits'][-1] if st.get('audits') else {}
    return dict(
        run_id=st['run_id'], task_id=st['task_id'], base_sha=st['base_sha'], start_head=st['start_head'],
        final_head=head, started_at=st['started_at'], finished_at=st.get('finished_at'), stage=st['stage'],
        build_result=st.get('build_result'),
        model_calls=dict(st['model_calls'], total=sum(st['model_calls'][k] for k in CALL_KEYS)),
        fix_rounds=st['completed']['fix'], audits=st.get('audits', []), category=st.get('category'),
        verification=verification_summary(st),
        verification_commands_run=[r['cmd'] for r in records if not r.get('reused')],
        verification_commands_reused=[r['cmd'] for r in records if r.get('reused')],
        findings=st.get('findings'), open_medium_low=minor_titles(last.get('artifact')),
        result=st.get('result'), human_gate_reason=st.get('reason'), detail=st.get('detail'),
        next_action=st.get('next_action'),
        production_changed='YES' if any(category(f) in 'CDEF' for f in files) else 'NO',
        engine_versions=dict(before=before, after=after) if (before or after) else 'N/A',
        usage=usage_records(st), report_paths=st.get('report_paths', {}), pushed='NO')


def report(st):
    s = summary(st)
    mc, f, v = s['model_calls'], s['findings'] or {}, s['verification']
    lines = ['AGENT_RUN_RESULT: ' + (s['result'] or 'IN_PROGRESS')]
    if s['result'] == 'HUMAN_DECISION_REQUIRED':
        lines.append('REASON: ' + (s['human_gate_reason'] or 'UNKNOWN'))
        lines += ['DETAIL: ' + l for l in (s['detail'] or '').splitlines()[:3]] or ['DETAIL: (none)']
        lines.append('NEXT_RECOMMENDED_ACTION: ' + (s['next_action'] or './scripts/agent-status'))
    lines.append('Task: %s  Base: %s  HEAD: %s  Stage: %s' % (s['task_id'], s['base_sha'][:7], s['final_head'][:7], s['stage']))
    lines.append('Model calls: build %d · primary %d · fix %d · final %d · total %d' % tuple(mc[k] for k in CALL_KEYS + ('total',)))
    if f: lines.append('Findings: CRITICAL=%s HIGH=%s MEDIUM=%s LOW=%s' % (f['critical'], f['high'], f['medium'], f['low']))
    lines.append('Build: %s · Category: %s · Verification: %s' % (
        s['build_result'] or '-', s['category'] or '-', ' '.join('%s=%s' % kv for kv in v.items())))
    lines.append('Production changed: %s · Pushed: NO' % s['production_changed'])
    return '\n'.join(lines)


def finish(result, reason, detail, nxt, resumable):
    st, path = load()
    st.update(result=result, reason=reason or None, detail=detail or None, next_action=nxt or None,
              resumable=resumable == 'true', finished_at=now(), in_flight=st.get('in_flight'))
    write_json(path, st)
    out = HISTORY / ('run-%s.json' % st['run_id'])
    write_json(out, summary(st))
    st.setdefault('report_paths', {})['run_summary'] = str(out)
    write_json(path, st)
    print(report(st))
    print('Summary: %s' % out)


def closeout(artifact):
    """Deterministic closure: the closing audit covered task_base..HEAD, HEAD is committed and clean."""
    st, path = load()
    data = read_task()
    head = git('rev-parse', 'HEAD')
    if git('status', '--porcelain', '--untracked-files=all'):
        raise ValueError('closeout requires a clean committed tree')
    line = Path(artifact).read_text(errors='replace').splitlines()[1]
    if ('range: %s..%s ' % (data['base_sha'], head)) not in line or 'verdict: ASSESSED' not in line:
        raise ValueError('closing audit does not cover the complete task delta at HEAD')
    receipt = HISTORY / ('status-' + data['task_id'] + '.json')
    status = json.loads(receipt.read_text()) if receipt.exists() else dict(task_id=data['task_id'], base_sha=data['base_sha'], audits=[])
    status.update(head_sha=head, status='complete', latest_result='PASS', closure_audit=artifact, closed_by='agent-run ' + st['run_id'])
    write_json(receipt, status)
    st.update(stage='CLOSEOUT_DONE', head=head)
    write_json(path, st)


def status_text():
    try: data = read_task()
    except (OSError, ValueError, KeyError, AttributeError, subprocess.CalledProcessError) as e:
        return 'Task: (unreadable: %s)' % e
    st, _ = load(state_path(data))
    head = git('rev-parse', '--short', 'HEAD')
    if st is None:
        return 'Task: %s\nState: NOT_STARTED (no agent-run state)\n\nBase: %s\nHEAD: %s' % (data['task_id'], data['base_sha'][:7], head)
    s = summary(st)
    mc, f, v = s['model_calls'], s['findings'] or {}, s['verification']
    state = s['result'] or ('IN_PROGRESS (%s%s)' % (st['stage'], ', in flight: ' + st['in_flight'] if st.get('in_flight') else ''))
    if state == 'COMPLETE' and git('rev-parse', 'HEAD') != s['final_head']:
        state = 'COMPLETE at %s — HEAD has since moved; later commits are unaudited' % s['final_head'][:7]
    out = ['Task: %s' % s['task_id'], 'State: %s' % state]
    if s['human_gate_reason']: out.append('Reason: %s' % s['human_gate_reason'])
    out += ['', 'Base: %s' % s['base_sha'][:7], 'HEAD: %s' % head, '', 'Model calls',
            '  Build: %d' % mc['build'], '  Primary audit: %d' % mc['primary_audit'], '  Fix: %d' % mc['fix'],
            '  Final audit: %d' % mc['final_audit'], '  Total: %d' % mc['total'], '', 'Audit']
    out += ['  %s: %s' % (k.capitalize(), f.get(k, '-')) for k in ('critical', 'high', 'medium', 'low')]
    label = dict(task_verify='Task verify', targeted_tests='Targeted tests', typecheck='Typecheck', lint='Lint',
                 build='Build', full_suite='Full suite', diff_check='Diff check', json_check='JSON check')
    out += ['', 'Verification'] + ['  %s: %s' % (label[k], val) for k, val in v.items()]
    usage = s['usage']
    if usage:
        out += ['', 'Approx model usage']
        out += ['  %s: in=%s out=%s cached=%s model=%s' % (u['mode'], u['input_tokens'], u['output_tokens'],
                                                          u['cached_input_tokens'], u['model']) for u in usage]
    out += ['', 'Production changed: %s' % s['production_changed'], 'Pushed: NO']
    return '\n'.join(out)


def dry_run(full, maxfix):
    data = read_task()
    head = git('rev-parse', 'HEAD')
    st, path = load(state_path(data))
    files = delta_files(data['base_sha'])
    p = plan(files, data['base_sha'], full == 'true', data)
    stage = st['stage'] if st else 'none (fresh start)'
    print('agent-run dry run (no model call, no file change)')
    print('Task: %s — %s' % (data['task_id'], data['title']))
    print('Base: %s  HEAD: %s  Saved stage: %s' % (data['base_sha'][:7], head[:7], stage))
    print('Flow: PRECHECK → agent-build → agent-audit --primary → CLOSE if CRITICAL=0 HIGH=0')
    print('      else agent-fix → agent-audit --final (repeat at most %s fix round(s)) → CLOSE | HUMAN_DECISION_REQUIRED' % maxfix)
    print('Model-call budget: build 1 · primary audit 1 · fix %s · final audit %s · max %d (clean path 2, one-fix path 4)'
          % (maxfix, maxfix, 2 + 2 * int(maxfix)))
    print('Verification category (current delta, %d file(s)): %s %s%s' % (
        len(files), p['category'], p['category_name'], ' — recomputed from the build diff' if not files else ''))
    print('Verification commands: task verify command + %s' % (', '.join(c['name'] for c in p['commands']) or 'none'))
    print('Potential human gates: build BLOCKED/STOP, preflight failure, migration/frozen-contract/scientific STOP, '
          'unassessed audit, Critical/High after %s fix round(s), ambiguous agent output' % maxfix)
    print('Would invoke: scripts/agent-build · scripts/agent-audit --primary · [scripts/agent-fix · scripts/agent-audit --final]')


def main():
    cmd, *args = sys.argv[1:]
    if cmd == 'task-id': print(read_task()['task_id'])
    elif cmd == 'state-path': print(state_path())
    elif cmd == 'init':
        run_id, branch, full, maxfix, auto = args
        data = read_task()
        path = state_path(data)
        usage = HISTORY / 'usage.jsonl'
        head = git('rev-parse', 'HEAD')
        write_json(path, dict(schema_version=1, run_id=run_id, task_id=data['task_id'], title=data['title'],
                              base_sha=data['base_sha'], branch=branch, start_head=head, head=head,
                              started_at=now(), updated_at=now(), finished_at=None, stage='PRECHECK_DONE', in_flight=None,
                              options=dict(full_tests=full == 'true', max_fix_rounds=int(maxfix), auto_commit=auto == 'true'),
                              model_calls={k: 0 for k in CALL_KEYS}, completed={k: 0 for k in CALL_KEYS},
                              build_result=None, findings=None, audits=[], verification=[], verify_plan=None,
                              category=None, verify_gate=None, result=None, reason=None, detail=None,
                              next_action=None, resumable=False, report_paths=dict(logs=[]),
                              usage_offset=len(usage.read_text().splitlines()) if usage.exists() else 0, pushed='NO'))
        print(path)
    elif cmd == 'get':
        st, _ = load()
        print(show(lookup(st, args[0])) if st else '')
    elif cmd in ('set', 'begin', 'complete', 'append', 'audit-done', 'resume'):
        st, path = load()
        if cmd == 'set': assign(st, args[0], args[1])
        elif cmd == 'append': st.setdefault('report_paths', {}).setdefault(args[0], []).append(args[1])
        elif cmd == 'begin':  # a model call is about to start: count it before it can spend tokens
            st['in_flight'] = args[0]; st['model_calls'][args[0]] += 1
        elif cmd == 'complete':  # key stage head result
            key, stage, head, result = args
            st['completed'][key] += 1
            st.update(in_flight=None, stage=stage, head=head)
            if key == 'build': st['build_result'] = result
            else: st.setdefault('fix_results', []).append(result)
        elif cmd == 'audit-done':  # key stage artifact head counts adopted
            key, stage, artifact, head, counts, adopted = args
            c, h, m, l = map(int, counts.split())
            st['completed'][key] += 1
            st['findings'] = dict(critical=c, high=h, medium=m, low=l)
            st['audits'].append(dict(kind=key, artifact=artifact, head=head, critical=c, high=h, medium=m, low=l,
                                     adopted=adopted == 'true'))
            st.update(in_flight=None, stage=stage, head=head)
        elif cmd == 'resume':
            st.update(result=None, reason=None, detail=None, next_action=None, resumable=False, finished_at=None)
        st['updated_at'] = now()
        write_json(path, st)
    elif cmd == 'consumed':  # is this audit artifact already recorded by the run?
        st, _ = load()
        sys.exit(0 if any(a['artifact'] == args[0] for a in st['audits']) else 1)
    elif cmd == 'reason':  # TEXT DEFAULT → the first stable gate reason named in TEXT
        text, default = args
        print(next((r for r in GATE_REASONS if r in text), default))
    elif cmd == 'verify': sys.exit(verify(*args))
    elif cmd == 'plan':
        data = read_task()
        print(json.dumps(plan(delta_files(data['base_sha'], args[0] if args else None), data['base_sha'], False, data), indent=2))
    elif cmd == 'coherent':  # uncommitted agent work looks complete: no conflicts or conflict markers
        if git('ls-files', '-u'): raise ValueError('unmerged paths present')
        for f in delta_files('HEAD'):
            if os.path.isfile(f) and re.search(rb'^(<{7}|>{7})( |$)', Path(f).read_bytes(), re.M):
                raise ValueError('conflict markers in ' + f)
    elif cmd == 'finish': finish(*args)
    elif cmd == 'report':
        st, _ = load(); print(report(st))
    elif cmd == 'closeout': closeout(*args)
    elif cmd == 'status': print(status_text())
    elif cmd == 'dry-run': dry_run(*args)
    elif cmd == 'lock':
        if args[0] == 'acquire': sys.exit(lock_acquire(args[1], args[2]))
        lock_release(args[1])
    else: raise ValueError('unknown command ' + cmd)


if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, OSError, AttributeError, subprocess.CalledProcessError) as e:
        print('agent-runstate: ' + str(e), file=sys.stderr)
        sys.exit(2)
