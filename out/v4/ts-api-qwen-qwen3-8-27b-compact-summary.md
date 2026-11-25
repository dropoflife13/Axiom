# Axiom-HOPE v4 TypeScript API Security Pilot Summary — `qwen/qwen3.8-27b`

- **Cartridge:** `ts-api-security-v4` (15 held-out tasks × 5 arms = 75 trials)
- **Retrieval Budget:** `K = 4`, `temperature = 0`
- **Context Compaction (`--compact`):** 4186 -> 3979 tokens (**-4.95%**, 391/391 required tokens preserved)

## 1. 5-Arm Performance Table

| Arm | Full-Task Pass | Mean Fact Pass | Committed | TS-01 Retrieved | TS-04 Retrieved | TS-08 Retrieved |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `A` | 0/15 (0.0%) | 55.6% | 15/15 (100.0%) | 0/15 | 0/15 | 0/15 |
| `C` | 0/15 (0.0%) | 66.5% | 13/15 (86.7%) | 11/15 | 0/15 | 15/15 |
| `C_ID_auto` | 0/15 (0.0%) | 71.7% | 14/15 (93.3%) | 11/15 | 0/15 | 15/15 |
| `C_ID_prereq` | 0/15 (0.0%) | 57.7% | 12/15 (80.0%) | 14/15 | 10/15 | 1/15 |
| `C_ID_hope` | 10/15 (66.7%) | 91.7% | 15/15 (100.0%) | 6/15 | 5/15 | 15/15 |

## 2. Key Causal Contrasts

| Contrast | Effect Isolated | Full-Task Delta | Mean Fact Delta |
| :--- | :--- | :---: | :---: |
| `C_ID_auto - C` | Automated Lexical Identifier Lock | +0.0 pp | +5.2 pp |
| `C_ID_prereq - C_ID_auto` | Naive Static Prerequisite Injection (same K=4) | +0.0 pp | -14.0 pp |
| `C_ID_prereq - C` | Static Prereq + Lexical Lock vs. Unconstrained `C` | +0.0 pp | -8.8 pp |
| `C_ID_prereq - A` | Static Prereq vs. Zero-Shot Baseline | +0.0 pp | +2.1 pp |
| `C_ID_hope - C` | **Closed-Loop 3-Clock Axiom-HOPE vs. Unconstrained `C`** | **+66.7 pp** | **+25.2 pp** |
| `C_ID_hope - C_ID_auto` | **Slow-Clock Promoted Graph/Rule Governance vs. `C_ID_auto`** | **+66.7 pp** | **+20.0 pp** |
| `C_ID_hope - C_ID_prereq` | **Closed-Loop Canary-Gated HOPE vs. Naive Static Prereq** | **+66.7 pp** | **+34.0 pp** |
| `C_ID_hope - A` | **Closed-Loop Axiom-HOPE vs. Zero-Shot `A`** | **+66.7 pp** | **+36.1 pp** |

## 3. Forensic Defect Counts (out of 15 tasks per arm)

| Forensic Flag | `A` | `C` | `C_ID_auto` | `C_ID_prereq` | `C_ID_hope` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `leakedSecretIdentifier` | 0 | 1 | 1 | 0 | 0 |
| `missingErrorEnvelope` | 15 | 15 | 15 | 6 | 5 |
| `missingIdempotencyKey` | 5 | 0 | 0 | 0 | 0 |
| `missingNoStoreHeader` | 0 | 1 | 0 | 1 | 0 |
| `missingSafeParse` | 0 | 1 | 1 | 1 | 0 |
| `missingTenantCheck` | 7 | 2 | 2 | 2 | 0 |
| `syntaxError` | 0 | 2 | 1 | 3 | 0 |
