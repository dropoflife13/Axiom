// scripts/v4/reflexion-capture.ts
// Fast Clock + Quarantine Stager for the Antigravity `axiom-self-reflexion` skill.
// Zero LLM calls: appends resolved build/test/lint failure traces to
// `.axiom-state/v4/reflexion-traces.jsonl` and auto-stages recurring signatures
// (`count >= 2` or `--force-stage`) into `.axiom-state/v4/reflexion-quarantine.json`.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeCanonicalJsonSha256 } from '../../src/v4/hope/index.js';
import { extractRequiredTokens } from '../../src/v4/lexical-token-extractor.js';

export interface ReflexionTraceRecord {
  readonly traceId: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly command: string;
  readonly fix: string;
  readonly rule: string;
  readonly rootCause?: string;
  readonly requiredTokens: readonly string[];
  readonly traceSha256: string;
}

export type ReflexionCandidateStatus = 'staged' | 'approved' | 'rejected';

export interface ReflexionQuarantineCandidate {
  readonly candidateId: string;
  readonly signature: string;
  readonly command: string;
  readonly fix: string;
  readonly proposedRuleText: string;
  readonly requiredTokens: readonly string[];
  readonly observedCount: number;
  readonly evidenceHashes: readonly string[];
  readonly status: ReflexionCandidateStatus;
  readonly rejectionReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReflexionQuarantineFile {
  readonly schemaVersion: '4.0.0-reflexion-quarantine';
  readonly minOccurrences: number;
  readonly candidates: readonly ReflexionQuarantineCandidate[];
}

export interface CaptureReflexionInput {
  readonly signature: string;
  readonly command: string;
  readonly fix: string;
  readonly rule: string;
  readonly rootCause?: string;
  readonly forceStage?: boolean;
  readonly rootDir?: string;
  readonly timestamp?: string;
  readonly minOccurrences?: number;
}

export interface CaptureReflexionResult {
  readonly trace: ReflexionTraceRecord;
  readonly signatureCount: number;
  readonly staged: boolean;
  readonly candidate?: ReflexionQuarantineCandidate;
  readonly tracesPath: string;
  readonly quarantinePath: string;
}

export function normalizeSignature(sig: string): string {
  return sig.trim().replace(/\s+/g, ' ');
}

export function slugifySignature(sig: string): string {
  const slug = sig
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'rule';
}

export function getReflexionPaths(rootDir = process.cwd()): {
  readonly tracesPath: string;
  readonly quarantinePath: string;
  readonly receiptsPath: string;
  readonly learnedRulesPath: string;
} {
  const resolved = path.resolve(rootDir);
  return {
    tracesPath: path.join(resolved, '.axiom-state', 'v4', 'reflexion-traces.jsonl'),
    quarantinePath: path.join(resolved, '.axiom-state', 'v4', 'reflexion-quarantine.json'),
    receiptsPath: path.join(resolved, '.axiom-state', 'v4', 'reflexion-receipts.jsonl'),
    learnedRulesPath: path.join(
      resolved,
      '.agents',
      'skills',
      'axiom-self-reflexion',
      'LEARNED_RULES.md'
    ),
  };
}

export function readReflexionTraces(tracesPath: string): ReflexionTraceRecord[] {
  if (!fs.existsSync(tracesPath)) return [];
  const raw = fs.readFileSync(tracesPath, 'utf8');
  const records: ReflexionTraceRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    records.push(JSON.parse(trimmed) as ReflexionTraceRecord);
  }
  return records;
}

export function readReflexionQuarantine(
  quarantinePath: string,
  minOccurrences = 2
): ReflexionQuarantineFile {
  if (!fs.existsSync(quarantinePath)) {
    return {
      schemaVersion: '4.0.0-reflexion-quarantine',
      minOccurrences,
      candidates: [],
    };
  }
  return JSON.parse(fs.readFileSync(quarantinePath, 'utf8')) as ReflexionQuarantineFile;
}

export function writeReflexionQuarantine(
  quarantinePath: string,
  data: ReflexionQuarantineFile
): void {
  fs.mkdirSync(path.dirname(quarantinePath), { recursive: true });
  fs.writeFileSync(quarantinePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function captureReflexionTrace(input: CaptureReflexionInput): CaptureReflexionResult {
  const signature = normalizeSignature(input.signature);
  const command = input.command.trim();
  const fix = input.fix.trim();
  const rule = input.rule.trim();
  if (!signature) throw new Error('Missing required --signature.');
  if (!command) throw new Error('Missing required --command.');
  if (!fix) throw new Error('Missing required --fix.');
  if (!rule) throw new Error('Missing required --rule.');

  const rootDir = input.rootDir ?? process.cwd();
  const timestamp = input.timestamp ?? new Date().toISOString();
  const minOccurrences = input.minOccurrences ?? 2;
  const { tracesPath, quarantinePath } = getReflexionPaths(rootDir);

  fs.mkdirSync(path.dirname(tracesPath), { recursive: true });

  const requiredTokens = extractRequiredTokens(rule);
  const traceSha256 = computeCanonicalJsonSha256({
    signature,
    command,
    fix,
    rule,
    timestamp,
  });
  const trace: ReflexionTraceRecord = {
    traceId: `RT-${traceSha256.slice(0, 12)}`,
    timestamp,
    signature,
    command,
    fix,
    rule,
    ...(input.rootCause ? { rootCause: input.rootCause.trim() } : {}),
    requiredTokens,
    traceSha256,
  };

  fs.appendFileSync(tracesPath, `${JSON.stringify(trace)}\n`, 'utf8');

  const allTraces = readReflexionTraces(tracesPath);
  const matchingTraces = allTraces.filter(
    (t) => normalizeSignature(t.signature).toLowerCase() === signature.toLowerCase()
  );
  const signatureCount = matchingTraces.length;
  const shouldStage = signatureCount >= minOccurrences || Boolean(input.forceStage);

  let stagedCandidate: ReflexionQuarantineCandidate | undefined;
  if (shouldStage) {
    const quarantine = readReflexionQuarantine(quarantinePath, minOccurrences);
    const candidateId = `Q-REFL-${slugifySignature(signature).toUpperCase()}`;
    const evidenceHashes = Array.from(new Set(matchingTraces.map((t) => t.traceSha256)));

    const existingIdx = quarantine.candidates.findIndex(
      (c) =>
        c.candidateId === candidateId ||
        normalizeSignature(c.signature).toLowerCase() === signature.toLowerCase()
    );

    const existing = existingIdx >= 0 ? quarantine.candidates[existingIdx] : undefined;
    stagedCandidate = {
      candidateId: existing?.candidateId ?? candidateId,
      signature,
      command,
      fix,
      proposedRuleText: rule,
      requiredTokens,
      observedCount: signatureCount,
      evidenceHashes,
      status: existing?.status === 'approved' ? 'approved' : 'staged',
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    const nextCandidates = [...quarantine.candidates];
    if (existingIdx >= 0) {
      nextCandidates[existingIdx] = stagedCandidate;
    } else {
      nextCandidates.push(stagedCandidate);
    }

    writeReflexionQuarantine(quarantinePath, {
      schemaVersion: '4.0.0-reflexion-quarantine',
      minOccurrences,
      candidates: nextCandidates,
    });
  }

  return {
    trace,
    signatureCount,
    staged: shouldStage && stagedCandidate?.status === 'staged',
    candidate: stagedCandidate,
    tracesPath,
    quarantinePath,
  };
}

export function parseReflexionCaptureArgs(argv: readonly string[]): CaptureReflexionInput {
  const readFlag = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx < 0 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };

  const signature = readFlag('--signature');
  const command = readFlag('--command');
  const fix = readFlag('--fix');
  const rule = readFlag('--rule');
  const rootCause = readFlag('--root-cause');
  const forceStage =
    argv.includes('--force-stage') || argv.includes('--promote-candidate');

  if (!signature || !command || !fix || !rule) {
    throw new Error(
      'Usage: npx tsx scripts/v4/reflexion-capture.ts --signature <sig> --command <cmd> --fix <fix> --rule <rule> [--root-cause <text>] [--force-stage]'
    );
  }

  return {
    signature,
    command,
    fix,
    rule,
    ...(rootCause ? { rootCause } : {}),
    forceStage,
  };
}

function main(): void {
  const input = parseReflexionCaptureArgs(process.argv.slice(2));
  const result = captureReflexionTrace(input);
  console.log(
    `[reflexion-capture] Logged ${result.trace.traceId} (signature="${result.trace.signature}", count=${result.signatureCount}, tokens=${result.trace.requiredTokens.length})`
  );
  if (result.staged && result.candidate) {
    console.log(
      `[reflexion-capture] Staged candidate ${result.candidate.candidateId} in ${path.relative(process.cwd(), result.quarantinePath).replace(/\\/g, '/')}`
    );
  } else {
    console.log(
      `[reflexion-capture] Trace recorded (${result.signatureCount}/2 toward automatic quarantine staging).`
    );
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  main();
}
