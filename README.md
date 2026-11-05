# Axiom

> A self-healing engine that deterministically generates, verifies, and tests architectural axioms.

## Overview

Axiom is an autonomous procedural judgment factory. It continuously evaluates architectural candidate rules across engineering, systems design, and specialized knowledge domains against an invariant verification pipeline.

## Core Principles

- **Deterministic Verification:** The Verifier contains zero stochastic LLM logic. Rule syntax, field pipelines (`why` -> `breaks` -> `conf` -> `ev` -> `status`), and anchor invariants are mathematically validated.
- **Candidate Staging Only:** Generated axioms remain in an isolated staging lifecycle (`status: candidate`) and are never written directly into canonical domain registries.
- **Constitution Gate (BN-00):** The 8 core specialist agent files in `agents/` serve as an immutable evaluation foundation.

## Directory Topography

- `agents/`: The 8 core specialist gatekeeper definitions (`PM`, `UX`, `GR`, `SD`, `IR`, `DB`, `SEC`, `RS`).
- `brain/02-domains/`: Canonical specialized domain rule registries (28 active domains).
- `brain/07-meta/`: Rule syntax conventions and vault consistency tooling.
- `docs/`: Formal grammar specifications (`domain-grammar.md`, `inbox-lifecycle.md`).

## License

[MIT](LICENSE)
