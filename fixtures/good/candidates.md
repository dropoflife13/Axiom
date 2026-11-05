---
type: candidates
version: 1
---

# Staged Candidates

- **CAND-01** (Externalized Boundary): WHEN building an async job queue → DO enforce per-tenant concurrency limits | why: Unbounded multi-tenant queues allow one runaway tenant to starve all others | breaks: strictly single-tenant dedicated deployments | conf: 3 | ev: Incident INC-2024-03, load testing runs | status: candidate #queue #reliability ^cand-01
- **CAND-02** WHEN logging request payloads → DO mask credentials and authorization headers | why: Prevent credential leakage into long-term aggregation stores | breaks: debug logs in local mock harness | conf: 2 | ev: Audit report SEC-2024-Q1 | status: candidate #security #compliance ^cand-02
- **CAND-03** (Deterministic Idempotency): WHEN designing mutating POST endpoints → DO require an Idempotency-Key header | why: Network drops cause client retries resulting in duplicate state mutations | breaks: read-only safe methods GET and HEAD | conf: 3 | ev: Stripe RFC 7396, internal billing post-mortem | status: candidate #api #idempotency ^cand-03

## Promotion Ledger
- 2026-01-15: None yet.

