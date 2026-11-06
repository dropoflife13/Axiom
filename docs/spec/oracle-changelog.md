# Oracle Changelog

- 2026-11-06, item 1, `scripts/oracle.ts`, repointed validation to the canonical `fixtures/task-v2/{good,bad}` directories; the duplicate `fixtures/oracle` tree was removed because its shared fixtures were byte-identical.
- 2026-11-06, item 1, `fixtures/oracle/`, removed the duplicate fixture tree so there is one source of truth for oracle fixtures.
- 2026-11-06, item 2, `fixtures/task-v2/seed.sql`, changed deployer default table privileges to grant ALL only to `application` and `PUBLIC`; `readonly_user` receives no default table privileges, matching the verified probe harness.
- 2026-11-06, item 3, `fixtures/task-v2/facts.json`, `scripts/facts.ts`, `scripts/generate-env-facts-doc.ts`, and `scripts/dev-recall-gate.ts`, marked F-14 UNCONFIRMED, made F-39 applicable to `view = true`, added generated documentation support for UNCONFIRMED, and corrected the F-38 description to `(key, observed_at DESC)`; this makes the fact registry and generated specification agree.
