import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  harvestCanaryOutputs,
  promoteCandidate,
  rejectCandidate,
  StagedAxiomCandidate,
} from '../src/promote.js';

describe('Axiom Harvester & Promotion Gate (src/promote.ts)', () => {
  const testDir = path.join(process.cwd(), '.axiom-state', 'test-promote');
  const stagingDir = path.join(testDir, 'staging');
  const registryPath = path.join(testDir, 'candidate-registry.json');

  const validAgentContent = `# Database Audit Ledger Agent — Enforcing Append-Only Tables

## 1. Identity & Scope
- **Role:** Ensure that designated PostgreSQL tables are immutable after insertion.
- **Owns:** Definition of append-only policy for target tables.
- **Does NOT own:** General database schema design.

## 2. Read-First (Docs to open before acting)
- PostgreSQL Documentation: https://www.postgresql.org/docs/current/

## 3. Hard Restrictions (With Rule IDs)
- **DAL-01** Append-Only Table Enforcement: WHEN a table is created with append-only tag → DO add REVOKE UPDATE, DELETE ON TABLE <table> FROM PUBLIC. *breaks: table has existing triggers* | conf: 5
- **DAL-02** Explicit REVOKE Guard: WHEN a user attempts to GRANT UPDATE on append-only table → DO reject command. *breaks: superuser override* | conf: 4

## 4. Required Checks (Checklist)
- [ ] Verify that every append-only table has REVOKE statements applied (DAL-01)
- [ ] Ensure no subsequent GRANT UPDATE succeeds on those tables (DAL-02)

## 5. Gate vs Insight Mode
- **Gate**: Evaluate all Hard Restrictions. Output **GATE: PASS** if every rule is satisfied; otherwise output **GATE: FAIL**.
- **Insight**: Output format: **INSIGHT** [details].

## 6. Handoff (Who gets the work next)
- Hands off to Compliance Reporting Agent for periodic audit reports.
`;

  beforeEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('harvests valid candidates and clamps confidence to <= 2', () => {
    fs.writeFileSync(path.join(stagingDir, 'db-audit.md'), validAgentContent, 'utf-8');

    const result = harvestCanaryOutputs(stagingDir, registryPath);
    expect(result.harvested).toBe(2);
    expect(result.skipped).toBe(0);

    const dal01 = result.candidates.find((c) => c.id === 'DAL-01');
    expect(dal01).toBeDefined();
    expect(dal01?.llmConfidence).toBe(5);
    expect(dal01?.enforcedConf).toBe(2); // Tenet 3: Quarantined to <= 2
    expect(dal01?.status).toBe('candidate');
    expect(dal01?.sha256).toHaveLength(12);
    expect(dal01?.sourceAgent).toBe('db-audit.md');
  });

  it('skips invalid agent files that fail deterministic verification', () => {
    // Missing Section 6 Handoff -> fails A3
    const badAgent = validAgentContent.replace(/## 6\. Handoff[\s\S]*$/, '');
    fs.writeFileSync(path.join(stagingDir, 'bad-agent.md'), badAgent, 'utf-8');

    const result = harvestCanaryOutputs(stagingDir, registryPath);
    expect(result.harvested).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.candidates).toHaveLength(0);
  });

  it('prevents collisions with canonical vault rules (e.g., SEC-01)', () => {
    // Attempting to generate a rule with ID SEC-01, which already exists in agents/securityagent.md
    const collidingAgent = validAgentContent
      .replace(/DAL-01/g, 'SEC-01')
      .replace(/DAL-02/g, 'SEC-02');
    fs.writeFileSync(path.join(stagingDir, 'colliding.md'), collidingAgent, 'utf-8');

    const result = harvestCanaryOutputs(stagingDir, registryPath);
    // Both SEC-01 and SEC-02 already exist in agents/securityagent.md
    expect(result.harvested).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('deduplicates identical candidates on repeat harvests', () => {
    fs.writeFileSync(path.join(stagingDir, 'db-audit.md'), validAgentContent, 'utf-8');

    const res1 = harvestCanaryOutputs(stagingDir, registryPath);
    expect(res1.harvested).toBe(2);

    const res2 = harvestCanaryOutputs(stagingDir, registryPath);
    expect(res2.harvested).toBe(0);
    expect(res2.skipped).toBe(2);
    expect(res2.candidates).toHaveLength(2);
  });

  it('supports promoteCandidate and rejectCandidate transitions', () => {
    fs.writeFileSync(path.join(stagingDir, 'db-audit.md'), validAgentContent, 'utf-8');
    harvestCanaryOutputs(stagingDir, registryPath);

    // Promote DAL-01
    const promResult = promoteCandidate('DAL-01', { registryPath });
    expect(promResult.success).toBe(true);
    expect(promResult.candidate?.status).toBe('promoted');
    expect(promResult.candidate?.enforcedConf).toBe(5); // Restores elevated confidence

    // Reject DAL-02
    const rejResult = rejectCandidate('DAL-02', { registryPath, reason: 'Redundant with DB-01' });
    expect(rejResult.success).toBe(true);
    expect(rejResult.candidate?.status).toBe('rejected');

    // Verify non-existent candidate handling
    const missing = promoteCandidate('NON-EXISTENT', { registryPath });
    expect(missing.success).toBe(false);
  });
});

