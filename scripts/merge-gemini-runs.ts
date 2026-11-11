import fs from 'node:fs';
import path from 'node:path';
import { pairedMcNemar, wilson95Interval, type ConditionId, type Trial } from '../src/eval/ablation.js';
import { buildReport, markdownReport } from './analyze-ablation-v2.js';

interface CheckpointFile {
  metadata?: any;
  trials: Trial[];
}

function summarize(condition: ConditionId, trials: Trial[], all: Trial[]) {
  const rawPasses = trials.filter((trial) => trial.passRaw).length;
  const tier0Passes = trials.filter((trial) => trial.passWithTier0).length;
  const boundPasses = trials.filter((trial) => trial.boundPassed).length;
  const meanBoundFactFraction = trials.length
    ? Number((trials.reduce((s, t) => s + (t.boundFactFraction ?? 0), 0) / trials.length).toFixed(4))
    : 0;
  const [rawLow, rawHigh] = wilson95Interval(rawPasses, trials.length);
  const [tierLow, tierHigh] = wilson95Interval(tier0Passes, trials.length);
  const [boundLow, boundHigh] = wilson95Interval(boundPasses, trials.length);
  const failures: Record<string, number> = {};
  for (const trial of trials) {
    for (const fact of trial.failedFacts) failures[fact] = (failures[fact] ?? 0) + 1;
  }
  const byCondition = (id: ConditionId) =>
    all
      .filter((trial) => trial.condition === id)
      .sort((a, b) => a.taskId.localeCompare(b.taskId));
  const c = byCondition('C');
  return {
    condition,
    trials: trials.length,
    primaryMeanBoundFactFraction: meanBoundFactFraction,
    primaryMeanBoundFactFractionPct: `${(meanBoundFactFraction * 100).toFixed(1)}%`,
    secondaryPassAt1OverBoundFacts: `${boundPasses}/${trials.length} (${trials.length ? ((boundPasses / trials.length) * 100).toFixed(1) : '0.0'}%)`,
    ci95Bound: `[${boundLow.toFixed(1)}%, ${boundHigh.toFixed(1)}%]`,
    passAt1Raw: `${rawPasses}/${trials.length} (${trials.length ? ((rawPasses / trials.length) * 100).toFixed(1) : '0.0'}%)`,
    ci95Raw: `[${rawLow.toFixed(1)}%, ${rawHigh.toFixed(1)}%]`,
    passAt1WithTier0: `${tier0Passes}/${trials.length} (${trials.length ? ((tier0Passes / trials.length) * 100).toFixed(1) : '0.0'}%)`,
    ci95WithTier0: `[${tierLow.toFixed(1)}%, ${tierHigh.toFixed(1)}%]`,
    mcnemarCvsA:
      condition === 'C'
        ? pairedMcNemar(byCondition('A').map((t) => t.passRaw), c.map((t) => t.passRaw))
        : null,
    mcnemarCvsB:
      condition === 'C'
        ? pairedMcNemar(byCondition('B').map((t) => t.passRaw), c.map((t) => t.passRaw))
        : null,
    mcnemarCvsC0:
      condition === 'C'
        ? pairedMcNemar(byCondition('C0').map((t) => t.passRaw), c.map((t) => t.passRaw))
        : null,
    mcnemarCvsD:
      condition === 'C'
        ? pairedMcNemar(byCondition('D').map((t) => t.passRaw), c.map((t) => t.passRaw))
        : null,
    mcnemarBoundCvsA:
      condition === 'C'
        ? pairedMcNemar(byCondition('A').map((t) => t.boundPassed), c.map((t) => t.boundPassed))
        : null,
    mcnemarBoundCvsB:
      condition === 'C'
        ? pairedMcNemar(byCondition('B').map((t) => t.boundPassed), c.map((t) => t.boundPassed))
        : null,
    mcnemarBoundCvsC0:
      condition === 'C'
        ? pairedMcNemar(byCondition('C0').map((t) => t.boundPassed), c.map((t) => t.boundPassed))
        : null,
    mcnemarBoundCvsD:
      condition === 'C'
        ? pairedMcNemar(byCondition('D').map((t) => t.boundPassed), c.map((t) => t.boundPassed))
        : null,
    failuresByFact: failures,
    averageLlmCallsPerTask: trials.length
      ? Number((trials.reduce((sum, trial) => sum + (trial.llmCalls ?? 1), 0) / trials.length).toFixed(2))
      : 0,
    averageTokensPerTask: trials.length
      ? Math.round(trials.reduce((sum, trial) => sum + trial.totalTokens, 0) / trials.length)
      : 0,
  };
}

async function main() {
  const root = path.resolve('.');
  const runsDir = path.join(root, '.axiom-state', 'runs');
  const archiveDir = path.join(root, '.axiom-state', 'archive', 'runs');

  const run1Dir = path.join(runsDir, 'gemini-flash-lite');
  const run2Dir = path.join(runsDir, 'gemini-flash-lite-expanded');
  const fullRunDir = path.join(runsDir, 'gemini-flash-lite-full');

  console.log('=== Merging Gemini 3.5 Flash Lite Checkpoints ===\n');

  if (!fs.existsSync(run1Dir)) {
    throw new Error(`Directory not found: ${run1Dir}`);
  }
  if (!fs.existsSync(run2Dir)) {
    throw new Error(`Directory not found: ${run2Dir}`);
  }

  const run1Checkpoint: CheckpointFile = JSON.parse(
    fs.readFileSync(path.join(run1Dir, 'checkpoint.json'), 'utf8')
  );
  const run2Checkpoint: CheckpointFile = JSON.parse(
    fs.readFileSync(path.join(run2Dir, 'checkpoint.json'), 'utf8')
  );

  console.log(`Loaded run 1: ${run1Checkpoint.trials.length} trials from gemini-flash-lite`);
  console.log(`Loaded run 2: ${run2Checkpoint.trials.length} trials from gemini-flash-lite-expanded`);

  // Map by task-condition key to guarantee uniqueness
  const trialsMap = new Map<string, Trial>();

  for (const trial of run1Checkpoint.trials) {
    const key = `${trial.taskId}:${trial.condition}`;
    trialsMap.set(key, trial);
  }
  for (const trial of run2Checkpoint.trials) {
    const key = `${trial.taskId}:${trial.condition}`;
    if (trialsMap.has(key)) {
      console.warn(`Warning: Overwriting duplicate key ${key}`);
    }
    trialsMap.set(key, trial);
  }

  const mergedTrials = Array.from(trialsMap.values());
  console.log(`Total unique merged trials: ${mergedTrials.length}`);

  const conditionOrder: ConditionId[] = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
  function taskNum(id: string): number {
    const m = id.match(/H-(\d+)/);
    return m ? parseInt(m[1], 10) : 9999;
  }

  mergedTrials.sort((a, b) => {
    const nA = taskNum(a.taskId);
    const nB = taskNum(b.taskId);
    if (nA !== nB) return nA - nB;
    return conditionOrder.indexOf(a.condition) - conditionOrder.indexOf(b.condition);
  });

  const uniqueTasks = Array.from(new Set(mergedTrials.map((t) => t.taskId))).sort(
    (a, b) => taskNum(a) - taskNum(b)
  );
  console.log(`Unique tasks: ${uniqueTasks.length} (${uniqueTasks[0]} .. ${uniqueTasks[uniqueTasks.length - 1]})`);

  // Provenance metadata
  const meta1 = run1Checkpoint.metadata ?? {};
  const meta2 = run2Checkpoint.metadata ?? {};
  const metadata = {
    ...meta2,
    ...meta1,
    runId: 'gemini-flash-lite-full',
    requestedModel: 'gemini-3.5-flash-lite',
  };

  fs.mkdirSync(fullRunDir, { recursive: true });

  // 1. Write checkpoint.json
  const checkpointPath = path.join(fullRunDir, 'checkpoint.json');
  fs.writeFileSync(
    checkpointPath,
    JSON.stringify({ metadata, trials: mergedTrials }, null, 2),
    'utf8'
  );
  console.log(`Saved merged checkpoint: ${checkpointPath}`);

  // 2. Compute results.json
  const results = conditionOrder.map((c) =>
    summarize(c, mergedTrials.filter((t) => t.condition === c), mergedTrials)
  );

  const report = {
    generatedAt: new Date().toISOString(),
    protocol: 'Ablation v2',
    runId: 'gemini-flash-lite-full',
    model: 'gemini-3.5-flash-lite',
    requestedModel: 'gemini-3.5-flash-lite',
    topK: metadata.topK ?? 10,
    hintBSha256: metadata.hintBSha256,
    hintDSha256: metadata.hintDSha256,
    hintBuildersSha256: metadata.hintBuildersSha256,
    diffSha256: metadata.diffSha256,
    temperature: 0,
    repeats: 1,
    testTasks: uniqueTasks.length,
    conditions: conditionOrder,
    memorySha256AtStart: metadata.memorySha256,
    memorySha256AtEnd: metadata.memorySha256,
    oracleSha256: metadata.oracleSha256,
    tasksSha256: metadata.tasksSha256,
    factsSha256: metadata.factsSha256,
    gitCommit: metadata.gitCommit,
    metadata,
    results,
    trials: mergedTrials,
  };

  const resultsPath = path.join(fullRunDir, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Saved merged results: ${resultsPath}`);

  // 3. Compute offline statistical analysis report
  const memoryPath = path.join(root, '.axiom-state', 'memory.json');
  const factsPath = path.join(root, 'fixtures', 'task-v2', 'facts.json');
  const lessons =
    fs.existsSync(memoryPath) && fs.existsSync(factsPath)
      ? {
          memory: JSON.parse(fs.readFileSync(memoryPath, 'utf8')),
          facts: JSON.parse(fs.readFileSync(factsPath, 'utf8')),
        }
      : undefined;

  const analysisReport = buildReport(mergedTrials as any, metadata, lessons);
  const analysisJsonPath = path.join(fullRunDir, 'analysis.json');
  const analysisMdPath = path.join(fullRunDir, 'analysis.md');
  fs.writeFileSync(analysisJsonPath, JSON.stringify(analysisReport, null, 2) + '\n', 'utf8');
  fs.writeFileSync(analysisMdPath, markdownReport(analysisReport), 'utf8');
  console.log(`Saved statistical analysis: ${analysisJsonPath} and ${analysisMdPath}`);

  // 4. Archive partial run directories
  fs.mkdirSync(archiveDir, { recursive: true });

  const destRun1 = path.join(archiveDir, 'gemini-flash-lite');
  const destRun2 = path.join(archiveDir, 'gemini-flash-lite-expanded');

  if (fs.existsSync(destRun1)) {
    fs.rmSync(destRun1, { recursive: true, force: true });
  }
  fs.renameSync(run1Dir, destRun1);
  console.log(`Archived ${run1Dir} -> ${destRun1}`);

  if (fs.existsSync(destRun2)) {
    fs.rmSync(destRun2, { recursive: true, force: true });
  }
  fs.renameSync(run2Dir, destRun2);
  console.log(`Archived ${run2Dir} -> ${destRun2}`);

  console.log('\n=== Analysis Summary on Combined 480-Trial Dataset ===\n');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Merge failed:', err);
  process.exit(1);
});
