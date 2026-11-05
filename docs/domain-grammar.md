# Domain Grammar Specification (Phase 0 Archaeology)

> **Document:** `docs/domain-grammar.md`  
> **Source Ground Truth:** All 30 Markdown files in `brain/02-domains/` (112 active rules across 28 rule files + 1 framework domain + 1 template)  
> **Audience:** Axiom Generator & Deterministic Verifier  
> **Standard Ref:** Derived empirically from codebase truth; contrasted with `brain/07-meta/CONVENTIONS.md` (CV-02) and `brain/07-meta/check-vault.py`.

---

## 1. Executive Summary: Agent Rules vs. Domain Rules

| Architectural Layer | Location | Frontmatter | Header Structure | Rule Grammar | Rule ID Prefixes |
|---|---|---|---|---|---|
| **Agents (Execution Layer)** | `agents/*.md` (8 files) | **Forbidden** (Starts directly with `# <Name> Agent — <Role>`) | 6 standard sections (Identity, Read-First, Restrictions, Checklist, Gate/Insight, Handoff) | `- **ID-NN** Title: WHEN x → DO y. *breaks: z.* \| conf: N` | `PM`, `UX`, `GR`, `SD`, `IR`, `DB`, `SEC`, `RS` |
| **Domains (Procedural Knowledge)** | `brain/02-domains/*.md` (29 domains) | **Mandatory YAML** (`domain`, `prefix`, `version`, `status`) | Split into **Cluster Profile** (2 sections) and **Operational Profile** (3–5 sections) | `- **ID-NN** [(Title):] WHEN trigger → DO action \| why: ... \| breaks: ... \| conf: <4\|5> \| ev: ... \| status: active #tags ^id-nn` | 28 registered domain prefixes (`ARB`, `ART`, `AUTH`, `BA`, `BIZ`, `CRY`, `CS`, `DS`, `ECO`, `EDU`, `ENV`, `FIN`, `GEO`, `HLT`, `HIS`, `LAW`, `LIT`, `MGT`, `MKT`, `MED`, `NWS`, `PHI`, `POL`, `PSY`, `RHE`, `SCI`, `SO`, `UI`) |

---

## 2. File-Level Topography & Two Structural Profiles

There are **30 markdown files** in `brain/02-domains/`:
- **28 files** define active rules (112 rules total).
- **1 file** (`empathy-personas.md`) is a conceptual framework domain without rule lines.
- **1 file** (`_TEMPLATE.md`) is the uninstantiated template (`status: draft`).
- Subdirectory `trends/` contains autonomous daily synthesis logs (`type: trend-radar`), not domain definitions.

### Profile A: Foundational & Cluster Domains (23 files)
*Used for cross-domain arbiter and knowledge clusters (Humanities, Global, Frontier, Science).*  
Files: `arbiter.md`, `art.md`, `business.md`, `crypto.md`, `data-science.md`, `economy.md`, `education.md`, `environment.md`, `finance.md`, `geopolitics.md`, `health.md`, `history.md`, `law.md`, `literature.md`, `management.md`, `marketing.md`, `medicine.md`, `news.md`, `philosophy.md`, `politics.md`, `psychology.md`, `rhetoric.md`, `science.md`.

1. **Frontmatter:**
   ```yaml
   ---
   domain: <domain-slug>
   prefix: <PREFIX>
   version: 1
   status: active
   ---
   ```
2. **H1 Title:** `# [<PREFIX>] <Title> — <Subtitle>` (23/23 files)
3. **Status Blockquote:** `> Status: \`active\` (<N> rules). <Scope statement>`
4. **H2 Sections (Strict 2-section layout):**
   - `## Mental Model & Worldview`
   - `## Rules (\`<PREFIX>-01\` .. \`<PREFIX>-99\>)`

### Profile B: Engineering & Operational Specialist Domains (5 files + `_TEMPLATE.md`)
*Used for direct software execution disciplines.*  
Files: `business-analysis.md`, `cybersec.md`, `solutions.md`, `ui-frontend.md`, `authorization.md`.

1. **Frontmatter:** Same 4 keys (`domain`, `prefix`, `version`, `status`).
2. **H1 Title:** `# <Specialist / Domain Title> — How I Think` (e.g., `# Business Analyst — How I Think`, `# UI & Frontend Specialist — How I Think`, `# Externalized Authorization — How I Think`).
3. **H2 Sections (3 to 5 sections):**
   - `## My first move`
   - `## Default lens`
   - `## Sub-areas (Self-Map)` *(omitted in authorization.md)*
   - `## Rules`
   - `## Open questions (gaps to elicit)` *(omitted in authorization.md)*

---

## 3. The Invariant Rule Grammar (Empirical Truth Across All 112 Rules)

Every rule line in `brain/02-domains/` adheres to a strict, single-line pipelined structure:

```markdown
- **<PREFIX>-<NN>** [(<Title>):] WHEN <trigger> → DO <action> | why: <rationale> | breaks: <boundary> | conf: <N> | ev: <citations> | status: active #<tag1> [#<tag2>...] ^<prefix>-<nn>
```

### Empirical Statistics (112 Rules Evaluated)

| Syntax Field / Invariant | Frequency in Vault | Compliance | Notes / Variance |
|---|---|---|---|
| **Bullet Prefix** | 112 / 112 | **100%** | Exactly `- **<PREFIX>-<NN>**` (no colon after the asterisks). |
| **Optional Title** | 81 / 112 with title<br>31 / 112 without title | **100%** | 81 rules use `(<Title>):`. Exactly 31 rules (in `BA`, `CS`, `SO`, `UI`) omit the title and go straight to `WHEN`. |
| **Trigger → Action** | 112 / 112 | **100%** | Every single rule contains `WHEN ... → DO ...` (using unicode arrow `→` `\u2192`). |
| **Mandatory `\| why:`** | 112 / 112 | **100%** | First metadata field. Concise causal justification. |
| **Mandatory `\| breaks:`** | 112 / 112 | **100%** | Second metadata field. Explicit falsification or exception boundary. |
| **Mandatory `\| conf:`** | 112 / 112 | **100%** | Third metadata field. Value is either `4` (36 rules) or `5` (76 rules). No 1, 2, or 3 in production domain files. |
| **Mandatory `\| ev:`** | 112 / 112 | **100%** | Fourth metadata field. Either Obsidian links `[[CONVENTIONS]]` (76 rules) or empirical project codes `S-01, A-02` (36 rules). |
| **Mandatory `\| status:`** | 112 / 112 | **100%** | Fifth metadata field. 100% are `active`. |
| **Field Ordering** | 112 / 112 | **100%** | Strictly: `why` → `breaks` → `conf` → `ev` → `status`. Zero field permutations across all 112 rules. |
| **Hashtags (`#tags`)** | 112 / 112 | **100%** | At least one lowercase tag following `status: active` and preceding the anchor. |
| **Block Anchor (`^anchor`)** | 112 / 112 | **100%** | Strictly matches `^` + `lowercase(ID)`. (e.g. `- **ARB-08** ... ^arb-08`). |

---

## 4. Conflict Analysis: Real Files vs. Existing Repo Tooling

### Conflict 1: `check-vault.py` Regex Defect
- **`check-vault.py` regex:**
  ```python
  RULE_LINE = re.compile(r"^- \*\*([A-Z]{2,4})-(\d{2})\*\*:\s+(.+)$")
  RULE_STRICT = re.compile(r"^- \*\*[A-Z]{2,4}-\d{2}\*\*:\s+.+\s\[conf:([1-5]),\s*src:([^\]]+)\]\s*$")
  ```
- **Reality:** Because `check-vault.py` looks for a colon immediately following `**`, it currently matches **zero rules** in `brain/02-domains/` (and zero in `agents/`). The script has been completely silent on domain rule verification, checking only broken links and mirror parity.
- **Axiom Implication:** Axiom's deterministic Verifier cannot rely on `check-vault.py` to validate rule syntax; it must encode the real regex:
  ```regex
  ^-\s+\*\*([A-Z]{2,5}-\d{2})\*\*(?:\s+\([^)]+\):)?\s+WHEN\s+.+?\s+→\s+DO\s+.+?\s+\|\s+why:\s+.+?\s+\|\s+breaks:\s+.+?\s+\|\s+conf:\s+[1-5]\s+\|\s+ev:\s+.+?\s+\|\s+status:\s+(?:active|candidate|superseded|retired)\s+(?:#[a-z0-9_-]+\s*)+\^([a-z0-9-]+)$
  ```

### Conflict 2: `CONVENTIONS.md` (CV-02) vs. Production Vault
- **CV-02 states:**
  `- **ID** WHEN <trigger> → DO <action> | why: <reason> | breaks: <condition> | conf: <1–5> | ev: <concrete artifacts or specs> | status: <candidate|active|superseded|retired> #tag ^block-id`
- **Vault Reality:**
  - Production rules in 24 of 28 domains include a parenthetical title: `- **ID-NN** (Title): WHEN ...`.
  - CV-02 does not explicitly document the parenthetical title, though 72% of vault rules utilize it.
  - CV-02 specifies `breaks:` is required for `conf ≥ 3`. In practice, 100% of domain rules have `conf: 4` or `5`, and 100% supply `breaks:`.

### Conflict 3: Domain Rule Grammar vs. Agent Rule Grammar
- **Agent Rules (`agents/*.md`):**
  `- **PM-14** Title: WHEN x → DO y. *breaks: z.* | conf: 1`
  - Inline italicized `*breaks: ...*` inside the sentence.
  - No `| why:`, no `| breaks:`, no `| ev:`, no `| status:`, no hashtags, no `^anchor`.
- **Domain Rules (`brain/02-domains/*.md`):**
  Pipelined pipe-delimited metadata fields with trailing hashtags and block anchor.
- **Axiom Generator Target:** Generated axioms destined for `brain/02-domains/` **MUST** follow the Domain Grammar (Section 3), not the Agent Grammar.

---

## 5. Domain Registry & Prefix Collision Matrix

Any new axiom generated by Axiom must register under one of the 28 active prefixes or claim a unique unallocated prefix:

| Prefix | Domain File | Rule Range in Vault | Style Profile |
|---|---|---|---|
| `ARB` | `arbiter.md` | ARB-01 .. ARB-08 | Cluster / Foundational |
| `ART` | `art.md` | ART-01 .. ART-03 | Cluster |
| `AUTH` | `authorization.md` | AUTH-01 .. AUTH-05 | Operational |
| `BA` | `business-analysis.md` | BA-01 .. BA-07 | Operational |
| `BIZ` | `business.md` | BIZ-01 .. BIZ-03 | Cluster |
| `CRY` | `crypto.md` | CRY-01 .. CRY-03 | Cluster |
| `CS` | `cybersec.md` | CS-01 .. CS-07 | Operational |
| `DS` | `data-science.md` | DS-01 .. DS-03 | Cluster |
| `ECO` | `economy.md` | ECO-01 .. ECO-03 | Cluster |
| `EDU` | `education.md` | EDU-01 .. EDU-03 | Cluster |
| `ENV` | `environment.md` | ENV-01 .. ENV-03 | Cluster |
| `FIN` | `finance.md` | FIN-01 .. FIN-03 | Cluster |
| `GEO` | `geopolitics.md` | GEO-01 .. GEO-03 | Cluster |
| `HLT` | `health.md` | HLT-01 .. HLT-03 | Cluster |
| `HIS` | `history.md` | HIS-01 .. HIS-03 | Cluster |
| `LAW` | `law.md` | LAW-01 .. LAW-05 | Cluster |
| `LIT` | `literature.md` | LIT-01 .. LIT-03 | Cluster |
| `MGT` | `management.md` | MGT-01 .. MGT-03 | Cluster |
| `MKT` | `marketing.md` | MKT-01 .. MKT-03 | Cluster |
| `MED` | `medicine.md` | MED-01 .. MED-03 | Cluster |
| `NWS` | `news.md` | NWS-01 .. NWS-03 | Cluster |
| `PHI` | `philosophy.md` | PHI-01 .. PHI-03 | Cluster |
| `POL` | `politics.md` | POL-01 .. POL-03 | Cluster |
| `PSY` | `psychology.md` | PSY-01 .. PSY-03 | Cluster |
| `RHE` | `rhetoric.md` | RHE-01 .. RHE-03 | Cluster |
| `SCI` | `science.md` | SCI-01 .. SCI-03 | Cluster |
| `SO` | `solutions.md` | SO-01 .. SO-08 | Operational |
| `UI` | `ui-frontend.md` | UI-01 .. UI-09 | Operational |

*Agent-only prefixes (forbidden in domain files):* `PM`, `UX`, `GR`, `SD`, `IR`, `DB`, `SEC`, `RS`.

---

## 6. Formal Grammar for Axiom Domain Rules (EBNF)

```ebnf
DomainRule        ::= "- **" RuleId "**" [ " " Title ] " WHEN " Trigger " → DO " Action " | why: " Why " | breaks: " Breaks " | conf: " Confidence " | ev: " Evidence " | status: " Status " " Tags " ^" Anchor

RuleId            ::= Prefix "-" Digit Digit
Prefix            ::= [A-Z]{2,5}
Title             ::= "(" [^)]+ "):"
Trigger           ::= [^\n→|]+
Action            ::= [^\n|]+
Why               ::= [^\n|]+
Breaks            ::= [^\n|]+
Confidence        ::= "1" | "2" | "3" | "4" | "5"
Evidence          ::= ( WikiLink+ | ProjectCitation+ )
WikiLink          ::= "[[" [^\]]+ "]]"
ProjectCitation   ::= [A-Za-z0-9-(),. ]+
Status            ::= "active" | "candidate" | "superseded" | "retired"
Tags              ::= ( "#" [a-z0-9_-]+ )+
Anchor            ::= Lowercase(Prefix) "-" Digit Digit
```

