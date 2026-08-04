---
id: "016"
title: "Стратегия обновления прошивок: Redfish OEM vs OpenBMC vs dual-path"
status: accepted
type: decision
parent: "004"
cross_refs: ["010", "015"]
created: 2026-07-21
decided: 2026-07-22
voters:
  - name: Ivan
    role: architect
    vote: "C"
    weight: 3
    rationale: "Dual-path: Redfish для совместимости, OpenBMC для гибкости"
  - name: Anna
    role: senior
    vote: "C"
    weight: 2
    rationale: "Лучшее из двух миров"
---

## Контекст

Обновление прошивок (BIOS, BMC, CPLD, NIC) можно делать через:
Redfish OEM extension, OpenBMC native, или оба пути (dual-path).

## Опции

### Option A: Redfish OEM extension

- Плюсы: стандартный API, совместимость с DCIM
- Минусы: OEM-расширения нестандартны, vendor lock-in

### Option B: OpenBMC native

- Плюсы: open-source, гибкость, прямое управление
- Минусы: только для OpenBMC-совместимых компонентов

### Option C: Dual-path (Redfish + OpenBMC)

- Плюсы: максимальная гибкость, совместимость + прямой доступ
- Минусы: сложность поддержки двух путей

## Решение

**Вариант C: Dual-path.**

Redfish — для внешних инструментов. OpenBMC — для глубокого управления.

## Последствия

- Две точки входа для обновления
- Согласование версий (не обновлять одновременно через два пути)
