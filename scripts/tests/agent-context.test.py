#!/usr/bin/env python3
"""Boundary/scope/usage regression tests; isolated repositories, no AI calls."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2]


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'scripts').mkdir()
        (self.root / '.agent/history').mkdir(parents=True)
        shutil.copy(SOURCE / 'scripts/agent-context.py', self.root / 'scripts/agent-context.py')
        self.run_cmd('git', 'init', '-q', '-b', 'work')
        self.run_cmd('git', 'config', 'user.email', 'test@example.invalid')
        self.run_cmd('git', 'config', 'user.name', 'test')
        (self.root / '.gitignore').write_text('.agent/history/\n')
        (self.root / '.agent/CURRENT_TASK.md').write_text('# Task: test\nStarting HEAD: auto\nVerify command: `true`\n')
        (self.root / 'old').write_text('base\n')
        self.commit()
        self.base = self.run_cmd('git', 'rev-parse', 'HEAD').strip()
        self.helper('pin')

    def tearDown(self): self.tmp.cleanup()

    def run_cmd(self, *args):
        return subprocess.check_output(args, cwd=self.root, text=True, stderr=subprocess.PIPE)

    def helper(self, *args): return self.run_cmd('python3', 'scripts/agent-context.py', *args)

    def commit(self):
        self.run_cmd('git', 'add', '-A')
        self.run_cmd('git', 'commit', '-qm', 'fixture')

    def test_complete_inventory_including_new_binary_deleted_and_odd_names(self):
        (self.root / 'old').unlink()
        (self.root / 'new file\nwith newline').write_bytes(b'\0binary')
        (self.root / 'untracked').mkdir()
        (self.root / 'untracked/child').write_text('new')
        inv = json.loads(self.helper('inventory', self.base, 'HEAD', 'true'))
        self.assertIn('old', inv['files'])
        self.assertIn('new file\nwith newline', inv['untracked'])
        self.assertIn('untracked/child', inv['untracked'])
        self.commit()
        inv = json.loads(self.helper('inventory', self.base, 'HEAD', 'false'))
        self.assertIn('new file\nwith newline', inv['files'])
        self.assertIn('untracked/child', inv['files'])

    def test_base_is_immutable_and_retask_requires_matching_title(self):
        path = self.root / '.agent/TASK.json'
        data = json.loads(path.read_text())
        (self.root / 'old').write_text('changed')
        self.commit()
        data['base_sha'] = self.run_cmd('git', 'rev-parse', 'HEAD').strip()
        path.write_text(json.dumps(data))
        with self.assertRaises(subprocess.CalledProcessError): self.helper('pin')

    def test_dependency_hints_expand_but_scope_stays_pinned(self):
        path = self.root / '.agent/TASK.json'
        data = json.loads(path.read_text())
        data['tests'].append('newly-discovered-test.py')
        path.write_text(json.dumps(data))
        self.assertEqual(self.helper('pin').strip(), self.base)
        task = self.root / '.agent/CURRENT_TASK.md'
        task.write_text(task.read_text() + '\nChanged scope\n')
        with self.assertRaises(subprocess.CalledProcessError): self.helper('pin')

    def test_fix_inventory_is_narrower_but_keeps_dependencies_in_prompt(self):
        (self.root / 'feature').write_text('feature')
        self.commit()
        fixbase = self.run_cmd('git', 'rev-parse', 'HEAD').strip()
        (self.root / 'old').write_text('fix')
        self.commit()
        broad = json.loads(self.helper('inventory', self.base, 'HEAD', 'false'))
        narrow = json.loads(self.helper('inventory', fixbase, 'HEAD', 'false'))
        self.assertIn('feature', broad['files'])
        self.assertEqual(narrow['files'], ['old'])
        self.assertIn('NEVER a file allow-list', self.helper('context'))
        self.assertIn('dependencies cross domains', self.helper('context'))

    def test_usage_known_or_unknown_never_invented(self):
        raw = self.root / '.agent/history/raw'
        output = self.root / '.agent/history/out'
        output.write_text('AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=0 LOW=0\n')
        raw.write_text('not structured usage')
        self.helper('telemetry', 'primary-audit', self.base, self.base, str(raw), '2', 'ASSESSED', str(output))
        raw.write_text(json.dumps({'type':'turn.completed', 'usage':{'input_tokens':100,'cached_input_tokens':80,'output_tokens':7}}))
        self.helper('telemetry', 'remediation', self.base, self.base, str(raw), '3', 'ASSESSED', str(output))
        records = [json.loads(l) for l in (self.root / '.agent/history/usage.jsonl').read_text().splitlines()]
        self.assertEqual(records[0]['total_tokens'], 'UNKNOWN')
        self.assertEqual(records[1]['total_tokens'], 107)
        self.assertEqual(records[1]['cached_input_tokens'], 80)
        self.assertEqual(records[1]['findings']['high'], 1)

    def test_audit_modes_and_legacy_default_are_explicit(self):
        for name in ('agent-audit', 'agent-lib.sh', 'codex-audit.sh'):
            shutil.copy(SOURCE / 'scripts' / name, self.root / 'scripts' / name)
        bindir = self.root / 'bin'; bindir.mkdir()
        codex = bindir / 'codex'; codex.write_text('#!/bin/sh\nexit 99\n'); codex.chmod(0o755)
        env = dict(os.environ, PATH=str(bindir) + ':' + os.environ['PATH'])
        self.commit()
        def audit(*args):
            return subprocess.run(['bash','scripts/agent-audit',*args,'--dry-run'], cwd=self.root, env=env, text=True, capture_output=True)
        primary = audit('--primary')
        self.assertEqual(primary.returncode, 0, primary.stderr)
        self.assertIn('base=' + self.base[:7], primary.stdout)
        self.assertNotIn('v1-baseline', primary.stdout)
        (self.root / 'brand-new').write_text('new')
        self.assertNotEqual(audit('--primary').returncode, 0)
        working = audit('--primary','--working-tree')
        self.assertEqual(working.returncode, 0, working.stderr)
        self.assertIn('brand-new', working.stdout)
        self.assertIn('git diff --cached', working.stdout)
        self.assertNotEqual(audit('--final','--working-tree').returncode, 0)
        self.commit()
        for mode in ('--campaign','--release','--repository'):
            self.assertEqual(audit(mode,self.base).returncode, 0)
            self.assertNotEqual(audit(mode).returncode, 0)
        for first in ('--primary', '--full', '--final', '--verify'):
            for second in ('--primary', '--final', '--verify'):
                run = audit(first, second)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn('conflicting modes', run.stderr)
        for mode in ('--campaign', '--release', '--repository'):
            for narrow in ('--primary', '--final', '--remediation'):
                run = audit(mode, 'HEAD~1', narrow, 'F001') if narrow == '--remediation' else audit(mode, 'HEAD~1', narrow)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn('conflicting modes', run.stderr)
        with self.assertRaises(subprocess.CalledProcessError):
            self.helper('receipt', 'final', 'HEAD~1', 'HEAD', 'PASS', 'fake.md')
        with self.assertRaises(subprocess.CalledProcessError):
            self.helper('receipt', 'final', self.base, 'HEAD', 'PASS', 'fake.md', 'true')
        old = (self.root / 'scripts/codex-audit.sh').read_text()
        self.assertNotIn('BASELINE_TAG=', old)

    def runstate(self, *args, check=True):
        if not (self.root / 'scripts/agent-runstate.py').exists():
            shutil.copy(SOURCE / 'scripts/agent-runstate.py', self.root / 'scripts/agent-runstate.py')
        env = {k: v for k, v in os.environ.items() if k != 'AGENT_RUN_STATE'}
        return subprocess.run(['python3', 'scripts/agent-runstate.py', *args], cwd=self.root, env=env,
                              text=True, capture_output=True, check=check)

    def test_verification_category_is_path_based_and_highest_wins(self):
        def cat(*files):
            (self.root / 'probe.py').write_text(
                'import importlib.util,sys\nspec=importlib.util.spec_from_file_location("r","scripts/agent-runstate.py")\n'
                'm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\n'
                'p=m.plan(sys.argv[1:],"HEAD",False,{})\nprint(p["category"],p["gate"],",".join(c["name"] for c in p["commands"]))\n')
            self.runstate('task-id')
            return self.run_cmd('python3', 'probe.py', *files).split()
        self.assertEqual(cat('docs/a.md', '.agent/CURRENT_TASK.md')[0], 'A')
        self.assertEqual(cat('scripts/x.sh', 'docs/a.md')[0], 'B')
        self.assertEqual(cat('src/components/X.tsx')[0], 'C')
        self.assertEqual(cat('src/domain/calc.ts', 'src/domain/calc.test.ts')[0], 'D')
        self.assertEqual(cat('src/lib/farm-data/q.ts')[0], 'E')
        self.assertEqual(cat('docs/farm-return-next/DOMAIN_CONTRACTS.md')[0], 'E')
        self.assertEqual(cat('unknown/file.bin')[0], 'E')  # unbounded impact → full path
        self.assertEqual(cat('supabase/migrations/1.sql')[:2], ['F', 'MIGRATION_APPROVAL_REQUIRED'])
        self.assertIn('quality_gate', cat('src/lib/farm-data/q.ts')[2])
        self.assertNotIn('quality_gate', cat('src/domain/calc.ts')[2])

    def test_code_fingerprint_ignores_docs_but_not_code(self):
        self.runstate('task-id')
        probe = ('import importlib.util\nspec=importlib.util.spec_from_file_location("r","scripts/agent-runstate.py")\n'
                 'm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nprint(m.fingerprint("code"),m.fingerprint("all"))\n')
        fp = lambda: self.run_cmd('python3', '-c', probe).split()
        code0, all0 = fp()
        (self.root / 'notes.md').write_text('doc\n')
        code1, all1 = fp()
        self.assertEqual(code0, code1)
        self.assertNotEqual(all0, all1)
        (self.root / 'old').write_text('code change\n')
        self.assertNotEqual(fp()[0], code1)
        self.assertEqual(self.run_cmd('git', 'status', '--porcelain', 'old').strip(), 'M old')  # real index untouched

    def test_runner_lock_live_stale_and_foreign(self):
        lock = self.root / '.agent/history/agent-run.lock'
        self.assertEqual(self.runstate('lock', 'acquire', str(os.getpid()), 'r1').returncode, 0)
        self.assertEqual(self.runstate('lock', 'acquire', '1', 'r2', check=False).returncode, 3)  # live owner kept
        dead = subprocess.Popen(['true']); dead.wait()
        lock.write_text(json.dumps(dict(pid=dead.pid, host=json.loads(lock.read_text())['host'], run_id='old')))
        self.assertEqual(self.runstate('lock', 'acquire', str(os.getpid()), 'r3').returncode, 0)  # stale replaced
        lock.write_text(json.dumps(dict(pid=1, host='elsewhere.invalid', run_id='x')))
        self.assertEqual(self.runstate('lock', 'acquire', str(os.getpid()), 'r4', check=False).returncode, 4)
        lock.write_text('garbage')
        self.assertEqual(self.runstate('lock', 'acquire', str(os.getpid()), 'r5', check=False).returncode, 4)

    def test_open_findings_extracts_only_critical_and_high(self):
        audit = self.root / '.agent/history/a.md'
        audit.write_text('# Audit\nrange: x\n\n### [HIGH] [F001] one\n- FILE:LINE: a:1\n### [MEDIUM] [F002] two\n- x\n'
                         '### [CRITICAL] [F003] three\n- y\nAUDIT_STATUS: ASSESSED\nAUDIT_SUMMARY: CRITICAL=1 HIGH=1 MEDIUM=1 LOW=0\n')
        out = self.root / '.agent/history/open.md'
        self.assertEqual(self.helper('open-findings', str(audit), str(out)).strip(), '2')
        text = out.read_text()
        self.assertIn('[F001]', text); self.assertIn('[F003]', text); self.assertNotIn('[F002]', text)
        self.assertNotIn('AUDIT_SUMMARY', text)

    def test_timeout_cleanup_needs_no_process_enumeration(self):
        import time
        shutil.copy(SOURCE / 'scripts/agent-lib.sh', self.root / 'scripts/agent-lib.sh')
        started = time.monotonic()
        run = subprocess.run(['bash', '-c', 'source scripts/agent-lib.sh; run_with_timeout 20 /dev/null .agent/history/out sleep 0.1'], cwd=self.root, timeout=5)
        self.assertEqual(run.returncode, 0)
        self.assertLess(time.monotonic() - started, 5)
        run = subprocess.run(['bash', '-c', 'source scripts/agent-lib.sh; run_with_timeout 1 /dev/null .agent/history/out sleep 20'], cwd=self.root, timeout=5)
        self.assertEqual(run.returncode, 124)

    def test_quality_gate_quiet_success_and_failure_logs(self):
        shutil.copy(SOURCE / 'scripts/quality-gate.sh', self.root / 'scripts/quality-gate.sh')
        bindir = self.root / 'bin'; bindir.mkdir()
        npm = bindir / 'npm'
        npm.write_text('#!/bin/sh\nprintf "verbose success\\n%.0s" 1 2 3\n')
        npm.chmod(0o755)
        env = dict(os.environ, PATH=str(bindir) + ':' + os.environ['PATH'])
        run = subprocess.run(['bash','scripts/quality-gate.sh'],cwd=self.root,env=env,text=True,capture_output=True)
        self.assertEqual(run.returncode, 0)
        self.assertIn('QUALITY_GATE pass', run.stdout)
        self.assertNotIn('verbose', run.stdout)
        npm.write_text('#!/bin/sh\necho exact-failure-diagnostic\nexit 42\n')
        run = subprocess.run(['bash','scripts/quality-gate.sh'],cwd=self.root,env=env,text=True,capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('exact-failure-diagnostic', run.stderr)
        self.assertTrue(any('exact-failure-diagnostic' in p.read_text() for p in (self.root / '.agent/history').glob('quality-*/test.log')))


if __name__ == '__main__': unittest.main()
