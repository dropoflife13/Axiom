import fs from 'node:fs';
import path from 'node:path';
import type { VaultRuleLocation } from '../schema/types.js';

export const CONSTITUTIONAL_ROOT_TARGETS = new Set([
  'OPERATING-PRINCIPLES',
  'HEURISTICS',
]);

export function buildVaultIndex(root: string): Map<string, VaultRuleLocation> {
  const vaultIndex = new Map<string, VaultRuleLocation>();
  const rulePattern = /^\s*-\s*\*\*([A-Z]{1,5}-\d+)\*\*/;

  const targetDirs = [
    path.join(root, 'agents'),
    path.join(root, 'brain', '02-domains')
  ];

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = path.join(dir, entry);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(rulePattern);
        if (match) {
          const id = match[1];
          const prefix = id.split('-')[0];
          vaultIndex.set(id, {
            id,
            file: path.relative(root, filePath).replace(/\\/g, '/'),
            line: i + 1,
            prefix
          });
        }
      }
    }
  }

  return vaultIndex;
}

