# Axiom-HOPE v4 Paired `--compact` Benchmark Sweep (`2026-11-26T14-45Z`)

- **Trials:** `99/99` across 2 v4 cartridges × 3 models (`policy-abac-v4` 54 + `ts-api-security-v4` 45)
- **Overall Pooled Mean Full-Task Pass:** **72.2%** (72/99 raw = 72.7%) vs. prior `73.3%` baseline (**-1.1 pp**)
- **Overall Mean Bound-Fact Pass:** **95.2%**
- **Lexical-Lock Preservation:** **7324/7324 (100.0%)**
- **Context Compression:** `65224 -> 62663` tokens (**-3.93%**, `2561` saved)
- **Promoted Canary Regressions:** **0**

| Cartridge | Model | Full-Task Pass (n/N, %) | Mean Fact Pass (%) | Lexical Lock (%) | Prompt Compression (%) | Delta vs. 73.3% Baseline |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| Policy-as-Code ABAC | `gemini-3.1-flash-lite` | 15/18 (83.3%) | 96.6% | 493/493 (100.0%) | -2.95% | +10.0 pp |
| Policy-as-Code ABAC | `gemma-4-31b-it` | 13/18 (72.2%) | 95.4% | 1730/1730 (100.0%) | -3.33% | -1.1 pp |
| Policy-as-Code ABAC | `qwen/qwen3.8-27b` | 14/18 (77.8%) | 94.3% | 1889/1889 (100.0%) | -3.32% | +4.4 pp |
| TypeScript API Security | `gemini-3.1-flash-lite` | 13/15 (86.7%) | 98.7% | 1777/1777 (100.0%) | -4.27% | +13.3 pp |
| TypeScript API Security | `gemma-4-31b-it` | 7/15 (46.7%) | 94.4% | 688/688 (100.0%) | -4.43% | -26.7 pp |
| TypeScript API Security | `qwen/qwen3.8-27b` | 10/15 (66.7%) | 91.7% | 747/747 (100.0%) | -4.94% | -6.7 pp |
| **Pooled ABAC (n=3)** | — | 42/54 (77.8%) | 95.4% | 4112/4112 (100.0%) | -3.28% | +4.4 pp |
| **Pooled TS-API (n=3)** | — | 30/45 (66.7%) | 94.9% | 3212/3212 (100.0%) | -4.46% | -6.7 pp |
| **Overall Pooled (n=6)** | — | **72/99 (72.2%)** | **95.2%** | **7324/7324 (100.0%)** | **-3.93%** | **-1.1 pp** |
