# Axiom-HOPE v4 Cross-Model Policy-as-Code (ABAC) Replication Summary

- **Cartridge:** `policy-abac-v4` (`18` held-out Cedar-style ABAC tasks across banking, healthcare, and admin domains)
- **Frozen Vaults:** `.axiom-state/v4/policy-abac-c.json` (`6.4%` token retention) vs. `.axiom-state/v4/policy-abac-cid-auto.json` (`100.0%` automated token retention via `extractRequiredTokens()`)
- **Protocol:** `K = 4` retrieval budget, `temperature = 0`, deterministic zero-LLM Cedar execution oracle + unmodified 3-clock `AxiomHopeEngine`

## 1. Cross-Model 5-Arm Full-Task Pass Rate Comparison

| Model | Provider | Status | `A` | `C` | `C_ID_prereq` | `C_ID_auto` | `C_ID_hope` | `C_ID_auto - C` | `C_ID_hope - C` | `C_ID_hope - C_ID_prereq` |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `gemini-3.1-flash-lite` | Google AI Studio | 90/90 | 0.0% | 11.1% | 55.6% | 66.7% | **72.2%** | +55.6 pp | **+61.1 pp** | **+16.7 pp** |
| `gemma-4-31b-it` | Google AI Studio | 90/90 | 0.0% | 0.0% | 38.9% | 61.1% | **61.1%** | +61.1 pp | **+61.1 pp** | **+22.2 pp** |
| `qwen/qwen3.8-27b` | Groq | 90/90 | 0.0% | 0.0% | 50.0% | 72.2% | **77.8%** | +72.2 pp | **+77.8 pp** | **+27.8 pp** |
| **Pooled Mean (n=3)** | Multi-Provider | Complete | 0.0% | 3.7% | 48.1% | 66.7% | **70.4%** | +63.0 pp | **+66.7 pp** | **+22.2 pp** |

## 2. Cross-Model 5-Arm Mean Fact Pass Rate Comparison

| Model | `A` | `C` | `C_ID_prereq` | `C_ID_auto` | `C_ID_hope` | `C_ID_auto - C` | `C_ID_hope - C` | `C_ID_hope - C_ID_prereq` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `gemini-3.1-flash-lite` | 57.2% | 76.8% | 92.2% | 91.2% | **95.5%** | +14.3 pp | **+18.8 pp** | **+3.3 pp** |
| `gemma-4-31b-it` | 61.9% | 60.4% | 85.0% | 92.8% | **93.5%** | +32.5 pp | **+33.1 pp** | **+8.5 pp** |
| `qwen/qwen3.8-27b` | 30.4% | 60.3% | 91.3% | 94.9% | **96.5%** | +34.5 pp | **+36.2 pp** | **+5.2 pp** |
| **Pooled Mean (n=3)** | 49.8% | 65.8% | 89.5% | 92.9% | **95.2%** | +27.1 pp | **+29.4 pp** | **+5.7 pp** |

## 3. Slow Clock Governance Receipts (Accepted vs. Rejected Candidates per Model)

| Model | Candidate | Status | Gate Outcome | Target Delta | Canary Regressions |
| :--- | :--- | :---: | :--- | :---: | :---: |
| `gemini-3.1-flash-lite` | `Q-STATIC-P-01` | **REJECTED** | Rejected by `canary_replay` | +13.2 pp | 3 (ABAC-001, ABAC-014, ABAC-016) |
| `gemini-3.1-flash-lite` | `Q-P-06-P-02` | **APPROVED** | All 3 gates PASS | +12.5 pp | 0 |
| `gemini-3.1-flash-lite` | `Q-P-12-P-07` | **REJECTED** | Rejected by `canary_replay` | +8.3 pp | 1 (ABAC-010) |
| `gemini-3.1-flash-lite` | `Q-P-06-CONJUNCT` | **APPROVED** | All 3 gates PASS | +22.2 pp | 0 |
| `gemma-4-31b-it` | `Q-STATIC-P-01` | **REJECTED** | Rejected by `canary_replay` | -9.6 pp | 4 (ABAC-002, ABAC-003, ABAC-014, ABAC-016) |
| `gemma-4-31b-it` | `Q-P-06-P-02` | **APPROVED** | All 3 gates PASS | +12.5 pp | 0 |
| `gemma-4-31b-it` | `Q-P-06-P-01` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp | 2 (ABAC-002, ABAC-003) |
| `gemma-4-31b-it` | `Q-P-12-P-07` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp | 0 |
| `gemma-4-31b-it` | `Q-P-06-CONJUNCT` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp | 0 |
| `gemma-4-31b-it` | `Q-P-12-FRESH` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp | 0 |
| `qwen/qwen3.8-27b` | `Q-STATIC-P-01` | **REJECTED** | Rejected by `canary_replay` | +2.5 pp | 4 (ABAC-001, ABAC-006, ABAC-014, ABAC-016) |
| `qwen/qwen3.8-27b` | `Q-P-06-P-02` | **APPROVED** | All 3 gates PASS | +12.5 pp | 0 |
| `qwen/qwen3.8-27b` | `Q-P-12-P-07` | **APPROVED** | All 3 gates PASS | +8.3 pp | 0 |
| `qwen/qwen3.8-27b` | `Q-P-06-CONJUNCT` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp | 0 |
| `qwen/qwen3.8-27b` | `Q-P-12-FRESH` | **REJECTED** | Rejected by `canary_replay` | +0.0 pp | 0 |
