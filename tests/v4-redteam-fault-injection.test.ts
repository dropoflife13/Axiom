import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRedTeamFaultInjectionManifest,
  isRedTeamFaultInjectionEnabled,
  REDTEAM_CANARY_ROUTE,
} from '../src/v4/redteam/fault-injection.js';
import { registerFaultInjectionManifest } from '../scripts/v4/run-redteam-live-verdicts.js';

describe('Red-Team fault-injection manifest', () => {
  it('is disabled unless explicitly env-gated and emits staged SHA-256 candidates', () => {
    expect(isRedTeamFaultInjectionEnabled({})).toBe(false);
    expect(isRedTeamFaultInjectionEnabled({ AXIOM_REDTEAM_FAULT_INJECT: '1' })).toBe(true);

    const manifest = buildRedTeamFaultInjectionManifest('2026-11-26T00:00:00.000Z');
    expect(manifest.threats.map((threat) => threat.id)).toEqual(['RT-07', 'RT-08']);
    expect(manifest.candidates.map((candidate) => candidate.status)).toEqual(['staged', 'staged']);
    expect(manifest.candidates.every((candidate) => candidate.route === REDTEAM_CANARY_ROUTE)).toBe(true);
    expect(manifest.candidates.every((candidate) => /^[a-f0-9]{64}$/.test(candidate.evidenceHashes[0]))).toBe(true);
  });

  it('appends RT-07 and unexecuted RT-08 idempotently to local telemetry only', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-redteam-fault-'));
    try {
      fs.writeFileSync(
        path.join(stateDir, 'quarantine-candidates.json'),
        JSON.stringify({ candidates: [{ factId: 'RT-01' }] })
      );
      fs.writeFileSync(
        path.join(stateDir, 'threat-matrix.json'),
        JSON.stringify({ threats: [{ id: 'RT-01' }] })
      );

      registerFaultInjectionManifest(stateDir, '2026-11-26T00:00:00.000Z');
      registerFaultInjectionManifest(stateDir, '2026-11-26T00:00:00.000Z');

      const candidates = JSON.parse(
        fs.readFileSync(path.join(stateDir, 'quarantine-candidates.json'), 'utf8')
      ).candidates as Array<{ factId: string; status?: string }>;
      const threats = JSON.parse(fs.readFileSync(path.join(stateDir, 'threat-matrix.json'), 'utf8'))
        .threats as Array<{ id: string }>;
      expect(candidates.map((candidate) => candidate.factId)).toEqual(['RT-01', 'RT-07', 'RT-08']);
      expect(candidates.slice(1).every((candidate) => candidate.status === 'staged')).toBe(true);
      expect(threats.map((threat) => threat.id)).toEqual(['RT-01', 'RT-07', 'RT-08']);
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
