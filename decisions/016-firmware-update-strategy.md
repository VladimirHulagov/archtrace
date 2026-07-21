---
id: "016"
title: "Firmware update: Redfish OEM vs OpenBMC native vs dual-path"
status: proposed
type: task
parent: "004"
cross_refs: ["010", "015"]
created: 2026-07-26
decided: null
voters: []
---

## Context

OCP firmware update requirements mandate: signed firmware, atomic updates
(A/B flash banks), rollback support, and Redfish-triggered updates.

OpenBMC has native update mechanisms via softwareVENTORY and UpdateService.
But we also need RoT firmware update (ADR-015) which may need a separate path.

## Options

### Option A: OpenBMC native only

All firmware updates through OpenBMC UpdateService Redfish API.

### Option B: Dual-path (OpenBMC for host + RoT MCU path for RoT)

Host BIOS/BMC via Redfish. RoT firmware via dedicated I2C path from BMC.

## Decision

Under discussion. Needs input from firmware team.
