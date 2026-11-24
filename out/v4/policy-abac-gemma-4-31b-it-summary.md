# Axiom-HOPE v4 Policy-as-Code ABAC Pilot Summary — `gemma-4-31b-it`

- **Cartridge:** `policy-abac-v4` (18 held-out tasks × 5 arms = 90 trials)
- **Retrieval Budget:** `K = 4`, `temperature = 0`

## 1. 5-Arm Performance Table

| Arm | Full-Task Pass | Mean Fact Pass | Committed | P-01 Retrieved | P-02 Retrieved |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `A` | 0/18 (0.0%) | 61.9% | 18/18 (100.0%) | 0/18 | 0/18 |
| `C` | 0/18 (0.0%) | 60.4% | 18/18 (100.0%) | 1/18 | 17/18 |
| `C_ID_auto` | 11/18 (61.1%) | 92.8% | 18/18 (100.0%) | 1/18 | 17/18 |
| `C_ID_prereq` | 7/18 (38.9%) | 85.0% | 17/18 (94.4%) | 18/18 | 18/18 |
| `C_ID_hope` | 11/18 (61.1%) | 93.5% | 18/18 (100.0%) | 1/18 | 18/18 |

## 2. Key Causal Contrasts

| Contrast | Effect Isolated | Full-Task Delta | Mean Fact Delta |
| :--- | :--- | :---: | :---: |
| `C_ID_auto - C` | Automated Lexical Identifier Lock | +61.1 pp | +32.5 pp |
| `C_ID_prereq - C_ID_auto` | Naive Static Prerequisite Injection (same K=4) | -22.2 pp | -7.8 pp |
| `C_ID_prereq - C` | Static Prereq + Lexical Lock vs. Unconstrained `C` | +38.9 pp | +24.6 pp |
| `C_ID_prereq - A` | Static Prereq vs. Zero-Shot Baseline | +38.9 pp | +23.1 pp |
| `C_ID_hope - C` | **Closed-Loop 3-Clock Axiom-HOPE vs. Unconstrained `C`** | **+61.1 pp** | **+33.1 pp** |
| `C_ID_hope - C_ID_auto` | **Slow-Clock Promoted Graph/Rule Governance vs. `C_ID_auto`** | **+0.0 pp** | **+0.7 pp** |
| `C_ID_hope - C_ID_prereq` | **Closed-Loop Canary-Gated HOPE vs. Naive Static Prereq** | **+22.2 pp** | **+8.5 pp** |
| `C_ID_hope - A` | **Closed-Loop Axiom-HOPE vs. Zero-Shot `A`** | **+61.1 pp** | **+31.6 pp** |

## 3. Forensic Defect Counts (out of 18 tasks per arm)

| Forensic Flag | `A` | `C` | `C_ID_auto` | `C_ID_prereq` | `C_ID_hope` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `missingForbidSuspended` | 18 | 18 | 1 | 0 | 0 |
| `missingLockedResourceGuard` | 3 | 6 | 2 | 0 | 1 |
| `missingMfaRequirement` | 14 | 3 | 0 | 5 | 0 |
| `missingNetworkRiskGuard` | 6 | 6 | 1 | 4 | 2 |
| `missingSeparationOfDuties` | 5 | 6 | 6 | 0 | 5 |
| `missingServiceAccountForbid` | 3 | 2 | 0 | 0 | 0 |
| `missingSessionFreshnessGuard` | 7 | 7 | 5 | 6 | 5 |
| `missingTenantIsolation` | 3 | 3 | 2 | 0 | 0 |
| `paraphrasedMfaClaim` | 0 | 0 | 0 | 0 | 0 |
| `syntaxError` | 0 | 0 | 0 | 1 | 0 |
