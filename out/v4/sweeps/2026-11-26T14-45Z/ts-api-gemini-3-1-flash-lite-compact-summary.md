# Axiom-HOPE v4 TypeScript API Security Pilot Summary — `gemini-3.1-flash-lite`

- **Cartridge:** `ts-api-security-v4` (15 held-out tasks × 5 arms = 75 trials)
- **Retrieval Budget:** `K = 4`, `temperature = 0`
- **Context Compaction (`--compact`):** 20231 -> 19367 tokens (**-4.27%**, 1777/1777 required tokens preserved)

## 1. 5-Arm Performance Table

| Arm | Full-Task Pass | Mean Fact Pass | Committed | TS-01 Retrieved | TS-04 Retrieved | TS-08 Retrieved |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `A` | 0/15 (0.0%) | 42.4% | 15/15 (100.0%) | 0/15 | 0/15 | 0/15 |
| `C` | 0/15 (0.0%) | 71.0% | 15/15 (100.0%) | 11/15 | 0/15 | 15/15 |
| `C_ID_auto` | 0/15 (0.0%) | 77.6% | 15/15 (100.0%) | 11/15 | 0/15 | 15/15 |
| `C_ID_prereq` | 0/15 (0.0%) | 68.4% | 15/15 (100.0%) | 14/15 | 10/15 | 1/15 |
| `C_ID_hope` | 13/15 (86.7%) | 98.7% | 15/15 (100.0%) | 6/15 | 5/15 | 15/15 |

## 2. Key Causal Contrasts

| Contrast | Effect Isolated | Full-Task Delta | Mean Fact Delta |
| :--- | :--- | :---: | :---: |
| `C_ID_auto - C` | Automated Lexical Identifier Lock | +0.0 pp | +6.6 pp |
| `C_ID_prereq - C_ID_auto` | Naive Static Prerequisite Injection (same K=4) | +0.0 pp | -9.2 pp |
| `C_ID_prereq - C` | Static Prereq + Lexical Lock vs. Unconstrained `C` | +0.0 pp | -2.6 pp |
| `C_ID_prereq - A` | Static Prereq vs. Zero-Shot Baseline | +0.0 pp | +26.0 pp |
| `C_ID_hope - C` | **Closed-Loop 3-Clock Axiom-HOPE vs. Unconstrained `C`** | **+86.7 pp** | **+27.7 pp** |
| `C_ID_hope - C_ID_auto` | **Slow-Clock Promoted Graph/Rule Governance vs. `C_ID_auto`** | **+86.7 pp** | **+21.1 pp** |
| `C_ID_hope - C_ID_prereq` | **Closed-Loop Canary-Gated HOPE vs. Naive Static Prereq** | **+86.7 pp** | **+30.3 pp** |
| `C_ID_hope - A` | **Closed-Loop Axiom-HOPE vs. Zero-Shot `A`** | **+86.7 pp** | **+56.3 pp** |

## 3. Forensic Defect Counts (out of 15 tasks per arm)

| Forensic Flag | `A` | `C` | `C_ID_auto` | `C_ID_prereq` | `C_ID_hope` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `leakedSecretIdentifier` | 0 | 0 | 0 | 0 | 0 |
| `missingErrorEnvelope` | 15 | 15 | 15 | 10 | 0 |
| `missingIdempotencyKey` | 5 | 0 | 0 | 0 | 0 |
| `missingNoStoreHeader` | 0 | 0 | 0 | 0 | 0 |
| `missingSafeParse` | 0 | 0 | 0 | 0 | 1 |
| `missingTenantCheck` | 4 | 0 | 1 | 1 | 0 |
| `syntaxError` | 0 | 0 | 0 | 0 | 0 |
