# Agent Suite — Ownership Matrix

## 1. Purpose
- Seven single-responsibility agents. Each rule has exactly one owner ID; other files reference it ("See SEC-04").
- Reuse: copy `agents/` into any project; replace or delete `MT:` (MerkadoTrack) annotations; keep rule IDs stable.
- New rule = next free number in the owning file. IDs are never reused; retired rules are marked `RETIRED`.

## 2. Roster
| File | Prefix | Owns |
|---|---|---|
| productmanageragent.md | PM | PRD, TRD, App Flow, Design Brief, logical schema plan, implementation plan, BR registry, waivers, defense traceability |
| uiuxagent.md | UX | dark mode, mobile menu, sticky header, hover, loading, FAQ, modals, toasts, 404, scroll progress, copy button, sync surfaces, a11y |
| growthagent.md | GR | newsletter, UTM, update dates, Cmd+K search, SEO, analytics, public claims |
| systemsdesignagent.md | SD | CAP, consistency, SLOs, bottlenecks, scaling order, redundancy, SPOF (non-auth), fault tolerance, CQRS decision, ADRs |
| integrationagent.md | IR | webhooks, real-time, idempotency, outbox sync, retries, circuit breakers, jobs/queues, self-healing |
| dbaagent.md | DB | schema invariants, RLS authoring, indexing, read/write scaling, migrations |
| securityagent.md | SEC | threat model, RLS attacks, secrets, queue security, ingestion trust, auth SPOF, webhook auth, hardening, abuse |

## 3. Boundary Rulings
| Topic | Define / Decide | Implement | Attack / Verify |
|---|---|---|---|
| Business rules | PM-04 | DB-01..05 | SEC-02 |
| RLS | — | DB-06 | SEC-02 |
| CAP / consistency | SD-01, SD-02 | DB-08, IR-02 | SD-09 checks |
| CQRS | SD-10 | DB-02, DB-08, IR-07 | DB-02 checks |
| Caching | — | DB-08 | SD-03 |
| Async writes / jobs | SD-05 | IR-07, DB-09 | IR-08 |
| Offline sync | SD-01 | IR-04, DB-05, UX-12 | SEC-04 |
| Idempotency | — | IR-03, DB-05 | IR checks |
| Anomaly / fraud | SEC-05 | DB-05 | SEC-05 checks |
| Webhooks | IR-01 | IR-01 | SEC-07 |
| SPOF | SD-08 (non-auth) | SD-07 | SEC-06 (auth) |
| Search | GR-04 | DB-07 | SEC-09 |
| FAQ / 404 | UX-06, UX-09 | GR-05 (SEO) | UX-13 |

## 4. Workflow & Modes
- Order: PM → SD → DB → IR → UX → GR → SEC (final gate).
- **Gate** blocks with `GATE: FAIL <ID>`; **Insight** advises with `INSIGHT`. Insight never overrides Gate.
- Waivers only through PM-12 (`docs/WAIVERS.md`). No agent self-waives.
- Required docs: `PROBLEM.md`, `docs/{PRD,TRD,APP_FLOW,DESIGN_BRIEF,SCHEMA_PLAN,IMPLEMENTATION_PLAN,SLO,BOTTLENECKS,SPOF,THREAT_MODEL,DEFENSE_QA,WAIVERS,UTM_REGISTRY,EVENTS}.md`, `docs/adr/`.
