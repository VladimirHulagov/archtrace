---
id: "009"
title: "DC-SCM BMC SoC: ASPEED AST2600 vs Nuvoton NPCM7xx vs custom"
status: accepted
type: decision
parent: "004"
cross_refs: []
created: 2026-07-24
decided: 2026-07-26
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "AST2600 has best OpenBMC support, industry standard"
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "AST2600 has dual ARM Cortex-A7, enough for Redfish + KVM"
  - name: Dmitri
    role: developer
    vote: "B"
    weight: 1
    rationale: "Nuvoton has better security features (TPM integrated)"
---

## Context

ADR-004 selected DC-SCM 1.0 pluggable management module. The BMC SoC
sits on the DC-SCM card, not the host board.

## Options

### Option A: ASPEED AST2600

Dual-core ARM Cortex-A7 @ 800MHz, 2D/3D graphics, 8x PCIe lanes.

- Pros: Best OpenBMC community support, de facto industry standard
- Cons: Older process node, limited crypto acceleration

### Option B: Nuvoton NPCM750

Dual-core ARM Cortex-A9 @ 800MHz, integrated TPM 2.0.

- Pros: Integrated security, competitive price
- Cons: Smaller OpenBMC community, fewer reference designs

## Decision

**Option A: ASPEED AST2600.**

Weighted vote: A=5, B=1. OpenBMC ecosystem support is decisive.
DC-SCM modularity means we can switch later if needed.

## Consequences

- DC-SCM card designed for AST2600 pinout
- OpenBMC build target: evb-ast2600
- External TPM 2.0 chip required on DC-SCM (AST2600 lacks integrated)
