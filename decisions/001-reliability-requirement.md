---
id: "001"
title: "System must guarantee 99.95% uptime"
status: accepted
type: requirement
parent: null
cross_refs: []
created: 2026-07-21
decided: 2026-07-21
voters: []
---

## Context

Hardware product for industrial deployment. Downtime costs exceed hardware costs
by 10x. Field servicing is expensive and slow.

## Requirement

The system must achieve 99.95% uptime (~4.4 hours downtime per year).

## Consequences

- Redundancy required at critical paths
- Failover mechanisms must be automatic
- Components must be hot-swappable where possible
