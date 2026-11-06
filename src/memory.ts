// src/memory.ts
import fs from 'node:fs';
import path from 'node:path';

export const STATE_DIR = path.join(process.cwd(), '.axiom-state');
export const DEFAULT_MEMORY_FILE = path.join(STATE_DIR, 'memory.json');
export const MEMORY_FILE = DEFAULT_MEMORY_FILE;
const LEGACY_MEMORY_FILE = path.join(process.cwd(), 'memory.json');

export const MAX_STORED_LESSONS = 25;
export const LESSON_TOP_K = 6;
export const MAX_INJECTED_LESSONS = LESSON_TOP_K;
export const MAX_LESSON_CHARS = 180;

export interface FeatureFlags {
  tenant: boolean;
  append_only: boolean;
  ingestion: boolean;
}

export interface ObservedFeatures {
  seenWhenTenantTrue: boolean;
  seenWhenTenantFalse: boolean;
  seenWhenAppendOnlyTrue: boolean;
  seenWhenAppendOnlyFalse: boolean;
  seenWhenIngestionTrue: boolean;
  seenWhenIngestionFalse: boolean;
}

export interface Lesson {
  errorCode: string;
  factId?: string;
  lesson: string;
  features?: FeatureFlags;
  observedFeatures?: ObservedFeatures;
  utilityScore?: number;
  tags?: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export function mergeObservedFeatures(
  existing?: ObservedFeatures,
  features?: FeatureFlags
): ObservedFeatures | undefined {
  if (!existing && !features) return undefined;
  const merged: ObservedFeatures = existing
    ? { ...existing }
    : {
        seenWhenTenantTrue: false,
        seenWhenTenantFalse: false,
        seenWhenAppendOnlyTrue: false,
        seenWhenAppendOnlyFalse: false,
        seenWhenIngestionTrue: false,
        seenWhenIngestionFalse: false,
      };

  if (features) {
    if (features.tenant) merged.seenWhenTenantTrue = true;
    else merged.seenWhenTenantFalse = true;

    if (features.append_only) merged.seenWhenAppendOnlyTrue = true;
    else merged.seenWhenAppendOnlyFalse = true;

    if (features.ingestion) merged.seenWhenIngestionTrue = true;
    else merged.seenWhenIngestionFalse = true;
  }

  return merged;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function writeMemoryAtomic(filePath: string, data: Lesson[]): void {
  ensureDir(filePath);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function sanitizeLessonText(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= MAX_LESSON_CHARS) return cleaned;
  return cleaned.slice(0, MAX_LESSON_CHARS - 3).trimEnd() + '...';
}

export const sanitizeAndCapLesson = sanitizeLessonText;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u00A0\u202F]/g, ' ')
    .trim();
}

export function isNearDuplicate(a: string, b: string): boolean {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (normA === normB) return true;

  // Substring or prefix match
  if (normA.slice(0, 40) === normB.slice(0, 40) && normA.length > 20) return true;

  // Pattern detection: if both mention the same core regex or rule token
  const patternMatchA = normA.match(/\[a-z\]\{1,5\}|conf:\s*\d|rule\s+id/g);
  const patternMatchB = normB.match(/\[a-z\]\{1,5\}|conf:\s*\d|rule\s+id/g);
  if (patternMatchA && patternMatchB) {
    const commonPattern = patternMatchA.some((p) => patternMatchB.includes(p));
    if (commonPattern) return true;
  }

  // Word token Jaccard similarity
  const wordsA = new Set(
    normA.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    normB.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
  );
  if (wordsA.size === 0 && wordsB.size === 0) return true;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = union === 0 ? 1 : intersection / union;

  return jaccard >= 0.60;
}

export function loadMemory(memoryFilePath: string = DEFAULT_MEMORY_FILE): Lesson[] {
  let targetPath = memoryFilePath;
  if (!fs.existsSync(targetPath) && targetPath === DEFAULT_MEMORY_FILE && fs.existsSync(LEGACY_MEMORY_FILE)) {
    targetPath = LEGACY_MEMORY_FILE;
  }
  if (!fs.existsSync(targetPath)) return [];

  const raw = fs.readFileSync(targetPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    const backupPath = `${targetPath}.bak.${Date.now()}`;
    fs.renameSync(targetPath, backupPath);
    throw new Error(
      `Corrupted memory JSON in ${targetPath}; renamed to ${path.basename(backupPath)}: ${err.message}`
    );
  }

  if (!Array.isArray(parsed)) {
    const backupPath = `${targetPath}.bak.${Date.now()}`;
    fs.renameSync(targetPath, backupPath);
    throw new Error(
      `Invalid memory JSON root (expected array) in ${targetPath}; renamed to ${path.basename(backupPath)}`
    );
  }

  return parsed as Lesson[];
}

export function hasLessonForCode(
  errorCode: string,
  memoryFilePath: string = DEFAULT_MEMORY_FILE
): boolean {
  const memory = loadMemory(memoryFilePath);
  return memory.some((m) => m.errorCode === errorCode);
}

export function saveLesson(
  lesson: Lesson,
  memoryFilePath: string = DEFAULT_MEMORY_FILE,
  maxStoredLessons: number = MAX_STORED_LESSONS
): { saved: boolean; updated: boolean } {
  ensureDir(memoryFilePath);
  const memory = loadMemory(memoryFilePath);
  const sanitizedText = sanitizeLessonText(lesson.lesson);
  const lastUsedAt = lesson.lastUsedAt ?? lesson.createdAt;
  const factId = lesson.factId ?? lesson.errorCode;

  // Keep strictly one lesson per errorCode; increment utilityScore and accumulate observedFeatures when re-observed on Train
  const existingIdx = memory.findIndex((m) => m.errorCode === lesson.errorCode);

  if (existingIdx !== -1) {
    const prevUtility = memory[existingIdx].utilityScore ?? 1;
    const mergedObserved = mergeObservedFeatures(
      lesson.observedFeatures ?? memory[existingIdx].observedFeatures,
      lesson.features
    );
    memory[existingIdx] = {
      ...memory[existingIdx],
      factId,
      lesson: sanitizedText,
      features: lesson.features ?? memory[existingIdx].features,
      observedFeatures: mergedObserved,
      utilityScore: lesson.utilityScore ?? prevUtility + 1,
      tags: lesson.tags ?? memory[existingIdx].tags,
      createdAt: lesson.createdAt,
      lastUsedAt,
    };
    writeMemoryAtomic(memoryFilePath, memory);
    return { saved: false, updated: true };
  }

  const initialObserved = mergeObservedFeatures(lesson.observedFeatures, lesson.features);
  memory.push({
    ...lesson,
    factId,
    lesson: sanitizedText,
    observedFeatures: initialObserved,
    utilityScore: lesson.utilityScore ?? 1,
    lastUsedAt,
  });

  // Order eviction by lastUsedAt (least recently used evicted first)
  let boundedMemory = memory;
  if (memory.length > maxStoredLessons) {
    const sorted = [...memory].sort((a, b) => {
      const tA = a.lastUsedAt ?? a.createdAt;
      const tB = b.lastUsedAt ?? b.createdAt;
      return tA.localeCompare(tB);
    });
    boundedMemory = sorted.slice(sorted.length - maxStoredLessons);
  }

  writeMemoryAtomic(memoryFilePath, boundedMemory);
  return { saved: true, updated: false };
}

/**
 * Checks whether a lesson is compatible with the target task's { tenant, append_only, ingestion } flags.
 * Infers compatibility purely from the empirical seenWhen* tallies accumulated across the tasks where
 * the lesson was observed, with zero hardcoded knowledge of fact IDs.
 */
export function isLessonCompatibleWithTask(
  taskFeatures: FeatureFlags,
  lesson: Lesson
): boolean {
  const obs = lesson.observedFeatures;

  if (obs) {
    if (obs.seenWhenTenantTrue && !obs.seenWhenTenantFalse && !taskFeatures.tenant) {
      return false;
    }
    if (obs.seenWhenAppendOnlyTrue && !obs.seenWhenAppendOnlyFalse && !taskFeatures.append_only) {
      return false;
    }
    if (obs.seenWhenAppendOnlyFalse && !obs.seenWhenAppendOnlyTrue && taskFeatures.append_only) {
      return false;
    }
    if (obs.seenWhenIngestionTrue && !obs.seenWhenIngestionFalse && !taskFeatures.ingestion) {
      return false;
    }
    return true;
  }

  if (lesson.features) {
    if (lesson.features.tenant && !taskFeatures.tenant) return false;
    if (lesson.features.append_only && !taskFeatures.append_only) return false;
    if (lesson.features.ingestion && !taskFeatures.ingestion) return false;
  }

  return true;
}

/**
 * Computes the feature-flag match score between a compatible lesson and a task's { tenant, append_only, ingestion } flags
 * strictly from empirically observed flags (observedFeatures / features).
 * Never inspects task text, prompt tokens, SQL strings, or hardcoded fact tables.
 */
export function computeFeatureOverlapScore(
  taskFeatures: FeatureFlags,
  lesson: Lesson
): number {
  let score = 0;
  const obs = lesson.observedFeatures;

  if (obs) {
    const reqTenant = obs.seenWhenTenantTrue && !obs.seenWhenTenantFalse;
    const reqAppendOnlyTrue = obs.seenWhenAppendOnlyTrue && !obs.seenWhenAppendOnlyFalse;
    const reqAppendOnlyFalse = obs.seenWhenAppendOnlyFalse && !obs.seenWhenAppendOnlyTrue;
    const reqIngestion = obs.seenWhenIngestionTrue && !obs.seenWhenIngestionFalse;

    if (reqTenant && taskFeatures.tenant) score += 2;
    if (reqAppendOnlyTrue && taskFeatures.append_only) score += 2;
    if (reqAppendOnlyFalse && !taskFeatures.append_only) score += 2;
    if (reqIngestion && taskFeatures.ingestion) score += 2;

    if (reqTenant === taskFeatures.tenant) score += 1;
    if (reqAppendOnlyTrue === taskFeatures.append_only) score += 1;
    if (reqIngestion === taskFeatures.ingestion) score += 1;
    return score;
  }

  if (lesson.features) {
    if (lesson.features.tenant && taskFeatures.tenant) score += 2;
    if (lesson.features.append_only && taskFeatures.append_only) score += 2;
    if (lesson.features.ingestion && taskFeatures.ingestion) score += 2;

    if (lesson.features.tenant === taskFeatures.tenant) score += 1;
    if (lesson.features.append_only === taskFeatures.append_only) score += 1;
    if (lesson.features.ingestion === taskFeatures.ingestion) score += 1;
  }

  return score;
}

/**
 * Retrieves top-k lessons (default LESSON_TOP_K = 6) strictly by:
 * 1. Filtering out lessons whose feature prerequisites conflict with taskFeatures, and
 * 2. Ranking compatible lessons by (utilityScore, featureMatchScore) descending.
 * Zero task text is inspected.
 */
export function retrieveLessonsByFeatures(
  taskFeatures: FeatureFlags,
  memoryOrPath: Lesson[] | string = DEFAULT_MEMORY_FILE,
  topK: number = LESSON_TOP_K
): Lesson[] {
  const isFilePath = typeof memoryOrPath === 'string';
  const memory = isFilePath ? loadMemory(memoryOrPath) : [...memoryOrPath];
  if (memory.length === 0) return [];

  // Deduplicate by errorCode (keep one per errorCode)
  const byCode = new Map<string, Lesson>();
  for (const item of memory) {
    byCode.set(item.errorCode, item);
  }
  const uniqueLessons = Array.from(byCode.values());

  // 1. Filter out lessons that are incompatible with taskFeatures
  const compatible = uniqueLessons.filter((lesson) =>
    isLessonCompatibleWithTask(taskFeatures, lesson)
  );

  // 2. Score each compatible lesson by featureMatchScore and utilityScore
  const scored = compatible.map((lesson) => ({
    lesson,
    featureMatchScore: computeFeatureOverlapScore(taskFeatures, lesson),
    utilityScore: lesson.utilityScore ?? 1,
  }));

  // Rank compatible lessons by:
  // (a) whether utilityScore > 0 (lessons actually violated on Train beat unviolated baseline facts),
  // (b) featureMatchScore + utilityScore weighting,
  // (c) deterministic tie-breakers (lastUsedAt desc, errorCode asc).
  scored.sort((a, b) => {
    const aActive = a.utilityScore > 0 ? 1 : 0;
    const bActive = b.utilityScore > 0 ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;

    const aCombined = a.featureMatchScore * 10 + a.utilityScore;
    const bCombined = b.featureMatchScore * 10 + b.utilityScore;
    if (bCombined !== aCombined) return bCombined - aCombined;

    if (b.featureMatchScore !== a.featureMatchScore) {
      return b.featureMatchScore - a.featureMatchScore;
    }
    if (b.utilityScore !== a.utilityScore) {
      return b.utilityScore - a.utilityScore;
    }
    const tA = a.lesson.lastUsedAt ?? a.lesson.createdAt ?? '';
    const tB = b.lesson.lastUsedAt ?? b.lesson.createdAt ?? '';
    if (tB !== tA) return tB.localeCompare(tA);
    return a.lesson.errorCode.localeCompare(b.lesson.errorCode);
  });

  const selected = scored.slice(0, topK).map((s) => s.lesson);

  if (isFilePath && selected.length > 0 && fs.existsSync(memoryOrPath)) {
    const now = new Date().toISOString();
    const injectedCodes = new Set(selected.map((b) => b.errorCode));
    let updated = false;
    for (const item of memory) {
      if (injectedCodes.has(item.errorCode)) {
        item.lastUsedAt = now;
        updated = true;
      }
    }
    if (updated) {
      writeMemoryAtomic(memoryOrPath, memory);
    }
  }

  return selected;
}

export function formatRetrievedLessons(lessons: Lesson[]): string {
  return lessons.map((r) => `[${r.errorCode}] ${r.lesson}`).join('\n');
}

export function getRelevantLessons(
  errorCodes: string[],
  memoryFilePath: string = DEFAULT_MEMORY_FILE
): string {
  const memory = loadMemory(memoryFilePath);
  const pool =
    errorCodes.length > 0
      ? memory.filter((m) => errorCodes.includes(m.errorCode))
      : memory;

  if (pool.length === 0) return '';

  // Deduplicate by errorCode (keep one per errorCode) and order by lastUsedAt
  const byCode = new Map<string, Lesson>();
  for (const item of pool) {
    byCode.set(item.errorCode, item);
  }

  const bounded = Array.from(byCode.values()).slice(-LESSON_TOP_K);
  const now = new Date().toISOString();
  const injectedCodes = new Set(bounded.map((b) => b.errorCode));

  let updated = false;
  for (const item of memory) {
    if (injectedCodes.has(item.errorCode)) {
      item.lastUsedAt = now;
      updated = true;
    }
  }

  if (updated && fs.existsSync(memoryFilePath)) {
    writeMemoryAtomic(memoryFilePath, memory);
  }

  return formatRetrievedLessons(bounded);
}
