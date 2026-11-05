import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runReflexionLoop } from '../src/loop.js';

const TEST_QUARANTINE_FILE = path.join(process.cwd(), 'fixtures', 'test-quarantine.json');

const VALID_AGENT_WITH_A5_PREFIX = `# DevOps Agent — Multi-Cloud Specialist

## 1. Identity & Scope
- **Role:** Cloud orchestrator
- **Owns:** Pipelines
- **Does NOT own:** Hardware

## 2. Read-First
- docs/reference.md

## 3. Hard Restrictions
- **DEVOPS-01** Validation: WHEN request is made → DO check credentials. *breaks: none* | conf: 4

## 4. Required Checks
- [ ] Check credentials (DEVOPS-01)

## 5. Gate vs Insight Mode
- **Gate**: Output **GATE: PASS** or **GATE: FAIL**
- **Insight**: Output **INSIGHT**

## 6. Handoff
- Work given to SRE
`;

const VALID_AGENT_COMPLIANT = `# DevOps Agent — Multi-Cloud Specialist

## 1. Identity & Scope
- **Role:** Cloud orchestrator
- **Owns:** Pipelines
- **Does NOT own:** Hardware

## 2. Read-First
- docs/reference.md

## 3. Hard Restrictions
- **DEVOP-01** Validation: WHEN request is made → DO check credentials. *breaks: none* | conf: 4

## 4. Required Checks
- [ ] Check credentials (DEVOP-01)

## 5. Gate vs Insight Mode
- **Gate**: Output **GATE: PASS** or **GATE: FAIL**
- **Insight**: Output **INSIGHT**

## 6. Handoff
- Work given to SRE
`;

const BROKEN_STRUCTURAL_AGENT = `# Malformed Agent
Completely missing H2 sections.
`;

describe('Tier 0 + Tier 3 Reflexion Loop Architecture', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_QUARANTINE_FILE)) {
      fs.unlinkSync(TEST_QUARANTINE_FILE);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_QUARANTINE_FILE)) {
      fs.unlinkSync(TEST_QUARANTINE_FILE);
    }
  });

  it('fixes grammar-only failure via Tier 0 without calling the Advisor', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      markdown: VALID_AGENT_WITH_A5_PREFIX,
      rawResponse: VALID_AGENT_WITH_A5_PREFIX,
    });
    const mockAdvisor = vi.fn();
    const mockHeavy = vi.fn();

    const result = await runReflexionLoop({
      task: 'Test DevOps Agent',
      maxAttempts: 3,
      quarantinePath: TEST_QUARANTINE_FILE,
      executorFn: mockExecutor,
      advisorFn: mockAdvisor,
      heavyFn: mockHeavy,
      silent: true,
    });

    expect(result.success).toBe(true);
    expect(result.attempt).toBe(1);
    expect(result.tier0Applied).toBeDefined();
    expect(result.tier0Applied).toContain('[TIER 0] Truncated prefix DEVOPS → DEVOP');
    // Advisor was NOT called because Tier 0 fixed the error directly!
    expect(mockAdvisor).not.toHaveBeenCalled();
    expect(mockHeavy).not.toHaveBeenCalled();
  });

  it('calls the Advisor when facing a structural error (A3) and escalates to Tier 3 on attempt 3', async () => {
    let callCount = 0;
    const mockExecutor = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        markdown: BROKEN_STRUCTURAL_AGENT,
        rawResponse: BROKEN_STRUCTURAL_AGENT,
      };
    });

    const mockAdvisor = vi.fn().mockResolvedValue('Ensure all 6 sections are present.');
    const mockHeavy = vi.fn().mockResolvedValue(VALID_AGENT_COMPLIANT);

    const result = await runReflexionLoop({
      task: 'Test Semantic Escalation',
      maxAttempts: 3,
      quarantinePath: TEST_QUARANTINE_FILE,
      executorFn: mockExecutor,
      advisorFn: mockAdvisor,
      heavyFn: mockHeavy,
      silent: true,
    });

    expect(result.success).toBe(true);
    expect(result.attempt).toBe(3);
    // Executor called on attempts 1 and 2
    expect(mockExecutor).toHaveBeenCalledTimes(2);
    // Advisor called for attempts 1 and 2
    expect(mockAdvisor).toHaveBeenCalledTimes(2);
    // Heavy model escalated on attempt 3
    expect(mockHeavy).toHaveBeenCalledTimes(1);
  });

  it('halts and writes to quarantine.json when all 3 attempts fail', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      markdown: BROKEN_STRUCTURAL_AGENT,
      rawResponse: BROKEN_STRUCTURAL_AGENT,
    });
    const mockAdvisor = vi.fn().mockResolvedValue('Fix missing sections.');
    const mockHeavy = vi.fn().mockResolvedValue(BROKEN_STRUCTURAL_AGENT);

    const result = await runReflexionLoop({
      task: 'Persistent Failure Task',
      maxAttempts: 3,
      quarantinePath: TEST_QUARANTINE_FILE,
      executorFn: mockExecutor,
      advisorFn: mockAdvisor,
      heavyFn: mockHeavy,
      silent: true,
    });

    expect(result.success).toBe(false);
    expect(result.quarantined).toBe(true);
    expect(fs.existsSync(TEST_QUARANTINE_FILE)).toBe(true);

    const quarantineData = JSON.parse(fs.readFileSync(TEST_QUARANTINE_FILE, 'utf-8'));
    expect(quarantineData.task).toBe('Persistent Failure Task');
    expect(quarantineData.attempts.length).toBe(3);
    expect(quarantineData.finalErrors.length).toBeGreaterThan(0);
  });
});
