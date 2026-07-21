---
id: "004"
title: "Management: DC-SCM + OpenBMC vs proprietary BMC"
status: accepted
type: decision
parent: "001"
cross_refs: ["009", "010"]
created: 2026-07-21
decided: 2026-07-24
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "DC-SCM is the OCP standard, OpenBMC gives us community support"
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "DC-SCM modularity means we can swap management SoC without respinning the board"
  - name: Dmitri
    role: developer
    vote: "B"
    weight: 1
    rationale: "Supermicro BMC is turnkey, less NRE"
---

## Context

OCP DC-SCM (Datacenter Secure Control Module) defines a pluggable management
module that separates the BMC SoC from the host board. This enables:
- Management SoC vendor flexibility (hot-swappable module)
- Hardware Root of Trust on the module itself
- Standardized connector (DC-SCM connector spec)

OpenBMC is the open-source firmware stack for baseboard management controllers,
moving to Redfish as the standard management API.

## Options

### Option A: DC-SCM 1.0 + OpenBMC

Pluggable management module per OCP spec. OpenBMC firmware.

- Pros: OCP compliant, vendor-agnostic, open-source, community-maintained
- Cons: NRE for DC-SCM connector integration, OpenBMC learning curve

### Option B: On-board BMC (AST2600) + proprietary firmware

BMC SoC soldered directly on host board. Vendor firmware (Supermicro, AMI).

- Pros: Turnkey, lower NRE, proven reliability
- Cons: NOT OCP compliant, vendor lock-in, no hot-swap

## Decision

**Option A: DC-SCM 1.0 + OpenBMC.**

Weighted vote: A=5, B=1. OCP compliance and supply chain flexibility
outweigh the NRE cost of DC-SCM integration.

## Consequences

- DC-SCM connector on host board (standardized pinout)
- OpenBMC build pipeline required (Yocto-based)
- Redfish API for all out-of-band management
- Hardware Root of Trust on DC-SCM module
