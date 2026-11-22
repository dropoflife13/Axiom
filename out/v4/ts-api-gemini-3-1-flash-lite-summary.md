# Axiom-HOPE v4 TypeScript API Security Pilot Summary — `gemini-3.1-flash-lite`

- **Cartridge:** `ts-api-security-v4` (15 held-out tasks × 5 arms = 75 trials)
- **Retrieval Budget:** `K = 4`, `temperature = 0`

## 1. 5-Arm Performance Table

| Arm | Full-Task Pass | Mean Fact Pass | Committed | TS-01 Retrieved | TS-04 Retrieved | TS-08 Retrieved |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `A` | 0/15 (0.0%) | 42.4% | 15/15 (100.0%) | 0/15 | 0/15 | 0/15 |
| `C` | 0/15 (0.0%) | 71.0% | 15/15 (100.0%) | 11/15 | 0/15 | 15/15 |
| `C_ID_auto` | 0/15 (0.0%) | 77.6% | 15/15 (100.0%) | 11/15 | 0/15 | 15/15 |
| `C_ID_prereq` | 0/15 (0.0%) | 68.4% | 15/15 (100.0%) | 14/15 | 10/15 | 1/15 |
| `C_ID_hope` | 9/15 (60.0%) | 91.1% | 15/15 (100.0%) | 11/15 | 0/15 | 15/15 |

## 2. Key Causal Contrasts

| Contrast | Effect Isolated | Full-Task Delta | Mean Fact Delta |
| :--- | :--- | :---: | :---: |
| `C_ID_auto - C` | Automated Lexical Identifier Lock | +0.0 pp | +6.6 pp |
| `C_ID_prereq - C_ID_auto` | Naive Static Prerequisite Injection (same K=4) | +0.0 pp | -9.2 pp |
| `C_ID_prereq - C` | Static Prereq + Lexical Lock vs. Unconstrained `C` | +0.0 pp | -2.6 pp |
| `C_ID_prereq - A` | Static Prereq vs. Zero-Shot Baseline | +0.0 pp | +26.0 pp |
| `C_ID_hope - C` | **Closed-Loop 3-Clock Axiom-HOPE vs. Unconstrained `C`** | **+60.0 pp** | **+20.1 pp** |
| `C_ID_hope - C_ID_auto` | **Slow-Clock Promoted Graph/Rule Governance vs. `C_ID_auto`** | **+60.0 pp** | **+13.5 pp** |
| `C_ID_hope - C_ID_prereq` | **Closed-Loop Canary-Gated HOPE vs. Naive Static Prereq** | **+60.0 pp** | **+22.7 pp** |
| `C_ID_hope - A` | **Closed-Loop Axiom-HOPE vs. Zero-Shot `A`** | **+60.0 pp** | **+48.7 pp** |

## 3. Forensic Defect Counts (out of 15 tasks per arm)

| Forensic Flag | `A` | `C` | `C_ID_auto` | `C_ID_prereq` | `C_ID_hope` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `leakedSecretIdentifier` | 0 | 0 | 0 | 0 | 0 |
| `missingErrorEnvelope` | 15 | 15 | 15 | 10 | 5 |
| `missingIdempotencyKey` | 5 | 0 | 0 | 0 | 0 |
| `missingNoStoreHeader` | 0 | 0 | 0 | 0 | 0 |
| `missingSafeParse` | 0 | 0 | 0 | 0 | 0 |
| `missingTenantCheck` | 4 | 0 | 1 | 1 | 0 |
| `syntaxError` | 0 | 0 | 0 | 0 | 0 |
