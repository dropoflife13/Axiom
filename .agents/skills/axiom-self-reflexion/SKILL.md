---
name: axiom-self-reflexion
description: Zero-API-cost 3-clock self-reflexion workflow that captures recurring local build, test, lint, or compiler fixes and promotes lexical-locked, deduplicated rules into LEARNED_RULES.md after passing deterministic tsc and Vitest gates.
---

# Axiom Self-Reflexion Skill

Turn recurring local build, typecheck, test, or compiler fixes (`tsc`, `vitest`, `next build`, `cargo`) into verified, compact, lexical-locked workspace rules with zero LLM API calls.

## Safety Rules

- **Never** modify frozen v2/v3 checkpoints, vaults, `docs/AXIOM-PAPER.md`, `docs/AXIOM-V3-PAPER-RESULTS.md`, or `src/v4/hope/slow-clock.ts`.
- **Never** auto-edit `GEMINI.md` or active skill files without passing the deterministic canary gate (`npx tsc --noEmit` + `npm test`, both exiting `0`).
- All promoted rules must retain **100%** of their extracted operational tokens (`extractRequiredTokens()`) after compaction (`compactRuleText()`).

## 3-Clock Workflow

### 1. Fast Clock — Capture Resolved Failures
Whenever a `tsc`, `vitest`, `next build`, or `cargo` command fails and is later resolved in the same session, record a structured trace:

```bash
npx tsx scripts/v4/reflexion-capture.ts \
  --signature "<stable-error-signature>" \
  --command "<failing-command>" \
  --fix "<minimal-verified-fix>" \
  --rule "<imperative-rule-preserving-exact-tokens>"
```

- Appends a timestamped JSONL record to `.axiom-state/v4/reflexion-traces.jsonl` (gitignored).
- Include exact operational tokens/APIs/flags/file paths in `--rule` so `extractRequiredTokens()` locks them verbatim.

### 2. Quarantine — Automatic Staging
- When the same `--signature` reaches **count >= 2** in `.axiom-state/v4/reflexion-traces.jsonl`, `reflexion-capture.ts` automatically stages a candidate rule in `.axiom-state/v4/reflexion-quarantine.json`.
- To stage a high-value rule immediately on first occurrence, pass `--force-stage` (or `--promote-candidate`).

### 3. Slow Clock — Compact, Deduplicate, Gate & Promote
Run the deterministic promoter to evaluate all staged candidates:

```bash
npx tsx scripts/v4/reflexion-promote.ts
```

Optional flags:
- `--dry-run`: Run compaction, rot/redundancy checks, and canary gate without writing `LEARNED_RULES.md` or receipts.
- `--skip-tests`: Skip `npx tsc --noEmit` and `npm test` (for isolated unit tests only — never use for real promotions).

Promotion pipeline for each staged candidate:
1. **Lexical Lock & Compaction:** Extracts required operational tokens via `extractRequiredTokens()` and compacts prose via `compactRuleText()` while asserting `100%` lexical token retention.
2. **Context-Rot Deduplication:** Checks each candidate against existing rules in `.agents/skills/axiom-self-reflexion/LEARNED_RULES.md` using `detectContextRot()` (blocks candidates with Jaccard similarity `>= 0.65`).
3. **Deterministic Canary Gate:** Runs `npx tsc --noEmit` and `npm test` (`exit 0` required). If either fails, zero rules are promoted.
4. **Commit & Cryptographic Receipt:** Appends approved rules to `.agents/skills/axiom-self-reflexion/LEARNED_RULES.md` and records an immutable SHA-256 receipt in `.axiom-state/v4/reflexion-receipts.jsonl`.

## Reading Learned Rules
Before debugging a recurring build/test failure in this workspace, check [LEARNED_RULES.md](LEARNED_RULES.md) for previously verified fixes.
