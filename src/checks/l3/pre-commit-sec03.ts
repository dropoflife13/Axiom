import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkSec03Secrets } from './sec-03-secrets.js';

export function scanStagedFiles(repoRoot: string = process.cwd()): {
  passed: boolean;
  findings: Array<{ file: string; errors: Array<{ code: string; detail: string }> }>;
} {
  let stagedOutput = '';
  try {
    stagedOutput = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
  } catch (err: any) {
    console.error(`[SEC-03 PRE-COMMIT] Failed to list staged files: ${err.message}`);
    return { passed: false, findings: [{ file: '<git>', errors: [{ code: 'GIT_ERR', detail: err.message }] }] };
  }

  const stagedFiles = stagedOutput
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean);

  const findings: Array<{ file: string; errors: Array<{ code: string; detail: string }> }> = [];

  for (const relPath of stagedFiles) {
    const normalized = relPath.replace(/\\/g, '/');
    // Skip intentional negative test fixtures for SEC-03 unit tests
    if (normalized.startsWith('fixtures/l3/sec-03/fail-')) {
      continue;
    }

    const fullPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      continue;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const res = checkSec03Secrets(content);
      if (res.verdict === 'FAIL') {
        findings.push({
          file: normalized,
          errors: res.errors,
        });
      }
    } catch {
      // Binary or unreadable file, skip
    }
  }

  return {
    passed: findings.length === 0,
    findings,
  };
}

// Run when executed directly as CLI script
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).toLowerCase();

if (isMain) {
  const result = scanStagedFiles();
  if (!result.passed) {
    console.error('================================================================');
    console.error('[SEC-03 PRE-COMMIT BLOCKED] Secret detected in staged files:');
    for (const f of result.findings) {
      for (const err of f.errors) {
        console.error(`  - ${f.file}: [${err.code}] ${err.detail}`);
      }
    }
    console.error('================================================================');
    process.exit(1);
  }
  console.log('[SEC-03 PRE-COMMIT] PASS — No secrets found in staged files.');
}

