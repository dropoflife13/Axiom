# Axiom-HOPE v4 Reverse-Masked Necessity Arm (`C_ID_masked`) Summary

- **Cartridge:** `policy-abac-v4` (`18` held-out Cedar-style ABAC tasks, exact same Top-`4` TF-IDF `retrievedRuleIds` as `C` and `C_ID_auto`, `temperature = 0`)
- **Reverse-Masked Vault:** `.axiom-state/v4/policy-abac-cid-masked.json` (0/78 (0.0%) operational tokens retained; 1993 chars (0.89x vs. C_ID_auto))
- **Bidirectional Identification:**
  - **Sufficiency (`C_ID_auto - C`):** Restoring exact operational tokens to distilled prose.
  - **Necessity (`C_ID_masked - C_ID_auto`):** Stripping exact operational tokens from full-length canonical rules while controlling prose structure and length.

## 1. Bidirectional Full-Task Pass Rate Comparison (`C_ID_auto` vs. `C_ID_masked` vs. `C`)

| Model | Provider | `A` | `C` | `C_ID_masked` | `C_ID_auto` | Sufficiency (`C_ID_auto - C`) | Necessity (`C_ID_masked - C_ID_auto`) | Structure Control (`C_ID_masked - C`) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `gemini-3.1-flash-lite` | Google AI Studio | 0.0% | 11.1% | **5.6%** (1/18) | 66.7% (12/18) | +55.6 pp | **-61.1 pp** | -5.6 pp |
| `gemma-4-31b-it` | Google AI Studio | 0.0% | 0.0% | **0.0%** (0/18) | 61.1% (11/18) | +61.1 pp | **-61.1 pp** | +0.0 pp |
| `qwen/qwen3.8-27b` | Groq | 0.0% | 0.0% | **0.0%** (0/18) | 72.2% (13/18) | +72.2 pp | **-72.2 pp** | +0.0 pp |
| **Pooled Mean (n=3)** | Multi-Provider | 0.0% | 3.7% | **1.9%** | 66.7% | +63.0 pp | **-64.8 pp** | -1.9 pp |

## 2. Bidirectional Mean Bound-Fact Pass Rate Comparison

| Model | `A` | `C` | `C_ID_masked` | `C_ID_auto` | Sufficiency (`C_ID_auto - C`) | Necessity (`C_ID_masked - C_ID_auto`) | Structure Control (`C_ID_masked - C`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `gemini-3.1-flash-lite` | 57.2% | 76.8% | **71.6%** | 91.2% | +14.3 pp | **-19.6 pp** | -5.2 pp |
| `gemma-4-31b-it` | 61.9% | 60.4% | **63.2%** | 92.8% | +32.5 pp | **-29.6 pp** | +2.9 pp |
| `qwen/qwen3.8-27b` | 30.4% | 60.3% | **64.0%** | 94.9% | +34.5 pp | **-30.9 pp** | +3.7 pp |
| **Pooled Mean (n=3)** | 49.8% | 65.8% | **66.3%** | 92.9% | +27.1 pp | **-26.7 pp** | +0.4 pp |

## 3. Length & Operational Token Control (`policy-abac-cid-masked.json`)

| Vault | Tokens Retained | Retention % | Total Chars | Total Words | Char Ratio vs. `C_ID_auto` | Word Ratio vs. `C_ID_auto` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Canonical Rules (`P-01..P-12`) | `78/78` | 100.0% | 1626 | 164 | 0.72x | 0.67x |
| `C_ID_auto` (Lexical-Locked) | `78/78` | 100.0% | 2249 | 246 | 1.00x | 1.00x |
| **`C_ID_masked` (Reverse-Masked)** | **`0/78`** | **0.0%** | **1993** | **282** | **0.89x** | **1.15x** |

## 4. `C_ID_masked` Forensic Defect Counts (out of 18 tasks per model)

| Forensic Flag | `gemini-3.1-flash-lite` (`C_ID_masked` / `C_ID_auto`) | `gemma-4-31b-it` (`C_ID_masked` / `C_ID_auto`) | `qwen/qwen3.8-27b` (`C_ID_masked` / `C_ID_auto`) |
| :--- | :---: | :---: | :---: |
| `missingForbidSuspended` | 6 / 1 | 16 / 1 | 18 / 1 |
| `missingLockedResourceGuard` | 3 / 1 | 6 / 2 | 6 / 1 |
| `missingMfaRequirement` | 11 / 0 | 0 / 0 | 5 / 0 |
| `missingNetworkRiskGuard` | 6 / 1 | 6 / 1 | 6 / 1 |
| `missingSeparationOfDuties` | 6 / 2 | 6 / 6 | 4 / 1 |
| `missingServiceAccountForbid` | 3 / 0 | 2 / 0 | 1 / 0 |
| `missingSessionFreshnessGuard` | 5 / 4 | 7 / 5 | 2 / 3 |
| `missingTenantIsolation` | 0 / 1 | 2 / 2 | 1 / 0 |
| `paraphrasedMfaClaim` | 11 / 0 | 0 / 0 | 5 / 0 |
| `syntaxError` | 0 / 0 | 0 / 0 | 0 / 0 |
