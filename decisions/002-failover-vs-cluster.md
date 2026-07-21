---
id: "002"
title: "Failover pair vs Active-Active cluster"
status: accepted
type: decision
parent: "001"
cross_refs: ["003"]
created: 2026-07-21
decided: 2026-07-25
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "Simpler to operate, proven pattern in our environment"
  - name: Anna
    role: senior
    vote: "B"
    weight: 2
    rationale: "No downtime during failover, better resource utilisation"
  - name: Dmitri
    role: developer
    vote: "A"
    weight: 1
    rationale: "Easier to debug, fewer moving parts"
---

## Context

We need to meet the 99.95% uptime requirement (ADR-001).
Two architectures considered.

## Options

### Option A: Failover Pair (Active-Standby)

One node active, second on standby. Heartbeat protocol.
Switch time: 2-5 seconds.

- Pros: Simple, well-understood, lower cost
- Cons: Brief downtime during switch, standby is idle

### Option B: Active-Active Cluster

Both nodes serve traffic. Consensus protocol (Raft).

- Pros: Zero downtime on single failure, load distribution
- Cons: Complex split-brain handling, 2x component cost

## Decision

**Option A: Failover Pair.**

Weighted vote: A=4, B=2. The operational simplicity outweighs
the theoretical benefit of zero-downtime failover for our use case.

## Consequences

- 2-5 second interruption acceptable per ADR-001 tolerance
- Standby hardware is reserved cost
- Future migration to Active-Active is possible if uptime needs tighten
