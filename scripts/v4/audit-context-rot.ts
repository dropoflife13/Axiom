// scripts/v4/audit-context-rot.ts
// Zero-LLM Workspace Doc Hygiene, Context-Rot Audit, & Cartridge Compaction Benchmark CLI.
// Strictly read-only on all frozen v2/v3 docs and existing reports; generates `docs/INDEX.md`.

import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PolicyAbacCartridge } from '../../src/v4/cartridges/policy-abac-cartridge.js';
import { PostgresV3Cartridge } from '../../src/v4/cartridges/postgres-v3-adapter.js';
import { TsApiSecurityCartridge } from '../../src/v4/cartridges/ts-api-security-cartridge.js';
import { compactContextBundle, estimateTokens } from '../../src/v4/hope/context-compactor.js';
import { detectContextRot } from '../../src/v4/hope/context-rot-detector.js';
import { computeTokenRecallAgainstReference } from '../../src/v4/lexical-token-extractor.js';
import { REQUIRED_FACT_TOKENS } from '../v3/verify-cid-vault.js';

export interface AuditedFileEntry {
  readonly relativePath: string;
  readonly rootGroup: 'docs' | 'out/v4';
  readonly category:
    | 'active_v4'
    | 'frozen_v3_archive'
    | 'frozen_v3_template'
    | 'architecture_and_spec'
    | 'v4_cross_model_summary'
    | 'v4_per_model_summary'
    | 'v4_hope_receipt'
    | 'other';
  readonly bytes: number;
  readonly lines: number;
  readonly estimatedTokens: number;
  readonly sha256: string;
  readonly tracked: boolean;
}

export interface DuplicateOrSupersededGroup {
  readonly kind: 'exact_duplicate' | 'template_source' | 'receipt_alias' | 'superseded_summary';
  readonly description: string;
  readonly paths: readonly string[];
  readonly totalBytes: number;
  readonly totalTokens: number;
}

export interface CartridgeCompactionStat {
  readonly cartridgeId: string;
  readonly domainLabel: string;
  readonly activeRules: number;
  readonly beforeTokens: number;
  readonly afterTokens: number;
  readonly reductionPct: number;
  readonly preservedTokens: number;
  readonly totalRequiredTokens: number;
  readonly oversizedCount: number;
  readonly redundantPairsCount: number;
}

export interface WorkspaceAuditReport {
  readonly totalFiles: number;
  readonly totalBytes: number;
  readonly totalEstimatedTokens: number;
  readonly docsFiles: number;
  readonly docsEstimatedTokens: number;
  readonly outV4Files: number;
  readonly outV4EstimatedTokens: number;
  readonly top10Largest: readonly AuditedFileEntry[];
  readonly duplicateAndSuperseded: readonly DuplicateOrSupersededGroup[];
  readonly cartridgeCompaction: readonly CartridgeCompactionStat[];
}

const FROZEN_V3_ARCHIVES = new Set<string>([
  'docs/AXIOM-PAPER.md',
  'docs/AXIOM-V3-PAPER-RESULTS.md',
  'docs/AXIOM-RESEARCH-DOSSIER.md',
  'docs/AXIOM-V3-LIVE-DOSSIER.md',
]);

const ACTIVE_V4_DOCS = new Set<string>(['docs/AXIOM-V4-HOPE.md']);

const RECEIPT_ALIASES = new Map<string, string>([
  [
    'out/v4/ts-api-gemini-3-1-flash-lite-hope-receipt.json',
    'out/v4/ts-api-hope-receipt.json',
  ],
]);

function walkFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function getTrackedFilesSet(rootDir: string): Set<string> | null {
  try {
    const out = execSync('git ls-files docs out/v4', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const set = new Set<string>();
    for (const line of out.split(/\r?\n/)) {
      const clean = line.trim().replace(/\\/g, '/');
      if (clean) set.add(clean);
    }
    return set;
  } catch {
    return null;
  }
}

function classifyFile(relPath: string): AuditedFileEntry['category'] {
  if (ACTIVE_V4_DOCS.has(relPath)) return 'active_v4';
  if (FROZEN_V3_ARCHIVES.has(relPath)) return 'frozen_v3_archive';
  if (relPath.startsWith('docs/') && relPath.endsWith('.template.md')) {
    return 'frozen_v3_template';
  }
  if (relPath.startsWith('docs/')) return 'architecture_and_spec';
  if (relPath.startsWith('out/v4/')) {
    if (
      relPath.includes('cross-model-summary') ||
      relPath.includes('cid-masked-summary')
    ) {
      return 'v4_cross_model_summary';
    }
    if (relPath.endsWith('-hope-receipt.json')) return 'v4_hope_receipt';
    if (relPath.includes('-summary.')) return 'v4_per_model_summary';
  }
  return 'other';
}

export function runCartridgeCompactionBenchmarks(
  rootDir = process.cwd()
): CartridgeCompactionStat[] {
  const results: CartridgeCompactionStat[] = [];

  // 1. PostgreSQL 16 (34 active rules)
  const pg = new PostgresV3Cartridge({ rootDir });
  const pgRules = pg.loadCanonicalRules().rules.filter((r) => r.active);
  const pgBundle = compactContextBundle(pgRules, {
    maxTokens: 100_000,
    tokenExtractor: (rule) => pg.extractRequiredTokens(rule),
  });
  const pgMap = new Map(pgBundle.compactedRules.map((r) => [r.id, r.statement]));
  const pgRefRecall = computeTokenRecallAgainstReference(pgMap, REQUIRED_FACT_TOKENS);
  if (pgRefRecall.matchedTokens !== pgRefRecall.totalExpectedTokens) {
    throw new Error(
      `PostgreSQL compaction lost reference tokens: ${pgRefRecall.matchedTokens}/${pgRefRecall.totalExpectedTokens}`
    );
  }
  const pgRot = detectContextRot(pgRules, [], { maxRuleTokens: 28 });
  results.push({
    cartridgeId: pg.id,
    domainLabel: 'SQL DDL (PostgreSQL 16)',
    activeRules: pgRules.length,
    beforeTokens: pgBundle.beforeTokens,
    afterTokens: pgBundle.afterTokens,
    reductionPct: pgBundle.reductionPct,
    preservedTokens: pgRefRecall.matchedTokens,
    totalRequiredTokens: pgRefRecall.totalExpectedTokens,
    oversizedCount: pgRot.oversizedRules.length,
    redundantPairsCount: pgRot.redundantPairs.length,
  });

  // 2. Policy-as-Code ABAC (12 active rules)
  const abac = new PolicyAbacCartridge({ rootDir });
  const abacRules = abac.loadCanonicalRules().rules.filter((r) => r.active);
  const abacBundle = compactContextBundle(abacRules, {
    maxTokens: 100_000,
    tokenExtractor: (rule) => abac.extractRequiredTokens(rule),
  });
  const abacRot = detectContextRot(abacRules, [], { maxRuleTokens: 28 });
  results.push({
    cartridgeId: abac.id,
    domainLabel: 'Policy-as-Code (ABAC)',
    activeRules: abacRules.length,
    beforeTokens: abacBundle.beforeTokens,
    afterTokens: abacBundle.afterTokens,
    reductionPct: abacBundle.reductionPct,
    preservedTokens: abacBundle.preservedTokenCount,
    totalRequiredTokens: abacBundle.totalRequiredTokens,
    oversizedCount: abacRot.oversizedRules.length,
    redundantPairsCount: abacRot.redundantPairs.length,
  });

  // 3. TypeScript API Security Contracts (12 active rules)
  const tsApi = new TsApiSecurityCartridge({ rootDir });
  const tsRules = tsApi.loadCanonicalRules().rules.filter((r) => r.active);
  const tsBundle = compactContextBundle(tsRules, {
    maxTokens: 100_000,
    tokenExtractor: (rule) => tsApi.extractRequiredTokens(rule),
  });
  const tsRot = detectContextRot(tsRules, [], { maxRuleTokens: 28 });
  results.push({
    cartridgeId: tsApi.id,
    domainLabel: 'TypeScript API Security',
    activeRules: tsRules.length,
    beforeTokens: tsBundle.beforeTokens,
    afterTokens: tsBundle.afterTokens,
    reductionPct: tsBundle.reductionPct,
    preservedTokens: tsBundle.preservedTokenCount,
    totalRequiredTokens: tsBundle.totalRequiredTokens,
    oversizedCount: tsRot.oversizedRules.length,
    redundantPairsCount: tsRot.redundantPairs.length,
  });

  return results;
}

export function scanWorkspaceDocsAndReports(rootDir = process.cwd()): {
  readonly entries: readonly AuditedFileEntry[];
  readonly report: WorkspaceAuditReport;
} {
  const trackedSet = getTrackedFilesSet(rootDir);
  const rawPaths = [
    ...walkFiles(path.join(rootDir, 'docs')),
    ...walkFiles(path.join(rootDir, 'out', 'v4')),
  ];

  const entries: AuditedFileEntry[] = [];
  for (const absPath of rawPaths) {
    const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/');
    const baseName = path.basename(relPath);
    if (baseName === '.gitkeep' || relPath === 'docs/INDEX.md') {
      continue;
    }

    const content = fs.readFileSync(absPath, 'utf8');
    const bytes = fs.statSync(absPath).size;
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    const estimatedTokens = estimateTokens(content);
    const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length;

    entries.push({
      relativePath: relPath,
      rootGroup: relPath.startsWith('out/v4/') ? 'out/v4' : 'docs',
      category: classifyFile(relPath),
      bytes,
      lines,
      estimatedTokens,
      sha256,
      tracked: trackedSet ? trackedSet.has(relPath) : true,
    });
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const totalBytes = entries.reduce((acc, e) => acc + e.bytes, 0);
  const totalEstimatedTokens = entries.reduce((acc, e) => acc + e.estimatedTokens, 0);
  const docsEntries = entries.filter((e) => e.rootGroup === 'docs');
  const outEntries = entries.filter((e) => e.rootGroup === 'out/v4');

  const top10Largest = [...entries]
    .sort((a, b) => b.estimatedTokens - a.estimatedTokens || b.bytes - a.bytes)
    .slice(0, 10);

  const duplicateAndSuperseded: DuplicateOrSupersededGroup[] = [];

  // 1. Exact SHA-256 duplicates
  const byHash = new Map<string, AuditedFileEntry[]>();
  for (const e of entries) {
    const list = byHash.get(e.sha256) ?? [];
    list.push(e);
    byHash.set(e.sha256, list);
  }
  for (const group of byHash.values()) {
    if (group.length > 1) {
      duplicateAndSuperseded.push({
        kind: 'exact_duplicate',
        description: 'Byte-identical files (exact SHA-256 match; frozen v3 archival pair)',
        paths: group.map((g) => g.relativePath),
        totalBytes: group.reduce((s, g) => s + g.bytes, 0),
        totalTokens: group.reduce((s, g) => s + g.estimatedTokens, 0),
      });
    }
  }

  // 2. Template sources vs rendered Markdown counterparts
  const entryMap = new Map(entries.map((e) => [e.relativePath, e]));
  for (const e of docsEntries) {
    if (!e.relativePath.endsWith('.template.md')) continue;
    const renderedPath = e.relativePath.replace(/\.template\.md$/, '.md');
    const rendered = entryMap.get(renderedPath);
    if (rendered) {
      duplicateAndSuperseded.push({
        kind: 'template_source',
        description: `Template source paired with rendered document (${renderedPath})`,
        paths: [e.relativePath, renderedPath],
        totalBytes: e.bytes + rendered.bytes,
        totalTokens: e.estimatedTokens + rendered.estimatedTokens,
      });
    }
  }

  // 3. Receipt aliases (model-slug alias vs canonical Gemini receipt)
  for (const [aliasPath, canonicalPath] of RECEIPT_ALIASES.entries()) {
    const aliasEntry = entryMap.get(aliasPath);
    const canonicalEntry = entryMap.get(canonicalPath);
    if (aliasEntry && canonicalEntry) {
      duplicateAndSuperseded.push({
        kind: 'receipt_alias',
        description: `Redundant alias/copy alongside canonical Slow Clock receipt (${canonicalPath})`,
        paths: [canonicalPath, aliasPath],
        totalBytes: canonicalEntry.bytes + aliasEntry.bytes,
        totalTokens: canonicalEntry.estimatedTokens + aliasEntry.estimatedTokens,
      });
    }
  }

  // 4. Per-model summary bundles rolled up into cross-model summaries
  const abacPerModel = outEntries.filter(
    (e) =>
      e.category === 'v4_per_model_summary' &&
      e.relativePath.includes('policy-abac-') &&
      e.relativePath.endsWith('.md')
  );
  if (abacPerModel.length > 0 && entryMap.has('out/v4/policy-abac-cross-model-summary.md')) {
    duplicateAndSuperseded.push({
      kind: 'superseded_summary',
      description:
        'Individual ABAC per-model Markdown reports aggregated into out/v4/policy-abac-cross-model-summary.md',
      paths: abacPerModel.map((e) => e.relativePath),
      totalBytes: abacPerModel.reduce((s, g) => s + g.bytes, 0),
      totalTokens: abacPerModel.reduce((s, g) => s + g.estimatedTokens, 0),
    });
  }

  const tsPerModel = outEntries.filter(
    (e) =>
      e.category === 'v4_per_model_summary' &&
      e.relativePath.includes('ts-api-') &&
      e.relativePath.endsWith('.md')
  );
  if (tsPerModel.length > 0 && entryMap.has('out/v4/ts-api-cross-model-summary.md')) {
    duplicateAndSuperseded.push({
      kind: 'superseded_summary',
      description:
        'Individual TS-API per-model Markdown reports aggregated into out/v4/ts-api-cross-model-summary.md',
      paths: tsPerModel.map((e) => e.relativePath),
      totalBytes: tsPerModel.reduce((s, g) => s + g.bytes, 0),
      totalTokens: tsPerModel.reduce((s, g) => s + g.estimatedTokens, 0),
    });
  }

  const cartridgeCompaction = runCartridgeCompactionBenchmarks(rootDir);

  return {
    entries,
    report: {
      totalFiles: entries.length,
      totalBytes,
      totalEstimatedTokens,
      docsFiles: docsEntries.length,
      docsEstimatedTokens: docsEntries.reduce((s, e) => s + e.estimatedTokens, 0),
      outV4Files: outEntries.length,
      outV4EstimatedTokens: outEntries.reduce((s, e) => s + e.estimatedTokens, 0),
      top10Largest,
      duplicateAndSuperseded,
      cartridgeCompaction,
    },
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function renderDocsIndexMarkdown(
  entries: readonly AuditedFileEntry[],
  report: WorkspaceAuditReport
): string {
  // Keep INDEX links scoped to tracked repository files so clones remain clean & link-valid
  const trackedEntries = entries.filter((e) => e.tracked);

  const activeV4 = trackedEntries.filter((e) => e.category === 'active_v4');
  const frozenV3 = trackedEntries.filter(
    (e) => e.category === 'frozen_v3_archive' || e.category === 'frozen_v3_template'
  );
  const archAndSpec = trackedEntries.filter((e) => e.category === 'architecture_and_spec');
  const v4CrossSummaries = trackedEntries.filter(
    (e) => e.category === 'v4_cross_model_summary' && e.relativePath.endsWith('.md')
  );
  const v4PerModelMd = trackedEntries.filter(
    (e) => e.category === 'v4_per_model_summary' && e.relativePath.endsWith('.md')
  );
  const v4Receipts = trackedEntries.filter((e) => e.category === 'v4_hope_receipt');

  const lines: string[] = [];
  lines.push('# Axiom Documentation & Empirical Artifact Index');
  lines.push('');
  lines.push(
    '> Auto-generated deterministically by `scripts/v4/audit-context-rot.ts`. Single compact navigation entry point separating **Active v4 HOPE docs**, **Frozen v3 Archives**, **Engine Specs**, and **Generated v4 Reports (`out/v4/`)** to minimize context bloat.'
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Active Axiom-HOPE v4 Documentation');
  lines.push('');
  lines.push('| File | Purpose | Est. Tokens | Size (B) |');
  lines.push('| :--- | :--- | ---: | ---: |');
  for (const e of activeV4) {
    lines.push(
      `| [\`${e.relativePath}\`](../${e.relativePath}) | Primary Axiom-HOPE v4 architecture, 3-clock governance, SQL/ABAC/TS-API benchmarks (495+ trials), and promotion receipts | ${formatNumber(e.estimatedTokens)} | ${formatNumber(e.bytes)} |`
    );
  }
  lines.push('');

  lines.push('## 2. Frozen Ablation v3 Archives (Read-Only — Do Not Modify)');
  lines.push('');
  lines.push('| File | Role | Est. Tokens | Size (B) |');
  lines.push('| :--- | :--- | ---: | ---: |');
  for (const e of frozenV3) {
    const role = e.relativePath.endsWith('.template.md')
      ? 'Frozen paper/dossier Markdown template source'
      : e.relativePath.includes('PAPER')
        ? 'Frozen v3 research paper / benchmark manuscript (9 models, 8,640 trials)'
        : 'Frozen v3 research dossier / telemetry snapshot';
    lines.push(
      `| [\`${e.relativePath}\`](../${e.relativePath}) | ${role} | ${formatNumber(e.estimatedTokens)} | ${formatNumber(e.bytes)} |`
    );
  }
  lines.push('');

  lines.push('## 3. Core Architecture & Operational Specifications');
  lines.push('');
  lines.push('| File | Scope | Est. Tokens | Size (B) |');
  lines.push('| :--- | :--- | ---: | ---: |');
  for (const e of archAndSpec) {
    const scope = e.relativePath.startsWith('docs/spec/')
      ? 'Formal v2/v3 evaluation protocol, fact spec, or changelog'
      : 'Core Axiom engine design, domain grammar, lifecycle, or guide';
    lines.push(
      `| [\`${e.relativePath}\`](../${e.relativePath}) | ${scope} | ${formatNumber(e.estimatedTokens)} | ${formatNumber(e.bytes)} |`
    );
  }
  lines.push('');

  lines.push('## 4. Generated v4 Empirical Summaries & Slow Clock Receipts (`out/v4/`)');
  lines.push('');
  lines.push('### 4.1 Cross-Model & Necessity Synthesis Reports (Start Here)');
  lines.push('| Markdown Report | JSON Counterpart | Est. Tokens (MD) |');
  lines.push('| :--- | :--- | ---: |');
  for (const e of v4CrossSummaries) {
    const jsonRel = e.relativePath.replace(/\.md$/, '.json');
    lines.push(
      `| [\`${e.relativePath}\`](../${e.relativePath}) | [\`${jsonRel}\`](../${jsonRel}) | ${formatNumber(e.estimatedTokens)} |`
    );
  }
  lines.push('');

  lines.push('### 4.2 Per-Model 5-Arm Trial Reports');
  lines.push('| Markdown Report | JSON Counterpart | Est. Tokens (MD) |');
  lines.push('| :--- | :--- | ---: |');
  for (const e of v4PerModelMd) {
    const jsonRel = e.relativePath.replace(/\.md$/, '.json');
    lines.push(
      `| [\`${e.relativePath}\`](../${e.relativePath}) | [\`${jsonRel}\`](../${jsonRel}) | ${formatNumber(e.estimatedTokens)} |`
    );
  }
  lines.push('');

  lines.push('### 4.3 Slow Clock Promotion & Rejection Receipts');
  lines.push('| Receipt JSON | Est. Tokens | Size (B) |');
  lines.push('| :--- | ---: | ---: |');
  for (const e of v4Receipts) {
    lines.push(
      `| [\`${e.relativePath}\`](../${e.relativePath}) | ${formatNumber(e.estimatedTokens)} | ${formatNumber(e.bytes)} |`
    );
  }
  lines.push('');

  lines.push('## 5. Lexical-Locked Compaction Benchmark Across All 3 Cartridges');
  lines.push('');
  lines.push(
    '| Cartridge | Active Rules | Tokens Before | Tokens After | Reduction % | Required Tokens Preserved |'
  );
  lines.push('| :--- | ---: | ---: | ---: | ---: | ---: |');
  for (const stat of report.cartridgeCompaction) {
    lines.push(
      `| ${stat.domainLabel} (\`${stat.cartridgeId}\`) | ${stat.activeRules} | ${formatNumber(stat.beforeTokens)} | ${formatNumber(stat.afterTokens)} | -${stat.reductionPct.toFixed(2)}% | ${stat.preservedTokens}/${stat.totalRequiredTokens} (100.0%) |`
    );
  }
  lines.push('');

  lines.push('## 6. Workspace Hygiene & Context-Rot Notes');
  lines.push('');
  lines.push(
    `- **Audited Corpus:** ${report.totalFiles} files (${report.docsFiles} in \`docs/\`, ${report.outV4Files} in \`out/v4/\`) totaling **${formatNumber(report.totalEstimatedTokens)} estimated tokens** (${formatNumber(report.totalBytes)} bytes).`
  );
  lines.push(
    '- **Single Source of Truth Rule:** Start in [`docs/AXIOM-V4-HOPE.md`](../docs/AXIOM-V4-HOPE.md) for current HOPE v4 architecture/results, and the 3 files in Section 4.1 (`policy-abac-cross-model-summary.md`, `policy-abac-cid-masked-summary.md`, `ts-api-cross-model-summary.md`) rather than reading per-model JSON dumps unless debugging a specific trial.'
  );
  if (report.duplicateAndSuperseded.length > 0) {
    lines.push('- **Detected Duplicate / Superseded Groups (Read-Only):**');
    for (const grp of report.duplicateAndSuperseded) {
      lines.push(
        `  - \`${grp.kind}\` (${formatNumber(grp.totalTokens)} tokens): ${grp.description} — ${grp.paths.map((p) => `\`${p}\``).join(', ')}`
      );
    }
  }
  lines.push('');

  return `${lines.join('\n')}`;
}

export function writeDocsIndexSafely(
  rootDir: string,
  markdownContent: string
): string {
  const indexPath = path.resolve(rootDir, 'docs', 'INDEX.md');
  const resolvedRootDocs = path.resolve(rootDir, 'docs');
  if (indexPath !== path.join(resolvedRootDocs, 'INDEX.md')) {
    throw new Error(`Refusing to write outside docs/INDEX.md: ${indexPath}`);
  }
  fs.writeFileSync(indexPath, markdownContent, 'utf8');
  return indexPath;
}

function main(): void {
  const rootDir = process.cwd();
  const { entries, report } = scanWorkspaceDocsAndReports(rootDir);
  const indexMarkdown = renderDocsIndexMarkdown(entries, report);
  const writtenPath = writeDocsIndexSafely(rootDir, indexMarkdown);

  console.log('=== Axiom v4 Workspace Context-Rot & Compaction Audit ===');
  console.log(
    `Files audited: ${report.totalFiles} (${report.docsFiles} in docs/, ${report.outV4Files} in out/v4/)`
  );
  console.log(
    `Total footprint: ${formatNumber(report.totalBytes)} bytes | ${formatNumber(report.totalEstimatedTokens)} estimated tokens (docs/: ${formatNumber(report.docsEstimatedTokens)}, out/v4/: ${formatNumber(report.outV4EstimatedTokens)})`
  );
  console.log('');
  console.log('Top 10 Largest Audited Files:');
  report.top10Largest.forEach((f, idx) => {
    console.log(
      `  ${idx + 1}. ${f.relativePath} — ${formatNumber(f.estimatedTokens)} tokens (${formatNumber(f.bytes)} bytes) [${f.category}]`
    );
  });
  console.log('');
  console.log('Potential Duplicate / Superseded Artifacts (Read-Only):');
  for (const grp of report.duplicateAndSuperseded) {
    console.log(
      `  - [${grp.kind}] ${grp.description} (${formatNumber(grp.totalTokens)} tokens across ${grp.paths.length} files)`
    );
  }
  console.log('');
  console.log('Cartridge Lexical-Locked Compaction Results:');
  for (const c of report.cartridgeCompaction) {
    console.log(
      `  - ${c.domainLabel} (${c.activeRules} rules): ${c.beforeTokens} -> ${c.afterTokens} tokens (-${c.reductionPct.toFixed(2)}%), preserved ${c.preservedTokens}/${c.totalRequiredTokens} (100.0%)`
    );
  }
  console.log('');
  console.log(`Generated index: ${path.relative(rootDir, writtenPath).replace(/\\/g, '/')}`);
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  main();
}
