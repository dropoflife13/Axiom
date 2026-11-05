---
domain: solutions
prefix: SO
version: 5
status: active
---
# Solutions Specialist — How I Think

## My first move
In the first 15 minutes on a blank page, I **define the actors, who owns what, the finite state machine of transitions, and the hard stack/network constraints** before writing any schema or UI (`S-01`, `A-01..A-05`).

## Default lens
1. Real-world operational & network constraints (intermittent PH mobile data, no-Docker, pinned stacks)
2. Derived state vs. immutable transaction logs
3. Explicit finite state machines for workflows
4. Procedural & structural efficiency over asset bloat
5. Disciplined relational scaling & 500-row/2s sync-to-async boundaries

## Sub-areas (Self-Map)
| Area | Self (0–3) | Demonstrated (0–3) | Evidence |
|---|---|---|---|
| Constraint-driven architecture (low-cost, no-Docker, pinned stacks) | 3 | 3 | S-01, A-02 (Pinned Stack), A-03, A-05 (FlexSpace) |
| Offline-first & sync reconciliation (outbox, idempotency, clock skew) | 3 | 3 | S-01, A-01 (DB-05, IR-04) |
| Append-only storage & materialized read views | 3 | 3 | S-01, A-01 (DB-01, DB-02), A-05 (Agrivet) |
| Asynchronous processing & write offloading (debounced triggers, queues) | 3 | 3 | S-01, S-02, A-01 (DB-03, DB-09) |
| Integration boundaries & strict RPC contracts | 3 | 3 | S-01, A-01 (DB-05), A-02 (Sec 12.2) |
| Pragmatic scale limits (simple early vs breaking at 10×) | 3 | 3 | S-01, S-02, A-01 (DB-08, DB-09) |

## Rules
Grammar: CV-02. IDs `SO-nn`. Mandatory `breaks:` condition for conf ≥ 3. Concrete `ev:` only.

- **SO-01** WHEN tracking current operational balances (agrivet retail stock, market commodity prices, approved student OJT hours) → DO compute or materialize current state exclusively from verified batch/transaction logs (`DB-02`), never by overwriting a single mutable summary integer in-place | why: overwriting totals hides expired batches, unapproved outliers, and audit drift | breaks: non-auditable high-velocity ephemeral counters (e.g. live pageview tickers) where historical batch lineage has zero business value | conf: 5 | ev: S-01, A-05 (Agrivet), A-01 (DB-02), A-02 (Sec 12.3.1) | status: active #derived-state ^so-01

- **SO-02** WHEN modeling multi-actor entity lifecycles (partnership requests, org membership applications, offline sync items) → DO define a strict finite state machine of canonical states (e.g. `requested → accepted | declined`, `pending → synced | flagged | rejected`) enforced by DB `CHECK` constraints or Zod schemas, rejecting arbitrary status strings or illegal jumps | why: prevents impossible intermediate states and happy-path-only bugs | breaks: user-customizable kanban or workflow builders where end-users intentionally define custom ad-hoc columns at runtime | conf: 4 | ev: S-01, A-05 (Godot state machines), A-01 (IR-04), A-02 (Sec 12.3), A-03 (Sec 6) | status: active #state-machine ^so-02

- **SO-03** WHEN read traffic surges on public or dashboard endpoints → DO follow the strict relational scaling sequence: indexing (`EXPLAIN (ANALYZE, BUFFERS)`) → query rewrite → CDN/edge cache with explicit invalidation tags → materialized read view (`REFRESH CONCURRENTLY`) → read replica, before ever introducing microservices, Kafka, or sharding | why: premature distributed systems multiply operational failure points for small teams | breaks: multi-region active-active write requirements exceeding single-primary PostgreSQL vertical write limits with an approved sharding ADR | conf: 4 | ev: S-01, A-01 (DB-07, DB-08, DB-09) | status: active #scaling-ladder ^so-03

- **SO-04** WHEN delivering interactive 3D centerpieces or media showcases over constrained mobile networks → DO generate 3D geometry procedurally via code/splines/seeded math (<50KB) rather than multi-megabyte `.gltf` downloads, and keep short preview `<video>` tags preloaded in collapsed CSS Grid rows (`0fr → 1fr`) instead of unmounting/remounting | why: guarantees 60fps initial paint and zero black-flash rebuffering | breaks: assets requiring photorealistic baked PBR textures, rigged skeletal character animations, or long-form videos (>60s) where DOM persistence exhausts memory | conf: 4 | ev: S-01, A-03 (Sec 2.1, Sec 3), A-04 (brainGraph.ts) | status: active #procedural-perf ^so-04

- **SO-05** WHEN processing batch uploads or offline sync queues (CSV student imports, batched price logs) → DO enforce `UNIQUE` idempotency keys (`ON CONFLICT DO NOTHING`), validate and return per-row status so one malformed row never aborts the entire batch, and keep materialized view refreshes off the synchronous write path | why: field networks drop mid-sync and users retry batches; synchronous view refreshes lock hot tables | breaks: strict all-or-nothing double-entry accounting transfers where partial batch commit violates conservation of money | conf: 4 | ev: S-01, A-01 (DB-03, DB-05), A-02 (Sec 12.3.1 Arwin CSV rules) | status: active #batch-resilience ^so-05

- **SO-06** WHEN designing bulk file imports or batch mutations (school cohort CSV uploads, agrivet inventory imports) → DO run synchronous server validation with a pre-commit row-level accept/reject preview for batches ≤ 500 rows and < 2s execution, and switch to client chunking or an async outbox job with a progress bar once batches exceed 500 rows or 2s | why: synchronous HTTP requests time out on serverless platforms above ~500 rows, while async worker infrastructure is unnecessary overhead for single-cohort school uploads | breaks: batches where every row triggers an external third-party API call (e.g. sending 500 transactional emails or provisioning 500 Auth accounts synchronously), which must offload to an async queue even below 500 rows | conf: 4 | ev: S-02, A-01 (DB-05, DB-09), A-02 (Sec 12.3.1 Arwin/Khent upload rules), A-05 (Agrivet) | status: active #sync-async-cutoff ^so-06

- **SO-07** WHEN architecting a coupled AI governance + knowledge system (`brain/` + `agents/`) → DO enforce a deterministic pre-flight file gate (`BN-00`) at both API and UI boot that halts initialization if any of the 7 Core Agent files (`PM, UX, GR, SD, IR, DB, SEC`) is missing, and distribute public starter templates with `0 personal rules` (blank-slate `empty` state) while keeping the 7 agent gatekeepers intact | why: a brain vault without execution agents has no enforcement boundary, while a forked vault pre-filled with someone else's rules produces unearned copy-pasted decisions | breaks: read-only portfolio showcase mode (`vaultMode === 'assessed'`) where visitors inspect the author's earned constellation without mutating it | conf: 5 | ev: S-03, A-01, A-06 (route.ts, brain-parser.ts, brainagent.md) | status: active #preflight-gate ^so-07

- **SO-08** WHEN synchronizing markdown knowledge bases with interactive visualizers or API endpoints → DO parse the live `.md` files on disk as the single canonical source of truth to populate both parent document nodes and all child synaptic nodes (keeping static TypeScript fallbacks 100% mirrored for offline/edge builds), and use `--webpack` on Windows Next.js production builds when Turbopack PostCSS child-process IPC fails | why: updating only parent nodes from disk while child nodes read a stale hardcoded array creates silent data drift between the vault and the 3D UI | breaks: purely static client-only deployments without a Node filesystem runtime where the build-time snapshot is the sole data source | conf: 5 | ev: S-03, A-06 (route.ts, brain-parser.ts, package.json) | status: active #live-sync ^so-08

## Open questions (gaps to elicit)
_All core sub-areas + Cortex v2.4 pre-flight and live-sync invariants covered._
