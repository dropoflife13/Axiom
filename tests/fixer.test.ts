import { describe, it, expect } from 'vitest';
import { tryDeterministicFix } from '../src/fixer.js';

describe('Tier 0: Deterministic Auto-Fixer', () => {
  it('truncates prefixes longer than 5 letters (A5)', () => {
    const input = `# DevOps Agent — Cloud Specialist

## 1. Identity & Scope
- **Role:** Cloud engineer
- **Owns:** Pipelines
- **Does NOT own:** Hardware

## 2. Read-First
- docs/pipeline.md

## 3. Hard Restrictions
- **DEVOPS-01** Validation: WHEN deploy request is sent → DO verify credentials. *breaks: invalid* | conf: 4
- **DEVOPS-02** Policy: WHEN region is set → DO verify policy. *breaks: policy error* | conf: 4

## 4. Required Checks
- [ ] Credentials verified (DEVOPS-01)
- [ ] Region compliant (DEVOPS-02)

## 5. Gate vs Insight Mode
- **Gate**: GATE: PASS or GATE: FAIL
- **Insight**: INSIGHT recommendations

## 6. Handoff
- Handoff to Operations
`;

    const errors = [
      { code: 'A5', detail: 'Prefix longer than 5 letters' },
    ];

    const result = tryDeterministicFix(input, errors);
    expect(result.applied).toContain('truncated DEVOPS to DEVOP');
    expect(result.fixed).toContain('**DEVOP-01**');
    expect(result.fixed).toContain('**DEVOP-02**');
    expect(result.fixed).toContain('(DEVOP-01)');
    expect(result.fixed).toContain('(DEVOP-02)');
    expect(result.fixed).not.toContain('DEVOPS-01');
  });

  it('appends missing | conf: 3 to rule lines lacking conf (A7)', () => {
    const input = `# Agent — Test

## 1. Identity & Scope
- **Role:** Test
- **Owns:** Test
- **Does NOT own:** Test

## 2. Read-First
- docs/test.md

## 3. Hard Restrictions
- **TST-01** Validation: WHEN request is made → DO check auth. *breaks: auth error*
- **TST-02** Rate Limit: WHEN limit exceeded → DO return 429. *breaks: bypass* | conf: 5

## 4. Required Checks
- [ ] Auth check (TST-01)
- [ ] Rate limit (TST-02)

## 5. Gate vs Insight Mode
- GATE: PASS or GATE: FAIL with INSIGHT

## 6. Handoff
- Handoff to QA
`;

    const errors = [{ code: 'A7', detail: 'Missing conf tag' }];
    const result = tryDeterministicFix(input, errors);

    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.fixed).toContain(
      '- **TST-01** Validation: WHEN request is made → DO check auth. *breaks: auth error* | conf: 3'
    );
    expect(result.fixed).toContain(
      '- **TST-02** Rate Limit: WHEN limit exceeded → DO return 429. *breaks: bypass* | conf: 5'
    );
  });

  it('adds standard GATE: PASS, GATE: FAIL, and INSIGHT strings to section 5 (A9)', () => {
    const input = `# Agent — Test

## 1. Identity & Scope
- **Role:** Test
- **Owns:** Test
- **Does NOT own:** Test

## 2. Read-First
- docs/test.md

## 3. Hard Restrictions
- **TST-01** Rule: WHEN trigger → DO action. *breaks: none* | conf: 4

## 4. Required Checks
- [ ] Check rule (TST-01)

## 5. Gate vs Insight Mode
This section just says pass or fail without the required tokens.

## 6. Handoff
- Handoff to QA
`;

    const errors = [{ code: 'A9', detail: 'Missing gate strings' }];
    const result = tryDeterministicFix(input, errors);

    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.fixed).toContain('GATE: PASS');
    expect(result.fixed).toContain('GATE: FAIL');
    expect(result.fixed).toContain('INSIGHT');
  });

  it('does NOT modify structural errors like missing section A3', () => {
    const input = `# Broken Agent
Just raw text without H2 sections.
`;
    const errors = [{ code: 'A3', detail: 'Missing sections' }];
    const result = tryDeterministicFix(input, errors);

    expect(result.applied).toHaveLength(0);
    expect(result.fixed).toBe(input);
  });
});
