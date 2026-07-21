---
id: "007"
title: "Power shelf topology: 2N vs N+1 redundancy"
status: debating
type: decision
parent: "003"
cross_refs: ["008"]
created: 2026-07-23
decided: null
voters:
  - name: Ivan
    role: architect
    vote: "B"
    weight: 3
    rationale: "N+1 is sufficient for planned maintenance windows"
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "2N allows full rack power during single shelf failure"
---

## Context

Open Rack V3 uses rack-level power shelves (not per-server PSUs).
Each shelf contains multiple 48V PSU modules.

A rack with 12 trays at ~500W each = 6kW total.
PSU modules: 3kW each (OCP V3 spec).

## Options

### Option A: 2N (2 power shelves, 6 PSUs total)

Full redundancy. Either shelf can power the entire rack.

- Pros: Highest reliability, zero-downtime shelf maintenance
- Cons: 2x PSU cost, uses rack space for second shelf

### Option B: N+1 (1 power shelf, 3+1 PSUs)

Single shelf with one spare PSU module.

- Pros: Cost-efficient, sufficient for planned maintenance
- Cons: Entire rack down if shelf bus bar fails

## Decision

Debating. Weighted vote: A=2, B=3. Leaning N+1.
