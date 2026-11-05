import fs from 'node:fs';
import path from 'node:path';
import type { VerificationResult, VerificationIssue, VerificationWarning, VerificationContext } from '../schema/types.js';
import { validateCrossReferences } from './reference-extractor.js';

export function verifyAgent(rawFileText: string, ctx: VerificationContext): VerificationResult {
  const fileText = rawFileText.replace(/^\uFEFF/, '');
  const errors: VerificationIssue[] = [];
  const warnings: VerificationWarning[] = [];
  const lines = fileText.split(/\r?\n/);

  // A1: no frontmatter
  if (fileText.trimStart().startsWith('---')) {
    errors.push({
      code: 'A1',
      line: 1,
      detail: 'Agent file must not contain YAML frontmatter'
    });
  }

  // A2: H1 matches ^# .+ Agent — .+$ (em dash \u2014)
  const h1Index = lines.findIndex(l => l.startsWith('# '));
  if (h1Index === -1) {
    errors.push({
      code: 'A2',
      line: 1,
      detail: 'Agent file is missing H1 header'
    });
  } else {
    const h1Line = lines[h1Index];
    if (!/^#\s+.+\s+Agent\s+—\s+.+$/.test(h1Line)) {
      errors.push({
        code: 'A2',
        line: h1Index + 1,
        detail: `H1 header does not match required format "^# .+ Agent — .+$": "${h1Line}"`
      });
    }
  }

  // A3: six H2 sections in order
  const expectedSections = [
    { prefix: '## 1. Identity & Scope', name: 'Identity & Scope', pattern: /##\s*1\.\s*Identity\s*&\s*Scope/i },
    { prefix: '## 2. Read-First', name: 'Read-First', pattern: /##\s*2\.\s*Read-First/i },
    { prefix: '## 3. Hard Restrictions', name: 'Hard Restrictions', pattern: /##\s*3\.\s*Hard\s*Restrictions/i },
    { prefix: '## 4. Required Checks', name: 'Required Checks', pattern: /##\s*4\.\s*Required\s*Checks/i },
    { prefix: '## 5. Gate vs Insight Mode', name: 'Gate vs Insight Mode', pattern: /##\s*5\.\s*Gate\s*vs\s*Insight\s*Mode/i },
    { prefix: '## 6. Handoff', name: 'Handoff', pattern: /##\s*6\.\s*Handoff/i }
  ];

  const actualH2s: { line: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      actualH2s.push({ line: i + 1, text: lines[i] });
    }
  }

  let sectionsMatch = actualH2s.length === 6;
  if (sectionsMatch) {
    for (let i = 0; i < 6; i++) {
      if (!actualH2s[i].text.startsWith(expectedSections[i].prefix)) {
        sectionsMatch = false;
        break;
      }
    }
  }

  if (!sectionsMatch) {
    const detail = `Agent must contain exactly 6 H2 sections in order: ${expectedSections.map(s => `"${s.prefix}"`).join(', ')}`;
    errors.push({
      code: 'A3',
      line: actualH2s[0]?.line || 1,
      detail
    });
  }

  // Helper to get section lines by pattern (finding actual content even if numbered differently)
  const getSectionLinesByPattern = (pattern: RegExp): { start: number; end: number; lines: string[] } => {
    const startIdx = lines.findIndex(l => pattern.test(l));
    if (startIdx === -1) return { start: -1, end: -1, lines: [] };
    const nextH2 = lines.findIndex((l, idx) => idx > startIdx && l.startsWith('## '));
    const endIdx = nextH2 === -1 ? lines.length : nextH2;
    return {
      start: startIdx,
      end: endIdx,
      lines: lines.slice(startIdx, endIdx)
    };
  };

  // A4: Identity has bullets "- **Role:**", "- **Owns:**", "- **Does NOT own:**"
  const sec1 = getSectionLinesByPattern(/Identity\s*&\s*Scope/i);
  if (sec1.start !== -1) {
    const hasRole = sec1.lines.some(l => /^- \*\*Role:\*\*/.test(l));
    const hasOwns = sec1.lines.some(l => /^- \*\*Owns:\*\*/.test(l));
    const hasDoesNotOwn = sec1.lines.some(l => /^- \*\*Does NOT own:\*\*/.test(l));

    if (!hasRole || !hasOwns || !hasDoesNotOwn) {
      errors.push({
        code: 'A4',
        line: sec1.start + 1,
        detail: `Section 1 must contain bullets "- **Role:**", "- **Owns:**", and "- **Does NOT own:**" (missing: ${[!hasRole && 'Role', !hasOwns && 'Owns', !hasDoesNotOwn && 'Does NOT own'].filter(Boolean).join(', ')})`
      });
    }
  }

  // A5 & A6 & A7 & A11: Hard Restrictions
  const sec3 = getSectionLinesByPattern(/Hard\s*Restrictions/i);
  const foundRuleIds: { id: string; num: number; line: number }[] = [];
  const foundPrefixes = new Set<string>();

  if (sec3.start !== -1) {
    for (let i = 0; i < sec3.lines.length; i++) {
      const line = sec3.lines[i];
      const absoluteLine = sec3.start + i + 1;

      // Check all bullet lines starting with "- **" or "- *"
      if (line.startsWith('- **') || line.startsWith('- *')) {
        const m = line.match(/^- \*\*([A-Z]{1,5})-(\d{2,3})\*\*/);
        if (!m) {
          errors.push({
            code: 'A5',
            line: absoluteLine,
            detail: `Line in section 3 does not match required rule format "^- \\*\\*([A-Z]{1,5})-(\\d{2,3})\\*\\*": "${line}"`
          });
        } else {
          const ruleId = `${m[1]}-${m[2]}`;
          foundPrefixes.add(m[1]);
          const num = parseInt(m[2], 10);
          foundRuleIds.push({ id: ruleId, num, line: absoluteLine });
        }
      }

      // A7: any rule containing WHEN must contain "→ DO" and end with "| conf: N" with N in 1..5
      if (/^-\s+\*\*[A-Z]{1,5}-\d+/.test(line) && /\bWHEN\b/.test(line)) {
        const hasDo = line.includes('→ DO');
        const hasConf = /\|\s*conf:\s*[1-5]\s*$/.test(line);
        if (!hasDo || !hasConf) {
          errors.push({
            code: 'A7',
            line: absoluteLine,
            detail: `Rule with WHEN must contain "→ DO" and terminate with "| conf: N" (1..5): "${line}"`
          });
        }
      }
    }

    // A6: one prefix per file and no duplicate IDs within the file
    if (foundPrefixes.size > 1) {
      errors.push({
        code: 'A6',
        line: sec3.start + 1,
        detail: `Multiple prefixes detected in agent file: ${Array.from(foundPrefixes).join(', ')}`
      });
    }

    const seenIds = new Set<string>();
    for (const r of foundRuleIds) {
      if (seenIds.has(r.id)) {
        errors.push({
          code: 'A6',
          line: r.line,
          detail: `Duplicate rule ID within file: ${r.id}`
        });
      }
      seenIds.add(r.id);
    }

    // A11: (warning) numbering gaps
    if (foundRuleIds.length > 0) {
      for (let i = 1; i < foundRuleIds.length; i++) {
        const prev = foundRuleIds[i - 1].num;
        const curr = foundRuleIds[i].num;
        if (curr !== prev + 1) {
          warnings.push({
            code: 'A11',
            line: foundRuleIds[i].line,
            detail: `Numbering gap between rule ${foundRuleIds[i - 1].id} and ${foundRuleIds[i].id}`
          });
        }
      }
    }
  }

  // A8: Required Checks: every "- [ ]" line cites an ID that resolves
  const sec4 = getSectionLinesByPattern(/Required\s*Checks/i);
  if (sec4.start !== -1) {
    for (let i = 0; i < sec4.lines.length; i++) {
      const line = sec4.lines[i];
      const absoluteLine = sec4.start + i + 1;
      if (line.startsWith('- [ ]')) {
        const ids: string[] = [];

        const parenMatches = line.matchAll(/\(([^)]+)\)/g);
        for (const pm of parenMatches) {
          const inner = pm[1];
          const tokens = inner.split(/[,;/]|\band\b|\bto\b|\.\./).map(t => t.trim());
          let currentPrefix: string | undefined;
          for (const tok of tokens) {
            const clean = tok.replace(/^(?:See|via)\s+/i, '').trim();
            const fullMatch = clean.match(/^([A-Z]{1,5})-(\d{1,3})$/);
            if (fullMatch) {
              currentPrefix = fullMatch[1];
              const num = parseInt(fullMatch[2], 10);
              const pad = num < 10 ? `0${num}` : `${num}`;
              ids.push(`${currentPrefix}-${pad}`);
            } else if (/^\d{1,3}$/.test(clean) && currentPrefix) {
              const num = parseInt(clean, 10);
              const pad = num < 10 ? `0${num}` : `${num}`;
              ids.push(`${currentPrefix}-${pad}`);
            }
          }
        }

        const directMatches = line.matchAll(/\b([A-Z]{1,5})-(\d{2,3})\b/g);
        for (const dm of directMatches) {
          const id = `${dm[1]}-${dm[2]}`;
          if (!ids.includes(id)) {
            ids.push(id);
          }
        }

        if (ids.length === 0) {
          errors.push({
            code: 'A8',
            line: absoluteLine,
            detail: `Checklist line does not cite any rule ID: "${line}"`
          });
        } else {
          for (const id of ids) {
            if (!ctx.vaultIndex.has(id)) {
              errors.push({
                code: 'A8',
                line: absoluteLine,
                detail: `Checklist cites unresolved rule ID: ${id}`
              });
            }
          }
        }
      }
    }
  }

  // A9: Section 5 contains strings GATE: PASS, GATE: FAIL, INSIGHT
  const sec5 = getSectionLinesByPattern(/Gate\s*vs\s*Insight/i);
  if (sec5.start === -1) {
    errors.push({
      code: 'A9',
      line: 1,
      detail: 'Agent is missing Gate vs Insight Mode section'
    });
  } else {
    const sec5Text = sec5.lines.join('\n');
    const hasPass = sec5Text.includes('GATE: PASS');
    const hasFail = sec5Text.includes('GATE: FAIL');
    const hasInsight = sec5Text.includes('INSIGHT');

    if (!hasPass || !hasFail || !hasInsight) {
      errors.push({
        code: 'A9',
        line: sec5.start + 1,
        detail: `Section 5 must contain GATE: PASS, GATE: FAIL, and INSIGHT (missing: ${[!hasPass && 'GATE: PASS', !hasFail && 'GATE: FAIL', !hasInsight && 'INSIGHT'].filter(Boolean).join(', ')})`
      });
    }
  }

  // A10: Section 6 every backticked *.md exists in agents/
  const sec6 = getSectionLinesByPattern(/Handoff/i);
  if (sec6.start !== -1) {
    const agentsDir = ctx.repoRoot ? path.join(ctx.repoRoot, 'agents') : null;
    for (let i = 0; i < sec6.lines.length; i++) {
      const line = sec6.lines[i];
      const absoluteLine = sec6.start + i + 1;
      const backtickMatches = line.matchAll(/`([^`]+\.md)`/g);
      for (const bm of backtickMatches) {
        const target = bm[1];
        if (agentsDir) {
          const targetPath = path.join(agentsDir, path.basename(target));
          if (!fs.existsSync(targetPath)) {
            errors.push({
              code: 'A10',
              line: absoluteLine,
              detail: `Section 6 references non-existent agent file \`${target}\``
            });
          }
        }
      }
    }
  }

  // Cross reference validation
  const refIssues = validateCrossReferences(lines, 'agent', ctx);
  errors.push(...refIssues);

  return {
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    warnings
  };
}
