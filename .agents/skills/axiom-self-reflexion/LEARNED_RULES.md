# Axiom Self-Reflexion — Learned Rules

> Deterministically promoted, lexical-locked workspace rules verified by `scripts/v4/reflexion-promote.ts` (`extractRequiredTokens` + `compactRuleText` + `detectContextRot` + `npx tsc --noEmit` + `npm test`).
> Do not hand-edit receipt hashes; promote new rules via `scripts/v4/reflexion-capture.ts` and `scripts/v4/reflexion-promote.ts`.

- **LR-001** (`next-build-turbopack-windows-ipc`): On Windows, run npx next build --webpack in dashboard/ instead of default Turbopack next build to avoid PostCSS child-process IPC panics.
