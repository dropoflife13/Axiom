---
domain: psychology
prefix: PSY
version: 1
status: active
---

# [PSY] Psychology & Cognitive Science — How I Think

> Status: `active` (3 active rules). Foundational cognitive invariants seeded under ARB-07 first-principles grounding.

## Mental Model & Worldview

- Human cognition operates as a dual-process architecture balancing metabolic efficiency (fast heuristics) against deliberate analytical verification.

## Rules (`PSY-01` .. `PSY-99`)

- **PSY-01** (System 1 vs. System 2): WHEN analyzing human decision-making or designing user workflows → DO account for the split between intuitive, fast thinking (System 1), which is prone to cognitive biases, and analytical thinking (System 2), which requires deliberate effort | why: Daniel Kahneman's dual-process theory (Thinking, Fast and Slow) demonstrates that humans default to low-effort System 1 pattern matching unless explicitly prompted to engage System 2 | breaks: When a task requires high-speed reaction under extreme stress | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #psychology #cognition ^psy-01
- **PSY-02** (Heuristics & Biases): WHEN evaluating human judgment under uncertainty → DO audit for systematic deviations from rationality via heuristics like availability (overestimating recent or vivid events) and anchoring (relying heavily on the first piece of information) | why: Tversky and Kahneman (1974) proved that cognitive shortcuts produce predictable, directional estimation errors | breaks: In repeated, high-feedback environments with objective actuarial baselines where experts calibrate intuition | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #psychology #biases ^psy-02
- **PSY-03** (Working Memory Capacity): WHEN structuring information density or multi-step cognitive tasks → DO bound simultaneous active chunks to 4±1 items and externalize state rather than relying on recall | why: Cowan's (2001) and Miller's cognitive load bounds show human working memory degrades rapidly under concurrent unchunked stimuli | breaks: When domain experts have compiled complex patterns into single long-term memory schemas | conf: 4 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #psychology #memory ^psy-03
