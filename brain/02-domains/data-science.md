---
domain: data-science
prefix: DS
version: 1
status: active
---

# [DS] Data Science & Statistical Modeling — How I Think

> Status: `active` (3 active rules). Foundational statistical inference invariants seeded under ARB-07 first-principles grounding.

## Mental Model & Worldview

- Statistical modeling extracts generalizable signal from noisy observations while rigorously guarding against confounding, leakage, and overfitting.

## Rules (`DS-01` .. `DS-99`)

- **DS-01** (Correlation != Causation): WHEN two variables co-vary in observational data → DO NOT infer that one causes the other without controlling for confounders, reverse causality, and selection bias | why: Judea Pearl's causal ladder and classical statistics demonstrate that observational association (P(Y|X)) is fundamentally distinct from interventional causation (P(Y|do(X))) | breaks: Only in a controlled randomized trial (RCT) or natural experiment with verified exogenous instrumental variables can causality be established | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #data-science #causality ^ds-01
- **DS-02** (Train-Test Contamination & Out-of-Sample Validation): WHEN evaluating predictive model performance → DO strictly partition training, validation, and holdout test sets (respecting temporal ordering for time-series) before any normalization, imputation, or feature selection | why: Hastie, Tibshirani, and Friedman (Elements of Statistical Learning) show that target or preprocessing leakage inflates validation metrics while causing catastrophic production generalization failure | breaks: Purely descriptive exploratory clustering on a closed historical census where no out-of-sample prediction is claimed | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #data-science #validation ^ds-02
- **DS-03** (Base Rate Neglect & Bayes' Theorem): WHEN interpreting a classifier's precision or diagnostic test result → DO condition the true-positive probability on the underlying population base rate (prior probability) via Bayes' Theorem | why: Even a 99% specific test yields mostly false positives when the condition's prevalence in the population is 0.1% | breaks: Balanced 50/50 benchmark datasets where prior probabilities are artificially equalized | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #data-science #bayesian ^ds-03
