---
id: "015"
title: "Hardware Root of Trust: TPM 2.0 vs custom RoT on DC-SCM"
status: accepted
type: decision
parent: "004"
cross_refs: ["009"]
created: 2026-07-24
decided: 2026-07-27
voters:
  - name: Ivan
    role: architect
    vote: "B"
    weight: 3
    rationale: "DC-SCM has dedicated RoT silicon per OCP security spec"
  - name: Anna
    role: senior
    vote: "B"
    weight: 2
    rationale: "Platform Firmware Resilience (PFR) needs dedicated RoT"
  - name: Dmitri
    role: developer
    vote: "A"
    weight: 1
    rationale: "TPM 2.0 is simpler and widely supported"
---

## Context

OCP security spec requires Hardware Root of Trust for measured boot,
firmware resilience, and attestation. DC-SCM module is the natural place
for RoT because it's physically separable from the host.

## Options

### Option A: TPM 2.0 chip (discrete)

Standard TPM 2.0 (e.g. Infineon SLB9670) on DC-SCM module.

- Pros: Standard, well-understood, OS-native support
- Cons: TPM is a passive measurement device, not an active RoT

### Option B: Dedicated RoT MCU on DC-SCM (PFR compliant)

Active RoT controller (e.g. Intel PFR, Max 10) that gates SPI flash,
verifies firmware signatures before host boot.

- Pros: Platform Firmware Resilience, active boot enforcement
- Cons: More complex, higher BOM, firmware development

## Decision

**Option B: Dedicated RoT MCU (PFR compliant).**

Weighted vote: A=1, B=5. Active RoT is required for OCP security profile.

## Consequences

- RoT MCU (Intel Max 10 or equivalent) on DC-SCM
- SPI flash gating circuit required
- Firmware must support signed updates (ADR-004 OpenBMC requirement)
- Measured boot measurements stored in RoT, attested via Redfish
