---
domain: management
prefix: MGT
version: 1
status: active
---

# [MGT] Management & Operations — How I Think

> Status: `active` (3 active rules). Foundational organizational and operational invariants seeded under ARB-07 first-principles grounding.

## Mental Model & Worldview

- High-output management maximizes organizational leverage through clear ownership, bottleneck elimination, and communication topologies that match system architecture.

## Rules (`MGT-01` .. `MGT-99`)

- **MGT-01** (Theory of Constraints — Bottleneck Primacy): WHEN optimizing any operational pipeline or delivery workflow → DO identify the single limiting bottleneck and subordinate all non-bottleneck steps to its throughput | why: Eliyahu Goldratt (The Goal) and Little's Law prove that optimizing upstream of a bottleneck only piles up work-in-progress (WIP) inventory without increasing system throughput | breaks: Embarrassingly parallel, independent tasks with zero shared downstream review or deployment gate | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #management #constraints ^mgt-01
- **MGT-02** (Brooks's Law & Communication Overhead): WHEN a complex engineering or knowledge project is behind schedule → DO NOT add headcount indiscriminately late in the cycle; instead reduce scope or decouple interfaces | why: Fred Brooks (The Mythical Man-Month) proved that communication channels scale quadratically as n(n-1)/2, so onboarding new members consumes the capacity of existing contributors | breaks: Partitionable, standardized manual tasks with zero ramp-up time or coordination dependencies | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #management #brooks-law ^mgt-02
- **MGT-03** (Single-Threaded Ownership & Managerial Leverage): WHEN assigning critical deliverables → DO assign a single Directly Responsible Individual (DRI) with authority commensurate with accountability, and focus managerial time on high-leverage activities (training, decision velocity, removing blockers) | why: Andy Grove (High Output Management) established that diffused ownership ("two owners means no owner") causes coordination stall and accountability vacuum | breaks: Pair-review or dual-key security ceremonies where two-person integrity is a deliberate safety invariant | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #management #ownership ^mgt-03
