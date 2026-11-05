import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { verify, buildVaultIndex, verifyAgentRoster, EXPECTED_AGENT_ROSTER } from '../src/verifier/index.js';
import type { VerificationContext } from '../src/schema/types.js';

describe('Verifier L1 Test Suite', () => {
  const root = path.resolve('.');
  let ctx: VerificationContext;

  beforeAll(() => {
    ctx = {
      vaultIndex: buildVaultIndex(root),
      repoRoot: root
    };
  });

  describe('BN-00: Agent Roster Invariant', () => {
    it('passes for complete agents/ roster', () => {
      const result = verifyAgentRoster(root);
      expect(result.verdict).toBe('PASS');
      expect(result.errors).toEqual([]);
    });

    it('fails with BN-00 if an agent file is missing', () => {
      // Test missing agent by checking against a mock directory
      const mockDir = path.join(root, 'fixtures', 'mock-agents');
      fs.mkdirSync(mockDir, { recursive: true });
      fs.writeFileSync(path.join(mockDir, 'dbaagent.md'), '# Mock');
      
      const mockRoot = path.join(root, 'fixtures');
      // verifyAgentRoster looks for path.join(root, 'agents')
      // Let's create fixtures/agents with 7 files only
      const incompleteAgentsDir = path.join(root, 'fixtures', 'incomplete-agents', 'agents');
      fs.mkdirSync(incompleteAgentsDir, { recursive: true });
      for (const f of EXPECTED_AGENT_ROSTER.slice(0, 7)) {
        fs.writeFileSync(path.join(incompleteAgentsDir, f), '# Mock');
      }

      const result = verifyAgentRoster(path.join(root, 'fixtures', 'incomplete-agents'));
      expect(result.verdict).toBe('FAIL');
      expect(result.errors.some(e => e.code === 'BN-00')).toBe(true);

      // Clean up mock dirs
      fs.rmSync(mockDir, { recursive: true, force: true });
      fs.rmSync(path.join(root, 'fixtures', 'incomplete-agents'), { recursive: true, force: true });
    });
  });

  describe('G1: Golden Agent Files', () => {
    const agentsDir = path.join(root, 'agents');
    const agentFiles = [
      'dbaagent.md',
      'growthagent.md',
      'integrationagent.md',
      'productmanageragent.md',
      'researchagent.md',
      'securityagent.md',
      'systemsdesignagent.md',
      'uiuxagent.md'
    ];

    for (const file of agentFiles) {
      it(`should PASS golden agent: ${file}`, () => {
        const filePath = path.join(agentsDir, file);
        const text = fs.readFileSync(filePath, 'utf-8');
        const result = verify(text, 'agent', ctx);
        if (result.verdict !== 'PASS') {
          console.error(`Golden Agent Failure [${file}]:`, result.errors);
        }
        expect(result.errors).toEqual([]);
        expect(result.verdict).toBe('PASS');
      });
    }
  });

  describe('G2: Golden Domain Files', () => {
    const domainsDir = path.join(root, 'brain', '02-domains');
    const allDomainFiles = fs.readdirSync(domainsDir)
      .filter((f: string) => f.endsWith('.md') && f !== '_TEMPLATE.md');

    let totalD10Warnings = 0;
    const unresolvedWikilinks = new Map<string, number>();

    for (const file of allDomainFiles) {
      it(`should PASS golden domain: ${file}`, () => {
        const filePath = path.join(domainsDir, file);
        const text = fs.readFileSync(filePath, 'utf-8');
        const result = verify(text, 'domain', ctx);
        if (result.verdict !== 'PASS') {
          console.error(`Golden Domain Failure [${file}]:`, result.errors);
        }
        expect(result.errors).toEqual([]);
        expect(result.verdict).toBe('PASS');

        for (const w of result.warnings) {
          if (w.code === 'D10') {
            totalD10Warnings++;
            const m = w.detail.match(/\[\[(.*?)\]\]/);
            const target = m ? m[1] : w.detail;
            unresolvedWikilinks.set(target, (unresolvedWikilinks.get(target) || 0) + 1);
          }
        }
      });
    }

    it('reports D10 wikilink warning statistics across domains', () => {
      console.log(`\n=== D10 WIKILINK WARNING REPORT ===`);
      console.log(`Total D10 warnings: ${totalD10Warnings}`);
      console.log(`Unresolved wikilink targets:`, Object.fromEntries(unresolvedWikilinks));
      expect(totalD10Warnings).toBeGreaterThan(0);
    });
  });

  describe('Real-World Regression Suite (pre-fix vault files from brain-web)', () => {
    const realBadDir = path.join(root, 'fixtures', 'bad', 'real');

    it('fails pre-fix-researchagent.md with A3, A6, A9', () => {
      const file = path.join(realBadDir, 'pre-fix-researchagent.md');
      const text = fs.readFileSync(file, 'utf-8');
      const result = verify(text, 'agent', ctx);

      console.log(`pre-fix-researchagent.md errors:`, result.errors.map(e => `[${e.code}] line ${e.line}: ${e.detail}`));
      expect(result.verdict).toBe('FAIL');
      expect(result.errors.some(e => e.code === 'A3')).toBe(true);
      expect(result.errors.some(e => e.code === 'A6')).toBe(true);
      expect(result.errors.some(e => e.code === 'A9')).toBe(true);
    });

    it('fails pre-fix-productmanageragent.md with A7 on rules lacking conf', () => {
      const file = path.join(realBadDir, 'pre-fix-productmanageragent.md');
      const text = fs.readFileSync(file, 'utf-8');
      const result = verify(text, 'agent', ctx);

      console.log(`pre-fix-productmanageragent.md errors:`, result.errors.map(e => `[${e.code}] line ${e.line}: ${e.detail}`));
      expect(result.verdict).toBe('FAIL');
      const a7Errors = result.errors.filter(e => e.code === 'A7');
      expect(a7Errors.length).toBe(3); // PM-14, PM-15, PM-16 lacking conf
    });

    it('fails pre-fix-uiuxagent.md with A7 on rules lacking conf', () => {
      const file = path.join(realBadDir, 'pre-fix-uiuxagent.md');
      const text = fs.readFileSync(file, 'utf-8');
      const result = verify(text, 'agent', ctx);

      console.log(`pre-fix-uiuxagent.md errors:`, result.errors.map(e => `[${e.code}] line ${e.line}: ${e.detail}`));
      expect(result.verdict).toBe('FAIL');
      const a7Errors = result.errors.filter(e => e.code === 'A7');
      expect(a7Errors.length).toBe(3); // UX-14, UX-15, UX-16 lacking conf
    });
  });

  describe('G4: Hand-written Candidate Fixtures', () => {
    const fixturesGood = path.join(root, 'fixtures', 'good');
    const fixturesBad = path.join(root, 'fixtures', 'bad');

    it('should PASS good candidate fixture', () => {
      const goodFile = path.join(fixturesGood, 'candidates.md');
      const text = fs.readFileSync(goodFile, 'utf-8');
      const result = verify(text, 'candidate', ctx);
      expect(result.errors).toEqual([]);
      expect(result.verdict).toBe('PASS');
    });

    it('should FAIL candidate-conf-high with C3', () => {
      const badFile = path.join(fixturesBad, 'candidate-conf-high.md');
      const text = fs.readFileSync(badFile, 'utf-8');
      const result = verify(text, 'candidate', ctx);
      expect(result.verdict).toBe('FAIL');
      expect(result.errors.some(e => e.code === 'C3')).toBe(true);
    });

    it('should FAIL candidate-status-active with C1 or C6', () => {
      const badFile = path.join(fixturesBad, 'candidate-status-active.md');
      const text = fs.readFileSync(badFile, 'utf-8');
      const result = verify(text, 'candidate', ctx);
      expect(result.verdict).toBe('FAIL');
      expect(result.errors.some(e => e.code === 'C6' || e.code === 'C1')).toBe(true);
    });

    it('should FAIL candidate-numbering-gap with C5', () => {
      const badFile = path.join(fixturesBad, 'candidate-numbering-gap.md');
      const text = fs.readFileSync(badFile, 'utf-8');
      const result = verify(text, 'candidate', ctx);
      expect(result.verdict).toBe('FAIL');
      expect(result.errors.some(e => e.code === 'C5')).toBe(true);
    });

    it('should FAIL candidate-wrong-anchor with C2', () => {
      const badFile = path.join(fixturesBad, 'candidate-wrong-anchor.md');
      const text = fs.readFileSync(badFile, 'utf-8');
      const result = verify(text, 'candidate', ctx);
      expect(result.verdict).toBe('FAIL');
      expect(result.errors.some(e => e.code === 'C2')).toBe(true);
    });

    it('should FAIL candidate-conf3-no-breaks with C4', () => {
      const badFile = path.join(fixturesBad, 'candidate-conf3-no-breaks.md');
      const text = fs.readFileSync(badFile, 'utf-8');
      const result = verify(text, 'candidate', ctx);
      expect(result.verdict).toBe('FAIL');
      expect(result.errors.some(e => e.code === 'C4')).toBe(true);
    });

    it('should FAIL candidate-bad-id with C1', () => {
      const badFile = path.join(fixturesBad, 'candidate-bad-id.md');
      const text = fs.readFileSync(badFile, 'utf-8');
      const result = verify(text, 'candidate', ctx);
      expect(result.verdict).toBe('FAIL');
      expect(result.errors.some(e => e.code === 'C1')).toBe(true);
    });
  });

  describe('G3: Programmatic Mutation Suite (At least 40 mutations)', () => {
    const sampleAgentText = fs.readFileSync(path.join(root, 'agents', 'productmanageragent.md'), 'utf-8');
    const sampleDomainText = fs.readFileSync(path.join(root, 'brain', '02-domains', 'arbiter.md'), 'utf-8');

    interface MutationCase {
      name: string;
      kind: 'agent' | 'domain' | 'candidate';
      mutate: (base: string) => string;
      expectedCode: string;
    }

    const mutations: MutationCase[] = [
      // Agent mutations A1 - A10
      {
        name: 'A1: add frontmatter to an agent',
        kind: 'agent',
        mutate: base => `---\ntype: agent\n---\n${base}`,
        expectedCode: 'A1'
      },
      {
        name: 'A2: remove em dash from H1',
        kind: 'agent',
        mutate: base => base.replace(' — ', ' - '),
        expectedCode: 'A2'
      },
      {
        name: 'A2: remove H1 completely',
        kind: 'agent',
        mutate: base => base.replace(/^# .+\r?\n/, ''),
        expectedCode: 'A2'
      },
      {
        name: 'A3: delete section 1',
        kind: 'agent',
        mutate: base => base.replace(/## 1\. Identity & Scope[\s\S]*?(?=## 2)/, ''),
        expectedCode: 'A3'
      },
      {
        name: 'A3: delete section 2',
        kind: 'agent',
        mutate: base => base.replace(/## 2\. Read-First[\s\S]*?(?=## 3)/, ''),
        expectedCode: 'A3'
      },
      {
        name: 'A3: delete section 3',
        kind: 'agent',
        mutate: base => base.replace(/## 3\. Hard Restrictions[\s\S]*?(?=## 4)/, ''),
        expectedCode: 'A3'
      },
      {
        name: 'A3: delete section 4',
        kind: 'agent',
        mutate: base => base.replace(/## 4\. Required Checks[\s\S]*?(?=## 5)/, ''),
        expectedCode: 'A3'
      },
      {
        name: 'A3: delete section 5',
        kind: 'agent',
        mutate: base => base.replace(/## 5\. Gate vs Insight Mode[\s\S]*?(?=## 6)/, ''),
        expectedCode: 'A3'
      },
      {
        name: 'A3: delete section 6',
        kind: 'agent',
        mutate: base => base.replace(/## 6\. Handoff[\s\S]*$/, ''),
        expectedCode: 'A3'
      },
      {
        name: 'A3: swap section 1 and 2 order',
        kind: 'agent',
        mutate: base => {
          const s1 = base.match(/## 1\. Identity & Scope[\s\S]*?(?=## 2)/)?.[0] || '';
          const s2 = base.match(/## 2\. Read-First[\s\S]*?(?=## 3)/)?.[0] || '';
          return base.replace(s1 + s2, s2 + s1);
        },
        expectedCode: 'A3'
      },
      {
        name: 'A4: drop Role bullet',
        kind: 'agent',
        mutate: base => base.replace(/- \*\*Role:\*\* .+\r?\n/, ''),
        expectedCode: 'A4'
      },
      {
        name: 'A4: drop Owns bullet',
        kind: 'agent',
        mutate: base => base.replace(/- \*\*Owns:\*\* .+\r?\n/, ''),
        expectedCode: 'A4'
      },
      {
        name: 'A4: drop Does NOT own bullet',
        kind: 'agent',
        mutate: base => base.replace(/- \*\*Does NOT own:\*\* .+\r?\n/, ''),
        expectedCode: 'A4'
      },
      {
        name: 'A5: break bold markers in section 3',
        kind: 'agent',
        mutate: base => base.replace('- **PM-01**', '- *PM-01*'),
        expectedCode: 'A5'
      },
      {
        name: 'A5: bad ID format in section 3',
        kind: 'agent',
        mutate: base => base.replace('- **PM-01**', '- **PM_01**'),
        expectedCode: 'A5'
      },
      {
        name: 'A6: duplicate ID within agent file',
        kind: 'agent',
        mutate: base => base.replace('- **PM-02**', '- **PM-01**'),
        expectedCode: 'A6'
      },
      {
        name: 'A6: mix prefixes in agent file',
        kind: 'agent',
        mutate: base => base.replace('- **PM-02**', '- **UX-01**'),
        expectedCode: 'A6'
      },
      {
        name: 'A7: WHEN without DO in agent rule',
        kind: 'agent',
        mutate: base => base.replace('WHEN defining a new feature or system → DO NOT', 'WHEN defining a new feature or system THEN NOT'),
        expectedCode: 'A7'
      },
      {
        name: 'A7: conf 0 in agent WHEN rule',
        kind: 'agent',
        mutate: base => base.replace('conf: 1', 'conf: 0'),
        expectedCode: 'A7'
      },
      {
        name: 'A7: conf 9 in agent WHEN rule',
        kind: 'agent',
        mutate: base => base.replace('conf: 1', 'conf: 9'),
        expectedCode: 'A7'
      },
      {
        name: 'A7: missing conf on WHEN rule',
        kind: 'agent',
        mutate: base => base.replace(' | conf: 1', ''),
        expectedCode: 'A7'
      },
      {
        name: 'A8: checklist cites nonexistent ID',
        kind: 'agent',
        mutate: base => base.replace('(PM-16)', '(PM-99)'),
        expectedCode: 'A8'
      },
      {
        name: 'A8: checklist line missing any cited ID',
        kind: 'agent',
        mutate: base => base.replace('- [ ] Cognitive Tracking (Knowledge Bars, Radar) and Gap Analysis highlighting < 30% blind spots implemented for personal knowledge systems (PM-16)', '- [ ] Cognitive Tracking without any cited rule ID'),
        expectedCode: 'A8'
      },
      {
        name: 'A9: missing GATE: PASS in section 5',
        kind: 'agent',
        mutate: base => base.replace('GATE: PASS', 'GATE: APPROVED'),
        expectedCode: 'A9'
      },
      {
        name: 'A9: missing GATE: FAIL in section 5',
        kind: 'agent',
        mutate: base => base.replace('GATE: FAIL', 'GATE: REJECT'),
        expectedCode: 'A9'
      },
      {
        name: 'A9: missing INSIGHT in section 5',
        kind: 'agent',
        mutate: base => base.replace('INSIGHT', 'SUGGESTION'),
        expectedCode: 'A9'
      },
      {
        name: 'A10: handoff to missing file',
        kind: 'agent',
        mutate: base => base.replace('`systemsdesignagent.md`', '`nonexistentagent.md`'),
        expectedCode: 'A10'
      },

      // Domain mutations D1 - D9
      {
        name: 'D1: missing frontmatter in domain',
        kind: 'domain',
        mutate: base => base.replace(/^---[\s\S]*?---\r?\n/, ''),
        expectedCode: 'D1'
      },
      {
        name: 'D1: frontmatter missing prefix',
        kind: 'domain',
        mutate: base => base.replace(/prefix:\s*ARB\r?\n/, ''),
        expectedCode: 'D1'
      },
      {
        name: 'D1: frontmatter missing domain',
        kind: 'domain',
        mutate: base => base.replace(/domain:\s*arbiter\r?\n/, ''),
        expectedCode: 'D1'
      },
      {
        name: 'D1: frontmatter missing version',
        kind: 'domain',
        mutate: base => base.replace(/version:\s*1\r?\n/, ''),
        expectedCode: 'D1'
      },
      {
        name: 'D1: frontmatter missing status',
        kind: 'domain',
        mutate: base => base.replace(/status:\s*active\r?\n/, ''),
        expectedCode: 'D1'
      },
      {
        name: 'D2: rule line missing arrow',
        kind: 'domain',
        mutate: base => base.replace('→ DO', 'DO'),
        expectedCode: 'D2'
      },
      {
        name: 'D2: broken bold markers on domain rule (- *ARB-01*)',
        kind: 'domain',
        mutate: base => base.replace('- **ARB-01**', '- *ARB-01*'),
        expectedCode: 'D2'
      },
      {
        name: 'D2: single digit rule ID (- **ARB-1**)',
        kind: 'domain',
        mutate: base => base.replace('- **ARB-01**', '- **ARB-1**'),
        expectedCode: 'D2'
      },
      {
        name: 'D2: swap why and breaks order',
        kind: 'domain',
        mutate: base => base.replace('| why: Cryptographic protocol soundness does not guarantee market liquidity, token solvency, or legal compliance | breaks: strictly single-domain queries confined to pure cryptographic math or pure accounting', '| breaks: strictly single-domain queries confined to pure cryptographic math or pure accounting | why: Cryptographic protocol soundness does not guarantee market liquidity, token solvency, or legal compliance'),
        expectedCode: 'D2'
      },
      {
        name: 'D2: missing tags in rule line',
        kind: 'domain',
        mutate: base => base.replace('#arbiter #separation ', ''),
        expectedCode: 'D2'
      },
      {
        name: 'D2: remove ^anchor from rule line',
        kind: 'domain',
        mutate: base => base.replace('^arb-01', ''),
        expectedCode: 'D2'
      },
      {
        name: 'D3: wrong anchor in domain rule',
        kind: 'domain',
        mutate: base => base.replace('^arb-01', '^arb-99'),
        expectedCode: 'D3'
      },
      {
        name: 'D4: rule prefix does not match frontmatter prefix',
        kind: 'domain',
        mutate: base => base.replace('- **ARB-01**', '- **SEC-01**').replace('^arb-01', '^sec-01'),
        expectedCode: 'D4'
      },
      {
        name: 'D5: bad status in domain rule',
        kind: 'domain',
        mutate: base => base.replace('| status: active', '| status: pending'),
        expectedCode: 'D5'
      },
      {
        name: 'D6: active rule with conf 2',
        kind: 'domain',
        mutate: base => base.replace('| conf: 5 | ev: [[OPERATING-PRINCIPLES]] [[HEURISTICS]] | status: active', '| conf: 2 | ev: [[OPERATING-PRINCIPLES]] [[HEURISTICS]] | status: active'),
        expectedCode: 'D6'
      },
      {
        name: 'D6: active rule with empty breaks',
        kind: 'domain',
        mutate: base => base.replace('| breaks: strictly single-domain queries confined to pure cryptographic math or pure accounting |', '| breaks: |'),
        expectedCode: 'D6'
      },
      {
        name: 'D6: active rule with empty ev',
        kind: 'domain',
        mutate: base => base.replace('| ev: [[OPERATING-PRINCIPLES]] [[HEURISTICS]] |', '| ev: |'),
        expectedCode: 'D6'
      },
      {
        name: 'D7: duplicate ID across vault',
        kind: 'domain',
        mutate: base => base.replace('- **ARB-02**', '- **ARB-01**').replace('^arb-02', '^arb-01'),
        expectedCode: 'D7'
      },
      {
        name: 'D8: agent prefix used in domain file frontmatter',
        kind: 'domain',
        mutate: base => base.replace('prefix: ARB', 'prefix: SEC'),
        expectedCode: 'D8'
      },
      {
        name: 'D9: wrong rule count in status header',
        kind: 'domain',
        mutate: base => base.replace('> Status: `active` (8 rules).', '> Status: `active` (99 rules).'),
        expectedCode: 'D9'
      },

      // Cross-reference mutations
      {
        name: 'UNRESOLVED_REF: cite nonexistent ID in body',
        kind: 'agent',
        mutate: base => base.replace('(SD-03)', '(SD-99)'),
        expectedCode: 'UNRESOLVED_REF'
      },
      {
        name: 'UNRESOLVED_REF: bad range with missing end in body',
        kind: 'agent',
        mutate: base => base.replace('DB-02/03', 'DB-02..DB-99'),
        expectedCode: 'UNRESOLVED_REF'
      },

      // Candidate mutations
      {
        name: 'C1: candidate status not candidate',
        kind: 'candidate',
        mutate: () => '- **CAND-01** WHEN trigger → DO action | why: why | breaks: breaks | conf: 2 | ev: ev | status: draft #tag ^cand-01',
        expectedCode: 'C1'
      },
      {
        name: 'C1: candidate broken bold (- *CAND-01*)',
        kind: 'candidate',
        mutate: () => '- *CAND-01* WHEN trigger → DO action | why: why | breaks: breaks | conf: 2 | ev: ev | status: candidate #tag ^cand-01',
        expectedCode: 'C1'
      },
      {
        name: 'C2: candidate wrong anchor',
        kind: 'candidate',
        mutate: () => '- **CAND-01** WHEN trigger → DO action | why: why | breaks: breaks | conf: 2 | ev: ev | status: candidate #tag ^wrong-anchor',
        expectedCode: 'C2'
      },
      {
        name: 'C3: candidate conf 4',
        kind: 'candidate',
        mutate: () => '- **CAND-01** WHEN trigger → DO action | why: why | breaks: breaks | conf: 4 | ev: ev | status: candidate #tag ^cand-01',
        expectedCode: 'C3'
      },
      {
        name: 'C4: candidate conf 3 with empty breaks',
        kind: 'candidate',
        mutate: () => '- **CAND-01** WHEN trigger → DO action | why: why | breaks: | conf: 3 | ev: ev | status: candidate #tag ^cand-01',
        expectedCode: 'C4'
      },
      {
        name: 'C5: candidate gap in numbering',
        kind: 'candidate',
        mutate: () => '- **CAND-01** WHEN trigger A → DO action A | why: why | breaks: brk | conf: 2 | ev: ev | status: candidate #t1 ^cand-01\n- **CAND-03** WHEN trigger B → DO action B | why: why | breaks: brk | conf: 2 | ev: ev | status: candidate #t2 ^cand-03',
        expectedCode: 'C5'
      },
      {
        name: 'C6: candidate with status active',
        kind: 'candidate',
        mutate: () => '- **CAND-01** WHEN trigger → DO action | why: why | breaks: breaks | conf: 2 | ev: ev | status: active #tag ^cand-01',
        expectedCode: 'C6'
      }
    ];

    it(`should have at least 40 mutations (found ${mutations.length})`, () => {
      expect(mutations.length).toBeGreaterThanOrEqual(40);
    });

    let killedCount = 0;
    const surviving: string[] = [];

    for (const m of mutations) {
      it(`Mutation [${m.expectedCode}] - ${m.name}`, () => {
        const base = m.kind === 'domain' ? sampleDomainText : sampleAgentText;
        const mutatedText = m.mutate(base);
        const result = verify(mutatedText, m.kind, ctx);

        const hasExpectedCode = result.errors.some(e => e.code === m.expectedCode);
        if (result.verdict === 'FAIL' && hasExpectedCode) {
          killedCount++;
        } else {
          surviving.push(`${m.name}: expected ${m.expectedCode}, got [${result.errors.map(e => e.code).join(', ')}] (verdict: ${result.verdict})`);
        }

        expect(result.verdict).toBe('FAIL');
        expect(result.errors.some(e => e.code === m.expectedCode)).toBe(true);
      });
    }

    it('reports mutation kill statistics', () => {
      const total = mutations.length;
      const killRate = (killedCount / total) * 100;
      console.log(`\n=== MUTATION TEST REPORT ===`);
      console.log(`Total Mutations: ${total}`);
      console.log(`Killed Mutations: ${killedCount}`);
      console.log(`Kill Rate: ${killRate.toFixed(1)}%`);
      if (surviving.length > 0) {
        console.error(`Surviving Mutations (${surviving.length}):\n` + surviving.join('\n'));
      }
      expect(killedCount).toBe(total);
    });
  });
});
