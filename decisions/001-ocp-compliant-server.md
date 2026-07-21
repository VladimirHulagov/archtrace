---
id: "001"
title: "Build an OCP-compliant datacenter server"
status: accepted
type: requirement
parent: null
cross_refs: []
created: 2026-07-21
decided: 2026-07-21
voters: []
---

## Context

We need to design and manufacture a server that meets Open Compute Project (OCP)
specifications for deployment in hyperscale datacenter environments.

Key OCP standards in scope:

- **Open Rack V3** (21-inch chassis, 48V bus bar, OU units)
- **DC-MHS** (Datacenter Modular Hardware System)
- **DC-SCM** (Datacenter Secure Control Module)
- **OCP NIC 3.0** (standardized networking)
- **OpenBMC / Redfish** (hardware management)
- **Hardware Management** (RAS, firmware update)

## Requirement

Design a complete server system that is OCP Accepted certified:
- Fits Open Rack V3 ecosystem
- Meets 48V power delivery spec
- Has modular DC-MHS compatible form factor
- Integrates DC-SCM for management
- Supports OCP NIC 3.0
- Compliant with OCP firmware update requirements
- Meets OCP thermal and airflow guidelines

## Consequences

- Must follow all OCP specs (not custom form factors)
- Supply chain constrained to OCP-compatible components
- Certification process required before GA
- Interoperability with any OCP rack guaranteed
