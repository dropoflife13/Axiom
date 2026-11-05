// Process-wide hard budget circuit breaker to prevent API runaway and bill shock
export interface BudgetConfig {
  maxTotalLlmCallsPerProcess: number;
  maxTier3EscalationsPerProcess: number;
  maxPromptChars: number;
  callTimeoutMs: number;
  currentLlmCalls: number;
  currentTier3Calls: number;
}

export const BUDGET_GUARD: BudgetConfig = {
  maxTotalLlmCallsPerProcess: 15, // Hard ceiling across all runs in one process
  maxTier3EscalationsPerProcess: 2, // Never allow more than 2 expensive Tier 3 calls
  maxPromptChars: 24_000, // ~6,000 tokens max input to prevent prompt bloat billing
  callTimeoutMs: 20_000, // Hard 20s kill switch per API request

  currentLlmCalls: 0,
  currentTier3Calls: 0,
};

export function resetBudget(): void {
  BUDGET_GUARD.currentLlmCalls = 0;
  BUDGET_GUARD.currentTier3Calls = 0;
}

export function assertBudgetAvailable(
  tier: 'EXECUTOR' | 'ADVISOR' | 'TIER_3',
  prompt: string
): AbortSignal {
  if (BUDGET_GUARD.currentLlmCalls >= BUDGET_GUARD.maxTotalLlmCallsPerProcess) {
    throw new Error(
      `[BILLING CIRCUIT BREAKER] Halted: Reached max LLM calls (${BUDGET_GUARD.maxTotalLlmCallsPerProcess}).`
    );
  }

  if (
    tier === 'TIER_3' &&
    BUDGET_GUARD.currentTier3Calls >= BUDGET_GUARD.maxTier3EscalationsPerProcess
  ) {
    throw new Error(
      `[BILLING CIRCUIT BREAKER] Halted: Reached max Tier 3 heavy escalations (${BUDGET_GUARD.maxTier3EscalationsPerProcess}).`
    );
  }

  if (prompt.length > BUDGET_GUARD.maxPromptChars) {
    throw new Error(
      `[BILLING CIRCUIT BREAKER] Halted: Prompt length (${prompt.length} chars) exceeds safety cap (${BUDGET_GUARD.maxPromptChars}). Check memory bloat!`
    );
  }

  BUDGET_GUARD.currentLlmCalls++;
  if (tier === 'TIER_3') {
    BUDGET_GUARD.currentTier3Calls++;
  }

  // Return a native AbortSignal so hanging API calls never sit open
  return AbortSignal.timeout(BUDGET_GUARD.callTimeoutMs);
}
