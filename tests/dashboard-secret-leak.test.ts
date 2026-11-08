import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walkDir(dir: string, baseDir = dir): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === '.turbo' ||
        entry.name === 'out'
      ) {
        continue;
      }
      results.push(...walkDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      // Exclude binary files like images/favicons
      if (/\.(ico|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot)$/i.test(entry.name)) {
        continue;
      }
      results.push(fullPath);
    }
  }
  return results;
}

describe('Dashboard Security & Secret Leak Prevention', () => {
  it('ensures dashboard/.env.example exists with no real keys', () => {
    const envExamplePath = path.resolve(process.cwd(), 'dashboard/.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const content = fs.readFileSync(envExamplePath, 'utf8');
    expect(content).not.toMatch(/nvapi-[A-Za-z0-9_-]{10,}/);
    expect(content).not.toMatch(/AIza[0-9A-Za-z-_]{35}/);
    expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
  });

  it('fails if any file under dashboard/ or dashboard/public/data/ contains NVIDIA key format or an env var name from root .env', () => {
    const rootEnvPath = path.resolve(process.cwd(), '.env');
    expect(fs.existsSync(rootEnvPath)).toBe(true);

    const rootEnvContent = fs.readFileSync(rootEnvPath, 'utf8');
    const envVarNames = rootEnvContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => line.split('=')[0].trim())
      .filter((name) => name.length > 0);

    expect(envVarNames.length).toBeGreaterThan(0);

    const dashboardDir = path.resolve(process.cwd(), 'dashboard');
    const files = walkDir(dashboardDir);

    expect(files.length).toBeGreaterThan(5);

    const nvidiaKeyRegex = /nvapi-[A-Za-z0-9_-]{20,}/;
    const violations: Array<{ file: string; reason: string }> = [];

    for (const filePath of files) {
      const relativePath = path.relative(process.cwd(), filePath);
      const content = fs.readFileSync(filePath, 'utf8');

      // 1. Check for NVIDIA key pattern
      const nvidiaMatch = content.match(nvidiaKeyRegex);
      if (nvidiaMatch) {
        violations.push({
          file: relativePath,
          reason: `Matches NVIDIA key format: ${nvidiaMatch[0].slice(0, 10)}...`,
        });
      }

      // 2. Check for env var names from root .env
      for (const envName of envVarNames) {
        if (content.includes(envName)) {
          violations.push({
            file: relativePath,
            reason: `Contains root .env variable name: "${envName}"`,
          });
        }
      }
    }

    if (violations.length > 0) {
      console.error('Secret/Env violations detected in dashboard:', violations);
    }

    expect(violations).toEqual([]);
  });
});
