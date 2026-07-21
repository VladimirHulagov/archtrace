---
id: "004"
title: "Hardware watchdog timer selection"
status: debating
type: decision
parent: "002"
cross_refs: ["003"]
created: 2026-07-28
decided: null
voters:
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "TI watchdog is industrial-grade, worth the cost"
  - name: Dmitri
    role: developer
    vote: "B"
    weight: 1
    rationale: "Built-in is sufficient for our timing needs"
---

## Context

Failover pair (ADR-002) requires reliable watchdog to detect hangs
and trigger switch to standby.

## Options

### Option A: External TI TPS3823

Dedicated watchdog IC.

### Option B: MCU internal watchdog

Use built-in WDT peripheral.

## Decision

Debating. Weighted vote currently A=2, B=1.
