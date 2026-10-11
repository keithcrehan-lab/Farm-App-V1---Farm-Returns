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
lines += ['AUDIT_STATUS: ' + spec.get('status', 'ASSESSED'), 'AUDIT_SUMMARY: CRITICAL=%d HIGH=%d MEDIUM=%d LOW=%d' % tuple(counts[k] for k in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'))]
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

    def test_01b_completed_rerun_validates_repository_state(self):
        # F010: COMPLETE is re-reported only on the campaign branch, clean, at the closing HEAD.
        self.seq(['done', 'done'], [CLEAN, CLEAN, CLEAN, CLEAN])
        self.run_campaign()
        self.complete()
        closing = self.state()['phases']['X2']['closure_sha']
        self.assertEqual(self.git('rev-parse', 'HEAD'), closing)
        self.run_campaign(); self.complete()                                 # valid completed rerun
        self.write('stray.txt', 'x\n')                                       # dirty tree
        self.run_campaign(); self.stopped('DIRTY_WORKING_TREE'); self.assertIn('RESUMABLE: yes', self.out)
        (self.R / 'stray.txt').unlink()
        self.run_campaign(); self.complete()
        self.git('checkout', '-q', '-b', 'elsewhere')                        # wrong branch
        self.run_campaign(); self.stopped('WRONG_BRANCH')
        self.git('checkout', '-q', 'work')
        self.run_campaign(); self.complete()
        self.write('later.txt', 'x\n'); self.commit('a commit after closure')  # moved HEAD
        self.run_campaign(); self.stopped('HEAD_DRIFT'); self.assertIn(closing[:7], self.out)
        self.git('reset', '-q', '--hard', closing)                           # fixture repo only
        self.run_campaign(); self.complete()
        self.assertEqual((self.calls('claude'), self.calls('codex')), (2, 4))
        self.assertIsNone(self.state()['stop'])

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

    # ── 5g–5k: a human gate in an incomplete audit is never retried away (F007) ──
    def test_05g_unassessed_audit_with_stop_marker_is_a_human_stop(self):
        self.one_phase()
        self.seq(['done', 'done'], [{'status': 'UNASSESSED', 'stop': 'EXTERNAL_EVIDENCE_REQUIRED no source for the rule'}, CLEAN, CLEAN])
        self.run_campaign()
        # A: persisted, non-resumable, no fixer, no freeze, no next phase.
        self.stopped('EXTERNAL_EVIDENCE_REQUIRED'); self.assertIn('RESUMABLE: no', self.out)
        st = self.state()
        self.assertEqual((st['stop']['reason'], st['stop']['resumable']), ('EXTERNAL_EVIDENCE_REQUIRED', False))
        self.assertIn('.agent/history/audit-', st['stop']['detail'])
        x1 = st['phases']['X1']
        self.assertEqual(x1['stage'], 'PRIMARY_AUDIT'); self.assertIsNone(x1['in_flight'])
        self.assertEqual(x1['model_calls']['fix'], 0); self.assertNotIn('X2', st['phases'])
        self.assertFalse((self.R / CAMP / 'receipts/X1.json').exists())
        # B: rerunning without --resolve-stop replays the same stop with no model call.
        for _ in range(2):
            self.run_campaign()
            self.stopped('EXTERNAL_EVIDENCE_REQUIRED'); self.assertIn('Model calls this invocation: 0', self.out)
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 1))
        self.assertEqual(self.state()['stop'], st['stop'])

    def test_05h_interrupted_unassessed_audit_with_stop_marker_is_not_reaudited(self):
        # C: the in-flight artifact is adopted as a human stop, never silently re-audited.
        self.one_phase()
        self.seq(['done', 'done'], [{'status': 'UNASSESSED', 'stop': 'EXTERNAL_EVIDENCE_REQUIRED missing'}, CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'audit'})
        self.assertEqual(self.rc, 130, self.out)
        self.run_campaign()
        self.stopped('EXTERNAL_EVIDENCE_REQUIRED'); self.assertIn('RESUMABLE: no', self.out)
        self.run_campaign()
        self.stopped('EXTERNAL_EVIDENCE_REQUIRED')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 1))
        self.assertEqual(self.state()['phases']['X1']['model_calls']['fix'], 0)

    def test_05i_unassessed_audit_without_marker_stays_retryable(self):
        # D: an incomplete audit with no human gate keeps its retry/resume semantics.
        self.one_phase()
        self.seq(['done'], [{'status': 'UNASSESSED'}, CLEAN, CLEAN])
        self.run_campaign()
        self.stopped('AUDIT_UNASSESSED'); self.assertIn('RESUMABLE: yes', self.out)
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 3))

    def test_05j_human_gate_variants_outrank_retry_classification(self):
        mod = self.module()
        cwd = os.getcwd(); os.chdir(self.R)
        try:
            h = mod.head(); base = self.git('rev-parse', 'HEAD~1')
            def art(name, body, verdict='UNASSESSED'):
                p = self.T / name
                p.write_text('# Audit x\nrange: %s..%s · working-tree: false · codex exit: 1 · verdict: %s\n'
                             'auditor: codex tier=strict model=gpt-6-astra reasoning=high\n\n%s' % (base, h, verdict, body))
                return str(p)
            c = mod.Campaign.__new__(mod.Campaign)
            gated = {
                'unassessed_stop': ('STOP: EXTERNAL_EVIDENCE_REQUIRED x\nAUDIT_STATUS: UNASSESSED\n', 'EXTERNAL_EVIDENCE_REQUIRED'),
                'quota_stop': ('QUOTA_EXHAUSTED: limit\n\nSTOP: MIGRATION_APPROVAL_REQUIRED y\n', 'MIGRATION_APPROVAL_REQUIRED'),
                'truncated_gate': ('### [MEDIUM] [F001] Needs PRODUCT_DECISION_REQUIRED\n', 'PRODUCT_DECISION_REQUIRED'),
                'plain_stop': ('STOP: human review required\n', 'AUDIT_STOP'),
            }
            for name, (body, reason) in gated.items():
                ps = mod.new_phase_state(); ps.update(in_flight='audit-strict', in_flight_ref='x')
                with self.assertRaises(mod.Stop) as cm:
                    c.refuse_human_gate(art(name + '.md', body), base, h, True, ps)
                self.assertEqual((cm.exception.reason, cm.exception.resumable), (reason, False), name)
                self.assertIsNone(ps['in_flight'])
            for name in ('no_final_message', 'clean_assessed'):
                body = '(no final message — see raw.log)\n' if name == 'no_final_message' else \
                    'AUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0\n'
                self.assertIsNone(c.refuse_human_gate(art(name + '.md', body), base, h, True, mod.new_phase_state()), name)
            # E: a consistent Critical still reaches triage unchanged (recorded, then CRITICAL_FINDING).
            ok = art('consistent.md', '### [CRITICAL] [F001] Leak\n- PROBLEM: CONFIRMED\nAUDIT_STATUS: ASSESSED\n'
                     'AUDIT_SUMMARY: CRITICAL=1 HIGH=0 MEDIUM=0 LOW=0\n', 'ASSESSED')
            self.assertIsNone(c.refuse_human_gate(ok, base, h, True, mod.new_phase_state()))
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

    # ── 26b–26j: an interrupted audit is attributed by its bound identity, never by STATE.md (F007 repeat) ──
    GATE = {'stop': 'EXTERNAL_EVIDENCE_REQUIRED no source for the rule'}

    def strict_interrupted(self, spec):
        # Interrupted right after the strict audit call returned: the standard audit's STATE.md values are the stale ones.
        self.one_phase()
        self.seq(['done'], [CLEAN, spec, CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'audit_strict'})
        self.assertEqual(self.rc, 130, self.out)
        x1 = self.state()['phases']['X1']
        self.assertEqual(x1['in_flight'], 'audit-strict')
        md = dict(l.split(': ', 1) for l in (self.R / '.agent/STATE.md').read_text().splitlines() if ': ' in l)
        inv = x1.get('audit_call') or dict(artifact=md['last_audit'], base=x1['base_sha'], head=x1['head'])  # pre-fix runner
        self.assertEqual(Path(inv['artifact']).name, Path(md['last_audit']).name)
        self.assertTrue(Path(self.R / inv['artifact']).is_file())
        return x1, inv

    def state_md(self, **kv):
        p = self.R / '.agent/STATE.md'
        lines = p.read_text().splitlines()
        for k, v in kv.items():
            lines = [l for l in lines if not l.startswith(k + ':')] + ([] if v is None else ['%s: %s' % (k, v)])
        p.write_text('\n'.join(lines) + '\n')

    def publication_boundary(self, x1, inv, boundary):
        # The STATE.md agent-audit leaves when it dies at BOUNDARY (it sets head, then last_audit, then kind, then result).
        prev = x1['audits'][-1]['artifact']
        stale = dict(last_audit=prev, last_audit_kind='full', last_audit_head=x1['base_sha'], last_audit_result='stale @ x')
        if boundary == 'no_state':          self.state_md(**stale)
        elif boundary == 'last_audit_only': self.state_md(**dict(stale, last_audit=inv['artifact']))
        elif boundary == 'audit_and_kind':  self.state_md(**dict(stale, last_audit=inv['artifact'], last_audit_kind='campaign'))
        elif boundary == 'result_missing':  self.state_md(last_audit_result=None, last_audit_head=x1['base_sha'])
        elif boundary == 'message_only':    # codex's message composed, artifact not yet written, no state
            art = self.R / inv['artifact']
            Path(str(art) + '.tmp').write_text(art.read_text().split('\n\n', 1)[1]); art.unlink(); self.state_md(**stale)
        else: self.assertEqual(boundary, 'fully_published')

    def gate_held(self, reason='EXTERNAL_EVIDENCE_REQUIRED'):
        self.stopped(reason); self.assertIn('RESUMABLE: no', self.out)
        st = self.state(); x1 = st['phases']['X1']
        self.assertEqual((st['stop']['reason'], st['stop']['resumable']), (reason, False))
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 2))        # no new audit, no fixer
        self.assertEqual(x1['model_calls']['fix'], 0)
        self.assertNotIn(x1['stage'], ('FREEZE', 'CLOSURE_RECORD', 'COMPLETE')); self.assertNotIn('X2', st['phases'])
        self.assertFalse((self.R / CAMP / 'receipts/X1.json').exists())
        self.run_campaign()                                                          # L: replayed, zero model calls
        self.stopped(reason); self.assertIn('Model calls this invocation: 0', self.out)
        self.assertEqual(self.calls('codex'), 2)

    def test_26b_gate_survives_every_publication_boundary(self):
        # A + B + C + F: the auditor's exact defect and every other state-publication boundary.
        for boundary in ('no_state', 'last_audit_only', 'audit_and_kind', 'result_missing', 'message_only', 'fully_published'):
            for spec in (self.GATE, dict(self.GATE, status='UNASSESSED')):
                with self.subTest(boundary=boundary, unassessed='status' in spec):
                    self.tearDown(); self.setUp()
                    x1, inv = self.strict_interrupted(spec)
                    self.publication_boundary(x1, inv, boundary)
                    self.run_campaign()
                    self.gate_held()

    def test_26c_recovered_consistent_critical_stops(self):
        # D
        x1, inv = self.strict_interrupted({'f': [['CRITICAL', 'Cross-farm leak']]})
        self.publication_boundary(x1, inv, 'last_audit_only')
        self.run_campaign()
        self.gate_held('CRITICAL_FINDING')

    def test_26d_recovered_contradictory_critical_stops(self):
        # E
        x1, inv = self.strict_interrupted({'f': [['CRITICAL', 'Hidden']], 'summary': {'CRITICAL': 0}})
        self.publication_boundary(x1, inv, 'last_audit_only')
        self.run_campaign()
        self.gate_held('AUDIT_ARTIFACT_CONTRADICTION')

    def test_26e_recovered_clean_assessed_is_adopted(self):
        # G: stale STATE.md never forces a re-audit of a clean published artifact.
        x1, inv = self.strict_interrupted(CLEAN)
        self.publication_boundary(x1, inv, 'last_audit_only')
        self.run_campaign()
        self.assertEqual((inv['kind'], inv['tier'], inv['base'], inv['head']), ('campaign', 'strict', x1['base_sha'], x1['head']))
        self.assertIn('adopting finished strict audit', self.out)
        self.stopped('PHASE_NOT_READY')
        y = self.state()['phases']['X1']
        self.assertEqual(y['stage'], 'COMPLETE'); self.assertEqual(self.calls('codex'), 2)
        self.assertEqual(self.receipt('X1')['strict_audit']['original'], inv['artifact'])

    def test_26f_recovered_clean_unassessed_retries_after_inspection(self):
        # H
        x1, inv = self.strict_interrupted({'status': 'UNASSESSED'})
        self.publication_boundary(x1, inv, 'audit_and_kind')
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE'); self.assertEqual(self.calls('codex'), 3)
        self.assertNotEqual(self.receipt('X1')['strict_audit']['original'], inv['artifact'])

    def test_26g_nothing_published_keeps_retry(self):
        # I: the call provably published nothing (no artifact, no composed message).
        x1, inv = self.strict_interrupted(self.GATE)
        (self.R / inv['artifact']).unlink(); self.publication_boundary(x1, inv, 'no_state')
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        self.assertEqual(self.calls('codex'), 3)

    def test_26h_two_matching_artifacts_are_ambiguous(self):
        # J: never the newest, never a retry.
        x1, inv = self.strict_interrupted(CLEAN)
        other = self.R / '.agent/history/audit-20991231T235959Z-1.md'
        other.write_text((self.R / inv['artifact']).read_text())
        self.publication_boundary(x1, inv, 'last_audit_only')
        self.run_campaign()
        self.gate_held('AUDIT_RECOVERY_AMBIGUOUS')
        self.assertIn('audit-20991231T235959Z-1.md', self.state()['stop']['detail'])

    def test_26i_unrelated_new_artifacts_are_never_adopted(self):
        # K: a different range, tier or HEAD is not this call's output.
        x1, inv = self.strict_interrupted(CLEAN)
        bound = (self.R / inv['artifact']).read_text()
        (self.R / inv['artifact']).unlink(); self.publication_boundary(x1, inv, 'no_state')
        hist = self.R / '.agent/history'
        (hist / 'audit-20991231T235959Z-2.md').write_text(bound.replace('range: %s..' % inv['base'], 'range: %s..' % ('0' * 40)) + 'STOP: forged\n')
        (hist / 'audit-20991231T235959Z-3.md').write_text(bound.replace('tier=strict', 'tier=standard') + 'STOP: forged\n')
        (hist / 'audit-20991231T235959Z-4.md').write_text(bound.replace(inv['head'], '1' * 40) + 'STOP: forged\n')
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        self.assertEqual(self.calls('codex'), 3)
        self.assertNotIn('20991231T235959Z', self.receipt('X1')['strict_audit']['original'])

    def test_26j_agent_audit_bound_identity_contract(self):
        # agent-audit honours a valid AGENT_AUDIT_STAMP, refuses a malformed or reused one; unset → its own stamp.
        self.one_phase()
        e = {k: v for k, v in os.environ.items() if not k.startswith('AGENT_')}
        e.update(PATH='%s:%s' % (self.B, os.environ['PATH']), FAKE_DIR=str(self.T))
        def audit(stamp):
            env = dict(e, **({'AGENT_AUDIT_STAMP': stamp} if stamp else {}))
            return subprocess.run(['./scripts/agent-audit', '--campaign', 'HEAD~1', '--dry-run'], cwd=self.R, env=env,
                                  capture_output=True, text=True)
        self.assertNotEqual(audit('not-a-stamp').returncode, 0)
        (self.R / '.agent/history/audit-20990101T000000Z-7.raw.log').write_text('x')
        r = audit('20990101T000000Z-7'); self.assertNotEqual(r.returncode, 0); self.assertIn('already has files', r.stdout + r.stderr)
        self.assertEqual(audit('20990101T000000Z-8').returncode, 0, 'dry run with a fresh bound identity')
        self.assertEqual(audit(None).returncode, 0, 'unset: agent-audit stamps its own identity')
        self.assertEqual(self.calls('codex'), 0)

    # ── 27d–27f: an interrupted step never resumes on the wrong branch (F011) ──
    def resume_on_wrong_branch_then_back(self, key, claude, codex, step):
        self.one_phase()
        self.seq(claude, codex)
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': key})
        self.assertEqual(self.rc, 130, self.out)
        before = self.state()['phases']['X1']
        self.assertEqual(before['in_flight'], step)
        n = (self.calls('claude'), self.calls('codex'))
        h = self.git('rev-parse', 'HEAD')
        self.git('checkout', '-q', '-b', 'elsewhere')       # same commit, wrong branch
        for _ in range(2):
            self.run_campaign()
            self.stopped('WRONG_BRANCH'); self.assertIn('Model calls this invocation: 0', self.out)
        self.assertEqual((self.calls('claude'), self.calls('codex')), n)
        self.assertEqual(self.state()['phases']['X1'], before)  # stage, in-flight step and counters untouched
        self.assertEqual(self.git('rev-parse', 'HEAD'), h); self.assertEqual(self.git('branch', '--show-current'), 'elsewhere')
        self.git('checkout', '-q', 'work')
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE', self.out)
        self.assertEqual(self.git('branch', '--show-current'), 'work')
        return n

    def test_27d_interrupted_build_wrong_branch(self):
        # A + D + E: the build commit (expected HEAD movement) is adopted once back on the campaign branch.
        n = self.resume_on_wrong_branch_then_back('build', ['done'], [CLEAN, CLEAN], 'build')
        self.assertIn('build was interrupted', self.out)
        self.assertEqual(self.calls('claude'), n[0])          # never rebuilt
        self.assertEqual(self.calls('codex'), 2)

    def test_27e_interrupted_fix_wrong_branch(self):
        # B + D: the fix commit is adopted, never repeated.
        n = self.resume_on_wrong_branch_then_back('fix', ['done', 'done'], [M('Label'), CLEAN, CLEAN], 'fix')
        self.assertIn('fix was interrupted', self.out)
        self.assertEqual(n, (2, 1)); self.assertEqual(self.calls('claude'), 2)

    def test_27f_interrupted_start_wrong_branch(self):
        # C: the task start step.
        self.resume_on_wrong_branch_then_back('start', ['done'], [CLEAN, CLEAN], 'start')
        self.assertEqual(self.calls('claude'), 1)

    # ── 27g–27l: an interrupted closure always completes or stops, never dead-loops (F012) ──
    def interrupted_at_freeze(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': 'freeze'})
        self.assertEqual(self.rc, 130, self.out)
        x1 = self.state()['phases']['X1']
        self.assertEqual((x1['stage'], self.git('rev-parse', 'HEAD')), ('CLOSURE_RECORD', x1['freeze_sha']))
        return x1

    def write_receipt_only(self):
        # The state an interruption left under the old write order: the receipt, without its audit copy.
        mod = self.module()
        cwd = os.getcwd(); os.chdir(self.R)
        try:
            m = mod.load_manifest(CID)
            plan = mod.closure_plan(m, mod.phase_by_id(m, 'X1'), self.state()['phases']['X1'])
        finally:
            os.chdir(cwd)
        rp = self.R / plan['receipt_path']
        rp.parent.mkdir(parents=True, exist_ok=True); rp.write_bytes(plan['contents'][plan['receipt_path']])
        audit_copy = self.R / plan['receipt']['strict_audit']['artifact']
        self.assertFalse(audit_copy.exists())
        self.assertIn('is missing', self.validate('X1'))     # the partial receipt is never valid
        return plan

    def closed_once(self, x1):
        self.stopped('PHASE_NOT_READY')
        y = self.state()['phases']['X1']
        self.assertEqual(y['stage'], 'COMPLETE', self.out)
        self.assertEqual(y['freeze_sha'], x1['freeze_sha'])                          # functional freeze SHA preserved
        self.assertEqual(self.git('rev-parse', 'HEAD^'), x1['freeze_sha'])           # docs closure commit on top of it
        self.assertNotEqual(y['closure_sha'], y['freeze_sha'])
        self.assertEqual(sum('record closure' in x for x in self.git('log', '--format=%s').splitlines()), 1)
        self.assertIsNone(self.validate('X1'))
        self.assertEqual(self.receipt('X1')['strict_audit']['original'], x1['audits'][-1]['artifact'])  # the exact strict audit reused
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, 2))      # no rebuild, fix or re-audit
        self.assertEqual(self.git('status', '--porcelain'), '')
        self.assertEqual((self.state()['stop']['phase'], self.state()['stop']['reason']), ('X2', 'PHASE_NOT_READY'))

    def test_27g_receipt_written_before_audit_copy_recovers(self):
        # A: the auditor's reproduction — no RECEIPT_INVALID dead loop.
        x1 = self.interrupted_at_freeze()
        self.write_receipt_only()
        self.run_campaign()
        self.assertIn('closure was interrupted before its commit', self.out); self.assertNotIn('RECEIPT_INVALID', self.out)
        self.closed_once(x1)

    def test_27h_interrupt_between_each_closure_write_recovers(self):
        # A/B/C: every write boundary of the new order; the receipt is written last.
        for name in ('audit-copy', 'BUILD_STATE.json', 'IMPLEMENTATION_LOG.md', 'X1.json'):
            with self.subTest(after=name):
                self.tearDown(); self.setUp()                                       # a fresh fixture per boundary
                x1 = self.interrupted_at_freeze()
                key = 'closure-write:' + (Path(x1['audits'][-1]['artifact']).name if name == 'audit-copy' else name)
                self.run_campaign(env={'AGENT_CAMPAIGN_TEST_INTERRUPT_AFTER': key})
                self.assertEqual(self.rc, 130, self.out)
                self.assertEqual(self.git('rev-parse', 'HEAD'), x1['freeze_sha'])
                receipt = self.R / CAMP / 'receipts/X1.json'
                self.assertEqual(receipt.exists(), name == 'X1.json')               # never before its dependencies
                self.run_campaign()
                self.closed_once(x1)

    def test_27i_pending_closure_wrong_branch(self):
        # D
        x1 = self.interrupted_at_freeze()
        self.write_receipt_only()
        self.git('checkout', '-q', '-b', 'elsewhere')
        self.run_campaign()
        self.stopped('WRONG_BRANCH')
        self.assertEqual(self.git('rev-parse', 'HEAD'), x1['freeze_sha'])
        self.git('checkout', '-q', 'work')
        self.run_campaign()
        self.closed_once(x1)

    def test_27j_pending_closure_head_drift_stops(self):
        # E: a commit closure cannot explain → STOP, nothing guessed or committed by the campaign.
        x1 = self.interrupted_at_freeze()
        self.write_receipt_only()
        self.write('src/x1/other.ts', '// unrelated\n')
        self.git('add', 'src/x1/other.ts'); self.git('commit', '-qm', 'unrelated work after freeze')
        h = self.git('rev-parse', 'HEAD')
        self.run_campaign()
        self.stopped('HEAD_DRIFT')
        self.assertEqual(self.git('rev-parse', 'HEAD'), h)
        self.assertNotEqual(self.state()['phases']['X1']['stage'], 'COMPLETE')

    def test_27k_pending_closure_with_foreign_receipt_bytes_fails_closed(self):
        # G (pending side): an uncommitted receipt that is not the deterministic closure record is never adopted.
        x1 = self.interrupted_at_freeze()
        self.write_receipt_only()
        self.rewrite_receipt('X1', lambda r: r.update(outstanding_low_findings=['forged']))
        self.run_campaign()
        self.stopped('CLOSURE_UNAUTHORISED_CHANGE')
        self.assertEqual(self.git('rev-parse', 'HEAD'), x1['freeze_sha'])
        self.assertNotIn('forged', self.git('log', '--all', '-p', '--format=%s'))

    def test_27l_committed_malformed_receipt_still_invalid(self):
        # F + G: a completed closure validates; a committed, malformed final receipt is RECEIPT_INVALID, not recovered.
        x1 = self.interrupted_at_freeze()
        self.run_campaign()
        self.closed_once(x1)
        self.rewrite_receipt('X1', lambda r: r.update(pushed_or_deployed=True), refingerprint=False)
        self.commit('tamper with the final receipt')
        self.run_campaign()
        self.stopped('RECEIPT_INVALID'); self.assertIn('fingerprint mismatch', self.out)
        self.assertNotIn('closure was interrupted', self.out)

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

    # ── 28c–28e: a transient stop never overwrites an unresolved human stop (F008) ──
    def agent_run_lock(self, live=True):
        p = self.R / '.agent/history/agent-run.lock'
        if live: p.write_text(json.dumps(dict(pid=os.getpid(), host=socket.gethostname())))
        elif p.exists(): p.unlink()

    def human_stop_survives_transients(self, reason, codex):
        self.one_phase()
        self.seq(['done'], codex)
        self.run_campaign()
        self.stopped(reason)
        before = self.state()['stop']; n = self.calls('codex')
        self.assertFalse(before['resumable'])
        # A: a live agent-run lock is reported, but never becomes the recorded stop.
        self.agent_run_lock()
        self.run_campaign()
        self.stopped('RUNNER_ACTIVE'); self.assertIn('UNRESOLVED_STOP: %s' % reason, self.out)
        self.assertEqual(self.state()['stop'], before)
        # Same defect class: a failed --resolve-stop (dirty tree) never replaces it either.
        self.agent_run_lock(False)
        self.write('scratch.txt', 'dirty\n')
        self.run_campaign('--resolve-stop', '--note', 'premature')
        self.stopped('DIRTY_WORKING_TREE'); self.assertEqual(self.state()['stop'], before)
        (self.R / 'scratch.txt').unlink()
        # B: with the transient gone, a rerun without resolution still replays the human stop.
        for _ in range(2):
            self.run_campaign()
            self.stopped(reason); self.assertIn('Model calls this invocation: 0', self.out)
        self.assertEqual(self.state()['stop'], before)
        self.assertEqual((self.calls('claude'), self.calls('codex')), (1, n))
        self.assertEqual(self.state()['phases']['X1']['model_calls']['fix'], 0)
        # C: after explicit human resolution, a lock conflict is an ordinary resumable RUNNER_ACTIVE.
        self.run_campaign('--resolve-stop', '--note', 'reviewed by a human')
        self.assertEqual(self.rc, 0, self.out); self.assertIsNone(self.state()['stop'])
        self.agent_run_lock()
        self.run_campaign()
        self.stopped('RUNNER_ACTIVE'); self.assertIn('RESUMABLE: yes', self.out); self.assertNotIn('UNRESOLVED_STOP', self.out)
        self.assertEqual((self.state()['stop']['reason'], self.state()['stop']['resumable']), ('RUNNER_ACTIVE', True))
        self.agent_run_lock(False)
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE')

    def test_28c_contradiction_stop_survives_lock_conflict(self):
        self.human_stop_survives_transients('AUDIT_ARTIFACT_CONTRADICTION',
                                            [{'f': [['CRITICAL', 'Hidden critical']], 'summary': {'CRITICAL': 0}}, CLEAN, CLEAN])

    def test_28d_judgement_gate_stop_survives_lock_conflict(self):
        # E: the same precedence for a non-Critical human gate.
        self.human_stop_survives_transients('EXTERNAL_EVIDENCE_REQUIRED',
                                            [{'status': 'UNASSESSED', 'stop': 'EXTERNAL_EVIDENCE_REQUIRED x'}, CLEAN, CLEAN])

    def test_28e_lock_conflict_without_human_stop_is_resumable(self):
        # D: no recorded stop → the existing transient RUNNER_ACTIVE behaviour is unchanged.
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.agent_run_lock()
        self.run_campaign()
        self.stopped('RUNNER_ACTIVE'); self.assertIn('RESUMABLE: yes', self.out); self.assertNotIn('UNRESOLVED_STOP', self.out)
        self.assertEqual(self.calls('claude'), 0)
        self.agent_run_lock(False)
        self.run_campaign()
        self.stopped('PHASE_NOT_READY')
        self.assertEqual(self.state()['phases']['X1']['stage'], 'COMPLETE')

    def test_28f_stop_record_precedence_unit(self):
        mod = self.module()
        cwd = os.getcwd(); os.chdir(self.R)
        try:
            c = mod.Campaign.__new__(mod.Campaign)
            c.save = lambda: None
            human = dict(phase='X1', reason='CRITICAL_FINDING', detail='d', next='n', resumable=False, at='t', head='h')
            c.st = dict(stop=dict(human))
            for e in (mod.Stop('RUNNER_ACTIVE', 'x', 'wait', True), mod.Stop('QUOTA_EXHAUSTED', 'q', 'later', True),
                      mod.Stop('AUDIT_UNASSESSED', 'u', 'rerun', True), mod.Stop('HEAD_DRIFT', 'h', 'inspect')):
                self.assertFalse(c.stop(e, 'X1')); self.assertEqual(c.st['stop'], human)
            c.st = dict(stop=dict(human, resumable=True, reason='QUOTA_EXHAUSTED'))
            self.assertTrue(c.stop(mod.Stop('CRITICAL_FINDING', 'd', 'n'), 'X1'))
            self.assertEqual((c.st['stop']['reason'], c.st['stop']['resumable']), ('CRITICAL_FINDING', False))
        finally:
            os.chdir(cwd)

    # ── 28g–28i: campaign.lock and agent-run.lock exclude each other (F009) ──
    def run_agent_run(self):
        e = {k: v for k, v in os.environ.items() if k not in ('AGENT_RUN_STATE', 'AGENT_PHASE', 'AGENT_AUDIT_TIER')}
        e.update(PATH='%s:%s' % (self.B, os.environ['PATH']), FAKE_DIR=str(self.T), AGENT_CLAUDE_TIMEOUT='30', AGENT_CODEX_TIMEOUT='30')
        p = subprocess.run(['./scripts/agent-run'], cwd=self.R, env=e, capture_output=True, text=True, timeout=600)
        self.out, self.rc = p.stdout + p.stderr, p.returncode

    def agent_snapshot(self):
        # Everything either runner could write: task, run/campaign state, audits, locks and the git checkpoint.
        files = {str(f.relative_to(self.R)): f.read_bytes() for f in (self.R / '.agent').rglob('*') if f.is_file()}
        return files, self.git('rev-parse', 'HEAD'), self.git('status', '--porcelain')

    def test_28g_agent_run_refuses_while_campaign_holds_lock(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        clock = self.R / '.agent/history/campaign.lock'
        clock.write_text(json.dumps(dict(pid=os.getpid(), host=socket.gethostname(), started_at='t', campaign_id=CID)))
        before = self.agent_snapshot()
        self.run_agent_run()
        self.assertEqual(self.rc, 3, self.out); self.assertIn('AGENT_RUN_RESULT: RUNNER_ACTIVE', self.out)
        self.assertIn('campaign runner %s' % CID, self.out)
        self.assertEqual((self.calls('claude'), self.calls('codex')), (0, 0))
        self.assertFalse((self.R / '.agent/history/agent-run.lock').exists())
        self.assertEqual(self.agent_snapshot(), before)   # no task, run-state, audit or checkpoint write
        # An unreadable campaign lock is never taken as free.
        clock.write_text('garbage')
        self.run_agent_run()
        self.assertNotEqual(self.rc, 0); self.assertIn('LOCK_INDETERMINATE', self.out)
        self.assertEqual((self.calls('claude'), self.calls('codex')), (0, 0))
        self.assertFalse((self.R / '.agent/history/agent-run.lock').exists())

    def test_28h_campaign_refuses_while_agent_run_holds_lock(self):
        self.one_phase()
        self.seq(['done'], [CLEAN, CLEAN])
        self.agent_run_lock()
        lock_before = (self.R / '.agent/history/agent-run.lock').read_bytes()
        files, h, porc = self.agent_snapshot()
        self.run_campaign()
        self.stopped('RUNNER_ACTIVE'); self.assertEqual((self.calls('claude'), self.calls('codex')), (0, 0))
        after, h2, porc2 = self.agent_snapshot()
        self.assertEqual((h2, porc2), (h, porc))
        self.assertEqual((self.R / '.agent/history/agent-run.lock').read_bytes(), lock_before)
        self.assertFalse((self.R / '.agent/history/campaign.lock').exists())
        # Refused before any campaign state exists: nothing under .agent changed at all.
        self.assertEqual(after, files)
        # With campaign state present, only the campaign's own state file records its resumable stop.
        self.state_seed()
        files = self.agent_snapshot()[0]
        self.run_campaign()
        self.stopped('RUNNER_ACTIVE')
        after = self.agent_snapshot()[0]
        changed = {k for k in set(files) | set(after) if files.get(k) != after.get(k)}
        self.assertEqual(changed, {'.agent/history/campaign-fx.state.json'})
        self.assertEqual(self.state()['phases'], {}); self.assertEqual(self.state()['stop']['reason'], 'RUNNER_ACTIVE')
        self.assertEqual((self.calls('claude'), self.calls('codex')), (0, 0))

    def state_seed(self):
        (self.R / '.agent/history/campaign-fx.state.json').write_text(json.dumps(dict(
            schema_version=1, campaign_id=CID, branch='work', created_at='t', updated_at='t', phases={}, stop=None,
            resolutions=[], model_calls=dict(build=0, fix=0, audit_standard=0, audit_strict=0))))

    def test_28i_lock_exclusion_both_orders_in_process(self):
        mod = self.module()
        cwd = os.getcwd(); os.chdir(self.R)
        try:
            rs = mod.rs
            run_lock, camp_lock = self.R / '.agent/history/agent-run.lock', self.R / '.agent/history/campaign.lock'
            # Campaign first → agent-run refused, and it leaves no lock of its own behind.
            c = mod.Campaign(mod.load_manifest(CID)); c.lock()
            self.assertEqual(rs.lock_acquire(os.getpid(), 'r1'), 3)
            self.assertFalse(run_lock.exists()); self.assertTrue(camp_lock.exists())
            c.unlock(); self.assertFalse(camp_lock.exists())
            # agent-run first → the campaign refused, and it leaves no lock of its own behind.
            self.assertEqual(rs.lock_acquire(os.getpid(), 'r2'), 0)
            c2 = mod.Campaign(mod.load_manifest(CID))
            with self.assertRaises(mod.Stop) as cm: c2.lock()
            self.assertEqual(cm.exception.reason, 'RUNNER_ACTIVE')
            c2.unlock(); self.assertFalse(camp_lock.exists()); self.assertTrue(run_lock.exists())
            rs.lock_release(os.getpid()); self.assertFalse(run_lock.exists())
            # A dead same-host campaign owner is not an active campaign: agent-run proceeds, the stale
            # lock is left for the campaign runner to report (LOCK_STALE).
            dead = subprocess.Popen(['true']); dead.wait()
            camp_lock.write_text(json.dumps(dict(pid=dead.pid, host=socket.gethostname(), campaign_id=CID)))
            self.assertEqual(rs.lock_acquire(os.getpid(), 'r3'), 0); self.assertTrue(camp_lock.exists())
            rs.lock_release(os.getpid())
            camp_lock.write_text(json.dumps(dict(pid=os.getpid(), host='elsewhere', campaign_id=CID)))
            self.assertEqual(rs.lock_acquire(os.getpid(), 'r4'), 4); self.assertFalse(run_lock.exists())
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
