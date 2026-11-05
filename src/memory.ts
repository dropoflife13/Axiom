import fs from 'node:fs';
import path from 'node:path';

const MEMORY_FILE = path.join(process.cwd(), 'memory.json');

export interface Lesson {
  errorCode: string;
  lesson: string;
  createdAt: string;
}

export function loadMemory(): Lesson[] {
  if (!fs.existsSync(MEMORY_FILE)) return [];
  try {
    const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLesson(lesson: Lesson): void {
  const memory = loadMemory();
  memory.push(lesson);
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
}

export function getRelevantLessons(errorCodes: string[]): string {
  const memory = loadMemory();
  const relevant = memory.filter((m) => errorCodes.includes(m.errorCode));
  if (relevant.length === 0) return '';
  return relevant.map((r) => `[${r.errorCode}] ${r.lesson}`).join('\n');
}

