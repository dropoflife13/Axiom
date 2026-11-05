---
type: conventions
version: 2
status: active
---
# Conventions

Formats, ID rules, and thresholds are defined here only. Other files cite CV-nn.

## Rules
- **CV-01** IDs are `<PREFIX>-nn` (two digits, three after 99). Never reused. Retired items stay with `status: retired`.
- **CV-02** Rule line grammar, one line, fields separated by ` | `:
  `- **ID** WHEN <trigger> → DO <action> | why: <reason> | breaks: <condition> | conf: <1–5> | ev: <concrete artifacts or specs> | status: <candidate|active|superseded|retired> #tag ^block-id`
  `conf`, `ev`, `status` are required. For rules at `conf ≥ 3`, `breaks:` is **mandatory**. Red flags use `SIGNAL → MEANS → DEFAULT` plus `dom:`. Patterns use `SITUATION → PLAY` plus `dom:`. Principles (`OP`) and taste (`TA`) are free declarations.
- **CV-03** Confidence and Promotion:
  - A rule is `active` only with a trigger, an action, concrete real-world evidence (`ev:` citing specific projects or artifacts, never generic textbook slogans), and meeting the confidence table below (conf ≥ 3).
  - **The Boundary Rule:** Repetition across projects without a known failure boundary is just a repeated habit. No rule reaches `conf 3` without an explicit `breaks:` condition stating when it would be wrong or waived.
  - Lower-confidence or unbounded lines stay `candidate` in `06-raw/inbox.md`. Only the human promotes.
- **CV-04** Every file has `type`, `version`, `status` (`empty` placeholder · `draft` · `active`). A domain file becomes `active` at ≥ 3 active rules.
- **CV-05** Contradictions: mark the older rule `superseded` with `superseded-by: <ID>`, open an X-nn in GAP-FINDER, never delete.
- **CV-06** Edits: typo or format → nothing. New evidence → update `ev` and `conf`. Changed trigger or action → new ID, old one superseded. Meaning changes bump the file `version`.
- **CV-07** Prefixes come from the registry below. A new domain prefix is taken from the free pool and registered here first.
- **CV-08** Links: wikilinks (`[[S-01]]`); session files are named `S-nn.md`; every rule line ends with a lowercase block ID (`^cs-01`) so `[[cybersec#^cs-01]]` resolves.
- **CV-09** Privacy: no credentials, client-confidential data, or third parties' personal data in the vault. Sanitize artifacts before mining.

## Confidence scale (CV-03)
| conf | Meaning | Evidence & Boundary required |
|---|---|---|
| 1 | guess | one mention or unverified intuition |
| 2 | reasoned | one session answer or artifact, with the owner's concrete reason |
| 3 | demonstrated & bounded | ≥ 2 independent real-world project artifacts + **mandatory `breaks:` condition** (when it fails or is waived) |
| 4 | battle-tested | ≥ 3 independent project implementations, verified failure boundaries, and edge cases |
| 5 | proven invariant | survived adversarial audit, proven in production outcomes, failure mode fully characterized |

## Prefix registry (CV-07)
| Group | Prefixes |
|---|---|
| Reserved by the agent suite (never domains) | PM UX GR SD IR DB SEC RS |
| Vault rule files | BN (brain agent) · EP (elicitation) · TE (test examiner) · CV (conventions) · SP (sync) · AA (archaeology) |
| Content IDs | H heuristic · RF red flag · P pattern · M model · OP principle · TA taste · Q question · S session · A artifact · X contradiction · CAND candidate · TS tacit signal · PB probe · LN lens |
| Scenario / excavation IDs | FL flash · FH flaw hunt · CW compliant-but-wrong · RK rank · PRE pre-mortem |
| Domains in use | CS cybersec · SO solutions · BA business analysis · UI ui-frontend · AUTH authorization · ARB arbiter · PSY psychology · ECO economy · PHI philosophy · GEO geopolitics · RHE rhetoric · HLT health · LIT literature · ART art · EDU education · MKT marketing · MGT management · LAW law · POL politics · ENV environment · HIS history · CRY crypto · FIN finance · NWS news · BIZ business · DS data-science · SCI science · MED medicine |
| Domain free pool | DA data · AR architecture · GC governance/compliance · PV privacy · DV devops · ML AI/ML |
