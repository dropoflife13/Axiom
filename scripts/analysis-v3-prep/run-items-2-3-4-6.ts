import fs from 'node:fs';
import path from 'node:path';
import type { TaskV2Item } from '../../src/eval/ablation.js';
import type { FactDefinition } from '../../scripts/facts.js';
import type { Lesson } from '../../src/memory.js';

const VALID_RUNS = [
  'nemotron-2',
  'gemma4-31b-full',
  'glm5-2',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-full',
] as const;

const CONDITIONS = ['A', 'D', 'C', 'C0', 'B'] as const;
type Cond = (typeof CONDITIONS)[number];

interface TrialRecord {
  condition: string;
  taskId: string;
  generationStatus?: string;
  generatedSql?: string;
  sanitizedSql?: string;
  boundFacts: string[];
  boundPassed: boolean;
  boundFactFraction: number;
  tableMissing?: boolean;
  migrationExitNonZero?: boolean;
  failedFacts: string[];
  retrievedFactIds: string[];
}

function makeRng(seed = 20260101): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function bootstrapMeanCi(values: number[], iterations = 10_000, seed = 20260101): [number, number] {
  if (values.length === 0) return [0, 0];
  const n = values.length;
  const rng = makeRng(seed);
  const means: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += values[Math.floor(rng() * n)];
    }
    means[i] = sum / n;
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * (iterations - 1))], means[Math.floor(0.975 * (iterations - 1))]];
}

function clusterBootstrapDiffCi(
  taskClusters: Array<{ numDiff: number; denom: number }>,
  iterations = 10_000,
  seed = 20260101
): [number, number] {
  const nonEmpty = taskClusters.filter((c) => c.denom > 0);
  if (nonEmpty.length === 0) return [0, 0];
  const n = nonEmpty.length;
  const rng = makeRng(seed);
  const diffs: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sumDiff = 0;
    let sumDenom = 0;
    for (let j = 0; j < n; j++) {
      const c = nonEmpty[Math.floor(rng() * n)];
      sumDiff += c.numDiff;
      sumDenom += c.denom;
    }
    diffs[i] = sumDenom > 0 ? sumDiff / sumDenom : 0;
  }
  diffs.sort((a, b) => a - b);
  return [diffs[Math.floor(0.025 * (iterations - 1))], diffs[Math.floor(0.975 * (iterations - 1))]];
}

function didFactPass(trial: TrialRecord, factId: string): boolean {
  const failed = new Set(trial.failedFacts ?? []);
  if (trial.tableMissing || failed.has('F-13')) return false;
  return !failed.has(factId);
}

function loadRunTrials(runId: string): TrialRecord[] {
  const cp = path.join('.axiom-state', 'runs', runId, 'checkpoint.json');
  const raw = JSON.parse(fs.readFileSync(cp, 'utf8'));
  return (raw.trials ?? []) as TrialRecord[];
}

function extractIdentifiers(text: string): string[] {
  const tokens = new Set<string>();
  const backticks = text.match(/`[^`]+`/g) ?? [];
  for (const b of backticks) tokens.add(b.slice(1, -1));
  // Match snake_case identifiers with underscore, dot paths, single-quoted literals, SQL keywords, templates
  const litMatches = text.match(/'[^']+'/g) ?? [];
  for (const l of litMatches) tokens.add(l);
  const identMatches =
    text.match(/\b(?:[a-z]+_[a-z0-9_<>]+(?:\.[a-z0-9_]+)?|<[a-z0-9_]+>|<table>|<col>|<key>|gen_random_uuid\(\)|now\(\)|app_metadata\.tenant_id|user_metadata\.tenant_id|security_invoker\s*=\s*true|search_path\s*=\s*''|deleted_at|updated_at|created_at|received_at|supersedes_id|idempotency_key|tenant_id|readonly_user|application|PUBLIC|jsonb|timestamptz|inet)\b/g) ??
    [];
  for (const m of identMatches) tokens.add(m);
  // Also catch explicit prefixes like fk_, chk_, idx_, REFERENCES, ON DELETE RESTRICT, FORCE ROW LEVEL SECURITY
  const explicitPatterns = [
    /fk_<table>_<column>/g,
    /chk_<table>_<column>/g,
    /idx_<table>_<column>/g,
    /REFERENCES\s+<table>\(id\)/g,
    /ON DELETE RESTRICT/g,
    /FORCE ROW LEVEL SECURITY/g,
    /ENABLE ROW LEVEL SECURITY/g,
    /BEFORE UPDATE OR DELETE/g,
    /BEFORE INSERT/g,
    /BEFORE UPDATE/g,
    /FOR UPDATE/g,
    /FOR DELETE/g,
    /FOR ALL/g,
    /WITH \(security_invoker = true\)/g,
    /WHERE deleted_at IS NULL/g,
    /USING \(true\)/g,
    /WITH CHECK \(true\)/g,
    /<singular_ref_table>_id/g,
    /NEW\.received_at = now\(\)/g,
  ];
  for (const re of explicitPatterns) {
    const ms = text.match(re) ?? [];
    for (const m of ms) tokens.add(m);
  }
  return [...tokens];
}

function main() {
  const root = path.resolve('.');
  const outDir = path.join(root, 'out', 'analysis-v3-prep');
  fs.mkdirSync(outDir, { recursive: true });

  const tasksJson = JSON.parse(fs.readFileSync('fixtures/task-v2/tasks.json', 'utf8')) as {
    train: TaskV2Item[];
    dev: TaskV2Item[];
    test: TaskV2Item[];
  };
  const factsJson = JSON.parse(fs.readFileSync('fixtures/task-v2/facts.json', 'utf8')) as {
    facts: FactDefinition[];
  };
  const memoryJson = JSON.parse(fs.readFileSync('.axiom-state/memory.json', 'utf8')) as Lesson[];

  const testTaskMap = new Map(tasksJson.test.map((t) => [t.id, t]));
  const factById = new Map(factsJson.facts.map((f) => [f.id, f]));
  const memByFact = new Map(memoryJson.map((l) => [l.factId ?? l.errorCode, l]));

  // Precompute identifier stripping map per fact
  const strippedIdentifiersByFact: Record<
    string,
    { origin: string; dropped: string[]; cText: string; c0Text: string }
  > = {};
  for (const fact of factsJson.facts) {
    const lesson = memByFact.get(fact.id);
    if (!lesson) continue;
    const c0Tokens = extractIdentifiers(fact.statement);
    const dropped = c0Tokens.filter((tok) => !lesson.lesson.includes(tok));
    strippedIdentifiersByFact[fact.id] = {
      origin: lesson.origin ?? 'unknown',
      dropped,
      cText: lesson.lesson,
      c0Text: fact.statement,
    };
  }

  // =========================================================================
  // ITEM 2 & 3 & 4 ACROSS 5 VALID COMPLETED RUNS
  // =========================================================================
  const item2: Record<string, any> = {};
  const item3: Record<string, any> = {};
  const item4: Record<string, any> = {};

  for (const runId of VALID_RUNS) {
    const trials = loadRunTrials(runId);
    const byTaskCond = new Map<string, Map<Cond, TrialRecord>>();
    for (const t of trials) {
      if (!byTaskCond.has(t.taskId)) byTaskCond.set(t.taskId, new Map());
      byTaskCond.get(t.taskId)!.set(t.condition as Cond, t);
    }

    // --- ITEM 2A: Pairwise clean intersection & 5-way common clean intersection ---
    const pairwiseClean: Record<string, any> = {};
    const pairsToCheck: Array<[Cond, Cond, string]> = [
      ['D', 'A', 'D_vs_A'],
      ['C', 'A', 'C_vs_A'],
      ['C0', 'A', 'C0_vs_A'],
      ['B', 'A', 'B_vs_A'],
      ['C0', 'C', 'C0_vs_C'],
      ['C', 'D', 'C_vs_D'],
      ['C0', 'B', 'C0_vs_B'],
    ];
    for (const [c1, c2, label] of pairsToCheck) {
      const diffs: number[] = [];
      const vals1: number[] = [];
      const vals2: number[] = [];
      let pass1 = 0;
      let pass2 = 0;
      for (const [, condMap] of byTaskCond) {
        const t1 = condMap.get(c1);
        const t2 = condMap.get(c2);
        if (t1 && t2 && !t1.migrationExitNonZero && !t2.migrationExitNonZero) {
          vals1.push(t1.boundFactFraction);
          vals2.push(t2.boundFactFraction);
          diffs.push(t1.boundFactFraction - t2.boundFactFraction);
          if (t1.boundPassed) pass1++;
          if (t2.boundPassed) pass2++;
        }
      }
      const n = diffs.length;
      const mean1 = n ? vals1.reduce((s, x) => s + x, 0) / n : 0;
      const mean2 = n ? vals2.reduce((s, x) => s + x, 0) / n : 0;
      const meanDiff = mean1 - mean2;
      const ci95 = bootstrapMeanCi(diffs);
      pairwiseClean[label] = {
        n,
        c1MeanPct: +(mean1 * 100).toFixed(2),
        c2MeanPct: +(mean2 * 100).toFixed(2),
        c1Pass1Pct: +(n ? (pass1 / n) * 100 : 0).toFixed(2),
        c2Pass1Pct: +(n ? (pass2 / n) * 100 : 0).toFixed(2),
        diffPts: +(meanDiff * 100).toFixed(2),
        ci95Pts: [+(ci95[0] * 100).toFixed(2), +(ci95[1] * 100).toFixed(2)],
      };
    }

    // 5-way common intersection (A & D & C & C0 & B all clean)
    const commonCleanTasks = [...byTaskCond.entries()]
      .filter(([, cm]) => CONDITIONS.every((c) => cm.get(c) && !cm.get(c)!.migrationExitNonZero))
      .map(([, cm]) => cm);
    const common5Summary: Record<string, any> = { n: commonCleanTasks.length, conditions: {}, diffs: {} };
    for (const c of CONDITIONS) {
      const n = commonCleanTasks.length;
      const mean = n ? commonCleanTasks.reduce((s, cm) => s + cm.get(c)!.boundFactFraction, 0) / n : 0;
      const pass = n ? commonCleanTasks.filter((cm) => cm.get(c)!.boundPassed).length / n : 0;
      common5Summary.conditions[c] = {
        meanBoundPct: +(mean * 100).toFixed(2),
        pass1Pct: +(pass * 100).toFixed(2),
      };
    }
    for (const [c1, c2, label] of pairsToCheck) {
      const diffs = commonCleanTasks.map(
        (cm) => cm.get(c1)!.boundFactFraction - cm.get(c2)!.boundFactFraction
      );
      const ci = bootstrapMeanCi(diffs);
      const meanD = diffs.length ? diffs.reduce((s, x) => s + x, 0) / diffs.length : 0;
      common5Summary.diffs[label] = {
        diffPts: +(meanD * 100).toFixed(2),
        ci95Pts: [+(ci[0] * 100).toFixed(2), +(ci[1] * 100).toFixed(2)],
      };
    }

    // --- ITEM 2B: 82 non-retrieved vs 396 retrieved bound pairs across A, D, C, C0, B ---
    const strataStats = (stratum: 'retrieved' | 'nonRetrieved') => {
      const condRates: Record<Cond, number> = { A: 0, D: 0, C: 0, C0: 0, B: 0 };
      const pairValues: Record<Cond, number[]> = { A: [], D: [], C: [], C0: [], B: [] };
      const clusterData: Array<{ taskId: string; counts: Record<Cond, { pass: number; n: number }> }> = [];

      const taskIdsSorted = [...byTaskCond.keys()].sort();
      for (const tid of taskIdsSorted) {
        const cm = byTaskCond.get(tid)!;
        const tC = cm.get('C');
        if (!tC) continue;
        const retSet = new Set(tC.retrievedFactIds ?? []);
        const counts: Record<Cond, { pass: number; n: number }> = {
          A: { pass: 0, n: 0 },
          D: { pass: 0, n: 0 },
          C: { pass: 0, n: 0 },
          C0: { pass: 0, n: 0 },
          B: { pass: 0, n: 0 },
        };
        for (const fid of tC.boundFacts ?? []) {
          const isRet = retSet.has(fid);
          if ((stratum === 'retrieved') !== isRet) continue;
          for (const c of CONDITIONS) {
            const tc = cm.get(c);
            if (!tc) continue;
            const ok = didFactPass(tc, fid) ? 1 : 0;
            pairValues[c].push(ok);
            counts[c].pass += ok;
            counts[c].n += 1;
          }
        }
        clusterData.push({ taskId: tid, counts });
      }

      const nPairs = pairValues.A.length;
      for (const c of CONDITIONS) {
        condRates[c] = +(nPairs ? (pairValues[c].reduce((s, x) => s + x, 0) / nPairs) * 100 : 0).toFixed(2);
      }

      const contrasts: Record<string, any> = {};
      for (const [c1, c2, lbl] of [
        ['D', 'A', 'D_minus_A'],
        ['C', 'A', 'C_minus_A'],
        ['C0', 'A', 'C0_minus_A'],
        ['B', 'A', 'B_minus_A'],
      ] as const) {
        const pairDiffs = pairValues[c1].map((v, i) => v - pairValues[c2][i]);
        const pairCi = bootstrapMeanCi(pairDiffs);
        const clusterDiffs = clusterData.map((cl) => ({
          numDiff: cl.counts[c1].pass - cl.counts[c2].pass,
          denom: cl.counts[c1].n,
        }));
        const clCi = clusterBootstrapDiffCi(clusterDiffs);
        const diffVal = pairDiffs.length
          ? pairDiffs.reduce((s, x) => s + x, 0) / pairDiffs.length
          : 0;
        contrasts[lbl] = {
          diffPts: +(diffVal * 100).toFixed(2),
          pairBootstrapCi95Pts: [+(pairCi[0] * 100).toFixed(2), +(pairCi[1] * 100).toFixed(2)],
          taskClusterBootstrapCi95Pts: [+(clCi[0] * 100).toFixed(2), +(clCi[1] * 100).toFixed(2)],
        };
      }
      return { nPairs, ratesPct: condRates, contrasts };
    };

    item2[runId] = {
      pairwiseClean,
      common5WayClean: common5Summary,
      retrieved396: strataStats('retrieved'),
      nonRetrieved82: strataStats('nonRetrieved'),
    };

    // --- ITEM 3: C0 - C by 8 cells + dropped identifiers in each cell's bound facts ---
    const cellRows: Record<string, any> = {};
    const cellIds = ['000', '001', '010', '011', '100', '101', '110', '111'];
    for (const cid of cellIds) {
      const cVals: number[] = [];
      const c0Vals: number[] = [];
      const cellBoundFacts = new Set<string>();
      const cellRetrievedBoundFacts = new Set<string>();
      for (const [tid, cm] of byTaskCond) {
        const task = testTaskMap.get(tid);
        if (!task) continue;
        const key =
          (task.features.tenant ? '1' : '0') +
          (task.features.append_only ? '1' : '0') +
          (task.features.ingestion ? '1' : '0');
        if (key !== cid) continue;
        const tC = cm.get('C');
        const tC0 = cm.get('C0');
        if (!tC || !tC0) continue;
        cVals.push(tC.boundFactFraction);
        c0Vals.push(tC0.boundFactFraction);
        const ret = new Set(tC.retrievedFactIds ?? []);
        for (const fid of tC.boundFacts ?? []) {
          cellBoundFacts.add(fid);
          if (ret.has(fid)) cellRetrievedBoundFacts.add(fid);
        }
      }
      const n = cVals.length;
      const mC = n ? cVals.reduce((s, x) => s + x, 0) / n : 0;
      const mC0 = n ? c0Vals.reduce((s, x) => s + x, 0) / n : 0;
      const diffs = c0Vals.map((v, i) => v - cVals[i]);
      const ci = bootstrapMeanCi(diffs);
      const droppedByFact: Record<string, string[]> = {};
      for (const fid of [...cellBoundFacts].sort()) {
        const info = strippedIdentifiersByFact[fid];
        if (info && info.dropped.length > 0 && info.origin === 'distilled') {
          droppedByFact[fid] = info.dropped;
        }
      }
      cellRows[cid] = {
        n,
        cMeanPct: +(mC * 100).toFixed(2),
        c0MeanPct: +(mC0 * 100).toFixed(2),
        c0MinusCPts: +((mC0 - mC) * 100).toFixed(2),
        ci95Pts: [+(ci[0] * 100).toFixed(2), +(ci[1] * 100).toFixed(2)],
        boundFactsInCell: [...cellBoundFacts].sort(),
        droppedIdentifiersInCell: droppedByFact,
      };
    }
    item3[runId] = cellRows;

    // --- ITEM 4: F-16/F-36 collision & Duplicate PK / F-01 ---
    const condItem4: Record<string, any> = {};
    for (const c of CONDITIONS) {
      const subset = trials.filter((t) => t.condition === c);
      type SupCat = 'both' | 'inlineOnly' | 'anyInline' | 'namedOnly' | 'neither' | 'nonCollisionAll';
      const supCounts: Record<SupCat, { n: number; f16AllPass: number; f16BoundN: number; f16BoundPass: number }> = {
        both: { n: 0, f16AllPass: 0, f16BoundN: 0, f16BoundPass: 0 },
        inlineOnly: { n: 0, f16AllPass: 0, f16BoundN: 0, f16BoundPass: 0 },
        anyInline: { n: 0, f16AllPass: 0, f16BoundN: 0, f16BoundPass: 0 },
        namedOnly: { n: 0, f16AllPass: 0, f16BoundN: 0, f16BoundPass: 0 },
        neither: { n: 0, f16AllPass: 0, f16BoundN: 0, f16BoundPass: 0 },
        nonCollisionAll: { n: 0, f16AllPass: 0, f16BoundN: 0, f16BoundPass: 0 },
      };

      let dupPkCount = 0;
      let dupPkExitNonZero = 0;
      let dupPkTableMissing = 0;
      let f01RetrievedCount = 0;
      let f01PassAll = 0;
      let f01ExplicitFail = 0;
      let f01BoundTotal = 0;
      let f01BoundPass = 0;

      const bump = (cat: SupCat, f16Pass: boolean, f16Bound: boolean) => {
        supCounts[cat].n++;
        if (f16Pass) supCounts[cat].f16AllPass++;
        if (f16Bound) {
          supCounts[cat].f16BoundN++;
          if (f16Pass) supCounts[cat].f16BoundPass++;
        }
      };

      for (const t of subset) {
        const sql = t.generatedSql || '';
        const lines = sql.split('\n');
        const retSet = new Set(t.retrievedFactIds ?? []);
        if (retSet.has('F-01')) f01RetrievedCount++;

        const f16Bound = (t.boundFacts ?? []).includes('F-16');
        const f16Pass = didFactPass(t, 'F-16');

        // Inline REFERENCES on supersedes_id column def (not FOREIGN KEY (...) clause)
        const hasInlineSupRef = lines.some(
          (l) =>
            !/\bFOREIGN\s+KEY\b/i.test(l) &&
            /^\s*supersedes_id\s+/i.test(l) &&
            /\bREFERENCES\b/i.test(l)
        );
        // Separate table-level or ALTER TABLE FOREIGN KEY (supersedes_id)
        const hasExplicitSupFk = /\bFOREIGN\s+KEY\s*\(\s*supersedes_id\s*\)/i.test(sql);

        if (hasInlineSupRef && hasExplicitSupFk) {
          bump('both', f16Pass, f16Bound);
          bump('anyInline', f16Pass, f16Bound);
        } else if (hasInlineSupRef) {
          bump('inlineOnly', f16Pass, f16Bound);
          bump('anyInline', f16Pass, f16Bound);
        } else if (hasExplicitSupFk) {
          bump('namedOnly', f16Pass, f16Bound);
          bump('nonCollisionAll', f16Pass, f16Bound);
        } else {
          bump('neither', f16Pass, f16Bound);
          bump('nonCollisionAll', f16Pass, f16Bound);
        }

        // Duplicate PRIMARY KEY: >= 2 occurrences of PRIMARY KEY in DDL
        const pkMatches = sql.match(/\bPRIMARY\s+KEY\b/gi) ?? [];
        const isDupPk = pkMatches.length >= 2;
        if (isDupPk) {
          dupPkCount++;
          if (t.migrationExitNonZero) dupPkExitNonZero++;
          if (t.tableMissing) dupPkTableMissing++;
        }

        if (didFactPass(t, 'F-01')) f01PassAll++;
        if ((t.failedFacts ?? []).includes('F-01')) f01ExplicitFail++;
        if ((t.boundFacts ?? []).includes('F-01')) {
          f01BoundTotal++;
          if (didFactPass(t, 'F-01')) f01BoundPass++;
        }
      }

      const summarizeSup = (s: { n: number; f16AllPass: number; f16BoundN: number; f16BoundPass: number }) => ({
        n: s.n,
        f16AllPassPct: s.n ? +((s.f16AllPass / s.n) * 100).toFixed(1) : null,
        f16BoundN: s.f16BoundN,
        f16BoundPassPct: s.f16BoundN ? +((s.f16BoundPass / s.f16BoundN) * 100).toFixed(1) : null,
      });

      condItem4[c] = {
        n: subset.length,
        f16f36SupersedesFk: {
          collisionBothInlineAndNamed: summarizeSup(supCounts.both),
          inlineSupOnly: summarizeSup(supCounts.inlineOnly),
          anyInlineSupRef: summarizeSup(supCounts.anyInline),
          namedSupFkOnly: summarizeSup(supCounts.namedOnly),
          neitherSupFk: summarizeSup(supCounts.neither),
          noInlineSupAll: summarizeSup({
            n: supCounts.inlineOnly.n * 0 + supCounts.nonCollisionAll.n,
            f16AllPass: supCounts.nonCollisionAll.f16AllPass,
            f16BoundN: supCounts.nonCollisionAll.f16BoundN,
            f16BoundPass: supCounts.nonCollisionAll.f16BoundPass,
          }),
        },
        dupPrimaryKey: {
          dupPkCount,
          dupPkExitNonZero,
          dupPkTableMissing,
          f01RetrievedCount,
          f01PassAll,
          f01ExplicitFail,
          f01BoundTotal,
          f01BoundPass,
        },
      };
    }
    item4[runId] = condItem4;
  }

  // =========================================================================
  // ITEM 6: 99 MUTATION SURVIVORS CLASSIFICATION
  // =========================================================================
  const mutReport = JSON.parse(fs.readFileSync('out/mutation-and-metamorphic-report.json', 'utf8'));
  const survivors: Array<{
    file: string;
    table: string;
    tenant: boolean;
    append_only: boolean;
    ingestion: boolean;
    statementIndex: number;
    statementCategory: string;
    deletedStatement: string;
  }> = mutReport.mutationTesting.survivors;

  const byCat = new Map<string, typeof survivors>();
  for (const s of survivors) {
    const arr = byCat.get(s.statementCategory) ?? [];
    arr.push(s);
    byCat.set(s.statementCategory, arr);
  }

  function countSplitFact(factId: string, kind: 'bound' | 'applicable') {
    const cnt = (arr: TaskV2Item[]) =>
      arr.filter((t) => ((kind === 'bound' ? t.boundFacts : t.applicableFacts) ?? []).includes(factId)).length;
    return `${cnt(tasksJson.train)} / ${cnt(tasksJson.dev)} / ${cnt(tasksJson.test)}`;
  }

  // Also check if good files with CREATE INDEX survivors have another index on tenant_id (like uq_... or idx_...)
  const createIndexDetails = (byCat.get('CREATE INDEX') ?? []).map((s) => {
    const goodSql = fs.readFileSync(path.join('fixtures/task-v2/good', s.file), 'utf8');
    const hasUniqueTenant = /CONSTRAINT\s+\S+\s+UNIQUE\s*\(\s*tenant_id/i.test(goodSql);
    const hasOtherIdx = (goodSql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\b/gi) ?? []).length > 1;
    const fkCols = [...goodSql.matchAll(/FOREIGN\s+KEY\s*\(\s*([a-z0-9_]+)\s*\)/gi)].map((m) => m[1]);
    return { file: s.file, stmt: s.deletedStatement, hasUniqueTenant, hasOtherIdx, fkCols };
  });

  const catAnnotations: Record<
    string,
    { facts: string[]; equivalentVerdict: string; reason: string }
  > = {
    'CREATE INDEX': {
      facts: ['F-22', 'F-23', 'F-38'],
      equivalentVerdict: 'Mixed (14/14 check)',
      reason: `Equivalent under F-22/F-23 when table already has a UNIQUE constraint starting with tenant_id (uq_<table>_tenant_id_... covers indkey[0]=tenant_id: true in ${createIndexDetails.filter((d) => d.hasUniqueTenant).length}/${createIndexDetails.length} files), OR Real gap if F-38 latest_per_key wasn't set on non-observation table or secondary created_at index not required by F-22/F-23.`,
    },
    'CREATE POLICY (INSERT)': {
      facts: ['F-26'],
      equivalentVerdict: 'Real Oracle Gap at 2026-11-06 (Patched later in commit 28623ca)',
      reason:
        'At 2026-11-06T11:32Z, F-26 tested cross-tenant INSERT (expected 42501) and NOT positive INSERT as application, so deleting INSERT policy still failed INSERT with 42501; fixed in 28623ca via POS_INSERT check.',
    },
    'CREATE POLICY (UPDATE)': {
      facts: ['F-26'],
      equivalentVerdict: 'Real Oracle Gap at 2026-11-06 (Patched later in commit 28623ca)',
      reason:
        'At 2026-11-06T11:32Z, F-26 did not probe positive/negative UPDATE as application; fixed in 28623ca via UPDATE probe for append_only=false.',
    },
    'REVOKE ALL': {
      facts: ['F-19'],
      equivalentVerdict: 'check append_only flag scope',
      reason:
        'F-19 runs ONLY when append_only=true; need to inspect whether survivors are append_only=false (PostgreSQL default REVOKE ALL on mutable tables not checked by any F-ID).',
    },
    'GRANT TO readonly_user': {
      facts: ['F-19'],
      equivalentVerdict: 'check append_only flag scope',
      reason:
        'F-19 runs ONLY when append_only=true (where readonly_user SELECT IS required); on append_only=false tables, no F-ID probes readonly_user SELECT.',
    },
    'GRANT ON VIEW': {
      facts: ['F-39'],
      equivalentVerdict: 'Real Contract/Probe Gap (Out of F-39 scope)',
      reason:
        'F-39 checks ONLY pg_class.reloptions containing security_invoker=true; zero F-IDs assert GRANT SELECT ON VIEW to application or readonly_user.',
    },
    'GRANT TO application': {
      facts: ['F-19', 'F-26'],
      equivalentVerdict: 'Mixed (Out of F-19/F-26 scope when tenant=false & append_only=false)',
      reason:
        'On tenant=false & append_only=false tables (good-26..good-30), neither F-19 nor F-26 executes SET ROLE application.',
    },
  };

  const item6Rows = [...byCat.entries()].map(([cat, list]) => {
    const appendTrue = list.filter((s) => s.append_only).length;
    const tenantTrue = list.filter((s) => s.tenant).length;
    const ingTrue = list.filter((s) => s.ingestion).length;
    const info = catAnnotations[cat] ?? { facts: [], equivalentVerdict: 'Unknown', reason: '' };
    const factCoverage = info.facts.map((fid) => ({
      factId: fid,
      boundTrainDevTest: countSplitFact(fid, 'bound'),
      applicableTrainDevTest: countSplitFact(fid, 'applicable'),
    }));
    return {
      category: cat,
      survivedCount: list.length,
      breakdown: { appendTrue, tenantTrue, ingTrue },
      targetFacts: factCoverage,
      equivalentVerdict: info.equivalentVerdict,
      reason: info.reason,
      sampleFiles: list.slice(0, 4).map((x) => x.file),
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    validRuns: VALID_RUNS,
    item2,
    item3,
    item4,
    item6: {
      reportTimestamp: mutReport.timestamp,
      totalMutants: mutReport.mutationTesting.totalMutants,
      killedMutants: mutReport.mutationTesting.killedMutants,
      survivedMutants: mutReport.mutationTesting.survivedMutants,
      categories: item6Rows,
      createIndexDetails,
    },
  };

  fs.writeFileSync(path.join(outDir, 'items-2-3-4-6.json'), JSON.stringify(payload, null, 2));
  console.log('Saved out/analysis-v3-prep/items-2-3-4-6.json');
  console.log('=== ITEM 6 FLAGS CHECK ===');
  for (const r of item6Rows) {
    console.log(r.category, 'n=' + r.survivedCount, 'flags(T/A/I):', r.breakdown, 'facts:', r.targetFacts);
  }
  console.log('CREATE INDEX details (tenant_id UNIQUE present?):', createIndexDetails.filter(d => d.hasUniqueTenant).length + '/' + createIndexDetails.length);
}

main();
