import type { VerificationResult, VerificationIssue, VerificationWarning, VerificationContext } from '../schema/types.js';

export function verifyCandidate(fileText: string, ctx: VerificationContext): VerificationResult {
  const errors: VerificationIssue[] = [];
  const warnings: VerificationWarning[] = [];
  const lines = fileText.split(/\r?\n/);

  // Skip frontmatter if present
  let startIndex = 0;
  if (fileText.trimStart().startsWith('---')) {
    const secondDashIndex = lines.slice(1).findIndex(l => l.trim() === '---');
    if (secondDashIndex !== -1) {
      startIndex = secondDashIndex + 2;
    }
  }

  // Stop checking rule lines if "Promotion Ledger" section is reached
  let inPromotionLedger = false;

  // Domain grammar regex with generic prefix capture and optional empty breaks/ev
  const candidateRuleRegex = /^-\s+\*\*([A-Za-z0-9_-]+)\*\*(?:\s+\([^)]+\):)?\s+WHEN\s+(.+?)\s+→\s+DO\s+(.+?)\s+\|\s+why:\s+(.+?)\s+\|\s+breaks:\s*(.*?)\s*\|\s+conf:\s+([0-9]+)\s+\|\s+ev:\s*(.*?)\s*\|\s+status:\s+([a-z]+)\s+((?:#[a-z0-9_-]+\s*)+)\^([a-z0-9-]+)$/;

  const foundCandidateNumbers: { num: number; line: number; id: string }[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (line.startsWith('## Promotion Ledger')) {
      inPromotionLedger = true;
      continue;
    }

    if (inPromotionLedger) {
      continue;
    }

    // A line is considered an intended candidate rule if:
    // 1. It starts with "- " outside promotion ledger, or
    // 2. Contains "\bWHEN\b" and ("\bDO\b" or "→"), or
    // 3. Starts with "- *" or contains "CAND-"
    const isBullet = trimmed.startsWith('- ');
    const hasRuleKeywords = /\bWHEN\b/.test(line) && (line.includes('→') || /\bDO\b/.test(line));
    const looksLikeCandidate = /^-\s+\*+[A-Za-z0-9_-]+/.test(trimmed) || /CAND-\d+/.test(trimmed);

    if (isBullet || hasRuleKeywords || looksLikeCandidate) {
      const match = line.match(candidateRuleRegex);
      if (!match) {
        errors.push({
          code: 'C1',
          line: lineNum,
          detail: `Candidate rule line does not match grammar: "${line}"`
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

      const conf = parseInt(confStr, 10);

      // C6: no line may have status active
      if (status === 'active') {
        errors.push({
          code: 'C6',
          line: lineNum,
          detail: 'Candidate rule must never have status "active"'
        });
      }

      // C1: ID matches ^CAND-\d{2,3}$ and status is exactly candidate
      const idMatch = ruleId.match(/^CAND-(\d{2,3})$/);
      if (!idMatch) {
        errors.push({
          code: 'C1',
          line: lineNum,
          detail: `Candidate ID "${ruleId}" does not match required pattern "^CAND-\\d{2,3}$"`
        });
      }

      if (status !== 'candidate') {
        errors.push({
          code: 'C1',
          line: lineNum,
          detail: `Candidate status must strictly be "candidate" (got "${status}")`
        });
      }

      // C2: anchor = lowercase ID
      const expectedAnchor = ruleId.toLowerCase();
      if (anchor !== expectedAnchor) {
        errors.push({
          code: 'C2',
          line: lineNum,
          detail: `Candidate anchor "^${anchor}" does not match lowercase ID "^${expectedAnchor}"`
        });
      }

      // C3: conf <= 3 (Axiom policy)
      if (conf > 3) {
        errors.push({
          code: 'C3',
          line: lineNum,
          detail: `Candidate confidence ${conf} exceeds maximum automated rating of 3 (Axiom policy)`
        });
      }

      // C4: conf >= 3 requires breaks and ev non-empty
      if (conf >= 3) {
        if (!breaks || breaks.trim().length === 0) {
          errors.push({
            code: 'C4',
            line: lineNum,
            detail: `Candidate at conf ${conf} requires non-empty "breaks:" boundary condition`
          });
        }
        if (!ev || ev.trim().length === 0) {
          errors.push({
            code: 'C4',
            line: lineNum,
            detail: `Candidate at conf ${conf} requires non-empty "ev:" evidence`
          });
        }
      }

      if (idMatch) {
        const num = parseInt(idMatch[1], 10);
        foundCandidateNumbers.push({ num, line: lineNum, id: ruleId });
      }
    }
  }

  // C5: IDs sequential with no gaps or reuse
  const seenNumbers = new Set<number>();
  for (let i = 0; i < foundCandidateNumbers.length; i++) {
    const item = foundCandidateNumbers[i];
    if (seenNumbers.has(item.num)) {
      errors.push({
        code: 'C5',
        line: item.line,
        detail: `Duplicate candidate ID: ${item.id}`
      });
    }
    seenNumbers.add(item.num);

    if (i > 0) {
      const prev = foundCandidateNumbers[i - 1].num;
      if (item.num !== prev + 1) {
        errors.push({
          code: 'C5',
          line: item.line,
          detail: `Sequential gap in candidate numbering between ${foundCandidateNumbers[i - 1].id} and ${item.id}`
        });
      }
    }
  }

  return {
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
    warnings
  };
}
