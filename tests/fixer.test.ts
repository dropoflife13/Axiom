import { describe, it, expect } from 'vitest';
import { tryDeterministicFix } from '../src/fixer.js';

describe('Tier 0: Deterministic Auto-Fixer', () => {
  it('truncates DEVOPS-01 to DEVOP-01 and updates checklist citations (A5)', () => {
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
- **Gate**: Output **GATE: PASS** or **GATE: FAIL**
- **Insight**: Output **INSIGHT**

## 6. Handoff
- Handoff to Operations
`;

    const errors = [
      { code: 'A5', detail: 'Prefix longer than 5 letters' },
    ];

    const result = tryDeterministicFix(input, errors);
    expect(result.applied).toContain('[TIER 0] Truncated prefix DEVOPS → DEVOP');
    expect(result.fixed).toContain('**DEVOP-01**');
    expect(result.fixed).toContain('**DEVOP-02**');
    expect(result.fixed).toContain('(DEVOP-01)');
    expect(result.fixed).toContain('(DEVOP-02)');
    expect(result.fixed).not.toContain('DEVOPS-01');
  });

  it('appends | conf: 3 to a rule with no conf tag (A7)', () => {
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
- Output **GATE: PASS** or **GATE: FAIL** with **INSIGHT**

## 6. Handoff
- Handoff to QA
`;

    const errors = [{ code: 'A7', detail: 'Missing conf tag' }];
    const result = tryDeterministicFix(input, errors);

    expect(result.applied).toContain('[TIER 0] Appended conf: 3 to rule TST-01');
    expect(result.fixed).toContain(
      '- **TST-01** Validation: WHEN request is made → DO check auth. *breaks: auth error* | conf: 3'
    );
    expect(result.fixed).toContain(
      '- **TST-02** Rate Limit: WHEN limit exceeded → DO return 429. *breaks: bypass* | conf: 5'
    );
  });

  it('appends Gate/Insight block when A9 fires (A9)', () => {
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

    expect(result.applied).toContain('[TIER 0] Appended missing Gate/Insight block');
    expect(result.fixed).toContain('GATE: PASS');
    expect(result.fixed).toContain('GATE: FAIL');
    expect(result.fixed).toContain('INSIGHT');
  });

  it('removes unresolved checklist reference when A8 fires (A8)', () => {
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
- [ ] Phantom check (GHOST-99)

## 5. Gate vs Insight Mode
- **Gate**: Output **GATE: PASS** or **GATE: FAIL**
- **Insight**: Output **INSIGHT**

## 6. Handoff
- Handoff to QA
`;

    const errors = [{ code: 'A8', detail: 'Checklist cites unresolved GHOST-99' }];
    const result = tryDeterministicFix(input, errors);

    expect(result.applied).toContain('[TIER 0] Removed unresolved checklist reference to GHOST-99');
    expect(result.fixed).toContain('- [ ] Check rule (TST-01)');
    expect(result.fixed).not.toContain('GHOST-99');
  });

  it('returns empty applied array when the error is A3 (structural)', () => {
    const input = `# Broken Agent
Just raw text without H2 sections.
`;
    const errors = [{ code: 'A3', detail: 'Missing sections' }];
    const result = tryDeterministicFix(input, errors);

    expect(result.applied).toHaveLength(0);
    expect(result.fixed).toBe(input);
  });
});
