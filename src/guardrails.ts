// src/guardrails.ts - Hard Process-Wide & Persistent Daily Billing Guard
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export interface DailyBudgetState {
  date: string; // YYYY-MM-DD UTC
  dailyCalls: number;
  dailyTier3Calls: number;
  updatedAt: string;
}

const DEFAULT_BUDGET_PATH = path.join(
  process.cwd(),
  '.axiom-state',
  process.env.VITEST ? 'budget.test.json' : 'budget.json'
);

export const BUDGET_GUARD = {
  maxTotalLlmCallsPerProcess: Number(process.env.AXIOM_MAX_LLM_CALLS || 15),
  maxTier3EscalationsPerProcess: Number(process.env.AXIOM_MAX_TIER3_CALLS || 2),
  maxPromptChars: Number(process.env.AXIOM_MAX_PROMPT_CHARS || 24_000),
  callTimeoutMs: Number(process.env.AXIOM_CALL_TIMEOUT_MS || 20_000),
  budgetFilePath: DEFAULT_BUDGET_PATH,

  currentLlmCalls: 0,
  currentTier3Calls: 0,
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyCap(): number {
  const raw = process.env.AXIOM_DAILY_CALLS;
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      '[BILLING_CIRCUIT_BREAKER] Halted: AXIOM_DAILY_CALLS is not set in .env (fail-closed).'
    );
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(
      `[BILLING_CIRCUIT_BREAKER] Halted: AXIOM_DAILY_CALLS ("${raw}") must be a positive integer (fail-closed).`
    );
  }
  return parsed;
}

export function readDailyBudget(filePath: string = BUDGET_GUARD.budgetFilePath): DailyBudgetState {
  const today = todayUtc();
  if (!fs.existsSync(filePath)) {
    return {
      date: today,
      dailyCalls: 0,
      dailyTier3Calls: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  let parsed: any;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(
      `[BILLING_CIRCUIT_BREAKER] Halted: Failed to parse daily budget file ${filePath} (fail-closed): ${err.message}`
    );
  }

  if (
    !parsed ||
    typeof parsed.date !== 'string' ||
    typeof parsed.dailyCalls !== 'number' ||
    !Number.isFinite(parsed.dailyCalls) ||
    parsed.dailyCalls < 0
  ) {
    throw new Error(
      `[BILLING_CIRCUIT_BREAKER] Halted: Corrupted daily budget schema in ${filePath} (fail-closed).`
    );
  }

  // If stored date is from a previous UTC day, roll over cleanly
  if (parsed.date !== today) {
    return {
      date: today,
      dailyCalls: 0,
      dailyTier3Calls: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    date: parsed.date,
    dailyCalls: parsed.dailyCalls,
    dailyTier3Calls: typeof parsed.dailyTier3Calls === 'number' ? parsed.dailyTier3Calls : 0,
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  };
}

export function writeDailyBudgetAtomic(
  state: DailyBudgetState,
  filePath: string = BUDGET_GUARD.budgetFilePath
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function resetBudgetGuard(): void {
  BUDGET_GUARD.currentLlmCalls = 0;
  BUDGET_GUARD.currentTier3Calls = 0;
  if (process.env.VITEST && fs.existsSync(BUDGET_GUARD.budgetFilePath)) {
    try {
      fs.unlinkSync(BUDGET_GUARD.budgetFilePath);
    } catch {
      // ignore if already removed
    }
  }
}

export const resetBudget = resetBudgetGuard;

export function assertBudgetAvailable(
  tier: 'EXECUTOR' | 'ADVISOR' | 'TIER_3',
  promptOrLength: string | number
): AbortSignal {
  const promptLength =
    typeof promptOrLength === 'number' ? promptOrLength : promptOrLength.length;

  // 1. Fail-closed persistent daily cap check (.axiom-state/budget.json)
  const dailyCap = getDailyCap();
  const dailyState = readDailyBudget(BUDGET_GUARD.budgetFilePath);

  if (dailyState.dailyCalls >= dailyCap) {
    throw new Error(
      `[BILLING_CIRCUIT_BREAKER] Halted: Reached persistent daily LLM call cap (${dailyState.dailyCalls}/${dailyCap}) in .axiom-state/budget.json.`
    );
  }

  // 2. Process-level cap check
  if (BUDGET_GUARD.currentLlmCalls >= BUDGET_GUARD.maxTotalLlmCallsPerProcess) {
    throw new Error(
      `[BILLING_CIRCUIT_BREAKER] Halted: Reached max process LLM calls (${BUDGET_GUARD.maxTotalLlmCallsPerProcess}).`
    );
  }

  if (
    tier === 'TIER_3' &&
    BUDGET_GUARD.currentTier3Calls >= BUDGET_GUARD.maxTier3EscalationsPerProcess
  ) {
    throw new Error(
      `[BILLING_CIRCUIT_BREAKER] Halted: Reached max Tier 3 heavy escalations (${BUDGET_GUARD.maxTier3EscalationsPerProcess}).`
    );
  }

  if (promptLength > BUDGET_GUARD.maxPromptChars) {
    throw new Error(
      `[BILLING_CIRCUIT_BREAKER] Halted: Prompt size (${promptLength} chars) exceeds safety cap (${BUDGET_GUARD.maxPromptChars}).`
    );
  }

  // Increment and persist daily counter BEFORE returning signal (fail-closed)
  dailyState.dailyCalls += 1;
  if (tier === 'TIER_3') {
    dailyState.dailyTier3Calls += 1;
  }
  dailyState.updatedAt = new Date().toISOString();
  writeDailyBudgetAtomic(dailyState, BUDGET_GUARD.budgetFilePath);

  BUDGET_GUARD.currentLlmCalls++;
  if (tier === 'TIER_3') {
    BUDGET_GUARD.currentTier3Calls++;
  }

  return AbortSignal.timeout(BUDGET_GUARD.callTimeoutMs);
}
