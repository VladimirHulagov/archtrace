---
id: "011"
title: "Сетевой интерфейс: OCP NIC 3.0 vs PCIe add-in card"
status: accepted
type: decision
parent: "001"
cross_refs: ["012"]
created: 2026-07-21
decided: 2026-07-22
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "Hot-swap без извлечения сервера — критичен для операций"
---

## Контекст

OCP NIC 3.0 определяет форм-фактор сетевой карты с hot-swap
(замена без выключения сервера). Традиционные PCIe AIC требуют выключения.

## Опции

### Option A: OCP NIC 3.0

- Плюсы: hot-swap, OCP-совместимость, стандартизированный разъём
- Минусы: нужен слот OCP NIC на плате, габариты

### Option B: PCIe Add-in Card

- Плюсы: универсальность, широкая доступность
- Минусы: требуется выключение для замены, НЕ OCP-совместимо

## Решение

**Вариант A: OCP NIC 3.0.**

Hot-swap критичен для обслуживания в production.

## Последствия

- Слот OCP NIC 3.0 на плате
- Backplane / тепловое решение для NIC
