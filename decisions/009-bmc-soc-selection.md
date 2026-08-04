---
id: "009"
title: "SoC для BMC: ASPEED AST2600 vs Nuvoton NPCM7xx vs кастомный"
status: accepted
type: decision
parent: "004"
cross_refs: ["015"]
created: 2026-07-21
decided: 2026-07-22
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "AST2600 — индустриальный стандарт для OpenBMC"
  - name: Anna
    role: senior
    vote: "A"
    weight: 2
    rationale: "Лучшая поддержка upstream OpenBMC"
---

## Контекст

DC-SCM требует SoC для BMC. Основные кандидаты: ASPEED AST2600
(ARM A7), Nuvoton NPCM750 (ARM A9), или кастомный на базе другого SoC.

## Опции

### Option A: ASPEED AST2600

- Плюсы: de-facto стандарт OpenBMC, огромная кодовая база, проверен
- Минусы: ARM Cortex-A7 (медленнее), закрытый GPU

### Option B: Nuvoton NPCM750

- Плюсы: ARM Cortex-A9 (быстрее), хорошая документация
- Минусы: меньше драйверов в upstream OpenBMC

### Option C: Кастомный SoC (напр. RISC-V)

- Плюсы: полный контроль, открытая архитектора
- Минусы: огромные затраты на разработку, нет готовых драйверов

## Решение

**Вариант A: ASPEED AST2600.**

Максимальная совместимость с OpenBMC — критична для time-to-market.

## Последствия

- Интеграция с DC-SCM модуль
- Использование стандартного device tree OpenBMC
