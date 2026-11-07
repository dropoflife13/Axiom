// scripts/calibrate-train-failure-frequency.ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runConditionACalibration } from './calibrate-condition-a.js';
import { REQUIRED_EXECUTOR_MODEL, assertModelMatch } from '../src/executor.js';

export async function runTrainFailureFrequencyCalibration(
  outputPath: string = path.resolve('out', 'train-calibration.json'),
  smoke: boolean = process.argv.includes('--smoke'),
  allowDirty: boolean = process.argv.includes('--allow-dirty')
) {
  const configuredModel = process.env.NVIDIA_EXECUTOR_MODEL ?? REQUIRED_EXECUTOR_MODEL;
  assertModelMatch(configuredModel, configuredModel);
  const summary = await runConditionACalibration({
    split: 'train',
    smoke,
    outputPath,
    allowDirty,
  });

  const oracleScriptSha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.resolve('scripts', 'oracle.ts')))
    .digest('hex');

  const payload = {
    ...summary,
    model: summary.model,
    oracleHash: summary.oracleCommit || oracleScriptSha256,
    oracleScriptSha256,
    factsSha256: summary.factsSha256,
    tasksSha256: summary.tasksSha256,
    taskContentSha256: summary.taskContentSha256,
    date: summary.date,
    failureCountsByFact: summary.failureCountsByFact,
    perFactStats: summary.perFactStats,
    taskReports: summary.taskReports,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('calibrate-train-failure-frequency.ts')
) {
  runTrainFailureFrequencyCalibration().catch((err) => {
    console.error('Train failure frequency calibration failed:', err);
    process.exit(1);
  });
}
