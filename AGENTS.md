# Axiom
A self-healing engine that generates and tests architectural axioms.
Rules: the Verifier is deterministic (no LLM). Generated axioms are candidates only and are
never written into domain files directly. The 8 files in agents/ must always be present (BN-00).

## Axiom Swarm Registry (BN-00)

When running a swarm or delegating subagents in this workspace, DO NOT use generic personas. Spawn and execute strictly using the 8 core Axiom specialist files in `agents/` as the source of truth.

### Execution Order
Follow the governance sequence from `agents/README.md`:
`PM -> SD -> DB -> IR -> UX -> GR -> SEC` (with `RS` invoked for verification / `RS-03` anti-hallucination gates).

### Specialist Mapping
- **PM**: Read and adopt `agents/productmanageragent.md`
- **SD**: Read and adopt `agents/systemsdesignagent.md`
- **DB**: Read and adopt `agents/dbaagent.md`
- **IR**: Read and adopt `agents/integrationagent.md`
- **UX**: Read and adopt `agents/uiuxagent.md`
- **GR**: Read and adopt `agents/growthagent.md`
- **SEC**: Read and adopt `agents/securityagent.md` (mandatory final gate)
- **RS**: Read and adopt `agents/researchagent.md`

### Swarm Rules
- Inherit the active Gemini Pro workspace model (do not override to Claude).
- Built-in subagents (`browser`, `code-reviewer`, etc.) may only be used as tools under the active Axiom specialist, not as replacements.
