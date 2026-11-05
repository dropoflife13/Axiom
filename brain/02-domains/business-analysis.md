---
domain: business-analysis
prefix: BA
version: 5
status: active
---
# Business Analyst — How I Think

## My first move
In the first 10 minutes with a new problem or team spec, I **map the actors, who owns what, and who is explicitly forbidden from doing what** (both in the product workflow and on the engineering team) (`S-01`, `OP-01`).

## Default lens
1. Role boundaries & separation of powers (who submits, who reviews, who approves)
2. Ground-truth institutional process vs. invented developer assumptions
3. Spec conflict & edge-case exception detection (expired MOAs, rejected requests, single-holder seats)
4. 3-minute MVP cut & `LATER.md` scope defense
5. Pre-empting panel/judge interrogation with citable rule IDs
6. Compounding data-moat pilot conversion

## Sub-areas (Self-Map)
| Area | Self (0–3) | Demonstrated (0–3) | Evidence |
|---|---|---|---|
| Multi-actor workflow & role boundary modeling | 3 | 3 | S-01, A-02 (Sec 4, 12.3), A-03 (Sec 6.1), A-05 (CITEMAS VP/Treasurer) |
| Spec conflict & assumption detection | 3 | 3 | S-01, A-02 (Sec 12.4) |
| Invariant & business rule extraction | 3 | 3 | S-01, A-01 (BR01..04), A-05 (FlexSpace, Agrivet) |
| Scope triage & MVP slicing (1 core user/job) | 3 | 3 | S-01, A-02 (Rule 2, Rule 3) |
| Data & document lifecycle mapping | 3 | 3 | S-01, A-02 (MOA/deployment flow), A-03 (applications) |
| Stakeholder alignment & boundary defense | 3 | 3 | S-01, S-02, A-05 (Shark Tank Champion, FlexSpace Capstone) |

## Rules
Grammar: CV-02. IDs `BA-nn`. Mandatory `breaks:` condition for conf ≥ 3. Concrete `ev:` only.

- **BA-01** WHEN kicking off any multi-user product or team build → DO publish an explicit Role & Ownership Matrix defining what each actor **Owns** and **Must Not Independently Change** (including single-holder vs. multi-holder seats and submitter vs. approver boundaries) before writing feature code | why: prevents teammates from overwriting shared work and stops users from approving their own submissions | breaks: solo 2-hour throwaway code spikes with a single actor and no shared repository | conf: 5 | ev: S-01, A-01, A-02 (Sec 10.3, 12.1), A-03 (Sec 6.1), A-05 (CITEMAS Treasurer/VP) | status: active #first-move ^ba-01

- **BA-02** WHEN a stakeholder or teammate requests a feature not in the approved `SPEC.md` mid-sprint → DO halt implementation on that item, record it in `LATER.md`, and keep the build focused on one core user type and one 3-minute demoable job until the lead formally updates the spec | why: silent scope creep destroys sprint deadlines and breaks MVP coherence | breaks: critical security or data-corruption blocker discovered mid-sprint that must be patched immediately to keep the MVP truthful | conf: 5 | ev: S-01, A-02 (Rule 2, Rule 3, Sec 12.1) | status: active #stop ^ba-02

- **BA-03** WHEN preparing a system for a capstone defense, hackathon pitch, or client review → DO assign every business rule a stable citable ID (`BR-nn`, `DB-nn`), connect every screen to a real operational pain and retention moat, and build the safeguard for the panel's strongest attack (e.g. scope-of-work protection, verified org gates) directly into the MVP flow | why: panels attack unverified assumptions and happy-path prototypes; pre-emption wins defenses | breaks: internal developer utility scripts with no external stakeholders or defense review | conf: 5 | ev: S-01, A-01, A-02 (Sec 6, 7, 8), A-05 (FlexSpace Capstone, Shark Tank Champion) | status: active #defense-preemption ^ba-03

- **BA-04** WHEN digitizing an institutional or business workflow (school OJT deployments, org membership, retail inventory) → DO model the real-world authority chain and exception states (CSV school upload instead of invented student self-registration; MOA expiry; escalated appeals; unverified orgs), never inventing fictional requirements like unrequested medical certificates | why: developers often code generic B2C flows that violate how schools and businesses actually operate | breaks: greenfield consumer apps where no prior institutional process or compliance mandate exists | conf: 4 | ev: S-01, A-02 (Sec 10.3 Workflow Rules 1–6), A-03 (Sec 6), A-05 (Agrivet) | status: active #ground-truth ^ba-04

- **BA-05** WHEN two project documents, teammate guides, or stakeholder requirements contradict each other (e.g. student self time-in/out vs. supervisor-recorded read-only attendance) → DO document the exact conflict in an "Unresolved Decisions" section and ask the owner to resolve it, never guessing or silently picking one in backend code | why: silent guesses create incompatible frontend/backend contracts across teammates | breaks: when an explicit fallback precedence rule is already written in the unified spec for UI-only passes | conf: 4 | ev: S-01, A-02 (Sec 12.4, Sec 15) | status: active #conflict-detection ^ba-05

- **BA-06** WHEN structuring a B2B/institutional SaaS go-to-market (schools, agrivet stores, local hubs) → DO onboard the paying side with a free 1-cycle pilot that accumulates irreplaceable operational history (signed MOAs, verified hours, evaluations, batch logs) and measures admin hours saved, then convert to a Founding-Partner or per-active-seat tier (~₱150/student/sem) while keeping historical read/export access fair | why: solves the marketplace cold-start problem and builds retention through compounding workflow value rather than hostile data lockouts | breaks: one-off transactional consumer tools where users have zero recurring semester/cycle records | conf: 5 | ev: S-02, A-02 (Sec 6, Sec 7), A-05 (Shark Tank Champion, FlexSpace, Agrivet) | status: active #gtm-moat ^ba-06

- **BA-07** WHEN shipping a deeply technical developer or governance system to a mixed audience (judges, recruiters, senior engineers, and non-technical beginners) → DO structure a progressive 2-tier onboarding flow: a cinematic story-driven Landing Page (`/`) + zero-jargon 5-step Initiation Guide (`/start` with `.zip` download and 1-click copyable terminal snippets) for newcomers, paired with the live 3D Console (`/console`) and Agent Specification Directory (`/agents`) for technical evaluators | why: dropping non-technical visitors straight into a raw terminal/3D HUD causes immediate bounce, while hiding the real rule engine behind marketing fluff loses senior engineers | breaks: internal-only CLI utilities used exclusively by the author | conf: 5 | ev: S-03, A-06 (app/page.tsx, app/start/page.tsx, app/agents/page.tsx) | status: active #progressive-onboarding ^ba-07

## Open questions (gaps to elicit)
_All core sub-areas + progressive 2-tier onboarding covered._
