import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function findExistingFile(candidates: string[]): string | null {
  for (const p of candidates) {
    try {
      if (
        fs.existsSync(/*turbopackIgnore: true*/ p) &&
        fs.statSync(/*turbopackIgnore: true*/ p).isFile()
      ) {
        return p;
      }
    } catch {
      // continue searching
    }
  }
  return null;
}

function resolveRepoFile(relPath: string): string | null {
  return findExistingFile([
    path.resolve(process.cwd(), relPath),
    path.resolve(process.cwd(), '..', relPath),
    path.resolve(process.cwd(), '..', '..', relPath),
  ]);
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8')) as T;
}

function sha256File(filePath: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(/*turbopackIgnore: true*/ filePath))
    .digest('hex');
}

export async function GET() {
  try {
    const snapshotPath = findExistingFile([
      path.resolve(process.cwd(), 'public/data/v4-hope-snapshot.json'),
      path.resolve(process.cwd(), 'dashboard/public/data/v4-hope-snapshot.json'),
    ]);

    const crossModelPath = resolveRepoFile('out/v4/policy-abac-cross-model-summary.json');
    const receiptRelPaths = [
      'out/v4/policy-abac-hope-receipt.json',
      'out/v4/policy-abac-gemma-4-31b-it-hope-receipt.json',
      'out/v4/policy-abac-qwen-qwen3-8-27b-hope-receipt.json',
    ];
    const resolvedReceipts = receiptRelPaths
      .map((rel) => ({ rel, full: resolveRepoFile(rel) }))
      .filter((r): r is { rel: string; full: string } => Boolean(r.full));

    // Prefer live committed repo artifacts from out/v4/ when running locally
    if (crossModelPath && resolvedReceipts.length > 0) {
      const baseSnapshot = snapshotPath
        ? readJsonFile<Record<string, unknown>>(snapshotPath)
        : null;
      const crossModel = readJsonFile<Record<string, unknown>>(crossModelPath);
      const receipts = resolvedReceipts.map(({ rel, full }) => ({
        file: rel,
        ...readJsonFile<Record<string, unknown>>(full),
      }));

      // Refresh live fixture hashes & TS-API artifacts if available
      const abacTasksPath = resolveRepoFile('fixtures/v4/policy-abac-tasks.json');
      const v3FactsPath = resolveRepoFile('fixtures/task-v3/facts.json');
      const v3TasksPath = resolveRepoFile('fixtures/task-v3/tasks.json');
      const tsApiTasksPath = resolveRepoFile('fixtures/v4/ts-api-security-tasks.json');
      const tsApiCrossModelPath = resolveRepoFile('out/v4/ts-api-cross-model-summary.json');
      const tsApiReceiptRelPaths = [
        'out/v4/ts-api-hope-receipt.json',
        'out/v4/ts-api-gemma-4-31b-it-hope-receipt.json',
        'out/v4/ts-api-qwen-qwen3-8-27b-hope-receipt.json',
      ];
      const resolvedTsApiReceipts = tsApiReceiptRelPaths
        .map((rel) => ({ rel, full: resolveRepoFile(rel) }))
        .filter((r): r is { rel: string; full: string } => Boolean(r.full));
      const tsApiSummaryPath = resolveRepoFile('out/v4/ts-api-gemini-3-1-flash-lite-summary.json');
      const tsApiReceiptPath = resolveRepoFile('out/v4/ts-api-hope-receipt.json');

      const tsApiCrossModel = tsApiCrossModelPath
        ? readJsonFile<{ models?: Array<{ completedTrials?: number }> }>(tsApiCrossModelPath)
        : null;
      const tsApiReceipts = resolvedTsApiReceipts.map(({ rel, full }) => ({
        file: rel,
        ...readJsonFile<Record<string, unknown>>(full),
      }));

      const cartridges = baseSnapshot?.cartridges as Record<string, any> | undefined;
      if (cartridges?.policyAbac && abacTasksPath) {
        const abacDoc = readJsonFile<{
          version: string;
          tasks: Array<{ domain: string }>;
        }>(abacTasksPath);
        const domainBreakdown: Record<string, number> = {};
        for (const t of abacDoc.tasks) {
          domainBreakdown[t.domain] = (domainBreakdown[t.domain] ?? 0) + 1;
        }
        cartridges.policyAbac = {
          ...cartridges.policyAbac,
          version: abacDoc.version,
          taskCount: abacDoc.tasks.length,
          domainBreakdown,
          tasksSha256: sha256File(abacTasksPath),
        };
      }
      if (cartridges?.postgresV3 && v3FactsPath && v3TasksPath) {
        const v3Facts = readJsonFile<{
          version: string;
          facts: Array<{ status?: string; applicability?: { never?: boolean } }>;
        }>(v3FactsPath);
        const inactive = new Set(['DROPPED', 'UNCONFIRMED', 'PROPOSED']);
        const activeCount = v3Facts.facts.filter(
          (f) => !f.applicability?.never && !inactive.has((f.status ?? '').toUpperCase())
        ).length;
        const v3Tasks = readJsonFile<{ test: unknown[] }>(v3TasksPath);
        cartridges.postgresV3 = {
          ...cartridges.postgresV3,
          version: v3Facts.version,
          ruleCount: activeCount,
          taskCount: v3Tasks.test.length,
          factsSha256: sha256File(v3FactsPath),
          tasksSha256: sha256File(v3TasksPath),
        };
      }
      if (cartridges?.tsApiSecurity && tsApiTasksPath) {
        const tsDoc = readJsonFile<{
          version: string;
          tasks: Array<{ domain: string }>;
        }>(tsApiTasksPath);
        const domainBreakdown: Record<string, number> = {};
        for (const t of tsDoc.tasks) {
          domainBreakdown[t.domain] = (domainBreakdown[t.domain] ?? 0) + 1;
        }
        cartridges.tsApiSecurity = {
          ...cartridges.tsApiSecurity,
          version: tsDoc.version,
          taskCount: tsDoc.tasks.length,
          ...(tsApiCrossModel?.models
            ? {
                modelCount: tsApiCrossModel.models.length,
                totalLiveTrials: tsApiCrossModel.models.reduce(
                  (acc, m) => acc + (m.completedTrials ?? 0),
                  0
                ),
              }
            : {}),
          domainBreakdown,
          tasksSha256: sha256File(tsApiTasksPath),
        };
      }

      const fallbackTsApi = (baseSnapshot?.tsApi as Record<string, unknown> | undefined) ?? undefined;
      const tsApiSummaryObj = tsApiSummaryPath
        ? readJsonFile<Record<string, unknown>>(tsApiSummaryPath)
        : fallbackTsApi?.summary;
      const primaryTsApiReceipt =
        tsApiReceipts[0] ??
        (tsApiReceiptPath
          ? {
              file: 'out/v4/ts-api-hope-receipt.json',
              ...readJsonFile<Record<string, unknown>>(tsApiReceiptPath),
            }
          : fallbackTsApi?.receipt);

      const tsApi =
        tsApiCrossModel && tsApiReceipts.length > 0
          ? {
              crossModel: tsApiCrossModel,
              receipts: tsApiReceipts,
              ...(tsApiSummaryObj ? { summary: tsApiSummaryObj } : {}),
              ...(primaryTsApiReceipt ? { receipt: primaryTsApiReceipt } : {}),
            }
          : fallbackTsApi;

      return NextResponse.json({
        ...(baseSnapshot ?? { schemaVersion: '4.0.0-hope-dashboard-snapshot' }),
        generatedAt: new Date().toISOString(),
        source: 'live-artifacts',
        crossModel,
        receipts,
        ...(tsApi ? { tsApi } : {}),
      });
    }

    // Fallback to static snapshot (Vercel / standalone)
    if (snapshotPath) {
      const staticPayload = readJsonFile<Record<string, unknown>>(snapshotPath);
      return NextResponse.json({
        ...staticPayload,
        source: 'static-snapshot',
      });
    }

    return NextResponse.json(
      { error: 'v4 Axiom-HOPE artifacts not found.' },
      { status: 404 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load v4 Axiom-HOPE artifacts', details: String(err) },
      { status: 500 }
    );
  }
}
