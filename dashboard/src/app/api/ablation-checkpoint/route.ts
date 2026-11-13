import fs from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { modelForRun } from '@/lib/runs';

export const dynamic = 'force-dynamic';

const SAFE_ID = /^[a-zA-Z0-9._-]+$/;

function findExistingFile(candidates: string[]): string | null {
  for (const p of candidates) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ p) && fs.statSync(/*turbopackIgnore: true*/ p).isFile()) {
        return p;
      }
    } catch {
      // Continue searching
    }
  }
  return null;
}

function readJsonSafe(file: string | null): Record<string, unknown> | null {
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf8'));
  } catch {
    return null;
  }
}

function loadFactStatements(isV3 = false): Record<string, string> {
  const v3Paths = [
    path.resolve(process.cwd(), 'fixtures/task-v3/facts.json'),
    path.resolve(process.cwd(), '../fixtures/task-v3/facts.json'),
    path.resolve(process.cwd(), '../../fixtures/task-v3/facts.json'),
  ];
  const v2Paths = [
    path.resolve(process.cwd(), 'fixtures/task-v2/facts.json'),
    path.resolve(process.cwd(), '../fixtures/task-v2/facts.json'),
    path.resolve(process.cwd(), '../../fixtures/task-v2/facts.json'),
  ];
  const candidates = isV3 ? [...v3Paths, ...v2Paths] : [...v2Paths, ...v3Paths];
  const factsPath = findExistingFile(candidates);
  const doc = readJsonSafe(factsPath) as { facts?: Array<{ id: string; statement: string }> } | null;
  const statements: Record<string, string> = {};
  for (const f of doc?.facts ?? []) statements[f.id] = f.statement;
  return statements;
}

function compactTrials(trials: any[]): any[] {
  return trials.map((t) => {
    if (!t || typeof t !== 'object') return t;
    const { generatedSql: _sql, prompt: _p, systemPrompt: _sp, ...rest } = t;
    return rest;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedRun = searchParams.get('run');
    const runId = requestedRun || 'nemotron-2';

    if (!SAFE_ID.test(runId)) {
      return NextResponse.json({ error: 'Invalid run id', trials: [] }, { status: 400 });
    }

    if (process.env.VERCEL) {
      return NextResponse.json(
        { error: 'Checkpoint API is for local development; static snapshots are used on Vercel.' },
        { status: 404 },
      );
    }

    const isV3 = runId.toLowerCase().includes('v3');
    const isMini = runId.toLowerCase().includes('mini');

    const foundPath = findExistingFile([
      path.resolve(process.cwd(), `../../.axiom-state/runs-v3/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `../.axiom-state/runs-v3/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `.axiom-state/runs-v3/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `../../.axiom-state/runs/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `../.axiom-state/runs/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `.axiom-state/runs/${runId}/checkpoint.json`),
      path.resolve(process.cwd(), `../../.axiom-state/${runId}-checkpoint.json`),
      path.resolve(process.cwd(), `../.axiom-state/${runId}-checkpoint.json`),
      path.resolve(process.cwd(), `.axiom-state/${runId}-checkpoint.json`),
      path.resolve(process.cwd(), `../../.axiom-state/${runId}.json`),
      path.resolve(process.cwd(), `../.axiom-state/${runId}.json`),
      path.resolve(process.cwd(), `.axiom-state/${runId}.json`),
    ]);

    const snapshotPath = findExistingFile([
      path.resolve(process.cwd(), `public/data/run-${runId}.json`),
      path.resolve(process.cwd(), `dashboard/public/data/run-${runId}.json`),
      path.resolve(process.cwd(), `../dashboard/public/data/run-${runId}.json`),
    ]);

    const resultsPath = findExistingFile([
      path.resolve(process.cwd(), `../../.axiom-state/runs-v3/${runId}/results.json`),
      path.resolve(process.cwd(), `../.axiom-state/runs-v3/${runId}/results.json`),
      path.resolve(process.cwd(), `.axiom-state/runs-v3/${runId}/results.json`),
      path.resolve(process.cwd(), `../../.axiom-state/runs/${runId}/results.json`),
      path.resolve(process.cwd(), `../.axiom-state/runs/${runId}/results.json`),
      path.resolve(process.cwd(), `.axiom-state/runs/${runId}/results.json`),
    ]);

    const primaryPath = foundPath ?? resultsPath ?? snapshotPath;
    const factStatements = loadFactStatements(isV3);

    if (!primaryPath) {
      return NextResponse.json({
        id: runId,
        runId,
        commit: 'live',
        model: modelForRun(runId),
        startedAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        trials: [],
        totalTrials: isV3 ? 960 : isMini ? 48 : 720,
        status: 'initializing',
        factStatements,
      });
    }

    const data = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ primaryPath, 'utf8'));
    const stats = fs.statSync(/*turbopackIgnore: true*/ primaryPath);
    const extraSnap = readJsonSafe(snapshotPath);
    const extraResults = readJsonSafe(resultsPath);

    const rawTrials = Array.isArray(data.trials)
      ? data.trials
      : Array.isArray(data)
      ? data
      : [];
    const trials = compactTrials(rawTrials);

    const commit = data.metadata?.gitCommit
      ? String(data.metadata.gitCommit).slice(0, 7)
      : data.gitCommit
      ? String(data.gitCommit).slice(0, 7)
      : typeof extraResults?.gitCommit === 'string'
      ? extraResults.gitCommit.slice(0, 7)
      : typeof extraSnap?.commit === 'string'
      ? extraSnap.commit
      : 'live';

    const model =
      data.metadata?.requestedModel ||
      data.requestedModel ||
      data.model ||
      (extraResults?.model as string | undefined) ||
      (extraSnap?.model as string | undefined) ||
      modelForRun(runId);

    const taskIds = new Set(trials.map((t: any) => t.taskId));
    const condMultiplier = isV3 ? 8 : 6;
    let totalTrials = isV3 ? 960 : 720;
    if (typeof data.totalTrials === 'number' && data.totalTrials > 0 && data.totalTrials >= trials.length) {
      totalTrials = data.totalTrials;
    } else if (typeof data.metadata?.totalTrials === 'number' && data.metadata.totalTrials > 0 && data.metadata.totalTrials >= trials.length) {
      totalTrials = data.metadata.totalTrials;
    } else if (typeof extraSnap?.totalTrials === 'number' && extraSnap.totalTrials > 0 && extraSnap.totalTrials >= trials.length) {
      totalTrials = extraSnap.totalTrials;
    } else if (Array.isArray(data.metadata?.targetTasks) && data.metadata.targetTasks.length > 0) {
      totalTrials = data.metadata.targetTasks.length * condMultiplier;
    } else if (Array.isArray(data.targetTasks) && data.targetTasks.length > 0) {
      totalTrials = data.targetTasks.length * condMultiplier;
    } else if (Array.isArray(data.tasks) && data.tasks.length > 0) {
      totalTrials = data.tasks.length * condMultiplier;
    } else if (Array.isArray(data.metadata?.tasks) && data.metadata.tasks.length > 0) {
      totalTrials = data.metadata.tasks.length * condMultiplier;
    } else if (typeof extraResults?.testTasks === 'number' && extraResults.testTasks > 0 && trials.length <= extraResults.testTasks * condMultiplier) {
      totalTrials = extraResults.testTasks * condMultiplier;
    } else if (isMini) {
      totalTrials = taskIds.size > 0 ? taskIds.size * 6 : 48;
    } else if (taskIds.size > 0 && taskIds.size <= 8 && trials.length >= 24 && !runId.toLowerCase().includes('expanded') && !isV3) {
      totalTrials = taskIds.size * 6;
    }

    // Dynamic scale-up for v3, expanded or full runs
    if (isV3) {
      totalTrials = Math.max(totalTrials, 960);
    } else if (!isMini) {
      if (trials.length > 240 || taskIds.size > 40 || runId.toLowerCase().includes('expanded') || totalTrials >= 480) {
        totalTrials = Math.max(totalTrials, 720);
      }
    }
    if (trials.length > totalTrials) {
      totalTrials = Math.max(totalTrials, Math.ceil(trials.length / condMultiplier) * condMultiplier);
    }

    const snapObj = extraSnap as Record<string, unknown> | null;
    const resObj = extraResults as Record<string, unknown> | null;
    const conditions =
      data.conditions && !Array.isArray(data.conditions)
        ? data.conditions
        : snapObj?.conditions && !Array.isArray(snapObj.conditions)
        ? snapObj.conditions
        : undefined;
    const pairedComparisons =
      data.pairedComparisons ?? snapObj?.pairedComparisons ?? resObj?.pairedComparisons ?? undefined;
    const failuresByFact =
      data.failuresByFact ?? snapObj?.failuresByFact ?? resObj?.failuresByFact ?? undefined;

    return NextResponse.json({
      id: runId,
      runId,
      commit,
      model,
      startedAt: stats.birthtime.toISOString(),
      lastModified: stats.mtime.toISOString(),
      trials,
      totalTrials,
      metadata: data.metadata ?? null,
      conditions,
      pairedComparisons,
      failuresByFact,
      factStatements,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error while resolving checkpoint', details: String(err), trials: [] },
      { status: 500 },
    );
  }
}
