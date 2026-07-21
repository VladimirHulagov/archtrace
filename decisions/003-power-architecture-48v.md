---
id: "003"
title: "Power architecture: 48V bus bar vs 12V distribution"
status: accepted
type: decision
parent: "001"
cross_refs: ["007", "008"]
created: 2026-07-21
decided: 2026-07-23
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "48V is OCP V3 standard, lower I2R losses at scale"
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "48V reduces bus bar current by 4x vs 12V"
  - name: Dmitri
    role: developer
    vote: "B"
    weight: 1
    rationale: "12V is simpler for board-level DC-DC, more VRM options"
---

## Context

Open Rack V3 specifies a 48V DC bus bar running along the rack vertical.
Each server taps the bus bar and steps down to board-level voltages.

Previous Open Rack V2 used 12V. The V3 connector adds a power sense line
for coordinated power management.

## Options

### Option A: 48V bus bar (OCP V3 native)

Board receives 48V, steps down via intermediate bus converters (IBC) to 12V,
then point-of-load (POL) regulators to chip voltages.

- Pros: OCP V3 compliant, lower distribution losses, future-proof
- Cons: More complex board power tree, IBC adds cost and loss stage

### Option B: 12V bus bar (legacy)

Board receives 12V directly, POL regulators to chip voltages.

- Pros: Simpler power tree, lower component count
- Cons: NOT OCP V3 compliant, 4x higher current at same power

## Decision

**Option A: 48V bus bar.**

Weighted vote: A=5, B=1. OCP V3 compliance is mandatory, and 48V
distribution is the right engineering choice at rack scale.

## Consequences

- Need 48V-to-12V intermediate bus converters on board
- Power shelf must output 48V (OCP V3 PSU spec)
- Bus bar connector with power sense line required
- Thermal budget includes IBC losses (~3-5% of input power)
