---
id: "013"
title: "Cooling: air-cooled vs liquid-cooled (cold plate)"
status: debating
type: decision
parent: "001"
cross_refs: ["005", "014"]
created: 2026-07-21
decided: null
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "Air cooling is proven at 350W TDP, liquid adds complexity"
  - name: Anna
    role: senior
    vote: "B"
    weight: 2
    rationale: "If we go 3OU with 500W TDP, we need cold plates"
  - name: Dmitri
    role: developer
    vote: "A"
    weight: 1
    rationale: "Air cooling is simpler, no leak risk, no coolant maintenance"
---

## Context

CPU TDP range: 250W-400W depending on SKU. OCP Cooling Environments (CE)
project defines cold plate base specifications for liquid cooling.

Decision depends on ADR-005 (2OU vs 3OU) and target CPU TDP.

## Options

### Option A: Air-cooled (heatsink + fans)

Custom extruded aluminium heatsink with heat pipes. High-RPM rear fans.

- Pros: Simple, sealed system, no fluid, proven at ≤350W per socket
- Cons: Fan power 15-25W per tray, noise, limited TDP headroom

### Option B: Liquid-cooled (cold plate + CDU)

OCP CE cold plate on CPU, quick-disconnect manifolds to rack CDU.

- Pros: Handles 500W+ TDP, lower fan power, quieter
- Cons: Fluid loops, CDU infrastructure, leak risk, maintenance

## Decision

Debating. Weighted vote: A=4, B=2. Depends on ADR-005 outcome.
