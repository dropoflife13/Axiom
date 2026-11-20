import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  classifySqlForensics,
  SQL_FORENSIC_FLAG_NAMES,
  type ForensicTaskContext,
} from '../../src/verifier/sql-forensics.js';

dotenv.config();

export const DECISION1_MODEL = 'gemini-decision-1';
export const DECISION1_DEFAULT_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/decisions';
export const ZHANG_2026_CATEGORIES = [
  'well_formed_operational',
  'concrete_vocabulary_eroded',
  'over_generalized',
  'syntax_contradictory',
] as const;

export type Zhang2026Category = (typeof ZHANG_2026_CATEGORIES)[number];

export type DecisionQuestionSpec =
  | {
      id: string;
      type: 'bool';
      prompt: string;
    }
  | {
      id: string;
      type: 'choice';
      prompt: string;
      choices: readonly string[];
    }
  | {
      id: string;
      type: 'score';
      prompt: string;
      minScore: number;
      maxScore: number;
    };

export interface Decision1RequestPayload {
  model: string;
  inputText: string;
  questions: DecisionQuestionSpec[];
}

export interface Decision1Answer {
  id: string;
  type: 'bool' | 'choice' | 'score';
  value: boolean | string | number;
  confidence: number;
}

export interface Decision1Response {
  model: string;
  answers: Decision1Answer[];
  promptTokens?: number;
  outputTokens?: number;
}

export interface LessonAuditRecord {
  factId: string;
  canonicalStatement: string;
  lesson: string;
}

export interface JudgeSampleInput {
  sampleId: string;
  taskId: string;
  sql: string;
  task: ForensicTaskContext;
  applicableFacts: Array<{ id: string; statement: string }>;
  oraclePassed: boolean;
  oracleFailedFacts: string[];
}

export interface JudgePredictionInput {
  sampleId: string;
  factPredictions: Array<{
    factId: string;
    predictedPass: boolean;
    confidence: number;
  }>;
  forensicPredictions?: Partial<
    Record<(typeof SQL_FORENSIC_FLAG_NAMES)[number], { predictedFlag: boolean; confidence: number }>
  >;
}

export interface JudgeCalibrationMetrics {
  totalFactJudgments: number;
  precision: number;
  recall: number;
  f1: number;
  hallucinatedComplianceRate: number;
  hallucinatedComplianceCount: number;
  oracleFailCount: number;
  f36F16CollisionTotal: number;
  f36F16CollisionFalsePositiveCount: number;
  f36F16CollisionFalsePositiveRate: number;
  ece: number;
  calibrationBins: Array<{
    binLower: number;
    binUpper: number;
    count: number;
    avgConfidence: number;
    empiricalAccuracy: number;
  }>;
}

export function buildMemoryAuditRequest(
  sourceLabel: string,
  records: readonly LessonAuditRecord[]
): Decision1RequestPayload {
  const inputLines: string[] = [
    `MEMORY EROSION AUDIT (${sourceLabel}, Zhang et al. 2026 arXiv:2605.12978v2):`,
  ];
  const questions: DecisionQuestionSpec[] = [];

  for (const rec of records) {
    inputLines.push(
      `[${rec.factId}] CANONICAL: ${rec.canonicalStatement}\n[${rec.factId}] LESSON: ${rec.lesson}`
    );
    questions.push(
      {
        id: `${rec.factId}__preserves_exact_identifiers`,
        type: 'bool',
        prompt: `For ${rec.factId}, does LESSON preserve all concrete SQL column, constraint, role, and literal identifiers from CANONICAL?`,
      },
      {
        id: `${rec.factId}__preserves_preconditions`,
        type: 'bool',
        prompt: `For ${rec.factId}, does LESSON preserve the exact applicability scope (tenant, append_only, ingestion)?`,
      },
      {
        id: `${rec.factId}__zhang_2026_category`,
        type: 'choice',
        prompt: `Classify ${rec.factId} LESSON under Zhang et al. (2026) Section D.2 & J.1.`,
        choices: ZHANG_2026_CATEGORIES,
      },
      {
        id: `${rec.factId}__actionability_score`,
        type: 'score',
        prompt: `Rate actionability of ${rec.factId} LESSON from 0 (unusable) to 2 (fully executable).`,
        minScore: 0,
        maxScore: 2,
      }
    );
  }

  return {
    model: DECISION1_MODEL,
    inputText: inputLines.join('\n\n'),
    questions,
  };
}

export function buildOracleVsJudgeRequest(sample: {
  sampleId: string;
  taskId: string;
  sql: string;
  task: ForensicTaskContext;
  applicableFacts: Array<{ id: string; statement: string }>;
}): Decision1RequestPayload {
  const inputText = [
    `SAMPLE: ${sample.sampleId} (TASK: ${sample.taskId})`,
    `TABLE: public.${sample.task.table}`,
    `FEATURES: tenant=${sample.task.features.tenant}, append_only=${sample.task.features.append_only}, ingestion=${sample.task.features.ingestion}`,
    `CANDIDATE_SQL:\n${sample.sql}`,
  ].join('\n');

  const questions: DecisionQuestionSpec[] = [
    ...sample.applicableFacts.map((f) => ({
      id: `fact__${f.id}`,
      type: 'bool' as const,
      prompt: `Does this SQL migration strictly satisfy invariant ${f.id}: ${f.statement}?`,
    })),
    ...SQL_FORENSIC_FLAG_NAMES.map((flagName) => ({
      id: `forensic__${flagName}`,
      type: 'bool' as const,
      prompt: `Does this SQL migration exhibit the deterministic forensic pattern ${flagName}?`,
    })),
  ];

  return {
    model: DECISION1_MODEL,
    inputText,
    questions,
  };
}

export function computeExpectedCalibrationError(
  observations: ReadonlyArray<{ confidence: number; correct: boolean }>,
  numBins = 10
): {
  ece: number;
  bins: JudgeCalibrationMetrics['calibrationBins'];
} {
  const bins = Array.from({ length: numBins }, (_, i) => ({
    binLower: i / numBins,
    binUpper: (i + 1) / numBins,
    count: 0,
    sumConf: 0,
    sumAcc: 0,
  }));

  for (const obs of observations) {
    const conf = Math.max(0, Math.min(1, obs.confidence));
    const idx = Math.min(numBins - 1, Math.floor(conf * numBins));
    bins[idx].count++;
    bins[idx].sumConf += conf;
    bins[idx].sumAcc += obs.correct ? 1 : 0;
  }

  const total = observations.length;
  let ece = 0;
  const formattedBins = bins.map((b) => {
    const avgConfidence = b.count > 0 ? b.sumConf / b.count : 0;
    const empiricalAccuracy = b.count > 0 ? b.sumAcc / b.count : 0;
    if (total > 0 && b.count > 0) {
      ece += (b.count / total) * Math.abs(empiricalAccuracy - avgConfidence);
    }
    return {
      binLower: b.binLower,
      binUpper: b.binUpper,
      count: b.count,
      avgConfidence,
      empiricalAccuracy,
    };
  });

  return { ece, bins: formattedBins };
}

export function evaluateDecision1VsOracle(
  samples: readonly JudgeSampleInput[],
  predictions: readonly JudgePredictionInput[]
): JudgeCalibrationMetrics {
  const predMap = new Map(predictions.map((p) => [p.sampleId, p]));
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let oracleFailCount = 0;
  let hallucinatedComplianceCount = 0;
  let f36F16CollisionTotal = 0;
  let f36F16CollisionFalsePositiveCount = 0;
  const calObs: Array<{ confidence: number; correct: boolean }> = [];

  for (const sample of samples) {
    const pred = predMap.get(sample.sampleId);
    if (!pred) continue;

    const failedSet = new Set(sample.oracleFailedFacts);
    const forensics = classifySqlForensics(sample.sql, sample.task);
    const hasF36F16Collision =
      forensics.hasInlineSupersedesFk ||
      failedSet.has('F-16') ||
      failedSet.has('F-36');

    for (const fpItem of pred.factPredictions) {
      const actualPass = !failedSet.has(fpItem.factId);
      const predictedPass = fpItem.predictedPass;
      if (predictedPass && actualPass) tp++;
      else if (predictedPass && !actualPass) {
        fp++;
        hallucinatedComplianceCount++;
      } else if (!predictedPass && actualPass) {
        fn++;
      }

      if (!actualPass) oracleFailCount++;

      if (
        (fpItem.factId === 'F-16' || fpItem.factId === 'F-36') &&
        hasF36F16Collision &&
        !actualPass
      ) {
        f36F16CollisionTotal++;
        if (predictedPass) {
          f36F16CollisionFalsePositiveCount++;
        }
      }

      calObs.push({
        confidence: fpItem.confidence,
        correct: predictedPass === actualPass,
      });
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const hallucinatedComplianceRate =
    oracleFailCount > 0 ? hallucinatedComplianceCount / oracleFailCount : 0;
  const f36F16CollisionFalsePositiveRate =
    f36F16CollisionTotal > 0 ? f36F16CollisionFalsePositiveCount / f36F16CollisionTotal : 0;
  const { ece, bins } = computeExpectedCalibrationError(calObs);

  return {
    totalFactJudgments: calObs.length,
    precision,
    recall,
    f1,
    hallucinatedComplianceRate,
    hallucinatedComplianceCount,
    oracleFailCount,
    f36F16CollisionTotal,
    f36F16CollisionFalsePositiveCount,
    f36F16CollisionFalsePositiveRate,
    ece,
    calibrationBins: bins,
  };
}

export class Decision1Client {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly minIntervalMs: number;
  private lastCallMs = 0;

  constructor(options?: { apiKey?: string; endpoint?: string; minIntervalMs?: number }) {
    this.apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.endpoint =
      options?.endpoint ?? process.env.DECISION1_ENDPOINT ?? DECISION1_DEFAULT_ENDPOINT;
    // >= 350ms keeps throughput <= ~171 RPM, well under 200 RPM / 50K TPM / 10K RPD
    this.minIntervalMs = options?.minIntervalMs ?? 350;
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastCallMs;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastCallMs = Date.now();
  }

  async decide(payload: Decision1RequestPayload): Promise<Decision1Response> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is required to call Gemini Decision 1.');
    }
    await this.throttle();

    const questionsObj: Record<string, Record<string, unknown>> = {};
    for (const q of payload.questions) {
      if (q.type === 'bool') {
        questionsObj[q.id] = {
          type: 'noul',
          instructions: q.prompt,
        };
      } else if (q.type === 'choice') {
        const criteria: Record<string, string> = {};
        for (const c of q.choices) {
          criteria[c] = c.replace(/_/g, ' ');
        }
        questionsObj[q.id] = {
          type: 'choice',
          instructions: q.prompt,
          criteria,
        };
      } else {
        const levels: string[] = [];
        for (let s = q.minScore; s <= q.maxScore; s++) {
          levels.push(`${s}: Score ${s}`);
        }
        questionsObj[q.id] = {
          type: 'score',
          instructions: q.prompt,
          criteria: levels,
        };
      }
    }

    let json: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          model: payload.model,
          input: payload.inputText,
          questions: questionsObj,
        }),
      });
      if (res.status === 429 && attempt < 5) {
        await new Promise((r) => setTimeout(r, 36_000));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Decision 1 API error (${res.status}): ${body.slice(0, 400)}`);
      }
      json = (await res.json()) as Record<string, unknown>;
      break;
    }
    if (!json) {
      throw new Error('Decision 1 API failed after rate-limit retries.');
    }
    const rawAnswers = (json.answers ?? json.decisions ?? json.results ?? json) as Record<
      string,
      Record<string, unknown>
    >;
    const answers: Decision1Answer[] = payload.questions.map((q) => {
      const item = Array.isArray(rawAnswers)
        ? (rawAnswers as Array<Record<string, unknown>>).find((x) => x.id === q.id)
        : rawAnswers?.[q.id];
      const conf =
        typeof item?.confidence === 'number'
          ? item.confidence
          : typeof item?.probability === 'number'
            ? item.probability
            : 0.5;
      let val: boolean | string | number;
      if (q.type === 'bool') {
        if (typeof item?.value === 'boolean') {
          val = item.value;
        } else if (typeof item?.answer === 'boolean') {
          val = item.answer;
        } else if (typeof item?.noul === 'number') {
          val = item.noul >= 0.5;
        } else if (typeof item?.probability === 'number') {
          val = item.probability >= 0.5;
        } else if (typeof item?.value === 'string') {
          val = item.value.toLowerCase() === 'yes' || item.value.toLowerCase() === 'true';
        } else if (typeof item?.answer === 'string') {
          val = item.answer.toLowerCase() === 'yes' || item.answer.toLowerCase() === 'true';
        } else {
          val = false;
        }
      } else if (q.type === 'score') {
        val =
          (typeof item?.score === 'number' ? item.score : undefined) ??
          (typeof item?.expectedScore === 'number' ? item.expectedScore : undefined) ??
          (typeof item?.value === 'number' ? item.value : undefined) ??
          0;
      } else {
        val =
          (item?.choice as string) ??
          (item?.value as string) ??
          (item?.answer as string) ??
          '';
      }
      return {
        id: q.id,
        type: q.type,
        value: val,
        confidence: conf,
      };
    });

    const usage = json.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined;
    const v1Usage = json.usage as
      | { total_input_tokens?: number; total_output_tokens?: number }
      | undefined;
    return {
      model: payload.model,
      answers,
      promptTokens: v1Usage?.total_input_tokens ?? usage?.promptTokenCount,
      outputTokens: v1Usage?.total_output_tokens ?? usage?.candidatesTokenCount ?? 0,
    };
  }
}

async function runMemoryAuditMode(client: Decision1Client, outPath: string): Promise<void> {
  const factsRaw = JSON.parse(
    fs.readFileSync(path.resolve('fixtures', 'task-v3', 'facts.json'), 'utf8')
  ) as { facts: Array<{ id: string; statement: string }> };
  const factStmtById = new Map(factsRaw.facts.map((f) => [f.id, f.statement]));

  const loadRecords = (memPath: string): LessonAuditRecord[] => {
    const entries = JSON.parse(fs.readFileSync(memPath, 'utf8')) as Array<{
      factId?: string;
      errorCode?: string;
      lesson: string;
    }>;
    return entries.map((e) => {
      const id = e.factId ?? e.errorCode ?? 'UNKNOWN';
      return {
        factId: id,
        canonicalStatement: factStmtById.get(id) ?? '',
        lesson: e.lesson,
      };
    });
  };

  const cRecords = loadRecords(path.resolve('.axiom-state', 'memory.json'));
  const cidRecords = loadRecords(path.resolve('.axiom-state', 'memory-v3-cid.json'));

  const reqC = buildMemoryAuditRequest('C (v2 memory.json)', cRecords);
  const reqCid = buildMemoryAuditRequest('C_ID (memory-v3-cid.json)', cidRecords);
  const resC = await client.decide(reqC);
  const resCid = await client.decide(reqCid);

  const output = {
    mode: 'memory-audit',
    model: DECISION1_MODEL,
    generatedAt: new Date().toISOString(),
    cAudit: { count: cRecords.length, response: resC },
    cIdAudit: { count: cidRecords.length, response: resCid },
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Wrote Decision 1 memory audit to ${outPath}`);
}

async function runOracleVsJudgeMode(
  client: Decision1Client,
  checkpointPath: string,
  outPath: string,
  limit = 60
): Promise<void> {
  const factsRaw = JSON.parse(
    fs.readFileSync(path.resolve('fixtures', 'task-v3', 'facts.json'), 'utf8')
  ) as { facts: Array<{ id: string; statement: string }> };
  const factStmtById = new Map(factsRaw.facts.map((f) => [f.id, f.statement]));
  const tasksRaw = JSON.parse(
    fs.readFileSync(path.resolve('fixtures', 'task-v3', 'tasks.json'), 'utf8')
  ) as { test: Array<{ id: string; table: string; features: ForensicTaskContext['features'] }> };
  const taskMap = new Map(tasksRaw.test.map((t) => [t.id, t]));

  const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as {
    trials: Array<{
      taskId: string;
      condition: string;
      sanitizedSql?: string;
      generatedSql?: string;
      boundFacts: string[];
      boundPassed: boolean;
      failedFacts: string[];
    }>;
  };

  const samples: JudgeSampleInput[] = [];
  const predictions: JudgePredictionInput[] = [];

  const allTrials = cp.trials ?? [];
  const targetTrials = limit > 0 && allTrials.length > limit ? allTrials.slice(0, limit) : allTrials;
  for (let idx = 0; idx < targetTrials.length; idx++) {
    const trial = targetTrials[idx];
    const taskMeta = taskMap.get(trial.taskId);
    if (!taskMeta) continue;
    const sampleId = `${trial.taskId}::${trial.condition}`;
    const sql = trial.sanitizedSql ?? trial.generatedSql ?? '';
    const applicableFacts = (trial.boundFacts ?? []).map((id) => ({
      id,
      statement: factStmtById.get(id) ?? '',
    }));

    const sample: JudgeSampleInput = {
      sampleId,
      taskId: trial.taskId,
      sql,
      task: { table: taskMeta.table, features: taskMeta.features },
      applicableFacts,
      oraclePassed: trial.boundPassed,
      oracleFailedFacts: trial.failedFacts ?? [],
    };
    samples.push(sample);

    const req = buildOracleVsJudgeRequest(sample);
    const res = await client.decide(req);
    await new Promise((r) => setTimeout(r, 1500));
    const factPredictions = applicableFacts.map((f) => {
      const ans = res.answers.find((a) => a.id === `fact__${f.id}`);
      return {
        factId: f.id,
        predictedPass: Boolean(ans?.value),
        confidence: typeof ans?.confidence === 'number' ? ans.confidence : 0.5,
      };
    });
    predictions.push({ sampleId, factPredictions });
    if ((idx + 1) % 10 === 0 || idx + 1 === targetTrials.length) {
      console.log(`[Decision1 oracle-vs-judge] ${idx + 1}/${targetTrials.length}`);
    }
  }

  const metrics = evaluateDecision1VsOracle(samples, predictions);
  const output = {
    mode: 'oracle-vs-judge',
    model: DECISION1_MODEL,
    generatedAt: new Date().toISOString(),
    checkpointPath,
    sampleCount: samples.length,
    metrics,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Wrote Decision 1 oracle-vs-judge audit to ${outPath}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : undefined;
  const cpIdx = args.indexOf('--checkpoint');
  const outIdx = args.indexOf('--out');
  const outPath = path.resolve(
    outIdx >= 0 && args[outIdx + 1]
      ? args[outIdx + 1]
      : path.join('out', 'v3-prep', 'decision1-audit.json')
  );

  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : 60;

  const client = new Decision1Client();
  if (mode === 'memory-audit') {
    await runMemoryAuditMode(client, outPath);
  } else if (mode === 'oracle-vs-judge') {
    if (cpIdx < 0 || !args[cpIdx + 1]) {
      throw new Error('--checkpoint <path> is required in oracle-vs-judge mode');
    }
    await runOracleVsJudgeMode(client, path.resolve(args[cpIdx + 1]), outPath, limit);
  } else {
    console.error(
      'Usage: npx tsx scripts/v3/audit-decision1-judge.ts --mode <memory-audit|oracle-vs-judge> [--checkpoint <path>] [--out <path>]'
    );
    process.exit(1);
  }
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('audit-decision1-judge.ts');

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
