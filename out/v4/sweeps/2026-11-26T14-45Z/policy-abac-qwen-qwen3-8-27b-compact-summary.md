# Axiom-HOPE v4 Policy-as-Code ABAC Pilot Summary — `qwen/qwen3.8-27b`

- **Cartridge:** `policy-abac-v4` (18 held-out tasks × 5 arms = 90 trials)
- **Retrieval Budget:** `K = 4`, `temperature = 0`
- **Context Compaction (`--compact`):** 13456 -> 13009 tokens (**-3.32%**, 1889/1889 required tokens preserved)

## 1. 5-Arm Performance Table

| Arm | Full-Task Pass | Mean Fact Pass | Committed | P-01 Retrieved | P-02 Retrieved |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `A` | 0/18 (0.0%) | 30.4% | 18/18 (100.0%) | 0/18 | 0/18 |
| `C` | 0/18 (0.0%) | 60.3% | 18/18 (100.0%) | 1/18 | 17/18 |
| `C_ID_auto` | 13/18 (72.2%) | 94.9% | 18/18 (100.0%) | 1/18 | 17/18 |
| `C_ID_prereq` | 9/18 (50.0%) | 91.3% | 18/18 (100.0%) | 18/18 | 18/18 |
| `C_ID_hope` | 14/18 (77.8%) | 94.3% | 18/18 (100.0%) | 1/18 | 18/18 |

## 2. Key Causal Contrasts

| Contrast | Effect Isolated | Full-Task Delta | Mean Fact Delta |
| :--- | :--- | :---: | :---: |
| `C_ID_auto - C` | Automated Lexical Identifier Lock | +72.2 pp | +34.5 pp |
| `C_ID_prereq - C_ID_auto` | Naive Static Prerequisite Injection (same K=4) | -22.2 pp | -3.6 pp |
| `C_ID_prereq - C` | Static Prereq + Lexical Lock vs. Unconstrained `C` | +50.0 pp | +31.0 pp |
| `C_ID_prereq - A` | Static Prereq vs. Zero-Shot Baseline | +50.0 pp | +60.9 pp |
| `C_ID_hope - C` | **Closed-Loop 3-Clock Axiom-HOPE vs. Unconstrained `C`** | **+77.8 pp** | **+33.9 pp** |
| `C_ID_hope - C_ID_auto` | **Slow-Clock Promoted Graph/Rule Governance vs. `C_ID_auto`** | **+5.6 pp** | **-0.6 pp** |
| `C_ID_hope - C_ID_prereq` | **Closed-Loop Canary-Gated HOPE vs. Naive Static Prereq** | **+27.8 pp** | **+3.0 pp** |
| `C_ID_hope - A` | **Closed-Loop Axiom-HOPE vs. Zero-Shot `A`** | **+77.8 pp** | **+63.9 pp** |

## 3. Forensic Defect Counts (out of 18 tasks per arm)

| Forensic Flag | `A` | `C` | `C_ID_auto` | `C_ID_prereq` | `C_ID_hope` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `missingForbidSuspended` | 18 | 18 | 1 | 0 | 0 |
| `missingLockedResourceGuard` | 5 | 6 | 1 | 1 | 1 |
| `missingMfaRequirement` | 5 | 3 | 0 | 4 | 0 |
| `missingNetworkRiskGuard` | 6 | 4 | 1 | 4 | 2 |
| `missingSeparationOfDuties` | 6 | 5 | 1 | 0 | 2 |
| `missingServiceAccountForbid` | 2 | 3 | 0 | 0 | 0 |
| `missingSessionFreshnessGuard` | 2 | 2 | 3 | 4 | 1 |
| `missingTenantIsolation` | 0 | 0 | 0 | 0 | 0 |
| `paraphrasedMfaClaim` | 4 | 3 | 0 | 4 | 0 |
| `syntaxError` | 0 | 0 | 0 | 0 | 0 |
