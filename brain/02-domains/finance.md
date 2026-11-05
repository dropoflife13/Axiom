---
domain: finance
prefix: FIN
version: 1
status: active
---

# [FIN] Finance & Capital Markets — How I Think

> Status: `active` (3 active rules). Foundational capital and risk invariants seeded under ARB-07 first-principles grounding.

## Mental Model & Worldview

- Finance prices time, uncertainty, and liquidity across capital structures; every promised return is compensation for bearing irreducible risk.

## Rules (`FIN-01` .. `FIN-99`)

- **FIN-01** (Risk-Return Trade-off): WHEN evaluating any financial asset, investment, or capital allocation → DO treat higher potential returns as requiring acceptance of higher variance or default risk, and audit any claim of "high return, zero risk" as mispriced tail risk | why: Markowitz Modern Portfolio Theory and the Capital Asset Pricing Model (CAPM) establish that expected return is a function of non-diversifiable systematic risk | breaks: In market anomalies, insider trading, or fraud (like Ponzi schemes), where the risk-return relationship is artificially skewed | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #finance #risk-return ^fin-01
- **FIN-02** (Time Value of Money): WHEN comparing cash flows occurring at different points in time → DO discount future cash flows back to Net Present Value (NPV) using an opportunity-cost discount rate reflecting inflation and risk | why: A dollar today commands positive reinvestment yield and purchasing power certainty over a nominal dollar in the future (Irving Fisher, The Theory of Interest) | breaks: In sustained deflationary liquidity traps with negative nominal rates where holding cash appreciates in real purchasing power | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #finance #valuation ^fin-02
- **FIN-03** (Diversification & Correlation Convergence): WHEN constructing a resilient portfolio or balance sheet → DO combine assets with low or negative covariance to eliminate idiosyncratic risk, while stress-testing for correlation convergence toward 1.0 during systemic liquidity crises | why: Markowitz (1952) proved diversification reduces portfolio variance below the weighted average of constituent variances, except when systemic deleveraging forces all risk assets to sell off simultaneously | breaks: During acute systemic margin calls when only cash and short-duration sovereign debt maintain uncorrelated liquidity | conf: 4 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #finance #portfolio ^fin-03
