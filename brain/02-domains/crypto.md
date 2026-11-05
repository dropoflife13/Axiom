---
domain: crypto
prefix: CRY
version: 1
status: active
---

# [CRY] Cryptography & Web3 Systems — How I Think

> Status: `active` (3 active rules). Foundational distributed consensus and cryptographic invariants seeded under ARB-07 first-principles grounding.

## Mental Model & Worldview

- Cryptographic protocols replace institutional trust assumptions with verifiable mathematical proofs and adversarial consensus guarantees.

## Rules (`CRY-01` .. `CRY-99`)

- **CRY-01** (Byzantine Fault Tolerance): WHEN designing or auditing a decentralized consensus network → DO ensure the protocol reaches deterministic or probabilistic agreement even when a bounded fraction of nodes are faulty or actively malicious | why: Lamport, Shostak, and Pease (1982) proved that distributed systems require explicit Byzantine fault tolerance (f < n/3 in classical BFT, <50% computational power in Nakamoto consensus) to prevent double-spending or state divergence | breaks: When a single entity or cartel controls >51% of the network hash rate or stake (51% attack) | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #crypto #consensus ^cry-01
- **CRY-02** (Decentralization & Trustless Verification): WHEN architecting trustless state transitions → DO remove reliance on a central intermediary by requiring every state change to be independently verifiable via public-key signatures, Merkle inclusion proofs, and open consensus rules | why: Satoshi Nakamoto (2008) demonstrated that peer-to-peer electronic state requires cryptographic proof rather than trusted third-party settlement | breaks: When off-chain physical assets (oracles, custodial RWAs) are bridged onto chain, reintroducing trusted legal/physical custodians | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #crypto #verification ^cry-02
- **CRY-03** (Kerckhoffs's Principle): WHEN evaluating cryptographic security → DO assume the adversary knows the complete algorithm and protocol specification, relying exclusively on the secrecy and entropy of the private keys | why: Auguste Kerckhoffs (1883) and Claude Shannon ("the enemy knows the system") proved that security through obscurity collapses upon reverse-engineering | breaks: Never in production cryptography; proprietary unreviewed ciphers are treated as broken by default | conf: 5 | ev: [[CONVENTIONS]] [[OPERATING-PRINCIPLES]] [[arbiter]] | status: active #crypto #security ^cry-03
