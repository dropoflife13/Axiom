// scripts/v3/d-safe-tips.ts
// Neutral distractor control tips for Condition D in Ablation v3 (D_safe).
// Purely descriptive, informational notes on PostgreSQL internal storage and engine architecture.
// Zero imperative DDL keywords (CREATE, ALTER, CONSTRAINT, FOREIGN KEY, PRIMARY KEY, REFERENCES, INDEX, PUBLIC, SCHEMA, public.).

export const DDL_KEYWORD_REGEX =
  /\b(CREATE|ALTER|CONSTRAINT|FOREIGN\s+KEY|PRIMARY\s+KEY|REFERENCES|INDEX|PUBLIC|SCHEMA)\b|public\./i;

export const D_SAFE_TIPS: readonly string[] = Object.freeze([
  'PostgreSQL tuple headers store 32-bit xmin and xmax transaction identifiers to determine row visibility under MVCC snapshot scans.',
  'B-tree relation pages implement the Lehman-Yao algorithm, storing downlink pointers to right-sibling blocks so concurrent traversals proceed during page splits.',
  'The write-ahead logging (WAL) engine enforces write-before-commit durability by flushing Log Sequence Numbers (LSN) to disk prior to buffer page writeback.',
  'The shared buffer pool uses a clock-sweep strategy where candidate buffer victim headers decrement usage counters until reaching zero during page eviction.',
  'Visibility map bitmasks track whether all tuples on a heap relation block are visible to all active transactions, enabling direct heap access skips.',
  'Free space maps (FSM) record available byte capacities across table blocks using binary tree page layouts to accelerate page space allocation.',
  'Autovacuum worker processes scan relation heap pages periodically to freeze ancient multixact identifiers and prevent 32-bit transaction counter wraparound.',
  'Checkpointer daemon processes synchronize dirty shared memory buffers with physical storage at configured intervals to bound crash recovery replay time.',
]);

export interface DSafeValidationResult {
  valid: boolean;
  tipCount: number;
  totalChars: number;
  estimatedTipTokens: number;
  estimatedTotalPromptTokens: number;
  violations: string[];
}

export function validateDSafeTips(tips: readonly string[] = D_SAFE_TIPS): DSafeValidationResult {
  const violations: string[] = [];

  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    const match = tip.match(DDL_KEYWORD_REGEX);
    if (match) {
      violations.push(`Tip ${i + 1} matches prohibited DDL token: "${match[0]}" in "${tip}"`);
    }
  }

  const hintText = tips.map((t) => `- ${t}`).join('\n');
  const totalChars = hintText.length;
  const estimatedTipTokens = Math.ceil(totalChars / 4);
  const basePromptChars = 810; // average system preamble + user prompt length
  const estimatedTotalPromptTokens = Math.ceil((basePromptChars + totalChars + 40) / 4);

  return {
    valid: violations.length === 0 && tips.length === 8,
    tipCount: tips.length,
    totalChars,
    estimatedTipTokens,
    estimatedTotalPromptTokens,
    violations,
  };
}

export function formatDSafeHint(tips: readonly string[] = D_SAFE_TIPS): string {
  const validation = validateDSafeTips(tips);
  if (!validation.valid) {
    throw new Error(`D_SAFE_TIPS validation failed: ${validation.violations.join('; ')}`);
  }
  return `UNRELATED POSTGRES INTERNALS:\n${tips.map((t) => `- ${t}`).join('\n')}`;
}
