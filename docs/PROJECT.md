# Axiom Project Specification

## 1. Purpose

Axiom is a self-healing engine designed to generate, verify, and refine architectural axioms (rules and constraints) across software domains. It mechanizes the discovery and formalization of architectural wisdom while maintaining strict epistemic boundaries and verification standards.

## 2. Core Architecture

The system consists of decoupled components:

```
                  ┌──────────────────┐
                  │     Executor     │  (Swappable OpenAI-compatible LLM client)
                  └────────┬─────────┘
                           │ candidate rule stream
                           ▼
                  ┌──────────────────┐
                  │     Verifier     │  (Deterministic: L1, L2, L3)
                  └────────┬─────────┘
                           │ failed traces & diagnostics
                           ▼
                  ┌──────────────────┐
                  │     Advisor      │  (Lesson generation & validation)
                  └──────────────────┘
```

### 2.1 Executor
- Generates proposed candidate axioms based on domain prompts and contextual inputs.
- Built on top of a free LLM API behind a standard OpenAI-compatible client interface.
- Completely swappable: any OpenAI-compatible endpoint or local/remote model can serve as the backend.

### 2.2 Verifier
- **Deterministic by construction:** strictly zero LLM, zero network calls, and zero randomness anywhere in `src/verifier`.
- Evaluates rules at three distinct verification levels:
  - **L1 (Grammar):** Structural and syntactic validity (rule line syntax, required metadata fields, casing, anchors, section headings, and field ordering).
  - **L2 (Vault Consistency):** Internal consistency across the procedural vault (ID uniqueness, prefix validity, status invariants, reference resolution across agents and domains, cross-links).
  - **L3 (Executable Checks):** Mechanizable validation testing candidates against paired compliant (positive) and violating (negative) test fixtures.

### 2.3 Advisor
- **Conditional Learning:** Learns exclusively from traces where the Verifier produced a failure.
- **Verification of Lessons:** A proposed lesson or guideline is only retained if re-running candidate generation with the lesson in context successfully enables the Verifier to pass.
- Eliminates speculative or hallucinatory prompt drift.

## 3. Staging & Candidate Quarantine Policy

To ensure repository and vault integrity:
- **Quarantine Location:** Generated axioms are exclusively output as candidates to `out/candidates.md`. They are **never** written directly into `brain/` or `agents/`.
- **Promotion Protocol:** A separate, human-operated import step validates candidates and renumbers them into the next free sequential `CAND-nn` identifier in the vault inbox (`brain/06-raw/inbox.md`).
- **Epistemic Invariant:** Automated systems never promote candidates to active status; promotion remains strictly a human practitioner decision.

## 4. Confidence Policy

Confidence scoring (`conf: 1..5`) is strictly bounded by verification rigor:
- **`conf <= 2`:** Candidates that have passed only Level 1 (Grammar) and Level 2 (Vault Consistency) checks.
- **`conf: 3` (Maximum Automated Rating):** Candidates that have passed Level 1, Level 2, and Level 3 (Executable Checks with compliant/violating fixtures).
- **`conf > 3` (4 or 5):** Never granted automatically. High confidence levels require human production validation, empirical incident evidence, and human practitioner ratification.

## 5. Evaluation Framework

Axiom measures generation accuracy and learning efficacy using an empirical benchmark:
- **Leave-One-Out Regeneration:** Existing mechanizable rules are withheld, and the system attempts to regenerate equivalent rules against human-authored test fixtures.
- **Baselines & Controls:**
  - *No-Learning Baseline:* Generation performance without prior advisor feedback or accumulated lessons.
  - *Placebo-Lesson Control:* Generation tested with unrelated or randomized lessons to verify that performance gains are causally driven by targeted failure remediation.

