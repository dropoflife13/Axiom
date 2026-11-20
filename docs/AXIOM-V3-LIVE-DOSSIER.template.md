# Axiom Ablation v3 — Live Research Dossier

**Generated At:** {{generated_at}}  
**Protocol:** Ablation v3 (`K=10`, 120 held-out `V3-H-001`..`V3-H-120` × 8 conditions = 960 trials/model; requested `temperature = 0` uniformly; provider-enforced sampling is disclosed for `Gemini 3.5 Flash-Lite` [API deprecates/ignores `temperature`, `top_p`, `top_k`] and `Kimi K3.1 Pro` [fixed `temperature = 1.0, top_p = 0.95` with always-on reasoning])  
**Finalized Models (960/960):** {{finalized_run_count}} / {{total_tracked_runs}}  
**Quarantined Self-Healing Candidates:** {{quarantine_total_candidates}} (`{{quarantine_ready_count}}` ready for next-generation promotion)

---

## 1. Live Fleet Telemetry

{{fleet_progress_table}}

---

## 2. Pre-Registered Validity Gate & Run Ledger (`960/960` Finalized Runs)

{{run_ledger_table}}

---

## 3. Confirmatory Primary Contrasts (`C_ID`, `C0_clean`, `C0`, `C`, `C0_rand`, `D_safe`, `A`, `B`)

{{primary_contrasts_table}}

---

## 4. Failure-Mode Attribution & Self-Healing Quarantine

### Observed Defect Rates in `C0_clean` / `C_ID` (Live Across All Runs)
{{forensic_summary_table}}

### Quarantined Candidate Rules (`.axiom-state/quarantine/v3-candidates.json`)
{{quarantine_candidates_table}}
