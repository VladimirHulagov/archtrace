---
id: "014"
title: "Fan control: BMC-managed vs independent thermal controller"
status: proposed
type: decision
parent: "013"
cross_refs: ["004"]
created: 2026-07-25
decided: null
voters: []
---

## Context

Fan speed control is safety-critical. If fans fail to spin, CPU overheats
in seconds. Need to decide control path.

## Options

### Option A: BMC PID control loop

OpenBMC reads thermal sensors, computes PWM for fan zones.

- Pros: Central control, sensor fusion, remote management
- Cons: If BMC crashes, fans go to fail-safe (100% speed, very noisy)

### Option B: Dedicated hardware thermal controller

Independent MCU (e.g. TI) monitors sensors and controls fans directly.

- Pros: Works even if BMC is down, deterministic response
- Cons: Extra component, split management plane

## Decision

Under discussion. No votes yet.

## Consequences

If A: simpler BOM, but BMC reliability is critical.
If B: dual-path safety, but more complex firmware.
