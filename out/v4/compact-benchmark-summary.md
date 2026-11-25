# Axiom-HOPE v4 Paired Live `--compact` Benchmark Summary

- **Scope:** 2 v4 cartridges (`policy-abac-v4`, `ts-api-security-v4`) × 3 models (`gemini-3.1-flash-lite`, `gemma-4-31b-it`, `qwen/qwen3.8-27b`) = **99 live paired `C_ID_hope` trials** (`temperature = 0`, `K = 4`)
- **Overall Pooled Accuracy Delta (`--compact` − Baseline):** **+13.7 pp** full-task pass (59.6% → 73.3%), **+4.0 pp** mean bound-fact pass (91.3% → 95.3%)
- **Cumulative Context Token Savings:** `54142 -> 51982` tokens (**-3.99%**, `2160` tokens saved)
- **Lexical-Lock Integrity:** **5850/5850 (100.0%)** required operational tokens preserved verbatim
- **Slow Clock Safety:** **0** promoted canary regressions across all 6 runs

## 1. Accuracy Non-Inferiority Table (Baseline `C_ID_hope` vs. Compact `C_ID_hope`)

| Cartridge | Model | Provider | Baseline Task | Compact Task | Δ Task | Baseline Facts | Compact Facts | Δ Facts |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Policy-as-Code ABAC | `gemini-3.1-flash-lite` | Google AI Studio | 72.2% (13/18) | **83.3% (15/18)** | **+11.1 pp** | 95.5% | **96.6%** | **+1.0 pp** |
| Policy-as-Code ABAC | `gemma-4-31b-it` | Google AI Studio | 61.1% (11/18) | **72.2% (13/18)** | **+11.1 pp** | 93.5% | **95.4%** | **+1.9 pp** |
| Policy-as-Code ABAC | `qwen/qwen3.8-27b` | Groq | 77.8% (14/18) | **77.8% (14/18)** | **+0.0 pp** | 96.5% | **94.3%** | **-2.2 pp** |
| TypeScript API Security | `gemini-3.1-flash-lite` | Google AI Studio | 60.0% (9/15) | **86.7% (13/15)** | **+26.7 pp** | 91.1% | **98.7%** | **+7.6 pp** |
| TypeScript API Security | `gemma-4-31b-it` | Google AI Studio | 20.0% (3/15) | **53.3% (8/15)** | **+33.3 pp** | 80.2% | **95.2%** | **+15.0 pp** |
| TypeScript API Security | `qwen/qwen3.8-27b` | Groq | 66.7% (10/15) | **66.7% (10/15)** | **+0.0 pp** | 90.8% | **91.7%** | **+0.8 pp** |
| **Pooled ABAC (n=3)** | — | Multi-Provider | 70.4% | **77.8%** | **+7.4 pp** | 95.2% | **95.4%** | **+0.2 pp** |
| **Pooled TS-API (n=3)** | — | Multi-Provider | 48.9% | **68.9%** | **+20.0 pp** | 87.4% | **95.2%** | **+7.8 pp** |
| **Overall Pooled (n=6)** | — | Multi-Provider | 59.6% | **73.3%** | **+13.7 pp** | 91.3% | **95.3%** | **+4.0 pp** |

## 2. Token & Context Savings Table (`100.0%` Lexical Lock)

| Cartridge | Model | Bundles | Before Tokens | After Tokens | Saved | Reduction % | Required Tokens Preserved |
| :--- | :--- | :---: | ---: | ---: | ---: | :---: | :---: |
| Policy-as-Code ABAC | `gemini-3.1-flash-lite` | 30 | 6112 | 5937 | 175 | **-2.86%** | `839/839` (100.0%) |
| Policy-as-Code ABAC | `gemma-4-31b-it` | 55 | 10215 | 9884 | 331 | **-3.24%** | `1428/1428` (100.0%) |
| Policy-as-Code ABAC | `qwen/qwen3.8-27b` | 18 | 3414 | 3319 | 95 | **-2.78%** | `491/491` (100.0%) |
| TypeScript API Security | `gemini-3.1-flash-lite` | 99 | 26238 | 25055 | 1183 | **-4.51%** | `2342/2342` (100.0%) |
| TypeScript API Security | `gemma-4-31b-it` | 15 | 3977 | 3808 | 169 | **-4.25%** | `359/359` (100.0%) |
| TypeScript API Security | `qwen/qwen3.8-27b` | 15 | 4186 | 3979 | 207 | **-4.95%** | `391/391` (100.0%) |
| **Total (All 6 Runs)** | — | 232 | **54142** | **51982** | **2160** | **-3.99%** | **`5850/5850` (100.0%)** |

## 3. Operational Telemetry & Slow Clock Governance

| Cartridge | Model | Slow Clock Audits (App/Rej) | Promoted Regressions | Lexical Lock Gate | Compact p50 / p95 Latency | Final Snapshot SHA-256 |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| Policy-as-Code ABAC | `gemini-3.1-flash-lite` | 6 (2/4) | **0** | PASS | 1355ms / 2032ms | `1150d533c5e0…` |
| Policy-as-Code ABAC | `gemma-4-31b-it` | 6 (2/4) | **0** | PASS | 32567ms / 84160ms | `0836fa58ce29…` |
| Policy-as-Code ABAC | `qwen/qwen3.8-27b` | 5 (2/3) | **0** | PASS | 634ms / 970ms | `0836fa58ce29…` |
| TypeScript API Security | `gemini-3.1-flash-lite` | 10 (6/4) | **0** | PASS | 3786ms / 5554ms | `4da1cd484155…` |
| TypeScript API Security | `gemma-4-31b-it` | 9 (2/7) | **0** | PASS | 59579ms / 97876ms | `29df656edfee…` |
| TypeScript API Security | `qwen/qwen3.8-27b` | 12 (4/8) | **0** | PASS | 2226ms / 12315ms | `05339287057e…` |
