---
id: "011"
title: "Networking: OCP NIC 3.0 vs PCIe add-in card"
status: accepted
type: decision
parent: "001"
cross_refs: ["012"]
created: 2026-07-21
decided: 2026-07-24
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "OCP NIC 3.0 is the standard. PCIe cards are legacy"
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "Hot-swap NIC without removing tray is huge for ops"
---

## Context

OCP NIC 3.0 specification defines standardized network adapter form factors
with a common connector, replacing vendor-specific PCIe add-in cards.

Three form factors defined: SFF (single-port), TSFF (tall), LFF (large, multi-port).

## Options

### Option A: OCP NIC 3.0

Standardized mezzanine-style adapter with OCP connector.

- Pros: OCP compliant, hot-swappable, vendor-agnostic, rear-access
- Cons: New connector footprint, limits to NIC 3.0 compatible products

### Option B: PCIe add-in card (standard slot)

Traditional PCIe x16 slot on board.

- Pros: Universal compatibility, any PCIe card works
- Cons: NOT OCP compliant, requires tray removal to service

## Decision

**Option A: OCP NIC 3.0.**

Weighted vote: A=5. OCP compliance is mandatory.

## Consequences

- OCP NIC 3.0 connector on board rear
- Support at least SFF form factor (LFF optional for multi-port)
- Rear panel cutout for NIC hot-swap access
