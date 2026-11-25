# Axiom-HOPE v4 TypeScript API Security Pilot Summary — `gemma-4-31b-it`

- **Cartridge:** `ts-api-security-v4` (15 held-out tasks × 5 arms = 75 trials)
- **Retrieval Budget:** `K = 4`, `temperature = 0`
- **Context Compaction (`--compact`):** 3977 -> 3808 tokens (**-4.25%**, 359/359 required tokens preserved)

## 1. 5-Arm Performance Table

| Arm | Full-Task Pass | Mean Fact Pass | Committed | TS-01 Retrieved | TS-04 Retrieved | TS-08 Retrieved |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `A` | 0/15 (0.0%) | 57.5% | 15/15 (100.0%) | 0/15 | 0/15 | 0/15 |
| `C` | 0/15 (0.0%) | 76.8% | 15/15 (100.0%) | 11/15 | 0/15 | 15/15 |
| `C_ID_auto` | 0/15 (0.0%) | 80.6% | 15/15 (100.0%) | 11/15 | 0/15 | 15/15 |
| `C_ID_prereq` | 0/15 (0.0%) | 58.8% | 15/15 (100.0%) | 14/15 | 10/15 | 1/15 |
| `C_ID_hope` | 8/15 (53.3%) | 95.2% | 15/15 (100.0%) | 6/15 | 0/15 | 15/15 |

## 2. Key Causal Contrasts

| Contrast | Effect Isolated | Full-Task Delta | Mean Fact Delta |
| :--- | :--- | :---: | :---: |
| `C_ID_auto - C` | Automated Lexical Identifier Lock | +0.0 pp | +3.8 pp |
| `C_ID_prereq - C_ID_auto` | Naive Static Prerequisite Injection (same K=4) | +0.0 pp | -21.7 pp |
| `C_ID_prereq - C` | Static Prereq + Lexical Lock vs. Unconstrained `C` | +0.0 pp | -17.9 pp |
| `C_ID_prereq - A` | Static Prereq vs. Zero-Shot Baseline | +0.0 pp | +1.3 pp |
| `C_ID_hope - C` | **Closed-Loop 3-Clock Axiom-HOPE vs. Unconstrained `C`** | **+53.3 pp** | **+18.4 pp** |
| `C_ID_hope - C_ID_auto` | **Slow-Clock Promoted Graph/Rule Governance vs. `C_ID_auto`** | **+53.3 pp** | **+14.6 pp** |
| `C_ID_hope - C_ID_prereq` | **Closed-Loop Canary-Gated HOPE vs. Naive Static Prereq** | **+53.3 pp** | **+36.4 pp** |
| `C_ID_hope - A` | **Closed-Loop Axiom-HOPE vs. Zero-Shot `A`** | **+53.3 pp** | **+37.7 pp** |

## 3. Forensic Defect Counts (out of 15 tasks per arm)

| Forensic Flag | `A` | `C` | `C_ID_auto` | `C_ID_prereq` | `C_ID_hope` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `leakedSecretIdentifier` | 0 | 0 | 1 | 0 | 0 |
| `missingErrorEnvelope` | 15 | 15 | 15 | 15 | 6 |
| `missingIdempotencyKey` | 2 | 0 | 0 | 0 | 0 |
| `missingNoStoreHeader` | 0 | 0 | 0 | 0 | 0 |
| `missingSafeParse` | 0 | 0 | 0 | 0 | 0 |
| `missingTenantCheck` | 0 | 1 | 0 | 0 | 0 |
| `syntaxError` | 0 | 0 | 0 | 0 | 0 |
