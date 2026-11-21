# Axiom-HOPE v4 Policy-as-Code ABAC Pilot Summary — `gemini-3.1-flash-lite`

- **Cartridge:** `policy-abac-v4` (18 held-out tasks × 5 arms = 90 trials)
- **Retrieval Budget:** `K = 4`, `temperature = 0`

## 1. 5-Arm Performance Table

| Arm | Full-Task Pass | Mean Fact Pass | Committed | P-01 Retrieved | P-02 Retrieved |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `A` | 0/18 (0.0%) | 57.2% | 18/18 (100.0%) | 0/18 | 0/18 |
| `C` | 2/18 (11.1%) | 76.8% | 18/18 (100.0%) | 1/18 | 17/18 |
| `C_ID_auto` | 12/18 (66.7%) | 91.2% | 18/18 (100.0%) | 1/18 | 17/18 |
| `C_ID_prereq` | 10/18 (55.6%) | 92.2% | 18/18 (100.0%) | 18/18 | 18/18 |
| `C_ID_hope` | 13/18 (72.2%) | 95.5% | 18/18 (100.0%) | 1/18 | 18/18 |

## 2. Key Causal Contrasts

| Contrast | Effect Isolated | Full-Task Delta | Mean Fact Delta |
| :--- | :--- | :---: | :---: |
| `C_ID_auto - C` | Automated Lexical Identifier Lock | +55.6 pp | +14.3 pp |
| `C_ID_prereq - C_ID_auto` | Naive Static Prerequisite Injection (same K=4) | -11.1 pp | +1.1 pp |
| `C_ID_prereq - C` | Static Prereq + Lexical Lock vs. Unconstrained `C` | +44.4 pp | +15.4 pp |
| `C_ID_prereq - A` | Static Prereq vs. Zero-Shot Baseline | +55.6 pp | +35.0 pp |
| `C_ID_hope - C` | **Closed-Loop 3-Clock Axiom-HOPE vs. Unconstrained `C`** | **+61.1 pp** | **+18.8 pp** |
| `C_ID_hope - C_ID_auto` | **Slow-Clock Promoted Graph/Rule Governance vs. `C_ID_auto`** | **+5.6 pp** | **+4.4 pp** |
| `C_ID_hope - C_ID_prereq` | **Closed-Loop Canary-Gated HOPE vs. Naive Static Prereq** | **+16.7 pp** | **+3.3 pp** |
| `C_ID_hope - A` | **Closed-Loop Axiom-HOPE vs. Zero-Shot `A`** | **+72.2 pp** | **+38.3 pp** |

## 3. Forensic Defect Counts (out of 18 tasks per arm)

| Forensic Flag | `A` | `C` | `C_ID_auto` | `C_ID_prereq` | `C_ID_hope` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `missingForbidSuspended` | 18 | 1 | 1 | 0 | 0 |
| `missingLockedResourceGuard` | 1 | 0 | 1 | 1 | 0 |
| `missingMfaRequirement` | 11 | 7 | 0 | 2 | 0 |
| `missingNetworkRiskGuard` | 6 | 6 | 1 | 4 | 2 |
| `missingSeparationOfDuties` | 5 | 6 | 2 | 0 | 0 |
| `missingServiceAccountForbid` | 3 | 3 | 0 | 0 | 0 |
| `missingSessionFreshnessGuard` | 4 | 5 | 4 | 3 | 4 |
| `missingTenantIsolation` | 0 | 0 | 1 | 0 | 3 |
| `paraphrasedMfaClaim` | 7 | 7 | 0 | 2 | 0 |
| `syntaxError` | 0 | 0 | 0 | 0 | 0 |
