// src/promote.ts - Candidate Axiom Harvester & Promotion Gate
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyAgentMarkdown } from './verifier/agent-verifier.js';
import { buildVaultIndex } from './verifier/vault-index.js';
import { LineProvenance } from './fixer.js';

export interface StagedAxiomCandidate {
  id: string;                        // e.g., "DAL-01"
  sourceAgent: string;               // e.g., "db-audit-ledger.md"
  rawRule: string;                   // Original verified rule line
  llmConfidence: number | null;      // Original conf emitted by Executor (1-5), null if Tier 0 touched line
  llmConf: number | null;            // Explicit alias: null for any line Tier 0 touched
  enforcedConf: number;              // Clamped to <= 2 while in candidate quarantine
  status: 'candidate' | 'promoted' | 'rejected';
  sha256: string;                    // Cryptographic anchor receipt (ev)
  extractedAt: string;
  tier0Provenance?: LineProvenance[];
}

export interface HarvestResult {
  harvested: number;
  skipped: number;
  candidates: StagedAxiomCandidate[];
}

export interface HarvestOptions {
  repoRoot?: string;
  enforceUniquePrefixes?: boolean;
  provenanceByFile?: Record<string, LineProvenance[]>;
}

/**
 * Enforces that harvester writes strictly under .axiom-state\ or out\ and never under brain\.
 */
export function assertHarvesterWritePathAllowed(
  targetPath: string,
  repoRoot: string = process.cwd()
): void {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedTarget = path.resolve(targetPath);

  const brainDir = path.join(resolvedRoot, 'brain');
  const allowedAxiomStateDir = path.join(resolvedRoot, '.axiom-state');
  const allowedOutDir = path.join(resolvedRoot, 'out');

  const isInsideDir = (child: string, parent: string) => {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };

  if (
    isInsideDir(resolvedTarget, brainDir) ||
    resolvedTarget.split(path.sep).includes('brain')
  ) {
    throw new Error(
      `[HARVESTER_PATH_VIOLATION] Harvester must never write under brain\\: ${resolvedTarget}`
    );
  }

  if (
    !isInsideDir(resolvedTarget, allowedAxiomStateDir) &&
    !isInsideDir(resolvedTarget, allowedOutDir)
  ) {
    throw new Error(
      `[HARVESTER_PATH_VIOLATION] Harvester may only write under .axiom-state\\ or out\\: ${resolvedTarget}`
    );
  }
}

function loadFileProvenance(
  stagingDir: string,
  file: string,
  options?: HarvestOptions
): LineProvenance[] {
  if (options?.provenanceByFile?.[file]) {
    return options.provenanceByFile[file];
  }
  const sidecarPath = path.join(stagingDir, `${file}.provenance.json`);
  if (fs.existsSync(sidecarPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.provenance)) return parsed.provenance;
      if (Array.isArray(parsed?.tier0Provenance)) return parsed.tier0Provenance;
    } catch {
      // Ignore malformed sidecar
    }
  }
  return [];
}

/**
 * Parses verified agent markdown files from canary staging directory,
 * enforces quarantine confidence caps (conf <= 2), checks for vault collisions,
 * carries per-line Tier 0 provenance (setting llmConf/llmConfidence to null if Tier 0 touched the line),
 * and records staged candidates into candidate-registry.json.
 */
export function harvestCanaryOutputs(
  stagingDir = path.join(process.cwd(), '.axiom-state', 'canary-outputs'),
  registryPath = path.join(process.cwd(), '.axiom-state', 'candidate-registry.json'),
  options?: HarvestOptions
): HarvestResult {
  const root = path.resolve(options?.repoRoot ?? '.');
  assertHarvesterWritePathAllowed(registryPath, root);

  if (!fs.existsSync(stagingDir)) {
    return { harvested: 0, skipped: 0, candidates: [] };
  }

  const vaultIndex = buildVaultIndex(root);
  const ctx = { vaultIndex, repoRoot: root };

  const files = fs.readdirSync(stagingDir).filter((f) => f.endsWith('.md'));
  const existing: StagedAxiomCandidate[] = fs.existsSync(registryPath)
    ? JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
    : [];

  let harvested = 0;
  let skipped = 0;

  // Rule line pattern: - **PREFIX-01** Title: WHEN ... → DO ... | conf: N
  const ruleLineRegex = /^-\s+\*\*([A-Z]{1,5}-\d{2,3})\*\*(?::)?\s+(.+?)\|\s*conf:\s*([1-5])\s*$/;

  for (const file of files) {
    const fullPath = path.join(stagingDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const fileProvenance = loadFileProvenance(stagingDir, file, options);

    // Gate 1: Must pass full deterministic verification before harvesting
    const verdict = verifyAgentMarkdown(content, ctx);
    if (verdict.verdict !== 'PASS') {
      skipped++;
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const rawLine = lines[lineIdx];
      const lineNumber = lineIdx + 1;
      const trimmed = rawLine.trim();
      const match = trimmed.match(ruleLineRegex);
      if (!match) continue;

      const [, ruleId, , confStr] = match;
      const parsedConf = parseInt(confStr, 10);
      const sha256 = crypto.createHash('sha256').update(trimmed).digest('hex').slice(0, 12);

      // Gate 2: Check for collisions with canonical vault index
      if (vaultIndex.has(ruleId)) {
        console.warn(`[HARVEST_COLLISION] Rule ID ${ruleId} already exists in canonical vault. Skipping.`);
        skipped++;
        continue;
      }

      // Check if candidate with identical ID and content hash is already registered
      if (existing.some((c) => c.id === ruleId && c.sha256 === sha256)) {
        skipped++;
        continue;
      }

      // Check if Tier 0 touched this line
      const touchedProvenance = fileProvenance.filter(
        (p) =>
          p.line === lineNumber ||
          (p.ruleId && p.ruleId === ruleId) ||
          (p.after && p.after.trim() === trimmed)
      );
      const touchedByTier0 = touchedProvenance.length > 0;
      const effectiveLlmConf = touchedByTier0 ? null : parsedConf;

      const candidate: StagedAxiomCandidate = {
        id: ruleId,
        sourceAgent: file,
        rawRule: trimmed,
        llmConfidence: effectiveLlmConf,
        llmConf: effectiveLlmConf,
        enforcedConf: Math.min(parsedConf, 2), // Quarantine cap: conf <= 2
        status: 'candidate',
        sha256,
        extractedAt: new Date().toISOString(),
        ...(touchedByTier0 ? { tier0Provenance: touchedProvenance } : {}),
      };

      // If candidate already exists with same ID but different sha, update it
      const existingIdx = existing.findIndex((c) => c.id === ruleId);
      if (existingIdx >= 0) {
        existing[existingIdx] = candidate;
      } else {
        existing.push(candidate);
      }
      harvested++;
    }
  }

  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(existing, null, 2), 'utf-8');
  return { harvested, skipped, candidates: existing };
}

/**
 * Promotes a candidate axiom to active status, elevating confidence.
 */
export function promoteCandidate(
  ruleId: string,
  options?: {
    registryPath?: string;
    targetConfidence?: number;
    repoRoot?: string;
  }
): { success: boolean; candidate?: StagedAxiomCandidate; reason?: string } {
  const registryPath =
    options?.registryPath ?? path.join(process.cwd(), '.axiom-state', 'candidate-registry.json');

  assertHarvesterWritePathAllowed(registryPath, options?.repoRoot ?? process.cwd());

  if (!fs.existsSync(registryPath)) {
    return { success: false, reason: 'Candidate registry does not exist' };
  }

  const registry: StagedAxiomCandidate[] = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  const candidate = registry.find((c) => c.id === ruleId);

  if (!candidate) {
    return { success: false, reason: `Candidate ${ruleId} not found in registry` };
  }

  candidate.status = 'promoted';
  candidate.enforcedConf = options?.targetConfidence ?? Math.max(candidate.llmConfidence ?? 2, 3);

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  return { success: true, candidate };
}

/**
 * Rejects a candidate axiom.
 */
export function rejectCandidate(
  ruleId: string,
  options?: {
    registryPath?: string;
    reason?: string;
    repoRoot?: string;
  }
): { success: boolean; candidate?: StagedAxiomCandidate; reason?: string } {
  const registryPath =
    options?.registryPath ?? path.join(process.cwd(), '.axiom-state', 'candidate-registry.json');

  assertHarvesterWritePathAllowed(registryPath, options?.repoRoot ?? process.cwd());

  if (!fs.existsSync(registryPath)) {
    return { success: false, reason: 'Candidate registry does not exist' };
  }

  const registry: StagedAxiomCandidate[] = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  const candidate = registry.find((c) => c.id === ruleId);

  if (!candidate) {
    return { success: false, reason: `Candidate ${ruleId} not found in registry` };
  }

  candidate.status = 'rejected';
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  return { success: true, candidate };
}
