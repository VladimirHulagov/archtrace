---
id: "003"
title: "Battery-backed RTC for failover heartbeat timing"
status: proposed
type: decision
parent: "002"
cross_refs: []
created: 2026-07-26
decided: null
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "Critical for correct heartbeat timing during power events"
---

## Context

ADR-002 chose failover pair architecture. Heartbeat timing must survive
brief power interruptions without clock drift causing false failovers.

## Options

### Option A: Battery-backed RTC (DS3231)

Dedicated RTC chip with coin cell backup.

- Pros: Accurate, independent of main power
- Cons: Additional component, battery maintenance

### Option B: Software NTP sync

Sync clocks via NTP after power restoration.

- Pros: No extra hardware
- Cons: Window of uncertainty after power loss, network dependency

## Decision

Under discussion. Initial vote favours Option A.
