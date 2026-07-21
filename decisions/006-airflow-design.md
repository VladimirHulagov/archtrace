---
id: "006"
title: "Airflow direction: front-to-back vs custom"
status: accepted
type: decision
parent: "002"
cross_refs: ["014"]
created: 2026-07-22
decided: 2026-07-23
voters:
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "Standard F2B is the only option for hot/cold aisle datacenters"
---

## Context

OCP datacenter facilities spec requires hot-aisle / cold-aisle containment.
All IT gear must have front-to-back airflow aligned with the rack.

## Options

### Option A: Front-to-back (standard)

Cold aisle intake at front, hot aisle exhaust at back.

### Option B: Custom airflow

Non-standard airflow (side intake, top exhaust).

## Decision

**Option A: Front-to-back.**

No real alternative for OCP datacenter deployment.

## Consequences

- Component layout must not block airflow path
- Fan placement at rear of tray
- Air baffle required to prevent recirculation
