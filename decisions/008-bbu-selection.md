---
id: "008"
title: "Battery Backup Unit: OCP V3 BBU vs UPS-only"
status: proposed
type: decision
parent: "003"
cross_refs: ["007"]
created: 2026-07-23
decided: null
voters: []
---

## Context

Open Rack V3 BBU specification defines rack-level battery backup modules
that slot into the power shelf, providing ride-through during power
transitions or grid failures.

## Options

### Option A: OCP V3 BBU modules (rack-level)

Battery modules in the power shelf. ~90 seconds ride-through.

- Pros: Standardized, hot-swappable, sufficient for generator switchover
- Cons: Additional cost, battery lifecycle maintenance

### Option B: Facility UPS only

Rely entirely on datacenter UPS for power continuity.

- Pros: Zero rack-level battery cost
- Cons: No rack-level ride-through, single point of facility dependency

## Decision

Under discussion. No votes yet.

## Consequences

To be determined based on deployment datacenter UPS classification.
