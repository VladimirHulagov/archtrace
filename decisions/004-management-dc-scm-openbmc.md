---
id: "004"
title: "Управление: DC-SCM + OpenBMC vs проприетарный BMC"
status: accepted
type: decision
parent: "001"
cross_refs: ["009", "010"]
created: 2026-07-21
decided: 2026-07-22
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "DC-SCM даёт сменяемость. OpenBMC — open source."
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "Стандартизация управления сокращает TCO"
---

## Контекст

OCP определяет DC-SCM (Datacenter Secure Control Module) как стандартный
модуль управления. OpenBMC — open-source прошивка BMC на базе Linux.

Проприетарные BMC (AMI MegaRAC, Insyde) имеют закрытый код, но широкую
поддержку железа.

## Опции

### Option A: DC-SCM + OpenBMC

- Плюсы: OCP-совместимость, сменяемость модуля, open-source, кастомизация
- Минусы: меньше готовых драйверов, требуется портирование под новое железо

### Option B: Проприетарный BMC (AMI/Insyde)

- Плюсы: готовые BSP для большинства SoC, поддержка "из коробки"
- Минусы: vendor lock-in, закрытый код, нет OCP-совместимости

## Решение

**Вариант A: DC-SCM + OpenBMC.**

Сменяемость модуля управления — ключевое преимущество для дата-центра.

## Последствия

- Платформа DC-SCM (разъём, форм-фактор, питание)
- Портация OpenBMC под выбранный SoC
- Контрибьюшен драйверов в upstream OpenBMC
