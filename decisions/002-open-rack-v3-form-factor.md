---
id: "002"
title: "Form factor: Open Rack V3 (21-inch) vs standard 19-inch"
status: accepted
type: decision
parent: "001"
cross_refs: ["006"]
created: 2026-07-21
decided: 2026-07-22
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "OCP compliance requires 21-inch. No point in half-measures"
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "21-inch gives better airflow and component density"
  - name: Dmitri
    role: developer
    vote: "A"
    weight: 1
    rationale: "More PCB real estate for layout"
---

## Context

ADR-001 requires OCP compliance. The Open Rack V3 standard defines a 21-inch
internal width (537mm) vs the traditional 19-inch (482mm) EIA-310 standard.

OpenU (OU) = 48mm vertical pitch (slightly taller than standard 1U = 44.45mm).

## Options

### Option A: Open Rack V3 (21-inch, OU)

- Pros: OCP compliant, wider PCB space, better airflow, higher density
- Cons: Non-standard tooling, new chassis suppliers, limited legacy rack compat

### Option B: 19-inch EIA-310

- Pros: Widely available, existing supply chain, proven mechanical design
- Cons: NOT OCP compliant, narrower, worse thermals, rejects requirement

## Decision

**Option A: Open Rack V3 (21-inch, OU).**

Unanimous. OCP compliance is a hard requirement.

## Consequences

- Chassis partners must have 21-inch tooling
- PCB width up to 537mm
- Vertical mounting pitch = 48mm OU
- Need Open Rack V3 bus bar connector (with power sense line)
