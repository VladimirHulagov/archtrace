---
id: "010"
title: "Уровень соответствия Redfish API"
status: accepted
type: decision
parent: "004"
cross_refs: ["016"]
created: 2026-07-21
decided: 2026-07-22
voters:
  - name: Ivan
    role: architect
    vote: "A"
    weight: 3
    rationale: "Полная совместимость с Redfish обязательна для дата-центра"
---

## Контекст

Redfish — современный REST API для управления серверами (замена IPMI).
Уровни соответствия: базовый (только чтение) или полный (CRUD + события).

## Опции

### Option A: Полное соответствие Redfish (Schema 2024.1)

- Плюсы: совместимость с DCIM, события, telemetry, push-уведомления
- Минусы: больше работы по реализации, сложные схемы

### Option B: Базовое соответствие (только чтение)

- Плюсы: проще, быстрый старт
- Минусы: нет событий, нет telemetry — DCIM инструменты ограничены

## Решение

**Вариант A: Полное соответствие.**

Telemetry и события критичны для operations.

## Последствия

- Реализация EventService, TelemetryService
- Подписки на события (EventDestination)
- Compliance-тестирование (OCP / DMTF profile)
