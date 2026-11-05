# Inbox Lifecycle Specification (Phase 0b Archaeology)

> **Document:** `docs/inbox-lifecycle.md`  
> **Source Ground Truth:** `brain/06-raw/inbox.md`, `brain/07-meta/SYNC-PROTOCOL.md`, `brain/05-elicitation/ELICITATION-PROTOCOL.md`, `brain/07-meta/CONVENTIONS.md` (CV-02, CV-03), and `brain/00-INDEX.md`.  
> **Audience:** Axiom Generator, Staging Pipeline & Verifier  

---

## 1. Role & Architectural Boundary

`06-raw/inbox.md` serves as the sole staging buffer between external execution projects/sessions and the canonical procedural vault:

- **Single Intake Valve (SP-01):** Project → Brain information flows *only* through `06-raw/inbox.md`. An active project PR, ticket, or code review must never write directly to `brain/02-domains/` or `brain/01-identity/`.
- **Epistemic Quarantine (SP-05, BN-09):** Only Tier 0/1 validated files leave the vault. Raw notes, excavation transcripts, and unvetted candidates stay internal to the brain and never ship in external templates.
- **Human Promotion Boundary (CV-03, EP-08, BN-02):** Agents and extraction pipelines may stage candidates into `inbox.md`. However, **promotion is strictly a human act**. No automated script or agent may self-promote a candidate to `status: active`.

---

## 2. Ingestion Triggers (How Candidates Arrive in Inbox)

Candidates are staged into `inbox.md` from four operational triggers:

1. **Agent Gate Failure (SP-08, SYNC-PROTOCOL):** When an agent Gate `FAIL`s during a PR review and exposes an undocumented tacit constraint or recurring blind spot, the failure is routed to `inbox.md`.
2. **Waiver Ratification (SP-08, SYNC-PROTOCOL):** When an agent waiver is recorded under `docs/WAIVERS.md` (per PM-12), the boundary condition (`breaks:`) must be staged in `inbox.md` to elicit the boundary in the next excavation session.
3. **Excavation Sessions (ELICITATION-PROTOCOL EP-05):** During structured elicitation sessions (Sessions S-01, S-02, S-03), raw transcripts are mapped into candidate rules using the `sessions/_TEMPLATE.md` format and appended to `inbox.md`.
4. **Post-Implementation Reflection (`/retro`):** Following a feature build or refactor sprint, discovered edge cases and heuristics are recorded as candidates starting at the next unallocated `CAND-nn` ID.

---

## 3. Candidate Grammar & Syntax (The Inactive State)

Every candidate line in `06-raw/inbox.md` must follow the CV-02 rule grammar with candidate-specific constraints:

```markdown
- **CAND-NN** WHEN <trigger> → DO <action> | why: <causal reason> | breaks: <boundary condition> | conf: <1–5> | ev: <concrete project or session evidence> | status: candidate #<tag> ^cand-nn
```

### Syntax Requirements:
1. **ID Scheme:** Prefix `CAND-` followed by a two-digit zero-padded integer (e.g., `CAND-01`, `CAND-21`).
2. **Status Field:** Must strictly be `status: candidate`.
3. **Confidence & Breaks Invariant (CV-02):** For any candidate at `conf ≥ 3`, a concrete `breaks:` falsification condition and real-world `ev:` citation are mandatory.
4. **Anchor Invariant:** Must terminate with the lowercase block anchor `^cand-nn`.

---

## 4. Promotion Lifecycle & The Promotion Ledger

When a human practitioner validates and promotes a candidate:

1. **Target Selection:** The candidate is translated into a domain rule under `brain/02-domains/<domain>.md` (or a heuristic under `brain/03-heuristics/`).
2. **ID Reassignment:** The `CAND-nn` ID is retired and replaced with the permanent domain ID (e.g., `CAND-01` → `CS-03`).
3. **Status Elevation:** The rule's status changes from `candidate` to `active` (requires `conf ≥ 3`, valid `ev:`, and `breaks:`).
4. **Ledger Recording:** The transition is permanently recorded in the `## Promotion Ledger` section of `06-raw/inbox.md` specifying:
   - Source Session (e.g., `Session S-01`, `Session S-03`)
   - Candidate ID (`CAND-nn`)
   - Target Rule ID (`<PREFIX>-nn`)
   - Target File Path
   - Summary of the invariant promoted

### Example Ledger Entries (From Production Vault):
```markdown
## Promotion Ledger (Session S-01 — 2026-10-27)
- `CAND-01` → Promoted to **`CS-03`** (`02-domains/cybersec.md`)
- `CAND-02` → Promoted to **`CS-02`** (`02-domains/cybersec.md`)
- `CAND-03` → Promoted to **`UI-01`** (`02-domains/ui-frontend.md`)
- `CAND-08` → Promoted to **`BA-01`** & **`BA-03`** (`02-domains/business-analysis.md`)
```

---

## 5. File Structure of `brain/06-raw/inbox.md`

```markdown
---
type: inbox
version: 7
status: active
---
# Inbox — Unprocessed Candidates

Candidates only (`status: candidate`). Promotion is a human act (CV-03). Format: CV-02 with `CAND-nn` IDs. Every candidate at `conf ≥ 3` must have a concrete `breaks:` condition and real project `ev:`.

## Active Candidates
_Inbox clear. All initial candidates (`CAND-01..13`) and Cortex v2.4 post-build candidates (`CAND-14..20`) have been promoted to `status: active`. Append new discoveries from future projects below starting at `CAND-21`._

## Promotion Ledger (Session S-01 — 2026-10-27)
...

## Promotion Ledger (Session S-03 — 2026-10-28 · Cortex v2.4 Journey)
...
```

---

## 6. Verifier Invariants for Axiom

When Axiom evaluates candidates or operations touching `inbox.md`:
1. **INBOX_NO_ACTIVE:** No rule inside `06-raw/inbox.md` may have `status: active`.
2. **CAND_PREFIX:** Every rule in `inbox.md` must carry the `CAND-` prefix.
3. **NO_INBOX_IN_PROJECT:** Generated project copies or client distributions must never include `06-raw/inbox.md` (enforcing `BN-09` / `SP-05`).
4. **CAND_NUMBERING:** Candidates must be monotonically sequential with no ID reuse.

