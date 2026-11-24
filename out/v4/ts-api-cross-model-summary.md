# Axiom-HOPE v4 Cross-Model TypeScript API Security Replication Summary

- **Cartridge:** `ts-api-security-v4` (`15` held-out TypeScript API security endpoints across financial payouts, multi-tenant admin exports, and user profile mutations)
- **Frozen Vaults:** `.axiom-state/v4/ts-api-c.json` (`18/47` = `38.3%` token retention) vs. `.axiom-state/v4/ts-api-cid-auto.json` (`47/47` = `100.0%` automated token retention via `extractRequiredTokens()`)
- **Protocol:** `K = 4` retrieval budget, `temperature = 0`, deterministic zero-LLM `esbuild` + `node:vm` execution oracle + unmodified 3-clock `AxiomHopeEngine`

## 1. Cross-Model 5-Arm Full-Task Pass Rate Comparison

| Model | Provider | Status | `A` | `C` | `C_ID_prereq` | `C_ID_auto` | `C_ID_hope` | `C_ID_auto - C` | `C_ID_hope - C` | `C_ID_hope - C_ID_prereq` |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `gemini-3.1-flash-lite` | Google AI Studio | 75/75 | 0.0% | 0.0% | 0.0% | 0.0% | **60.0%** | +0.0 pp | **+60.0 pp** | **+60.0 pp** |
| `gemma-4-31b-it` | Google AI Studio | 75/75 | 0.0% | 0.0% | 0.0% | 0.0% | **20.0%** | +0.0 pp | **+20.0 pp** | **+20.0 pp** |
| `qwen/qwen3.8-27b` | Groq | 75/75 | 0.0% | 0.0% | 0.0% | 0.0% | **66.7%** | +0.0 pp | **+66.7 pp** | **+66.7 pp** |
| **Pooled Mean (n=3)** | Multi-Provider | Complete | 0.0% | 0.0% | 0.0% | 0.0% | **48.9%** | +0.0 pp | **+48.9 pp** | **+48.9 pp** |

## 2. Cross-Model 5-Arm Mean Fact Pass Rate Comparison

| Model | `A` | `C` | `C_ID_prereq` | `C_ID_auto` | `C_ID_hope` | `C_ID_auto - C` | `C_ID_hope - C` | `C_ID_hope - C_ID_prereq` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `gemini-3.1-flash-lite` | 42.4% | 71.0% | 68.4% | 77.6% | **91.1%** | +6.6 pp | **+20.1 pp** | **+22.7 pp** |
| `gemma-4-31b-it` | 57.5% | 76.8% | 58.8% | 80.6% | **80.2%** | +3.8 pp | **+3.4 pp** | **+21.4 pp** |
| `qwen/qwen3.8-27b` | 55.6% | 66.5% | 57.7% | 71.7% | **90.8%** | +5.2 pp | **+24.3 pp** | **+33.1 pp** |
| **Pooled Mean (n=3)** | 51.8% | 71.4% | 61.6% | 76.6% | **87.4%** | +5.2 pp | **+16.0 pp** | **+25.7 pp** |

## 3. Slow Clock Governance Receipts (Accepted vs. Rejected Candidates per Model)

| Model | Candidate | Status | Gate Outcome | Target Delta (Full Pass) | Canary Regressions |
| :--- | :--- | :---: | :--- | :---: | :---: |
| `gemini-3.1-flash-lite` | `Q-STATIC-TS-PREREQ` | **REJECTED** | Rejected by `canary_replay` | -9.2 pp (0→0/15) | 0 |
| `gemini-3.1-flash-lite` | `Q-EDGE-TS-10-TS-04` | **REJECTED** | Rejected by `canary_replay` | -10.0 pp (0→0/5) | 0 |
| `gemini-3.1-flash-lite` | `Q-EDGE-TS-10-TS-05` | **REJECTED** | Rejected by `canary_replay` | -4.0 pp (0→0/5) | 0 |
| `gemini-3.1-flash-lite` | `Q-EDGE-TS-11-TS-04` | **REJECTED** | Rejected by `canary_replay` | -22.2 pp (0→0/5) | 0 |
| `gemini-3.1-flash-lite` | `Q-EDGE-TS-12-TS-04` | **REJECTED** | Rejected by `canary_replay` | +10.0 pp (0→0/5) | 4 (TSAPI-006, TSAPI-007, TSAPI-008, TSAPI-009) |
| `gemini-3.1-flash-lite` | `Q-REFINE-TS-04` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp (0→0/15) | 0 |
| `gemini-3.1-flash-lite` | `Q-REFINE-TS-12` | **APPROVED** | All 3 gates PASS | +22.5 pp (0→4/5) | 0 |
| `gemini-3.1-flash-lite` | `Q-REFINE-TS-05` | **APPROVED** | All 3 gates PASS | +8.3 pp (0→2/4) | 0 |
| `gemini-3.1-flash-lite` | `Q-ANCHOR-TS-10` | **REJECTED** | Rejected by `canary_replay` | -2.0 pp (0→1/5) | 0 |
| `gemini-3.1-flash-lite` | `Q-ANCHOR-TS-11` | **APPROVED** | All 3 gates PASS | +0.0 pp (2→4/5) | 0 |
| `gemma-4-31b-it` | `Q-STATIC-TS-PREREQ` | **REJECTED** | Rejected by `canary_replay` | -21.7 pp (0→0/15) | 0 |
| `gemma-4-31b-it` | `Q-EDGE-TS-10-TS-04` | **REJECTED** | Rejected by `canary_replay` | -18.0 pp (0→0/5) | 0 |
| `gemma-4-31b-it` | `Q-EDGE-TS-10-TS-05` | **APPROVED** | All 3 gates PASS | +10.0 pp (0→0/5) | 0 |
| `gemma-4-31b-it` | `Q-EDGE-TS-11-TS-04` | **REJECTED** | Rejected by `canary_replay` | -33.3 pp (0→0/5) | 0 |
| `gemma-4-31b-it` | `Q-EDGE-TS-12-TS-04` | **REJECTED** | Rejected by `canary_replay` | -5.0 pp (0→0/5) | 4 (TSAPI-006, TSAPI-007, TSAPI-008, TSAPI-009) |
| `gemma-4-31b-it` | `Q-REFINE-TS-04` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp (0→0/15) | 0 |
| `gemma-4-31b-it` | `Q-REFINE-TS-12` | **REJECTED** | Rejected by `canary_replay` | +25.0 pp (0→5/5) | 1 (TSAPI-009) |
| `gemma-4-31b-it` | `Q-ANCHOR-TS-10` | **REJECTED** | Rejected by `canary_replay` | -2.0 pp (0→3/5) | 0 |
| `gemma-4-31b-it` | `Q-ANCHOR-TS-11` | **APPROVED** | All 3 gates PASS | +2.2 pp (0→3/5) | 0 |
| `qwen/qwen3.8-27b` | `Q-STATIC-TS-PREREQ` | **REJECTED** | Rejected by `canary_replay` | -14.0 pp (0→0/15) | 0 |
| `qwen/qwen3.8-27b` | `Q-EDGE-TS-10-TS-04` | **APPROVED** | All 3 gates PASS | +4.0 pp (0→0/5) | 0 |
| `qwen/qwen3.8-27b` | `Q-EDGE-TS-10-TS-05` | **APPROVED** | All 3 gates PASS | +6.0 pp (0→0/5) | 0 |
| `qwen/qwen3.8-27b` | `Q-EDGE-TS-11-TS-09` | **APPROVED** | All 3 gates PASS | +55.6 pp (0→0/2) | 0 |
| `qwen/qwen3.8-27b` | `Q-EDGE-TS-11-TS-01` | **REJECTED** | Rejected by `canary_replay` | -11.1 pp (0→0/2) | 3 (TSAPI-006, TSAPI-008, TSAPI-010) |
| `qwen/qwen3.8-27b` | `Q-EDGE-TS-11-TS-04` | **REJECTED** | Rejected by `canary_replay` | -11.1 pp (0→0/2) | 1 (TSAPI-006) |
| `qwen/qwen3.8-27b` | `Q-EDGE-TS-12-TS-04` | **REJECTED** | Rejected by `canary_replay` | +12.5 pp (0→0/5) | 4 (TSAPI-006, TSAPI-007, TSAPI-008, TSAPI-009) |
| `qwen/qwen3.8-27b` | `Q-REFINE-TS-04` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp (0→0/15) | 0 |
| `qwen/qwen3.8-27b` | `Q-REFINE-TS-12` | **REJECTED** | Rejected by `canary_replay` | +25.0 pp (0→5/5) | 1 (TSAPI-007) |
| `qwen/qwen3.8-27b` | `Q-REFINE-TS-05` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp (0→0/2) | 1 (TSAPI-011) |
| `qwen/qwen3.8-27b` | `Q-ANCHOR-TS-10` | **APPROVED** | All 3 gates PASS | +10.0 pp (0→5/5) | 0 |
| `qwen/qwen3.8-27b` | `Q-ANCHOR-TS-11` | **APPROVED** | All 3 gates PASS | +13.3 pp (0→5/5) | 0 |
