---
id: "010"
title: "Redfish API compliance level"
status: accepted
type: decision
parent: "004"
cross_refs: []
created: 2026-07-24
decided: 2026-07-25
voters:
  - name: Ivan
    role: architect
    vote: "B"
    weight: 3
    rationale: "OCP baseline + a few profiles covers 95% of use cases"
  - name: Anna
    role: senior
    vote: "B"
    weight: 2
    rationale: "Full conformace is over-engineering for our scale"
  - name: Dmitri
    role: developer
    vote: "A"
    weight: 1
    rationale: "Full compliance gives betterinterop testing tools"
---

## Context

OpenBMC exposes Redfish API for management. DMTF defines multiple
conformance levels and service profiles.

## Options

### Option A: Full DMTF Redfish conformace (all profiles)

Every Redfish profile implemented and certified.

- Pros: Maximum interoperability, DMTF logo, broader tool support
- Cons: Significant engineering effort, many unused features

### Option B: OCP Baseline Redfish + key profiles

OCP-required Redfish resources + Boot, Telemetry, EventService.

- Pros: Practical coverage, OCP compliant, manageable scope
- Cons: Not all tools will work, some manual API calls needed

## Decision

**Option B: OCP Baseline + key profiles.**

Weighted vote: A=1, B=5. Pragmatic approach for first product.

## Consequences

- Implement: Systems, Chassis, Managers, BootControl, TelemetryService
- Defer: Storage pools, composability, NVMe-oF management
- Can extend profiles in future firmware updates
