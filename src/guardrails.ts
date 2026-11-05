// src/guardrails.ts - Hard Process-Wide Billing & Timeout Guard
export const BUDGET_GUARD = {
  maxTotalLlmCallsPerProcess: Number(process.env.AXIOM_MAX_LLM_CALLS || 15),
  maxTier3EscalationsPerProcess: Number(process.env.AXIOM_MAX_TIER3_CALLS || 2),
  maxPromptChars: Number(process.env.AXIOM_MAX_PROMPT_CHARS || 24_000),
  callTimeoutMs: Number(process.env.AXIOM_CALL_TIMEOUT_MS || 20_000),

  currentLlmCalls: 0,
  currentTier3Calls: 0,
};

export function resetBudgetGuard(): void {
  BUDGET_GUARD.currentLlmCalls = 0;
  BUDGET_GUARD.currentTier3Calls = 0;
}

export const resetBudget = resetBudgetGuard;

export function assertBudgetAvailable(
  tier: 'EXECUTOR' | 'ADVISOR' | 'TIER_3',
  promptOrLength: string | number
): AbortSignal {
  const promptLength =
    typeof promptOrLength === 'number' ? promptOrLength : promptOrLength.length;

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

  BUDGET_GUARD.currentLlmCalls++;
  if (tier === 'TIER_3') {
    BUDGET_GUARD.currentTier3Calls++;
  }

  return AbortSignal.timeout(BUDGET_GUARD.callTimeoutMs);
}
