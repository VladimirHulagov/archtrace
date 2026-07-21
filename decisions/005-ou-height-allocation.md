---
id: "005"
title: "Compute tray height: 2OU vs 3OU"
status: debating
type: decision
parent: "002"
cross_refs: ["014"]
created: 2026-07-22
decided: null
voters:
  - name: Ivan
    role: architect
    vote: "B"
    weight: 3
    rationale: "3OU gives room for high-TDP CPUs and future GPU options"
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "2OU maximizes rack density, TDP manageable with good heatsinks"
  - name: Dmitri
    role: developer
    vote: "A"
    weight: 1
    rationale: "2OU is proven for dual-socket, less thermal complexity"
---

## Context

ADR-002 chose Open Rack V3 (21-inch). The compute tray height must be defined
in OpenU (OU) units. Each OU = 48mm.

## Options

### Option A: 2OU (96mm)

Dual-socket CPU with custom heatsinks. Air-cooled only.

- Pros: Maximum rack density (18 trays per rack), proven thermal
- Cons: Limited to ~350W TDP total, no room for GPUs

### Option B: 3OU (144mm)

Dual-socket CPU + option for accelerators. Larger heatsinks or cold plates.

- Pros: ~500W TDP headroom, future GPU/FPGA option, better thermals
- Cons: 33% less density (12 trays per rack), more material cost

## Decision

Under discussion. Weighted vote: A=3, B=3. Deadlock.
