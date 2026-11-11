import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import {
  sanitizeReasoningTags,
  sanitizeSqlOutput,
  classifyGenerationStatus,
  generateSqlMigration,
  executeSqlWithPolicy,
  getModelProfile,
  REQUIRED_EXECUTOR_MODEL,
} from '../src/executor.js';
import { buildTrial, runAblationTaskCondition, type TaskV2Item } from '../src/eval/ablation.js';
import { resetBudget } from '../src/guardrails.js';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const sampleTask: TaskV2Item = {
  id: 'H-001',
  split: 'test',
  cohortId: 'C1',
  table: 'audit_logs',
  prompt: 'Create a multi-tenant append-only table in PostgreSQL.',
  features: { tenant: true, append_only: true, ingestion: false },
  boundFacts: ['F-03', 'F-12'],
  goldenSql: 'CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);',
};

describe('Reasoning Tag Sanitizer & Trial Hash Provenance', () => {
  const originalFetch = globalThis.fetch;
  let tmpCacheDir: string;

  beforeEach(() => {
    resetBudget();
    tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-sanitizer-cache-'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmpCacheDir, { recursive: true, force: true });
  });

  it('closed: strips closed <think> and <thought> blocks while preserving valid SQL', () => {
    const thinkSql = '<think>Check schema flags\nVerify tenant_id</think>\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY);';
    const res1 = sanitizeSqlOutput(thinkSql);
    expect(res1.tagError).toBeNull();
    expect(res1.strippedBlocks).toBe(1);
    expect(res1.sanitizedSql).toBe('CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);');
    expect(classifyGenerationStatus('stop', res1.sanitizedSql, undefined, res1.tagError)).toBe('ok');

    const thoughtSql = '<thought>* Target: audit_logs\n* Need RLS</thought>\n```sql\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY);\n```';
    const res2 = sanitizeSqlOutput(thoughtSql);
    expect(res2.tagError).toBeNull();
    expect(res2.strippedBlocks).toBe(1);
    expect(res2.sanitizedSql).toBe('CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);');

    const multi = '<thought>plan A</thought>\n<think>plan B</think>\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY);';
    const res3 = sanitizeSqlOutput(multi);
    expect(res3.tagError).toBeNull();
    expect(res3.strippedBlocks).toBe(2);
    expect(res3.sanitizedSql).toBe('CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);');

    const onlyClosedThought = '<thought>I thought a lot and output nothing else</thought>';
    const res4 = sanitizeSqlOutput(onlyClosedThought);
    expect(res4.tagError).toBeNull();
    expect(res4.sanitizedSql).toBe('');
    expect(classifyGenerationStatus('stop', res4.sanitizedSql, undefined, res4.tagError)).toBe('empty');
  });

  it('unclosed: fails with generationStatus="other", skips Oracle, scores zero, never strips to silent empty SQL', async () => {
    const unclosedThought = '<thought>Wait let me plan...\nCREATE TABLE public.audit_logs (id uuid);';
    const r1 = sanitizeSqlOutput(unclosedThought);
    expect(r1.tagError).toBe('unclosed_tag');
    expect(r1.sanitizedSql).toBe(unclosedThought);
    expect(r1.sanitizedSql.length).toBeGreaterThan(0);
    expect(classifyGenerationStatus('stop', r1.sanitizedSql, undefined, r1.tagError)).toBe('other');

    const unclosedThink = 'CREATE TABLE public.audit_logs (id uuid);\n<think>forgot to close';
    const r2 = sanitizeSqlOutput(unclosedThink);
    expect(r2.tagError).toBe('unclosed_tag');
    expect(r2.sanitizedSql).toContain('<think>forgot to close');
    expect(classifyGenerationStatus('stop', r2.sanitizedSql, undefined, r2.tagError)).toBe('other');

    const unmatchedClose = 'CREATE TABLE public.audit_logs (id uuid);\n</thought>';
    const r3 = sanitizeSqlOutput(unmatchedClose);
    expect(r3.tagError).toBe('unmatched_closing_tag');
    expect(r3.sanitizedSql).toContain('</thought>');
    expect(classifyGenerationStatus('stop', r3.sanitizedSql, undefined, r3.tagError)).toBe('other');

    const partialTag = 'CREATE TABLE public.audit_logs (id uuid);\n<thought';
    const r4 = sanitizeSqlOutput(partialTag);
    expect(r4.tagError).toBe('leftover_tag');
    expect(classifyGenerationStatus('stop', r4.sanitizedSql, undefined, r4.tagError)).toBe('other');

    // length truncation stays "length" even if thinking block was unclosed
    expect(classifyGenerationStatus('length', r1.sanitizedSql, undefined, r1.tagError)).toBe('length');

    // Full end-to-end pipeline verification with mocked provider payload
    process.env.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || 'test_key';
    const rawPayload = {
      model: REQUIRED_EXECUTOR_MODEL,
      choices: [
        {
          finish_reason: 'stop',
          message: { content: unclosedThought },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rawPayload,
    });
    globalThis.fetch = mockFetch as any;

    const mockOracle = vi.fn();
    const { trial } = await runAblationTaskCondition({
      containerName: 'mock-pg',
      task: sampleTask,
      condition: 'A',
      memory: [],
      configuredModel: REQUIRED_EXECUTOR_MODEL,
      executorFn: (prompt, table, features, lesson, opts) =>
        generateSqlMigration(prompt, table, features, lesson, { ...opts, cacheDir: tmpCacheDir }),
      oracleEvalFn: mockOracle as any,
      runMetadata: {
        oracleSha256: 'a'.repeat(64),
        tasksSha256: 'b'.repeat(64),
        factsSha256: 'c'.repeat(64),
        memorySha256: 'd'.repeat(64),
        gitCommit: 'e'.repeat(40),
        requestedModel: REQUIRED_EXECUTOR_MODEL,
      },
    });

    expect(trial.generationStatus).toBe('other');
    expect(trial.boundPassed).toBe(false);
    expect(trial.boundFactFraction).toBe(0);
    expect(trial.generatedSql).toBe('');
    expect(trial.sanitizedSql).toBe(unclosedThought);
    expect(trial.sanitizedSha256).toBe(sha256(unclosedThought));
    expect(trial.rawResponse).toBe(JSON.stringify(rawPayload));
    expect(trial.rawSha256).toBe(sha256(JSON.stringify(rawPayload)));
    expect(mockOracle).not.toHaveBeenCalled();
  });

  it('nested: handles nested <think> and <thought> blocks cleanly and rejects nested unclosed/mismatched', () => {
    const nestedThought =
      '<thought>outer reasoning <thought>inner tangent</thought> still inside outer</thought>\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY);';
    const r1 = sanitizeSqlOutput(nestedThought);
    expect(r1.tagError).toBeNull();
    expect(r1.strippedBlocks).toBe(1);
    expect(r1.sanitizedSql).toBe('CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);');

    const nestedMixed =
      '<thought>outer <think>inner think</think> back to outer</thought>\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY);';
    const r2 = sanitizeSqlOutput(nestedMixed);
    expect(r2.tagError).toBeNull();
    expect(r2.strippedBlocks).toBe(1);
    expect(r2.sanitizedSql).toBe('CREATE TABLE public.audit_logs (id uuid PRIMARY KEY);');

    const nestedUnclosed =
      '<thought>outer <thought>inner closed</thought> outer never closes';
    const r3 = sanitizeSqlOutput(nestedUnclosed);
    expect(r3.tagError).toBe('unclosed_tag');
    expect(classifyGenerationStatus('stop', r3.sanitizedSql, undefined, r3.tagError)).toBe('other');

    const nestedMismatch =
      '<thought>outer <think>inner mismatched</thought>';
    const r4 = sanitizeSqlOutput(nestedMismatch);
    expect(r4.tagError).toBe('mismatched_closing_tag');
    expect(classifyGenerationStatus('stop', r4.sanitizedSql, undefined, r4.tagError)).toBe('other');
  });

  it('tag text inside a SQL comment: preserves tags inside -- line comments, /* */ block comments, and SQL literals', () => {
    const lineCommentSql =
      '-- Explain why <thought> and </thought> or unclosed <think> do not affect SQL\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY);';
    const r1 = sanitizeSqlOutput(lineCommentSql);
    expect(r1.tagError).toBeNull();
    expect(r1.strippedBlocks).toBe(0);
    expect(r1.sanitizedSql).toBe(lineCommentSql);

    const blockCommentSql =
      '/* Note: <thought>ignored inside block comment</thought> and <think>unclosed inside comment */\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY);';
    const r2 = sanitizeSqlOutput(blockCommentSql);
    expect(r2.tagError).toBeNull();
    expect(r2.strippedBlocks).toBe(0);
    expect(r2.sanitizedSql).toBe(blockCommentSql);

    const nestedBlockCommentSql =
      '/* outer /* nested <thought>tag</thought> */ still in comment <think> */\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY);';
    const r3 = sanitizeSqlOutput(nestedBlockCommentSql);
    expect(r3.tagError).toBeNull();
    expect(r3.strippedBlocks).toBe(0);
    expect(r3.sanitizedSql).toBe(nestedBlockCommentSql);

    const literalAndOuterThought =
      '<thought>planning DDL</thought>\n-- keeps <thought> inside comment\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY, note text DEFAULT \'<think>literal\');';
    const r4 = sanitizeSqlOutput(literalAndOuterThought);
    expect(r4.tagError).toBeNull();
    expect(r4.strippedBlocks).toBe(1);
    expect(r4.sanitizedSql).toBe(
      '-- keeps <thought> inside comment\nCREATE TABLE public.audit_logs (id uuid PRIMARY KEY, note text DEFAULT \'<think>literal\');'
    );
  });

  it('none: leaves clean SQL completely untouched and records matching raw/sanitized hashes on Trial', () => {
    const cleanSql = 'CREATE TABLE public.audit_logs (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid()\n);';
    const res = sanitizeSqlOutput(cleanSql);
    expect(res.tagError).toBeNull();
    expect(res.strippedBlocks).toBe(0);
    expect(res.foundReasoningTags).toBe(false);
    expect(res.sanitizedSql).toBe(cleanSql);

    const mockOracle = vi.fn().mockReturnValue({
      pass: true,
      failedFacts: [],
      details: 'All bound facts passed.',
      migrationExitNonZero: false,
    });
    const rawResp = JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: cleanSql } }] });
    const trial = buildTrial(
      'mock-container',
      sampleTask,
      'A',
      res.sanitizedSql,
      { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      [],
      {
        requestedModel: REQUIRED_EXECUTOR_MODEL,
        returnedModel: REQUIRED_EXECUTOR_MODEL,
        finishReason: 'stop',
        rawResponse: rawResp,
        rawSha256: sha256(rawResp),
        sanitizedSql: res.sanitizedSql,
        sanitizedSha256: sha256(res.sanitizedSql),
        tagError: res.tagError,
      },
      mockOracle,
      {
        oracleSha256: 'a'.repeat(64),
        tasksSha256: 'b'.repeat(64),
        factsSha256: 'c'.repeat(64),
        memorySha256: 'd'.repeat(64),
        gitCommit: 'e'.repeat(40),
        requestedModel: REQUIRED_EXECUTOR_MODEL,
      }
    );

    expect(trial.generationStatus).toBe('ok');
    expect(trial.boundPassed).toBe(true);
    expect(trial.generatedSql).toBe(cleanSql);
    expect(trial.sanitizedSql).toBe(cleanSql);
    expect(trial.sanitizedSha256).toBe(sha256(cleanSql));
    expect(trial.rawResponse).toBe(rawResp);
    expect(trial.rawSha256).toBe(sha256(rawResp));
  });

  it('model profile assigns consistent reasoning, maxTokens, and timeout settings', () => {
    const gemma26 = getModelProfile('gemma-4-26b-it');
    const gemma31 = getModelProfile('gemma-4-31b-it');
    const qwen = getModelProfile('qwen/qwen3.8-27b');
    const glm = getModelProfile('z-ai/glm-5.3-flash');

    expect(gemma26.model).toBe('gemma-4-26b-a4b-it');
    expect(gemma31.model).toBe('gemma-4-31b-it');
    expect(gemma26.maxTokens).toBe(8192);
    expect(gemma31.maxTokens).toBe(8192);
    expect(gemma26.timeoutMs).toBe(180_000);
    expect(qwen.extraRequestBody).toEqual({});
    expect(glm.extraRequestBody).toEqual({ reasoning_effort: 'low' });
  });
});
