#!/usr/bin/env python3
"""Deterministic tests for scripts/agent-campaign-run. No real Claude/Codex call.

Each case builds a throwaway git repository holding copies of the REAL harness scripts
(agent-lib.sh, agent-start/build/audit/fix/run/status, agent-context.py, agent-runstate.py,
agent-campaign-run) plus a small fixture campaign. Fake `claude` and `codex` CLIs first on PATH
replay a scripted sequence and count their calls; a fake `git` wrapper records (and refuses) any
push/reset/rebase/checkout/stash/clean; fake supabase/vercel/psql record any call.

  python3 scripts/tests/agent-campaign.test.py
"""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2]
REAL_GIT = shutil.which('git')
SCRIPTS = ('agent-lib.sh', 'agent-build', 'agent-audit', 'agent-fix', 'agent-status', 'agent-run', 'agent-context.py',
           'agent-runstate.py', 'agent-start', 'agent-campaign-run')
CID = 'fx'
CAMP = '.agent/campaigns/fx'

FAKE_CLAUDE = r'''#!/usr/bin/env python3
import json, os, sys, time
d = os.environ['FAKE_DIR']
n = int(open(d + '/claude.n').read()) + 1 if os.path.exists(d + '/claude.n') else 1
open(d + '/claude.n', 'w').write(str(n))
prompt = sys.argv[sys.argv.index('-p') + 1] if '-p' in sys.argv else ''
open(d + '/claude.prompts', 'a').write('=== call %d\n%s\n' % (n, prompt))
seq = json.load(open(d + '/claude.json'))
act = seq[n - 1] if n <= len(seq) else 'unexpected'
def change():
    open('src/domain/fixture/work.ts', 'a').write('// change %d\n' % n)
out = 'BUILD_RESULT: DONE'
if act == 'done': change()
elif act == 'noop': pass
elif act.startswith('blocked:'): out = 'BUILD_RESULT: BLOCKED %s needs a human decision' % act.split(':', 1)[1]
elif act.startswith('stop:'): change(); out = 'STOP: %s cannot decide this\nBUILD_RESULT: DONE' % act.split(':', 1)[1]
elif act.startswith('concern:'): change(); out = 'Open concerns: %s\nBUILD_RESULT: DONE' % act.split(':', 1)[1]
elif act == 'editbrief':
    change(); p = '.agent/campaigns/fx/X1_BRIEF.md'; open(p, 'a').write('\nWidened scope.\n')
elif act == 'migration':
    os.makedirs('supabase/migrations', exist_ok=True); open('supabase/migrations/0001_x.sql', 'w').write('select 1;\n')
elif act == 'frozen':
    os.makedirs('src/domain', exist_ok=True); open('src/domain/evidence.ts', 'w').write('export const x = 1;\n')
elif act == 'contracts_add':
    change(); open('docs/farm-return-next/DOMAIN_CONTRACTS.md', 'a').write('\n## Fixture phase section\n\nAdditive.\n')
elif act == 'contracts_delete':
    p = 'docs/farm-return-next/DOMAIN_CONTRACTS.md'; open(p, 'w').write(open(p).read().replace('| Shared | `types.ts`, `units.ts` |\n', ''))
elif act == 'breakstate':
    change(); open('docs/farm-return-next/BUILD_STATE.json', 'w').write('{"broken": \n')
elif act == 'fail':
    print(json.dumps({'type': 'result', 'is_error': True, 'result': 'You have hit your usage limit.'})); sys.exit(1)
elif act == 'hang':
    open(d + '/hanging', 'w').write('claude %d' % n)
    for _ in range(3000):
        if os.path.exists(d + '/release'): sys.exit(130)
        time.sleep(0.1)
else:
    print('unexpected claude call %d' % n); sys.exit(9)
print(json.dumps({'type': 'result', 'result': out + '\n'}))
'''

FAKE_CODEX = r'''#!/usr/bin/env python3
import json, os, sys
d = os.environ['FAKE_DIR']
args = sys.argv[1:]
open(d + '/codex.args', 'a').write(' '.join(args) + '\n')
out = args[args.index('-o') + 1]
sys.stdin.read()
n = int(open(d + '/codex.n').read()) + 1 if os.path.exists(d + '/codex.n') else 1
open(d + '/codex.n', 'w').write(str(n))
seq = json.load(open(d + '/codex.json'))
spec = seq[n - 1] if n <= len(seq) else 'unexpected'
if spec == 'quota':
    print('{"type":"error","message":"You have hit your usage limit. Try again later."}'); sys.exit(1)
if spec == 'unexpected':
    print('unexpected codex call %d' % n); sys.exit(9)
counts = dict(CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0)
lines = []
for i, f in enumerate(spec.get('f', []), 1):
    sev, title = f[0], f[1]
    proof = f[2] if len(f) > 2 else 'CONFIRMED'
    counts[sev] += 1
    lines.append('### [%s] [F%03d] %s' % (sev, i, title))
    if sev in ('CRITICAL', 'HIGH', 'MEDIUM'):
        lines += ['- FILE:LINE: work.txt:%d' % i, '- PROBLEM: %s, REGRESSION - reproduced with a test' % proof,
                  '- WHY_IT_MATTERS: x', '- REQUIRED_FIX: y']
if spec.get('stop'): lines.append('STOP: ' + spec['stop'])
counts.update(spec.get('summary', {}))  # tests only: a summary contradicting the finding headings
lines += ['AUDIT_STATUS: ASSESSED', 'AUDIT_SUMMARY: CRITICAL=%d HIGH=%d MEDIUM=%d LOW=%d' % tuple(counts[k] for k in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'))]
open(out, 'w').write('AUDIT_RESULT: FINDINGS\n' + '\n'.join(lines) + '\n')
'''

FAKE_GIT = '''#!/usr/bin/env bash
for a in "$@"; do case "$a" in push|reset|rebase|checkout|clean|stash) echo "git $*" >> "$FAKE_DIR/forbidden"; exit 97;; esac; done
exec "%s" "$@"
'''

BRIEF = '''# {pid} — Fixture phase {pid}

## Objective

Fixture work for {pid}.

## Scope

src/domain/fixture/work.ts only.

## Out of scope

Everything else.

## Acceptance criteria

The verify command passes.

## Required tests

The verify command.

## STOP conditions

Stop on any judgement question.
'''

CLEAN = {}


def M(*titles): return {'f': [['MEDIUM', t] for t in titles]}


def H(*titles): return {'f': [['HIGH', t] for t in titles]}


def L(*titles): return {'f': [['LOW', t] for t in titles]}


class CampaignTests(unittest.TestCase):
    maxDiff = None

    # ── fixture ──────────────────────────────────────────────────────
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='agent-campaign-test.')
        self.T = Path(self.tmp.name)
        self.R, self.B = self.T / 'repo', self.T / 'bin'
        (self.R / 'scripts').mkdir(parents=True)
        (self.R / '.agent/history').mkdir(parents=True)
        self.B.mkdir()
        for f in SCRIPTS: shutil.copy(SOURCE / 'scripts' / f, self.R / 'scripts' / f)
        self.write('scripts/quality-gate.sh', '#!/usr/bin/env bash\necho gate >> "$FAKE_DIR/gate.log"\n'
                   '[[ -e "$FAKE_DIR/fail-gate" ]] && exit 1\nexit 0\n')
        # The orchestrator entrypoint keeps the mode it has in the real checkout (shutil.copy copies
        # it): fixtures never repair its executable bit, so a non-executable entrypoint fails here.
        for f in [x for x in SCRIPTS if x != 'agent-campaign-run'] + ['quality-gate.sh']: self.chmod_x(self.R / 'scripts' / f)
        self.write('AGENTS.md', '# AGENTS.md — Farm Return (fixture)\n')
        self.write('.agent/.gitignore', 'STATE.md\nhistory/*\n')
        self.write('.agent/AUDIT_RULES.md', '# Audit rules (fixture)\n')
        self.write('.agent/CURRENT_TASK.md', '# Task: Old task\nStarting HEAD: auto\nVerify command: `true`\n\nOld.\n')
        self.write('docs/farm-return-next/DOMAIN_CONTRACTS.md',
                   '# Contracts\n\n## Frozen contract inventory (`src/domain/*.ts`)\n\n| Concern | Modules |\n|---|---|\n'
                   '| Evidence | `evidence.ts`, `nutrients.ts` |\n| Shared | `types.ts`, `units.ts` |\n\n'
                   '## Frozen contract inventory (`src/lib/farm-data/*.ts`)\n')
        self.write('docs/farm-return-next/BUILD_STATE.json',
                   json.dumps({'next_action': 'fixture', 'fixture_campaign': {'campaign': CAMP + '/CAMPAIGN.md'}}, indent=2) + '\n')
        self.write('docs/farm-return-next/IMPLEMENTATION_LOG.md', '# Fixture log\n\nIntro.\n\n## Older entry\n\nText.\n')
        self.write(CAMP + '/CAMPAIGN.md', '# Fixture campaign\n')
        self.write('src/domain/fixture/work.ts', '// base\n')
        self.phases = ['X1', 'X2']
        self.write_manifest()
        for pid in self.phases: self.write('%s/%s_BRIEF.md' % (CAMP, pid), BRIEF.format(pid=pid))
        self.write(str(self.B / 'claude'), FAKE_CLAUDE); self.write(str(self.B / 'codex'), FAKE_CODEX)
        self.write(str(self.B / 'git'), FAKE_GIT % REAL_GIT)
        for t in ('supabase', 'vercel', 'psql'):
            self.write(str(self.B / t), '#!/usr/bin/env bash\necho "%s $*" >> "$FAKE_DIR/forbidden"; exit 97\n' % t)
        for p in self.B.iterdir(): self.chmod_x(p)
        self.git('init', '-q', '-b', 'work')
        self.git('config', 'user.email', 't@example.invalid'); self.git('config', 'user.name', 'test')
        self.git('add', '-A'); self.git('commit', '-qm', 'init')
        base0 = self.git('rev-parse', 'HEAD')
        self.write('.agent/TASK.json', json.dumps(dict(schema_version=1, task_id='old-task', title='Old task', base_sha=base0,
                                                       domains=[], expected_changed_files=[], contracts=[], evidence=[],
                                                       tests=[], prohibited_areas=[]), indent=2) + '\n')
        self.commit('old task')
        self.seq([], [])

    def tearDown(self):
        forbidden = self.T / 'forbidden'
        self.assertFalse(forbidden.exists() and forbidden.read_text().strip(), 'forbidden command invoked: %s' % (
            forbidden.read_text() if forbidden.exists() else ''))
        self.tmp.cleanup()

    def chmod_x(self, p):
        p = Path(p); p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def write(self, rel, text):
        p = Path(rel) if os.path.isabs(rel) else self.R / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def git(self, *args):
        return subprocess.run([REAL_GIT, *args], cwd=self.R, capture_output=True, text=True, check=True).stdout.strip()

    def commit(self, msg):
        self.git('add', '-A'); self.git('commit', '-qm', msg)

    def write_manifest(self, ready=None, **policy):
        ready = self.phases if ready is None else ready
        pol = dict(medium_rounds=4, high_rounds=2, attempts_per_signature=2, strict_freeze_audit=True,
                   full_suite_at_freeze=True, low_findings='record')
        pol.update(policy)
        phases, prev = [], None
        for i, pid in enumerate(self.phases, 1):
            phases.append(dict(id=pid, order=i, kind='campaign', title='Fixture phase %s' % pid, task_title='Fixture %s build' % pid,
                               predecessor=prev, brief='%s/%s_BRIEF.md' % (CAMP, pid),
                               brief_status='READY' if pid in ready else 'PLACEHOLDER', domains=['fixture'],
                               contracts=['AGENTS.md'], verify='test ! -e verify-fail', strict_freeze=True,
                               closure='docs-commit', build_state_key='c%d_fixture_%s' % (i, pid.lower()),
                               scope_guard=['src/%s' % pid.lower()],
                               allowed_shared_paths=['docs/farm-return-next/DOMAIN_CONTRACTS.md']))
            prev = pid
        self.manifest = dict(schema_version=1, campaign_id=CID, title='Fixture Campaign', campaign_doc=CAMP + '/CAMPAIGN.md',
                             branch='work', build_state_key='fixture_campaign', closure_commit_prefix='Fixture',
                             receipts_dir=CAMP + '/receipts', audits_dir=CAMP + '/audits', policy=pol, phases=phases)
        self.write(CAMP + '/campaign.json', json.dumps(self.manifest, indent=2) + '\n')

    def one_phase(self):
        """Only X1 is ready (X2 stays a placeholder), committed."""
        self.write_manifest(ready=['X1']); self.commit('one ready phase')

    def seq(self, claude, codex):
        (self.T / 'claude.json').write_text(json.dumps(claude))
        (self.T / 'codex.json').write_text(json.dumps(codex))

    def run_campaign(self, *args, env=None):
        e = {k: v for k, v in os.environ.items() if k not in ('AGENT_RUN_STATE', 'AGENT_PHASE', 'AGENT_AUDIT_TIER',
                                                               'AGENT_CODEX_MODEL', 'AGENT_CODEX_REASONING',
                                                               'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER')}
        e.update(PATH='%s:%s' % (self.B, os.environ['PATH']), FAKE_DIR=str(self.T), AGENT_START_DATE='20261010',
                 AGENT_CLAUDE_TIMEOUT='30', AGENT_CODEX_TIMEOUT='30')
        e.update(env or {})
        p = subprocess.run(['./scripts/agent-campaign-run', CID, *args], cwd=self.R, env=e, capture_output=True, text=True, timeout=600)
        self.out, self.rc = p.stdout + p.stderr, p.returncode
        return self.rc

    def calls(self, tool):
        p = self.T / ('%s.n' % tool)
        return int(p.read_text()) if p.exists() else 0

    def state(self):
        return json.loads((self.R / '.agent/history/campaign-fx.state.json').read_text())

    def receipt(self, pid):
        return json.loads((self.R / CAMP / 'receipts' / ('%s.json' % pid)).read_text())

    def codex_args(self):
        p = self.T / 'codex.args'
        return p.read_text().splitlines() if p.exists() else []

    def stopped(self, reason):
        self.assertEqual(self.rc, 1, self.out)
        self.assertIn('AGENT_CAMPAIGN_RESULT: STOPPED', self.out)
        self.assertIn('REASON: %s' % reason, self.out)
        self.assertNotIn('AGENT_CAMPAIGN_RESULT: COMPLETE', self.out)

    def complete(self):
        self.assertEqual(self.rc, 0, self.out)
        self.assertIn('AGENT_CAMPAIGN_RESULT: COMPLETE', self.out)

    def module(self):
        loader = importlib.machinery.SourceFileLoader('campaign_fixture', str(self.R / 'scripts/agent-campaign-run'))
        spec = importlib.util.spec_from_loader('campaign_fixture', loader)
        mod = importlib.util.module_from_spec(spec)
        cwd = os.getcwd()
        try:
            loader.exec_module(mod)  # chdirs into the fixture repo
            return mod
        finally:
            os.chdir(cwd)

    def validate(self, pid, pred_fp=None):
        """validate_receipt in the fixture repo → None or the failure reason."""
        mod = self.module()
        cwd = os.getcwd(); os.chdir(self.R)
        try:
            m = mod.load_manifest(CID)
            mod.validate_receipt(m, mod.phase_by_id(m, pid), pred_fp)
            return None
        except ValueError as e:
            return str(e)
        finally:
            os.chdir(cwd)

    def rewrite_receipt(self, pid, mutate, refingerprint=True):
        mod = self.module()
        p = self.R / CAMP / 'receipts' / ('%s.json' % pid)
        r = json.loads(p.read_text())
        mutate(r)
        if refingerprint: r['receipt_fingerprint'] = mod.receipt_fingerprint(r)
        p.write_text(json.dumps(r, indent=2) + '\n')

    # ── 1, 31: the clean path through two phases ─────────────────────
    def test_01_clean_phase_then_next_phase(self):
        self.seq(['done', 'done'], [CLEAN, CLEAN, CLEAN, CLEAN])
        self.run_campaign()
        self.complete()
        self.assertEqual((self.calls('claude'), self.calls('codex')), (2, 4))
        args = self.codex_args()
        self.assertIn('gpt-6.1-sol', args[0]); self.assertIn('model_reasoning_effort=medium', args[0])
        self.assertIn('gpt-6-astra', args[1]); self.assertIn('model_reasoning_effort=high', args[1])
        st = self.state()
        x1, x2 = st['phases']['X1'], st['phases']['X2']
        self.assertEqual(x1['stage'], 'COMPLETE'); self.assertEqual(x2['stage'], 'COMPLETE')
        # 31: the functional freeze SHA is distinct from the docs-only closure commit on top of it.
        self.assertNotEqual(x1['freeze_sha'], x1['closure_sha'])
        self.assertEqual(self.git('rev-parse', x1['closure_sha'] + '^'), x1['freeze_sha'])
        self.assertEqual(self.git('log', '-1', '--format=%s', x1['closure_sha']), 'Fixture X1: record closure — frozen at %s' % x1['freeze_sha'][:7])
        closure_files = set(self.git('diff', '--name-only', x1['freeze_sha'], x1['closure_sha']).splitlines())
        self.assertEqual(closure_files, {'docs/farm-return-next/BUILD_STATE.json', 'docs/farm-return-next/IMPLEMENTATION_LOG.md',
                                         CAMP + '/receipts/X1.json', CAMP + '/audits/' + Path(x1['audits'][-1]['artifact']).name})
        # The next phase base is the exact clean HEAD after the predecessor closure, recorded explicitly.
        self.assertEqual(x2['base_sha'], x1['closure_sha'])
        r1, r2 = self.receipt('X1'), self.receipt('X2')
        self.assertEqual(r1['functional_freeze_sha'], x1['freeze_sha'])
        self.assertEqual(r2['predecessor_receipt_fingerprint'], r1['receipt_fingerprint'])
        self.assertFalse(r1['pushed_or_deployed'])
        self.assertEqual({v['name'] for v in r1['verification']}, {'phase_verify', 'full_suite'})
        bs = json.loads((self.R / 'docs/farm-return-next/BUILD_STATE.json').read_text())
        self.assertEqual(bs['fixture_campaign']['c1_fixture_x1']['final_audited_sha'], x1['freeze_sha'])
        self.assertEqual(bs['fixture_campaign']['campaign_progress']['last_frozen_phase'], 'X2')
        log = (self.R / 'docs/farm-return-next/IMPLEMENTATION_LOG.md').read_text()
        self.assertLess(log.index('X2 close-out'), log.index('X1 close-out')); self.assertLess(log.index('X1 close-out'), log.index('## Older entry'))
        self.assertEqual(self.git('status', '--porcelain'), '')
        self.run_campaign('--status')
        self.assertEqual(self.rc, 0); self.assertRegex(self.out, r'X1\s+FROZEN'); self.assertRegex(self.out, r'X2\s+FROZEN')
        self.run_campaign()
        self.complete(); self.assertEqual((self.calls('claude'), self.calls('codex')), (2, 4))

    # ── 2: standard audit Medium → Medium-only remediation ───────────
    def test_02_standard_medium_narrow_remediation_low_untouched(self):
        self.one_phase()
        self.seq(['done', 'done'], [{'f': [['MEDIUM', 'Boundary off by one'], ['LOW', 'Rename helper']]}, CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')  # X1 done; X2 brief is a placeholder
        x1 = self.state()['phases']['X1']
        self.assertEqual(x1['stage'], 'COMPLETE'); self.assertEqual(x1['rounds'], dict(medium=1, high=0))
        self.assertEqual((self.calls('claude'), self.calls('codex')), (2, 3))
        sel = list((self.R / '.agent/history').glob('*.selected-findings.md'))
        self.assertEqual(len(sel), 1)
        text = sel[0].read_text()
        self.assertIn('[MEDIUM] [F001]', text); self.assertNotIn('LOW', text); self.assertNotIn('Rename helper', text)
        prompts = (self.T / 'claude.prompts').read_text()
        self.assertIn('Fix ONLY these selected findings', prompts); self.assertIn('never Low findings', prompts)
        self.assertEqual([a['tier'] for a in x1['audits']], ['standard', 'standard', 'strict'])
        self.assertIn('Rename helper', ' '.join(self.receipt('X1')['outstanding_low_findings']) or 'none')

    # ── 3: strict audit finds Medium → remediation → strict again from the same base ──
    def test_03_strict_medium_loops_back_to_strict_from_phase_base(self):
        self.one_phase()
        self.seq(['done', 'done'], [CLEAN, M('Strict-only defect'), CLEAN])
        self.run_campaign()
        x1 = self.state()['phases']['X1']
        self.assertEqual(x1['stage'], 'COMPLETE', self.out)
        self.assertEqual([a['tier'] for a in x1['audits']], ['standard', 'strict', 'strict'])
        self.assertEqual({a['base'] for a in x1['audits']}, {x1['base_sha']})
        last = Path(self.R / x1['audits'][-1]['artifact']).read_text().splitlines()[1]
        self.assertTrue(last.startswith('range: %s..%s ' % (x1['base_sha'], x1['freeze_sha'])), last)
        self.assertIn('gpt-6-astra', self.codex_args()[2])

    # ── 4: Low only → recorded, never fixed ──────────────────────────
    def test_04_low_only_recorded_not_fixed(self):
        self.one_phase()
        self.seq(['done'], [L('Style nit', 'Naming'), L('Another nit')])
        self.run_campaign()
        x1 = self.state()['phases']['X1']
        self.assertEqual(x1['stage'], 'COMPLETE', self.out)
        self.assertEqual(self.calls('claude'), 1)
        self.assertEqual(self.receipt('X1')['strict_audit']['counts']['low'], 1)
        self.assertEqual(len(self.receipt('X1')['outstanding_low_findings']), 3)

    # ── 5: Critical → immediate stop, no fixer ───────────────────────
    def test_05_critical_stops_without_fixer(self):
        self.one_phase()
        self.seq(['done', 'done'], [{'f': [['CRITICAL', 'Cross-farm leak'], ['MEDIUM', 'Also this']]}])
        self.run_campaign()
        self.stopped('CRITICAL_FINDING')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 1))
        self.assertIn('RESUMABLE: no', self.out)
        self.run_campaign()
        self.stopped('CRITICAL_FINDING')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 1))
        self.assertIn('Model calls this invocation: 0', self.out)
        self.run_campaign('--status')
        self.assertIn('STOPPED: X1', self.out); self.assertIn('REASON: CRITICAL_FINDING', self.out)

    def test_05c_critical_heading_with_zero_count_never_freezes(self):
        self.one_phase()
        self.seq(['done', 'done'], [CLEAN, {'f': [['CRITICAL', 'Hidden critical']], 'summary': {'CRITICAL': 0}}, CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('AUDIT_ARTIFACT_CONTRADICTION')
        self.assertIn('RESUMABLE: no', self.out); self.assertIn('inconsistent', self.out)
        # Rerunning never clears the gate, never re-runs the strict audit and never calls the fixer.
        for _ in range(2):
            self.run_campaign()
            self.stopped('AUDIT_ARTIFACT_CONTRADICTION')
            self.assertIn('Model calls this invocation: 0', self.out)
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 2))
        st = self.state()
        self.assertFalse(st['stop']['resumable']); self.assertEqual(st['stop']['reason'], 'AUDIT_ARTIFACT_CONTRADICTION')
        self.assertNotIn(st['phases']['X1']['stage'], ('FREEZE', 'CLOSURE_RECORD', 'COMPLETE'))
        self.assertEqual(st['phases']['X1']['model_calls']['fix'], 0)
        self.assertFalse((self.R / CAMP / 'receipts/X1.json').exists())
        self.run_campaign('--status')
        self.assertIn('REASON: AUDIT_ARTIFACT_CONTRADICTION', self.out)
        mod = self.module()
        art = self.T / 'contradictory.md'
        art.write_text('### [CRITICAL] [F001] Hidden\n- PROBLEM: CONFIRMED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n')
        fs = mod.findings_of(art)
        self.assertEqual([f['severity'] for f in fs], ['CRITICAL'])

    def test_05e_contradictory_critical_survives_interruption_without_reaudit(self):
        # Interrupted right after the audit returned: the resume must not discard the Critical by re-auditing.
        self.one_phase()
        self.seq(['done', 'done'], [{'f': [['CRITICAL', 'Hidden critical']], 'summary': {'CRITICAL': 0}}, CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'audit'})
        self.assertEqual(self.rc, 130, self.out)
        self.run_campaign()
        self.stopped('AUDIT_ARTIFACT_CONTRADICTION'); self.assertIn('RESUMABLE: no', self.out)
        self.run_campaign()
        self.stopped('AUDIT_ARTIFACT_CONTRADICTION')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 1))
        self.assertEqual(self.state()['phases']['X1']['model_calls']['fix'], 0)

    def test_05f_critical_signal_variants_are_non_resumable(self):
        mod = self.module()
        cwd = os.getcwd(); os.chdir(self.R)
        try:
            h = mod.head(); base = self.git('rev-parse', 'HEAD~1')
            def art(name, body):
                p = self.T / name
                p.write_text('# Audit x\nrange: %s..%s · working-tree: false · codex exit: 0 · verdict: ASSESSED\n'
                             'auditor: codex tier=strict model=gpt-6-astra reasoning=high\n\n%s' % (base, h, body))
                return str(p)
            variants = {
                'zero_count': '### [CRITICAL] [F001] Hidden\n- PROBLEM: CONFIRMED\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n',
                'unassessed': '### [CRITICAL] [F001] Hidden\n- PROBLEM: CONFIRMED\nAUDIT_STATUS: UNASSESSED\nAUDIT_SUMMARY: CRITICAL=1 HIGH=0 MEDIUM=0 LOW=0\n',
                'odd_heading': '## [ critical ] leak without an id\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n',
                'two_summaries': 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=1 HIGH=0 MEDIUM=0 LOW=0\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n',
            }
            c = mod.Campaign.__new__(mod.Campaign)
            for name, body in variants.items():
                path = art(name + '.md', body)
                self.assertTrue(mod.critical_signal(path), name)
                ps = mod.new_phase_state(); ps.update(in_flight='audit-strict', in_flight_ref='x')
                with self.assertRaises(mod.Stop) as cm:
                    c.refuse_critical_contradiction(path, base, h, True, ps)
                self.assertEqual((cm.exception.reason, cm.exception.resumable), ('AUDIT_ARTIFACT_CONTRADICTION', False), name)
                self.assertIsNone(ps['in_flight'])
            # A consistent Critical is left to triage (recorded, then CRITICAL_FINDING); a clean artifact passes.
            ok = art('consistent.md', '### [CRITICAL] [F001] Leak\n- PROBLEM: CONFIRMED\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=1 HIGH=0 MEDIUM=0 LOW=0\n')
            self.assertIsNone(c.refuse_critical_contradiction(ok, base, h, True, mod.new_phase_state()))
            clean = art('clean.md', 'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n')
            self.assertFalse(mod.critical_signal(clean))
        finally:
            os.chdir(cwd)

    def test_05d_triage_stops_on_parsed_critical_even_if_counted_zero(self):
        mod = self.module()
        art = self.T / 'contradictory.md'
        art.write_text('### [CRITICAL] [F001] Hidden\n- PROBLEM: CONFIRMED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n')
        cwd = os.getcwd(); os.chdir(self.R)
        try:
            h = mod.head()
            c = mod.Campaign.__new__(mod.Campaign)
            c.m, c.st = mod.load_manifest(CID), dict(phases={})
            c.save = lambda: None
            ps = mod.new_phase_state()
            ps['audits'] = [dict(tier='strict', artifact=str(art), head=h, counts=dict(critical=0, high=0, medium=0, low=0),
                                 findings=mod.findings_of(art))]
            with self.assertRaises(mod.Stop) as cm:
                c.triage(mod.phase_by_id(c.m, 'X1'), ps)
            self.assertEqual(cm.exception.reason, 'CRITICAL_FINDING')
            self.assertNotEqual(ps['stage'], 'FREEZE')
        finally:
            os.chdir(cwd)

    def test_05b_human_resolution_reaudits_whole_phase(self):
        self.one_phase()
        self.seq(['done'], [{'f': [['CRITICAL', 'Cross-farm leak']]}, CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('CRITICAL_FINDING')
        self.run_campaign('--resolve-stop')
        self.assertNotEqual(self.rc, 0); self.assertIn('requires --note', self.out)
        self.write('src/domain/fixture/work.ts', '// human fix\n'); self.commit('human fix for the critical finding')
        self.run_campaign('--resolve-stop', '--note', 'fixed by hand and reviewed')
        self.assertEqual(self.rc, 0, self.out)
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        x1 = self.state()['phases']['X1']
        self.assertEqual(x1['stage'], 'COMPLETE')
        self.assertEqual([a['tier'] for a in x1['audits']], ['standard', 'standard', 'strict'])
        self.assertEqual(self.state()['resolutions'][0]['note'], 'fixed by hand and reviewed')

    # ── 6, 7: High ───────────────────────────────────────────────────
    def test_06_reproduced_high_is_repaired(self):
        self.one_phase()
        self.seq(['done', 'done'], [H('Wrong temporal projection'), CLEAN, CLEAN])
        self.run_campaign()
        x1 = self.state()['phases']['X1']
        self.assertEqual(x1['stage'], 'COMPLETE', self.out); self.assertEqual(x1['rounds'], dict(medium=0, high=1))

    def test_07_repeated_unresolved_high_stops(self):
        self.one_phase()
        self.seq(['done', 'done', 'done'], [H('Same defect'), H('Same defect'), H('Same defect')])
        self.run_campaign()
        self.stopped('REPEATED_HIGH_FINDING')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (3, 3))

    def test_07b_unreproduced_high_is_not_auto_repaired(self):
        self.one_phase()
        self.seq(['done'], [{'f': [['HIGH', 'Maybe a race', 'PLAUSIBLE']]}])
        self.run_campaign()
        self.stopped('HIGH_NOT_REPRODUCED'); self.assertEqual(self.calls('claude'), 1)

    def test_07c_high_and_medium_in_one_round(self):
        self.one_phase()
        self.seq(['done', 'done'], [{'f': [['HIGH', 'H one'], ['MEDIUM', 'M one']]}, CLEAN, CLEAN])
        self.run_campaign()
        x1 = self.state()['phases']['X1']
        self.assertEqual(x1['stage'], 'COMPLETE', self.out); self.assertEqual(x1['rounds'], dict(medium=1, high=1))
        self.assertEqual(x1['round_history'][0]['ids'], ['F001', 'F002'])

    # ── 8, 9, 10: Medium budgets ─────────────────────────────────────
    def test_08_new_mediums_within_budget_continue(self):
        self.one_phase()
        self.seq(['done'] * 4, [M('First'), M('Second'), M('Third'), CLEAN, CLEAN])
        self.run_campaign()
        x1 = self.state()['phases']['X1']
        self.assertEqual(x1['stage'], 'COMPLETE', self.out); self.assertEqual(x1['rounds']['medium'], 3)
        self.assertEqual(self.receipt('X1')['remediation']['medium_rounds'], 3)

    def test_09_identical_medium_beyond_signature_budget_stops(self):
        self.one_phase()
        self.seq(['done'] * 3, [M('Same medium'), M('Same medium'), M('Same medium')])
        self.run_campaign()
        self.stopped('REPEATED_MEDIUM_FINDING')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (3, 3))

    def test_10_medium_round_budget_exhausted_stops(self):
        self.one_phase()
        self.seq(['done'] * 5, [M('A'), M('B'), M('C'), M('D'), M('E')])
        self.run_campaign()
        self.stopped('MEDIUM_BUDGET_EXHAUSTED')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (5, 5))

    def test_10b_manifest_may_tighten_budget(self):
        self.write_manifest(ready=['X1'], medium_rounds=1); self.commit('tight')
        self.seq(['done', 'done'], [M('A'), M('B')])
        self.run_campaign()
        self.stopped('MEDIUM_BUDGET_EXHAUSTED'); self.assertEqual(self.calls('claude'), 2)

    # ── 11–15: judgement gates ───────────────────────────────────────
    def test_11_audit_stop_marker_regulatory(self):
        self.one_phase()
        self.seq(['done'], [{'f': [['MEDIUM', 'Which movement rule applies']],
                             'stop': 'REGULATORY_INTERPRETATION_REQUIRED [F001] the source is ambiguous'}])
        self.run_campaign()
        self.stopped('REGULATORY_INTERPRETATION_REQUIRED'); self.assertEqual(self.calls('claude'), 1)

    def test_11b_unstructured_audit_stop_still_stops(self):
        self.one_phase()
        self.seq(['done'], [{'f': [['MEDIUM', 'x']], 'stop': 'human review required'}])
        self.run_campaign()
        self.stopped('AUDIT_STOP'); self.assertEqual(self.calls('claude'), 1)

    def test_12_scientific_decision_gate_from_builder(self):
        self.one_phase()
        self.seq(['blocked:SCIENTIFIC_DECISION_REQUIRED'], [])
        self.run_campaign()
        self.stopped('SCIENTIFIC_DECISION_REQUIRED'); self.assertEqual(self.calls('codex'), 0)

    def test_12b_builder_gate_in_open_concerns_stops_despite_done(self):
        self.one_phase()
        self.seq(['concern:VETERINARY_DECISION_REQUIRED'], [])
        self.run_campaign()
        self.stopped('VETERINARY_DECISION_REQUIRED'); self.assertEqual(self.calls('codex'), 0)

    def test_12c_interrupted_build_adoption_honours_gate(self):
        self.one_phase()
        self.seq(['concern:SCIENTIFIC_DECISION_REQUIRED'], [CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'build'})
        self.assertEqual(self.rc, 130, self.out)
        self.run_campaign()
        self.stopped('SCIENTIFIC_DECISION_REQUIRED')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 0))

    def test_13c_fixer_gate_in_open_concerns_stops(self):
        self.one_phase()
        self.seq(['done', 'concern:PRODUCT_DECISION_REQUIRED'], [M('Label choice')])
        self.run_campaign()
        self.stopped('PRODUCT_DECISION_REQUIRED'); self.assertEqual(self.calls('codex'), 1)

    def test_13_veterinary_decision_gate_in_finding(self):
        self.one_phase()
        self.seq(['done'], [M('Dose choice is VETERINARY_DECISION_REQUIRED')])
        self.run_campaign()
        self.stopped('VETERINARY_DECISION_REQUIRED'); self.assertEqual(self.calls('claude'), 1)

    def test_13b_fixer_stop_line_stops(self):
        self.one_phase()
        self.seq(['done', 'stop:SOURCE_PRECEDENCE_DECISION_REQUIRED'], [M('Which source wins')])
        self.run_campaign()
        self.stopped('SOURCE_PRECEDENCE_DECISION_REQUIRED')

    def test_14_migration_stops(self):
        self.one_phase()
        self.seq(['migration'], [])
        self.run_campaign()
        self.stopped('MIGRATION_APPROVAL_REQUIRED'); self.assertEqual(self.calls('codex'), 0)

    def test_14b_manifest_cannot_authorise_migrations(self):
        self.write_manifest(); m = json.loads((self.R / CAMP / 'campaign.json').read_text())
        m['phases'][0]['domains'] = ['migrations']
        self.write(CAMP + '/campaign.json', json.dumps(m)); self.commit('m')
        self.run_campaign()
        self.stopped('MANIFEST_INVALID'); self.assertEqual(self.calls('claude'), 0)

    def test_15_frozen_contract_change_stops(self):
        self.one_phase()
        self.seq(['frozen'], [])
        self.run_campaign()
        self.stopped('FROZEN_CONTRACT_CHANGE_REQUIRED'); self.assertEqual(self.calls('codex'), 0)

    def test_15b_contracts_doc_additive_allowed_deletion_stops(self):
        self.one_phase()
        self.seq(['contracts_add'], [CLEAN, CLEAN])
        self.run_campaign()
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertTrue(self.receipt('X1')['frozen_contract_status'].startswith('ADDITIVE_ALLOWED'))

    def test_15c_contracts_doc_deletion_stops(self):
        self.one_phase()
        self.seq(['contracts_delete'], [])
        self.run_campaign()
        self.stopped('FROZEN_CONTRACT_CHANGE_REQUIRED')

    # ── 16–21: preflight / drift ─────────────────────────────────────
    def test_16_missing_brief_not_ready_before_any_model_call(self):
        (self.R / CAMP / 'X1_BRIEF.md').unlink(); self.commit('no brief')
        self.run_campaign()
        self.stopped('PHASE_NOT_READY'); self.assertIn('does not exist', self.out)
        self.assertEqual((self.calls('claude'), self.calls('codex')), (0, 0))
        self.run_campaign('--status'); self.assertRegex(self.out, r'X1\s+(NOT_READY|STOPPED)')

    def test_16b_brief_missing_sections_not_ready(self):
        self.write(CAMP + '/X1_BRIEF.md', '# X1 — thin\n\n## Objective\n\nx\n'); self.commit('thin')
        self.run_campaign()
        self.stopped('PHASE_NOT_READY'); self.assertIn('lacks sections', self.out); self.assertEqual(self.calls('claude'), 0)

    def test_17_malformed_manifest_stops_before_model_call(self):
        self.write(CAMP + '/campaign.json', '{"schema_version": 1,'); self.commit('bad')
        self.run_campaign()
        self.stopped('MANIFEST_INVALID'); self.assertEqual(self.calls('claude'), 0)

    def test_17b_manifest_cannot_loosen_budgets(self):
        self.write_manifest(medium_rounds=5); self.commit('loose')
        self.run_campaign()
        self.stopped('MANIFEST_INVALID'); self.assertIn('policy.medium_rounds', self.out)

    def test_17c_manifest_predecessor_chain_enforced(self):
        self.write_manifest(); m = json.loads((self.R / CAMP / 'campaign.json').read_text())
        m['phases'][1]['predecessor'] = None
        self.write(CAMP + '/campaign.json', json.dumps(m)); self.commit('m')
        self.run_campaign()
        self.stopped('MANIFEST_INVALID')

    def test_18_wrong_branch_stops(self):
        self.git('branch', 'other'); self.git('symbolic-ref', 'HEAD', 'refs/heads/other')
        self.seq(['done'], [CLEAN])
        self.run_campaign()
        self.stopped('WRONG_BRANCH'); self.assertEqual(self.calls('claude'), 0)

    def test_19_dirty_tree_stops(self):
        self.write('stray.txt', 'x\n')
        self.run_campaign()
        self.stopped('DIRTY_WORKING_TREE'); self.assertEqual(self.calls('claude'), 0)

    def test_20_predecessor_receipt_mismatch_stops(self):
        self.one_phase()
        self.seq(['done', 'done'], [CLEAN, CLEAN, CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        self.rewrite_receipt('X1', lambda r: r.update(phase_title='edited'), refingerprint=False)
        self.write_manifest(); self.commit('tamper receipt and ready X2')
        self.run_campaign()
        self.stopped('RECEIPT_INVALID'); self.assertEqual(self.calls('claude'), 1)
        self.run_campaign('--status'); self.assertRegex(self.out, r'X1\s+RECEIPT_INVALID')

    def test_20b_product_commit_between_phases_stops(self):
        self.one_phase()
        self.seq(['done', 'done'], [CLEAN, CLEAN])
        self.run_campaign()
        self.write('src/app/page.tsx', 'export default 1;\n'); self.write_manifest(); self.commit('sneaky product change')
        self.run_campaign()
        self.stopped('UNEXPECTED_INTERVENING_CHANGE'); self.assertEqual(self.calls('claude'), 1)

    def test_20c_later_phase_scope_already_present_stops(self):
        self.write('src/x2/early.ts', 'export const early = 1;\n'); self.commit('early x2 work')
        self.run_campaign()
        self.stopped('SCOPE_ALREADY_PRESENT'); self.assertEqual(self.calls('claude'), 0)

    def test_21_head_drift_stops(self):
        self.one_phase()
        self.seq(['done'], ['quota'])
        self.run_campaign()
        self.stopped('QUOTA_EXHAUSTED')
        self.write('src/domain/fixture/work.ts', '// manual\n'); self.commit('manual commit mid-phase')
        self.run_campaign()
        self.stopped('HEAD_DRIFT'); self.assertEqual(self.calls('codex'), 1)

    # ── 22–24: receipt validation ────────────────────────────────────
    def _frozen_x1(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.run_campaign()
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertIsNone(self.validate('X1'))

    def test_22_receipt_audit_range_mismatch_invalid(self):
        self._frozen_x1()
        older = self.git('rev-list', '--max-parents=0', 'HEAD')
        self.rewrite_receipt('X1', lambda r: r.update(phase_base_sha=older))
        self.assertIn('does not cover', self.validate('X1'))

    def test_23_receipt_nonzero_medium_invalid(self):
        self._frozen_x1()
        mod = self.module()
        r = self.receipt('X1')
        art = self.R / r['strict_audit']['artifact']
        art.write_text(art.read_text().replace('MEDIUM=0', 'MEDIUM=1').replace(
            'AUDIT_STATUS', '### [MEDIUM] [F001] Tampered\n- FILE:LINE: work.txt:1\nAUDIT_STATUS', 1))
        def mut(x):
            x['strict_audit']['sha256'] = mod.sha256_file(str(art)); x['strict_audit']['counts']['medium'] = 1
        self.rewrite_receipt('X1', mut)
        self.assertIn('MEDIUM=1', self.validate('X1'))

    def test_24_receipt_missing_or_failed_verification_invalid(self):
        self._frozen_x1()
        self.rewrite_receipt('X1', lambda r: r.update(verification=[]))
        self.assertIn('no verification', self.validate('X1'))
        self.rewrite_receipt('X1', lambda r: r.update(verification=[dict(name='phase_verify', result='PASS', head=r['functional_freeze_sha']),
                                                                    dict(name='full_suite', result='FAIL', head=r['functional_freeze_sha'])]))
        self.assertIn('did not pass', self.validate('X1'))

    def test_24b_receipt_brief_changed_or_tampered_invalid(self):
        self._frozen_x1()
        p = self.R / CAMP / 'X1_BRIEF.md'
        p.write_text(p.read_text() + '\nNew scope.\n')
        self.assertIn('brief changed', self.validate('X1'))
        p.write_text(BRIEF.format(pid='X1'))
        self.rewrite_receipt('X1', lambda r: r.update(pushed_or_deployed=True), refingerprint=False)
        self.assertIn('fingerprint mismatch', self.validate('X1'))

    def test_24c_brief_edited_during_execution_stops_before_audit(self):
        self.one_phase()
        self.seq(['editbrief'], [CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('BRIEF_CHANGED')
        self.assertEqual(self.calls('codex'), 0)
        self.assertFalse((self.R / CAMP / 'receipts/X1.json').exists())
        self.assertTrue(self.state()['phases']['X1']['brief_sha256'])

    def test_24d_closure_refuses_brief_not_pinned_at_start(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'freeze'})
        self.assertEqual(self.rc, 130, self.out)
        sp = self.R / '.agent/history/campaign-fx.state.json'
        st = json.loads(sp.read_text()); st['phases']['X1']['brief_sha256'] = '0' * 64; sp.write_text(json.dumps(st))
        self.run_campaign()
        self.stopped('BRIEF_CHANGED')
        self.assertFalse((self.R / CAMP / 'receipts/X1.json').exists())

    # ── 25–27: resumability ──────────────────────────────────────────
    def test_25_interrupt_after_successful_build_resumes_without_rebuild(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'build'})
        self.assertEqual(self.rc, 130, self.out); self.assertIn('INTERRUPTED', self.out)
        self.assertEqual(self.state()['phases']['X1']['in_flight'], 'build')
        self.assertFalse((self.R / '.agent/history/campaign.lock').exists())
        self.run_campaign()
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertEqual(self.calls('claude'), 1); self.assertIn('build was interrupted', self.out)

    def test_25b_real_sigint_during_build_resumes(self):
        self.one_phase()
        self.seq(['hang', 'done'], [CLEAN, CLEAN])
        e = {k: v for k, v in os.environ.items() if not k.startswith('AGENT_')}
        e.update(PATH='%s:%s' % (self.B, os.environ['PATH']), FAKE_DIR=str(self.T), AGENT_START_DATE='20261010',
                 AGENT_CLAUDE_TIMEOUT='60', AGENT_CODEX_TIMEOUT='60')
        p = subprocess.Popen(['./scripts/agent-campaign-run', CID], cwd=self.R, env=e, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, start_new_session=True)
        import time
        for _ in range(600):
            if (self.T / 'hanging').exists(): break
            time.sleep(0.1)
        self.assertTrue((self.T / 'hanging').exists(), 'fake claude never started')
        os.killpg(p.pid, 2)
        out, _ = p.communicate(timeout=120)
        (self.T / 'release').write_text('x')
        self.assertEqual(p.returncode, 130, out)
        self.run_campaign()
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertEqual(self.calls('claude'), 2)  # the interrupted call never succeeded, so it was repeated once

    def test_26_interrupt_after_successful_audit_adopts_it(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'audit'})
        self.assertEqual(self.rc, 130, self.out)
        self.run_campaign()
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertEqual(self.calls('codex'), 2); self.assertIn('adopting finished standard audit', self.out)
        self.assertTrue(self.state()['phases']['X1']['audits'][0]['adopted'])

    def test_27_codex_quota_is_resumable_without_rebuild(self):
        self.one_phase()
        self.seq(['done'], ['quota', CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('QUOTA_EXHAUSTED'); self.assertIn('RESUMABLE: yes', self.out)
        self.run_campaign()
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertEqual(self.calls('claude'), 1)

    def test_27b_claude_failure_is_resumable(self):
        self.one_phase()
        self.seq(['fail', 'done'], [CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('MODEL_CALL_FAILED'); self.assertIn('RESUMABLE: yes', self.out)
        self.run_campaign()
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertEqual(self.calls('claude'), 2)

    def test_27c_interrupt_after_freeze_and_after_closure_commit(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'freeze'})
        self.assertEqual(self.rc, 130, self.out)
        self.assertEqual(self.state()['phases']['X1']['stage'], 'CLOSURE_RECORD')
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'closure'})
        self.assertEqual(self.rc, 130, self.out)
        self.run_campaign()
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertIn('adopting closure commit', self.out)
        subjects = self.git('log', '--format=%s').splitlines()
        self.assertEqual(sum(1 for s in subjects if 'record closure' in s), 1)
        self.assertEqual(self.calls('codex'), 2)

    # ── 28: lock ─────────────────────────────────────────────────────
    def test_28_lock_prevents_second_runner_and_fails_closed(self):
        lock = self.R / '.agent/history/campaign.lock'
        # B: the same campaign, live → refused, lock untouched.
        lock.write_text(json.dumps(dict(pid=os.getpid(), host=socket.gethostname(), campaign_id=CID)))
        self.run_campaign()
        self.assertEqual(self.rc, 3, self.out); self.assertIn('RUNNER_ACTIVE', self.out)
        self.assertTrue(lock.exists())
        # A: a DIFFERENT campaign holding the worktree lock also refuses this one.
        lock.write_text(json.dumps(dict(pid=os.getpid(), host=socket.gethostname(), campaign_id='another-campaign')))
        self.run_campaign()
        self.assertEqual(self.rc, 3, self.out); self.assertIn('campaign another-campaign', self.out)
        self.assertTrue(lock.exists()); self.assertEqual(self.calls('claude'), 0)
        dead = subprocess.Popen(['true']); dead.wait()
        lock.write_text(json.dumps(dict(pid=dead.pid, host=socket.gethostname())))
        self.run_campaign()
        self.stopped('LOCK_STALE'); self.assertTrue(lock.exists())
        lock.write_text('garbage')
        self.run_campaign()
        self.stopped('LOCK_INDETERMINATE'); self.assertEqual(self.calls('claude'), 0)
        lock.unlink()
        # E: a per-campaign lock left by the first orchestrator build is never ignored.
        legacy = self.R / '.agent/history/campaign-other.lock'
        legacy.write_text(json.dumps(dict(pid=os.getpid(), host=socket.gethostname())))
        self.run_campaign()
        self.stopped('LOCK_INDETERMINATE'); self.assertIn('campaign-other.lock', self.out)
        self.assertTrue(legacy.exists()); self.assertEqual(self.calls('claude'), 0)

    def test_28b_worktree_lock_is_global_across_campaign_ids(self):
        mod = self.module()
        cwd = os.getcwd(); os.chdir(self.R)
        try:
            m = mod.load_manifest(CID)
            other = dict(m, campaign_id='another-campaign')
            self.assertEqual(mod.lock_path(CID), mod.lock_path('another-campaign'))
            a, b, a2 = mod.Campaign(m), mod.Campaign(other), mod.Campaign(m)
            a.lock()
            info = json.loads((self.R / '.agent/history/campaign.lock').read_text())
            # C: the lock names its owning campaign, process and host.
            self.assertEqual((info['campaign_id'], info['pid'], info['host']), (CID, os.getpid(), socket.gethostname()))
            self.assertIn('started_at', info)
            with self.assertRaises(mod.RunnerActive) as cm: b.lock()        # A: another campaign
            self.assertIn('campaign %s' % CID, str(cm.exception))
            with self.assertRaises(mod.RunnerActive): a2.lock()             # B: the same campaign again
            self.assertFalse(b.locked or a2.locked)
            b.unlock(); a2.unlock()                                          # a non-owner never removes the lock
            self.assertTrue((self.R / '.agent/history/campaign.lock').exists())
            a.unlock()                                                       # D: legitimate release
            self.assertFalse((self.R / '.agent/history/campaign.lock').exists())
            b.lock()
            self.assertEqual(json.loads((self.R / '.agent/history/campaign.lock').read_text())['campaign_id'], 'another-campaign')
            b.unlock()
        finally:
            os.chdir(cwd)

    # ── 29, 30: docs closure safety ──────────────────────────────────
    def test_29_closure_with_unauthorised_file_stops(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'freeze'})
        self.assertEqual(self.rc, 130, self.out)
        self.write('notes.md', 'unrelated\n')
        self.run_campaign()
        self.stopped('CLOSURE_UNAUTHORISED_CHANGE')
        self.assertNotIn('record closure', self.git('log', '-1', '--format=%s'))

    def test_30_build_state_corruption_stops_without_closure(self):
        self.one_phase()
        log_before = (self.R / 'docs/farm-return-next/IMPLEMENTATION_LOG.md').read_text()
        self.seq(['breakstate'], [CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('CLOSURE_SCHEMA_UNSUPPORTED')
        self.assertNotIn('record closure', self.git('log', '-1', '--format=%s'))
        self.assertEqual((self.R / 'docs/farm-return-next/IMPLEMENTATION_LOG.md').read_text(), log_before)
        self.assertEqual(self.git('status', '--porcelain'), '')
        self.assertFalse((self.R / CAMP / 'receipts/X1.json').exists())
        self.run_campaign('--status'); self.assertNotRegex(self.out, r'X1\s+FROZEN')

    def test_30b_corrupt_build_state_blocks_phase_start(self):
        self.write('docs/farm-return-next/BUILD_STATE.json', '{"x": 1}'); self.commit('unformatted')
        self.run_campaign()
        self.stopped('CLOSURE_SCHEMA_UNSUPPORTED'); self.assertEqual(self.calls('claude'), 0)

    # ── 32–35: no C2, no push/deploy/migration path, read-only modes ─
    def test_32_placeholder_phase_never_starts(self):
        # Placeholder safety is proven on an isolated fixture, so the real manifest may progress.
        self.write_manifest(ready=[]); (self.R / CAMP / 'X1_BRIEF.md').unlink(); self.commit('placeholders only')
        self.seq(['done'], [CLEAN])
        for mode in ('--status', '--dry-run'):
            self.run_campaign(mode)
            self.assertRegex(self.out, r'X1\s+NOT_READY'); self.assertRegex(self.out, r'X2\s+NOT_STARTED')
        self.assertIn('would NOT start', self.out)
        self.run_campaign()
        self.assertEqual(self.rc, 1, self.out)
        self.assertEqual((self.calls('claude'), self.calls('codex')), (0, 0))
        self.assertEqual(self.git('log', '-1', '--format=%s'), 'placeholders only')

    def test_32b_real_cattle_manifest_read_only_modes(self):
        state = SOURCE / '.agent/history/campaign-cattle-engine-v1.state.json'
        before = state.read_bytes() if state.exists() else None
        e = {k: v for k, v in os.environ.items() if not k.startswith('AGENT_')}
        e.update(PATH='%s:%s' % (self.B, os.environ['PATH']), FAKE_DIR=str(self.T))
        for mode in ('--status', '--dry-run'):
            p = subprocess.run(['./scripts/agent-campaign-run', 'cattle-engine-v1', mode],
                               cwd=SOURCE, env=e, capture_output=True, text=True, timeout=120)
            self.assertIn(p.returncode, (0, 1), p.stdout + p.stderr)
            self.assertRegex(p.stdout, r'C0\s+FROZEN', p.stdout + p.stderr)
        self.assertEqual((self.calls('claude'), self.calls('codex')), (0, 0))
        self.assertEqual(state.read_bytes() if state.exists() else None, before)

    def test_32c_operator_entrypoint_is_executable_in_git_and_on_disk(self):
        mode = subprocess.run([REAL_GIT, 'ls-files', '-s', 'scripts/agent-campaign-run'], cwd=SOURCE, capture_output=True,
                              text=True, check=True).stdout.split()
        self.assertEqual(mode[:1], ['100755'], 'scripts/agent-campaign-run must be committed executable (100755)')
        self.assertTrue(os.access(SOURCE / 'scripts/agent-campaign-run', os.X_OK))
        self.assertTrue(os.access(self.R / 'scripts/agent-campaign-run', os.X_OK), 'fixture copy lost the executable bit')
        self.assertTrue((SOURCE / 'scripts/agent-campaign-run').read_text().startswith('#!/usr/bin/env python3\n'))

    def test_33_no_push_deploy_or_migration_command_path(self):
        src = (SOURCE / 'scripts/agent-campaign-run').read_text()
        for bad in (r"'git',\s*'(push|reset|rebase|checkout|stash|clean)'", r"\b(vercel|supabase|psql)\b'", r"'deploy'",
                    r"db\s+push", r"migration\s+up"):
            self.assertIsNone(re.search(bad, src), bad)
        calls = re.findall(r"\['git', '([a-z-]+)'", src)
        self.assertTrue(set(calls) <= {'cat-file', 'merge-base', 'rev-parse', 'status', 'show', 'add', 'diff', 'commit', 'restore'}, calls)
        helper = re.findall(r"\bgit\('([a-z-]+)'", src)
        self.assertTrue(set(helper) <= {'rev-parse', 'status', 'branch', 'log', 'diff'}, helper)
        # Every external program the orchestrator itself starts: git, bash (verify commands) and the harness scripts.
        self.assertEqual(set(re.findall(r"SCRIPTS / '([a-z-]+)'", src)), {'agent-start', 'agent-build', 'agent-audit', 'agent-fix'})

    def test_34_35_dry_run_and_status_make_no_model_call_and_no_write(self):
        self.seq(['done'], [CLEAN])
        self.run_campaign('--dry-run')
        self.assertEqual(self.rc, 0, self.out); self.assertIn('Next: X1 from base', self.out); self.assertIn('Model calls: 0', self.out)
        self.run_campaign('--status')
        self.assertEqual(self.rc, 0, self.out); self.assertRegex(self.out, r'X1\s+READY')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (0, 0))
        self.assertFalse((self.R / '.agent/history/campaign-fx.state.json').exists())
        self.assertFalse((self.R / '.agent/history/campaign.lock').exists())
        self.assertEqual(self.git('status', '--porcelain'), '')

    def test_34b_usage_errors(self):
        self.run_campaign('--bogus'); self.assertEqual(self.rc, 2)
        self.run_campaign('--status', '--dry-run'); self.assertEqual(self.rc, 2)

    # ── 36: agent-fix narrow mode stays backward compatible ──────────
    def test_36_agent_fix_only_mode_guards(self):
        self.one_phase()
        self.seq(['done'], [{'f': [['MEDIUM', 'M'], ['LOW', 'L']]}])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'audit'})
        self.assertEqual(self.rc, 130, self.out)
        art = re.search(r'^last_audit: (.+)$', (self.R / '.agent/STATE.md').read_text(), re.M).group(1)
        e = {k: v for k, v in os.environ.items() if k not in ('AGENT_RUN_STATE', 'AGENT_PHASE')}
        e.update(PATH='%s:%s' % (self.B, os.environ['PATH']), FAKE_DIR=str(self.T))
        def fix(*a):
            p = subprocess.run(['./scripts/agent-fix', *a], cwd=self.R, env=e, capture_output=True, text=True)
            return p.returncode, p.stdout + p.stderr
        rc, out = fix('--only', 'F001', '--all', '--audit', art); self.assertNotEqual(rc, 0); self.assertIn('mutually exclusive', out)
        rc, out = fix('--only', 'F001'); self.assertNotEqual(rc, 0); self.assertIn('requires --audit', out)
        rc, out = fix('--audit', art); self.assertNotEqual(rc, 0); self.assertIn('only used with --only', out)
        rc, out = fix('--only', 'F002', '--audit', art, '--dry-run'); self.assertNotEqual(rc, 0); self.assertIn('cannot select', out)
        rc, out = fix('--only', 'F001', '--audit', art + '.old', '--dry-run'); self.assertNotEqual(rc, 0); self.assertIn('stale pin', out)
        rc, out = fix('--only', 'F001', '--audit', art, '--expect-head', 'HEAD~1', '--dry-run'); self.assertNotEqual(rc, 0)
        rc, out = fix('--only', 'F001', '--audit', art, '--dry-run'); self.assertEqual(rc, 0, out)
        self.assertIn('Fix ONLY these selected findings', out)
        rc, out = fix('--dry-run'); self.assertEqual(rc, 0, out); self.assertIn('no findings to fix', out)  # default unchanged: C/H only
        self.assertEqual(self.calls('claude'), 1)


if __name__ == '__main__':
    unittest.main(verbosity=1)
