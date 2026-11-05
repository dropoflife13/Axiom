// src/memory.ts
import fs from 'node:fs';
import path from 'node:path';

export const STATE_DIR = path.join(process.cwd(), '.axiom-state');
export const DEFAULT_MEMORY_FILE = path.join(STATE_DIR, 'memory.json');
export const MEMORY_FILE = DEFAULT_MEMORY_FILE;
const LEGACY_MEMORY_FILE = path.join(process.cwd(), 'memory.json');

export const MAX_STORED_LESSONS = 25;
export const MAX_INJECTED_LESSONS = 6;
export const MAX_LESSON_CHARS = 180;

export interface Lesson {
  errorCode: string;
  lesson: string;
  createdAt: string;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

  return jaccard >= 0.35;
}

export function loadMemory(memoryFilePath: string = DEFAULT_MEMORY_FILE): Lesson[] {
  let targetPath = memoryFilePath;
  if (!fs.existsSync(targetPath) && targetPath === DEFAULT_MEMORY_FILE && fs.existsSync(LEGACY_MEMORY_FILE)) {
    targetPath = LEGACY_MEMORY_FILE;
  }
  if (!fs.existsSync(targetPath)) return [];
  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  memoryFilePath: string = DEFAULT_MEMORY_FILE
): { saved: boolean; updated: boolean } {
  ensureDir(memoryFilePath);
  const memory = loadMemory(memoryFilePath);
  const sanitizedText = sanitizeLessonText(lesson.lesson);

  const existingIdx = memory.findIndex(
    (m) => m.errorCode === lesson.errorCode && isNearDuplicate(m.lesson, sanitizedText)
  );

  if (existingIdx !== -1) {
    memory[existingIdx].createdAt = lesson.createdAt;
    fs.writeFileSync(memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
    return { saved: false, updated: true };
  }

  memory.push({
    ...lesson,
    lesson: sanitizedText,
  });

  // Enforce FIFO Ring Buffer cap so disk/memory never grows unbounded
  const boundedMemory =
    memory.length > MAX_STORED_LESSONS
      ? memory.slice(memory.length - MAX_STORED_LESSONS)
      : memory;

  fs.writeFileSync(memoryFilePath, JSON.stringify(boundedMemory, null, 2), 'utf-8');
  return { saved: true, updated: false };
}

export function getRelevantLessons(
  errorCodes: string[],
  memoryFilePath: string = DEFAULT_MEMORY_FILE
): string {
  const memory = loadMemory(memoryFilePath);
  // If errorCodes is empty (e.g., Attempt 1 preload), take all lessons and deduplicate by errorCode
  const pool =
    errorCodes.length > 0
      ? memory.filter((m) => errorCodes.includes(m.errorCode))
      : memory;

  if (pool.length === 0) return '';

  // Deduplicate by errorCode (keep newest) and cap at MAX_INJECTED_LESSONS
  const byCode = new Map<string, Lesson>();
  for (const item of pool) {
    byCode.set(item.errorCode, item);
  }

  const bounded = Array.from(byCode.values()).slice(-MAX_INJECTED_LESSONS);
  return bounded.map((r) => `[${r.errorCode}] ${r.lesson}`).join('\n');
}
