import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { VerificationResult, VerificationIssue, VerificationWarning, VerificationContext } from '../schema/types.js';
import { validateCrossReferences } from './reference-extractor.js';
import { CONSTITUTIONAL_ROOT_TARGETS } from './vault-index.js';

const AGENT_PREFIXES = new Set(['PM', 'UX', 'GR', 'SD', 'IR', 'DB', 'SEC', 'RS']);
const VALID_STATUSES = new Set(['candidate', 'active', 'superseded', 'retired']);

export function verifyDomain(fileText: string, ctx: VerificationContext): VerificationResult {
  const errors: VerificationIssue[] = [];
  const warnings: VerificationWarning[] = [];
  const lines = fileText.split(/\r?\n/);

  // D1: frontmatter has domain, prefix, version, status
  let frontmatter: Record<string, any> | null = null;
  let fmEndLine = 0;

  if (fileText.trimStart().startsWith('---')) {
    const secondDashIndex = lines.slice(1).findIndex(l => l.trim() === '---');
    if (secondDashIndex !== -1) {
      fmEndLine = secondDashIndex + 2;
      const yamlContent = lines.slice(1, secondDashIndex + 1).join('\n');
      try {
        frontmatter = YAML.parse(yamlContent);
      } catch (err: any) {
        errors.push({
          code: 'D1',
          line: 1,
          detail: `Invalid YAML frontmatter: ${err.message}`
        });
      }
    }
  }

  // Count actual rule lines in the file
  let ruleCount = 0;
  for (const line of lines) {
    if (/^-\s+\*\*[A-Z]{2,5}-\d+/.test(line)) {
      ruleCount++;
    }
  }

  if (!frontmatter) {
    errors.push({
      code: 'D1',
      line: 1,
      detail: 'Domain file is missing YAML frontmatter (must start with ---)'
    });
  } else {
    // Check required fields
    const isConceptualFramework = ruleCount === 0 && frontmatter.type === 'domain';
    if (!isConceptualFramework) {
      const missingFields: string[] = [];
      if (!frontmatter.domain) missingFields.push('domain');
      if (!frontmatter.prefix) missingFields.push('prefix');
      if (frontmatter.version === undefined) missingFields.push('version');
      if (!frontmatter.status) missingFields.push('status');

      if (missingFields.length > 0) {
        errors.push({
          code: 'D1',
          line: 1,
          detail: `Frontmatter missing required fields: ${missingFields.join(', ')}`
        });
      }
    } else {
      // For framework domain like empathy-personas.md: must have type, version, status
      const missingFields: string[] = [];
      if (!frontmatter.type) missingFields.push('type');
      if (frontmatter.version === undefined) missingFields.push('version');
      if (!frontmatter.status) missingFields.push('status');
      if (missingFields.length > 0) {
        errors.push({
          code: 'D1',
          line: 1,
          detail: `Framework domain frontmatter missing required fields: ${missingFields.join(', ')}`
        });
      }
    }

    // D8: prefix must not be an agent prefix
    if (frontmatter.prefix && AGENT_PREFIXES.has(frontmatter.prefix)) {
      errors.push({
        code: 'D8',
        line: 1,
        detail: `Domain prefix "${frontmatter.prefix}" collides with reserved agent prefix`
      });
    }
  }

  // If conceptual framework domain without rules (e.g. empathy-personas.md), stop here
  if (frontmatter && frontmatter.type === 'domain' && ruleCount === 0) {
    return {
      verdict: errors.length === 0 ? 'PASS' : 'FAIL',
      errors,
      warnings
    };
  }

  const expectedPrefix = frontmatter?.prefix;

  // Strict domain rule regex from docs/domain-grammar.md section 3
  // breaks and ev allow empty capture so D6 can report missing content
  const domainRuleRegex = /^-\s+\*\*([A-Z]{2,5}-\d{2,3})\*\*(?:\s+\([^)]+\):)?\s+WHEN\s+(.+?)\s+→\s+DO\s+(.+?)\s+\|\s+why:\s+(.+?)\s+\|\s+breaks:\s*(.*?)\s*\|\s+conf:\s+([0-9]+)\s+\|\s+ev:\s*(.*?)\s*\|\s+status:\s+([a-z]+)\s+((?:#[a-z0-9_-]+\s*)+)\^([a-z0-9-]+)$/;

  const fileRuleIds = new Set<string>();
  let inRulesSection = false;

  for (let i = fmEndLine; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith('## Rules')) {
      inRulesSection = true;
      continue;
    } else if (inRulesSection && trimmed.startsWith('## ')) {
      inRulesSection = false;
    }

    // A line is considered an intended rule if:
    // 1. It is a bullet line under ## Rules (e.g. starts with "- ")
    // 2. OR it contains "\bWHEN\b" and ("\bDO\b" or "→")
    // 3. OR it starts with "- *" or "- [A-Z]{2,5}-"
    const isBulletInRules = inRulesSection && trimmed.startsWith('- ');
    const hasRuleKeywords = /\bWHEN\b/.test(line) && (line.includes('→') || /\bDO\b/.test(line));
    const looksLikeRuleBullet = /^-\s+\*+[A-Za-z0-9_-]+/.test(trimmed) || /^-\s+[A-Z]{2,5}-\d+/.test(trimmed);

    if (isBulletInRules || hasRuleKeywords || looksLikeRuleBullet) {
      const match = line.match(domainRuleRegex);
      if (!match) {
        errors.push({
          code: 'D2',
          line: lineNum,
          detail: `Rule line does not match domain grammar: "${line}"`
        });
        continue;
      }

      const [
        ,
        ruleId,
        trigger,
        action,
        why,
        breaks,
        confStr,
        ev,
        status,
        tags,
        anchor
      ] = match;

      const rulePrefix = ruleId.split('-')[0];
      const conf = parseInt(confStr, 10);

      // D3: anchor equals lowercase rule ID
      const expectedAnchor = ruleId.toLowerCase();
      if (anchor !== expectedAnchor) {
        errors.push({
          code: 'D3',
          line: lineNum,
          detail: `Rule anchor "^${anchor}" does not match lowercase ID "^${expectedAnchor}"`
        });
      }

      // D4: prefix equals frontmatter prefix
      if (expectedPrefix && rulePrefix !== expectedPrefix) {
        errors.push({
          code: 'D4',
          line: lineNum,
          detail: `Rule prefix "${rulePrefix}" does not match frontmatter prefix "${expectedPrefix}"`
        });
      }

      // D5: status in candidate|active|superseded|retired
      if (!VALID_STATUSES.has(status)) {
        errors.push({
          code: 'D5',
          line: lineNum,
          detail: `Invalid rule status "${status}" (must be candidate, active, superseded, or retired)`
        });
      }

      // D6: conf in 1..5; if status active then conf >= 3 and ev non-empty and breaks non-empty
      if (conf < 1 || conf > 5) {
        errors.push({
          code: 'D6',
          line: lineNum,
          detail: `Confidence value ${conf} is out of bounds (1..5)`
        });
      } else if (status === 'active') {
        if (conf < 3) {
          errors.push({
            code: 'D6',
            line: lineNum,
            detail: `Active rule has confidence ${conf} < 3 (CV-03)`
          });
        }
        if (!breaks || breaks.trim().length === 0) {
          errors.push({
            code: 'D6',
            line: lineNum,
            detail: 'Active rule must provide non-empty "breaks:" boundary condition'
          });
        }
        if (!ev || ev.trim().length === 0) {
          errors.push({
            code: 'D6',
            line: lineNum,
            detail: 'Active rule must provide non-empty "ev:" evidence'
          });
        }
      }

      // D7: no duplicate IDs across the whole vault index (and file)
      if (fileRuleIds.has(ruleId)) {
        errors.push({
          code: 'D7',
          line: lineNum,
          detail: `Duplicate rule ID within file: ${ruleId}`
        });
      } else {
        fileRuleIds.add(ruleId);
      }

      // D10: (warning) wikilinks in ev: that do not resolve to a file in the repo
      const wikilinkMatches = ev.matchAll(/\[\[([^\]#|]+)(?:#[^\]]+)?\]\]/g);
      for (const wm of wikilinkMatches) {
        const target = wm[1].trim();
        if (CONSTITUTIONAL_ROOT_TARGETS.has(target)) {
          continue;
        }
        if (ctx.repoRoot) {
          const possiblePaths = [
            path.join(ctx.repoRoot, `${target}.md`),
            path.join(ctx.repoRoot, 'brain', '02-domains', `${target}.md`),
            path.join(ctx.repoRoot, 'brain', '07-meta', `${target}.md`),
            path.join(ctx.repoRoot, 'docs', `${target}.md`),
            path.join(ctx.repoRoot, 'agents', `${target}.md`)
          ];
          const exists = possiblePaths.some(p => fs.existsSync(p));
          if (!exists) {
            warnings.push({
              code: 'D10',
              line: lineNum,
              detail: `Wikilink [[${target}]] in ev: does not resolve to a file in the repository`
            });
          }
        }
      }
    }
  }

  // D9: for Profile A files, the "> Status: `active` (N rules)" count equals the actual number of rule lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const statusMatch = line.match(/^>\s*Status:\s*`active`\s*\((\d+)\s+(?:active\s+)?rules\)/i);
    if (statusMatch) {
      const declaredCount = parseInt(statusMatch[1], 10);
      if (declaredCount !== ruleCount) {
        errors.push({
          code: 'D9',
          line: i + 1,
          detail: `Status header declares (${declaredCount} rules) but file contains ${ruleCount} rule lines`
        });
      }
    }
  }

  // Cross reference validation
  const refIssues = validateCrossReferences(lines, 'domain', ctx);
  errors.push(...refIssues);

  return {
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    warnings
  };
}
