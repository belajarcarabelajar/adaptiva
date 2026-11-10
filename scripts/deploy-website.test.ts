import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Runs the real script inside a throwaway git repo with `bun` stubbed on PATH,
// so no build, test run, or wrangler deploy ever happens.
const SCRIPT = path.join(import.meta.dir, 'deploy-website.sh');
const ROOT_PKG = path.join(import.meta.dir, '..', 'package.json');

const STUB_BUN = `#!/usr/bin/env bash
echo "bun $* acct=\${CLOUDFLARE_ACCOUNT_ID:-}" >> "$STUB_LOG"
if [[ "$1" == "x" && "$2" == "wrangler" ]]; then
  echo "wrangler says: \${WRANGLER_MSG:-ok} https://abc123.adaptiva.pages.dev"
  exit "\${WRANGLER_EXIT:-0}"
fi
exit 0
`;

let work: string;
let repo: string;
let log: string;

function sh(cmd: string[], cwd: string) {
  const r = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(' ')} failed: ${r.stderr.toString()}`);
}

beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'adaptiva-deploy-test-'));
  repo = path.join(work, 'repo');
  const bin = path.join(work, 'bin');
  log = path.join(work, 'stub.log');
  mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  mkdirSync(path.join(repo, 'apps/web/dist'), { recursive: true });
  mkdirSync(bin);
  copyFileSync(SCRIPT, path.join(repo, 'scripts/deploy-website.sh'));
  writeFileSync(path.join(repo, 'apps/web/dist/index.html'), '<!doctype html>');
  writeFileSync(path.join(bin, 'bun'), STUB_BUN);
  chmodSync(path.join(bin, 'bun'), 0o755);
  writeFileSync(log, '');
  sh(['git', 'init', '-q'], repo);
  commitAll();
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function commitAll() {
  sh(['git', 'add', '-A'], repo);
  sh(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'fixture'], repo);
}

function run(args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bash', 'scripts/deploy-website.sh', ...args], {
    cwd: repo,
    env: {
      PATH: `${path.join(work, 'bin')}:${process.env.PATH}`,
      HOME: work,
      STUB_LOG: log,
      CLOUDFLARE_API_TOKEN: 'tok-env',
      CLOUDFLARE_ACCOUNT_ID: 'acct-env',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exit: r.exitCode,
    out: r.stdout.toString() + r.stderr.toString(),
    calls: readFileSync(log, 'utf8'),
  };
}

describe('deploy-website.sh', () => {
  test('prints the wrangler output and a failure message when wrangler fails', () => {
    const r = run(['--skip-build', '--skip-test'], { WRANGLER_EXIT: '7', WRANGLER_MSG: 'Authentication error 10000' });
    expect(r.exit).not.toBe(0);
    expect(r.out).toContain('Authentication error 10000');
    expect(r.out).toContain('Deployment failed (exit 7)');
  });

  test('runs the Functions tests in the test step', () => {
    const r = run(['--skip-build']);
    expect(r.exit).toBe(0);
    expect(r.calls).toContain('bun run test:functions');
  });

  test('deploys with credentials from the environment when no .env exists', () => {
    const r = run(['--skip-build', '--skip-test']);
    expect(r.exit).toBe(0);
    expect(r.calls).toMatch(/bun x wrangler pages deploy .*acct=acct-env/);
  });

  test('falls back to .env when the environment has no credentials', () => {
    writeFileSync(path.join(repo, '.env'), 'CLOUDFLARE_API_TOKEN=tok-file\nCLOUDFLARE_ACCOUNT_ID=acct-file\n');
    sh(['git', 'add', '-f', '.env'], repo);
    commitAll();
    const r = run(['--skip-build', '--skip-test'], { CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' });
    expect(r.exit).toBe(0);
    expect(r.calls).toMatch(/bun x wrangler pages deploy .*acct=acct-file/);
  });

  test('refuses to deploy from a dirty working tree', () => {
    writeFileSync(path.join(repo, 'untracked.txt'), 'x');
    const r = run(['--skip-build', '--skip-test']);
    expect(r.exit).not.toBe(0);
    expect(r.out).toContain('--allow-dirty');
    expect(r.calls).not.toContain('wrangler');
  });

  test('deploys a dirty tree only with --allow-dirty', () => {
    writeFileSync(path.join(repo, 'untracked.txt'), 'x');
    const r = run(['--skip-build', '--skip-test', '--allow-dirty']);
    expect(r.exit).toBe(0);
    expect(r.calls).toContain('--commit-dirty=true');
  });

  test('a clean tree deploys without --commit-dirty', () => {
    const r = run(['--skip-build', '--skip-test']);
    expect(r.exit).toBe(0);
    expect(r.calls).toContain('bun x wrangler pages deploy');
    expect(r.calls).not.toContain('--commit-dirty');
  });
});

describe('package.json deploy script', () => {
  test('does not skip the tests', () => {
    const scripts = JSON.parse(readFileSync(ROOT_PKG, 'utf8')).scripts;
    expect(scripts.deploy).toContain('scripts/deploy-website.sh');
    expect(scripts.deploy).not.toContain('--skip-test');
  });
});
