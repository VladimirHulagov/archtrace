---
id: "012"
title: "Форм-фактор NIC: SFF vs LFF"
status: accepted
type: decision
parent: "011"
cross_refs: []
created: 2026-07-21
decided: 2026-07-22
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "SFF достаточно для 100G. LFF — для 400G+ в будущем."
---

## Контекст

OCP NIC 3.0 имеет два размера: SFF (small) и LFF (large).
SFF: до 100G. LFF: до 400G, больше рассеиваемая мощность.

## Опции

### Option A: SFF (Small Form Factor)

- Плюсы: компактнее, ниже TDP, достаточно для 100G
- Минусы: ограничение пропускной способности

### Option B: LFF (Large Form Factor)

- Плюсы: поддержка 400G, больше места для компонентов
- Минусы: больше места на плате, выше TDP

## Решение

**Вариант A: SFF.**

100G достаточно для текущих требований.

## Последствия

- 1 слот SFF OCP NIC 3.0
- Возможность апгрейда до LFF в следующей ревизии
