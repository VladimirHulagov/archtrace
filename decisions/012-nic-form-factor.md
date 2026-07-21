---
id: "012"
title: "NIC form factor: SFF vs LFF"
status: debating
type: decision
parent: "011"
cross_refs: []
created: 2026-07-24
decided: null
voters:
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "SFF is sufficient for dual 25G, saves rear panel space"
  - name: Dmitri
    role: developer
    vote: "B"
    weight: 1
    rationale: "LFF gives quad-port option for future 100G upgrade"
---

## Context

ADR-011 selected OCP NIC 3.0. Need to choose physical form factor.

- SFF: 56.5mm x 70.8mm, single-row connector
- LFF: 107.8mm x 70.8mm, double-row connector, supports up to 4 ports

## Options

### Option A: SFF (Small Form Factor)

Dual 25GbE or single 100GbE.

- Pros: Compact, lower cost, fits 2OU tray easily
- Cons: Limited to 2 ports max

### Option B: LFF (Large Form Factor)

Quad 100GbE or dual 400GbE.

- Pros: Maximum port density, future-proof bandwidth
- Cons: Larger rear panel footprint, higher cost, may need 3OU

## Decision

Debating. Weighted vote: A=2, B=1.
