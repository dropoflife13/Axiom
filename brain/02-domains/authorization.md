---
domain: authorization
prefix: AUTH
version: 1
status: active
---
# Externalized Authorization — How I Think

## My first move
In the first 3 seconds of evaluating access control, I check **whether authorization logic is coupled to application code or database queries**: whether permissions are hardcoded into `if/else` branches or scattered across SQL/RLS policies instead of externalized to a deterministic, testable Policy Decision Point (PDP).

## Default lens
1. PDP/PEP separation (decision external to enforcement)
2. Attribute-Based Access Control (ABAC) over static role explosion
3. Policy-as-Code (declarative, versioned in git, tested in CI)
4. Runtime derived roles bound to resource context
5. Centralized policy distribution and aggregated decision audit trails

## Rules
Grammar: CV-02. IDs `AUTH-nn`. Mandatory `breaks:` condition for conf ≥ 3. Concrete `ev:` only.

- **AUTH-01** (PDP/PEP Separation): WHEN designing authorization → DO externalize the decision logic to a Policy Decision Point (PDP) and enforce it at the Policy Enforcement Point (PEP) in the application. Do not scatter authorization logic inside database queries (like RLS) or app code (like `if/else` checks) | why: externalizing policy decouples business permission rules from application code and database schema, preventing logic duplication and enabling independent audits | breaks: for simple monolithic apps where a single database policy is sufficient | conf: 4 | ev: enterprise-auth-patterns, A-01 (SEC-02), A-03 | status: active #pdp-pep ^auth-01

- **AUTH-02** (ABAC > RBAC): WHEN access rules depend on resource ownership (e.g., "a user can edit their own post") → DO use Attribute-Based Access Control (ABAC) rather than static Role-Based Access Control to prevent role explosion | why: ABAC evaluates subject, resource, action, and environment attributes dynamically rather than creating exponential static roles | breaks: for flat systems with only 2-3 system-wide roles and no ownership logic | conf: 4 | ev: enterprise-auth-patterns, S-01, A-01 | status: active #abac-rbac ^auth-02

- **AUTH-03** (Policy-as-Code): WHEN defining access rules → DO write them as versioned, testable YAML policies in Git so they can be tested in CI/CD, rather than relying on manual testing or database migrations | why: declarative policy-as-code enables unit testing of permissions in CI, audit histories in pull requests, and instant rollbacks | breaks: small throwaway prototypes where access rules never change after initial scaffold | conf: 4 | ev: enterprise-auth-patterns, CI-verification, S-02 | status: active #policy-as-code ^auth-03

- **AUTH-04** (Derived Roles): WHEN a user's permission depends on the specific resource they are accessing → DO compute "derived roles" dynamically at runtime (e.g., `role: owner` if `resource.ownerId == principal.id`) | why: dynamic role computation at the policy engine prevents polluting user identity profiles with per-resource role bindings | breaks: static global permissions where resource context is completely irrelevant | conf: 4 | ev: enterprise-auth-patterns, A-02, S-01 | status: active #derived-roles ^auth-04

- **AUTH-05** (Centralized Control Plane): WHEN managing authorization across multiple microservices → DO use a centralized control plane to distribute policy updates across all services in seconds and aggregate a centralized audit trail of every access decision | why: centralized distribution guarantees uniform policy evaluation across all services and eliminates blind spots in security audits | breaks: standalone offline-first local applications that do not talk to network microservices | conf: 4 | ev: enterprise-auth-patterns, A-03, S-03 | status: active #control-plane ^auth-05
