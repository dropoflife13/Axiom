import fs from 'node:fs';
import path from 'node:path';

const MEMORY_FILE = path.join(process.cwd(), 'memory.json');

export interface Lesson {
  errorCode: string;
  lesson: string;
  createdAt: string;
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
  if (!fs.existsSync(memoryFilePath)) return [];
  try {
    const raw = fs.readFileSync(memoryFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLesson(
  lesson: Lesson,
  memoryFilePath: string = MEMORY_FILE
): { saved: boolean; updated: boolean } {
  const memory = loadMemory(memoryFilePath);
  const existingIdx = memory.findIndex(
    (m) => m.errorCode === lesson.errorCode && isNearDuplicate(m.lesson, lesson.lesson)
  );

  if (existingIdx !== -1) {
    // Near duplicate found: update timestamp, do not append duplicate
    memory[existingIdx].createdAt = lesson.createdAt;
    fs.writeFileSync(memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
    return { saved: false, updated: true };
  }

  memory.push(lesson);
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
  return relevant.map((r) => `[${r.errorCode}] ${r.lesson}`).join('\n');
}
