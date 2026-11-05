import fs from 'node:fs';
import path from 'node:path';

export const STATE_DIR = path.join(process.cwd(), '.axiom-state');
export const MEMORY_FILE = path.join(STATE_DIR, 'memory.json');
const LEGACY_MEMORY_FILE = path.join(process.cwd(), 'memory.json');

export const MAX_STORED_LESSONS = 25; // Ring-buffer cap on disk (FIFO eviction)
export const MAX_INJECTED_LESSONS = 8; // Never inject more than 8 lessons into the LLM prompt
export const MAX_LESSON_CHARS = 180; // Force Advisor lessons to stay 1 short sentence

export interface Lesson {
  errorCode: string;
  lesson: string;
  createdAt: string;
}

export function sanitizeAndCapLesson(rawLesson: string): string {
  // Strip newlines/markdown bloat and hard-truncate at 180 chars
  return rawLesson.replace(/\s+/g, ' ').trim().slice(0, MAX_LESSON_CHARS);
}

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

export function loadMemory(memoryFilePath: string = MEMORY_FILE): Lesson[] {
  let targetPath = memoryFilePath;
  if (!fs.existsSync(targetPath) && targetPath === MEMORY_FILE && fs.existsSync(LEGACY_MEMORY_FILE)) {
    targetPath = LEGACY_MEMORY_FILE;
  }
  if (!fs.existsSync(targetPath)) return [];
  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLesson(
  lesson: Lesson,
  memoryFilePath: string = MEMORY_FILE
): { saved: boolean; updated: boolean } {
  // Sanitize and cap length
  const sanitizedLesson: Lesson = {
    errorCode: lesson.errorCode,
    lesson: sanitizeAndCapLesson(lesson.lesson),
    createdAt: lesson.createdAt,
  };

  const targetDir = path.dirname(memoryFilePath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const memory = loadMemory(memoryFilePath);
  const existingIdx = memory.findIndex(
    (m) => m.errorCode === sanitizedLesson.errorCode && isNearDuplicate(m.lesson, sanitizedLesson.lesson)
  );

  if (existingIdx !== -1) {
    // Near duplicate found: update timestamp, do not append duplicate
    memory[existingIdx].createdAt = sanitizedLesson.createdAt;
    fs.writeFileSync(memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
    return { saved: false, updated: true };
  }

  memory.push(sanitizedLesson);

  // FIFO ring-buffer cap: keep only the newest MAX_STORED_LESSONS
  while (memory.length > MAX_STORED_LESSONS) {
    memory.shift();
  }

  fs.writeFileSync(memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
  return { saved: true, updated: false };
}

export function getRelevantLessons(
  errorCodes: string[],
  memoryFilePath: string = MEMORY_FILE
): string {
  const memory = loadMemory(memoryFilePath);
  const relevant = memory.filter((m) => errorCodes.includes(m.errorCode));
  if (relevant.length === 0) return '';

  // Limit injected lessons to the last MAX_INJECTED_LESSONS to prevent prompt bloat
  const bounded = relevant.slice(-MAX_INJECTED_LESSONS);
  return bounded.map((r, i) => `[${r.errorCode}] ${r.lesson}`).join('\n');
}
