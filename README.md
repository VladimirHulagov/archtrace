# ArchTrace

Architecture Decision Graph — trace every technical decision from requirement
to implementation, with weighted voting and full rationale.

## What is this?

A tool for hardware/software teams that traces how architectural decisions are made:

```
Requirement → Options → Vote → Decision → Tasks → Sub-decisions
```

Each decision is a markdown file (ADR). The tool renders them as an interactive
tree, showing parent-child relationships and cross-references.

**Key features:**
- ADR files in git = source of truth (git history = decision history)
- Weighted voting (architect ×3, senior ×2, developer ×1)
- Interactive tree visualization with drag & drop
- Detail panel with full rationale and vote table
- Cross-reference connections between decisions

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Install & Run (Development)

```bash
# Terminal 1: API server
npm install
npm run server

# Terminal 2: Vite dev server (frontend)
npm run dev
```

Open http://localhost:5233

### Run with Docker

```bash
docker-compose up --build
```

Open http://localhost:5233

## How It Works

### ADR Format

Each decision is a markdown file in `decisions/`:

```
decisions/
├── 001-reliability-requirement.md
├── 002-failover-vs-cluster.md
├── 003-battery-backed-rtc.md
└── 004-watchdog-timer.md
```

File format — YAML frontmatter + markdown body:

```markdown
---
id: "002"
title: "Failover pair vs Active-Active cluster"
status: accepted          # proposed | debating | accepted | rejected | superseded
type: decision             # requirement | decision | task
parent: "001"              # parent decision ID (tree structure)
cross_refs: ["003"]        # related decision IDs (graph edges)
created: 2026-07-21
decided: 2026-07-25
voters:
  - name: Ivan
    role: architect
    vote: "A"              # option label
    weight: 3              # role-based weight
    rationale: "Simpler to operate"
  - name: Anna
    role: senior
    vote: "B"
    weight: 2
    rationale: "No downtime during failover"
---

## Context
Why this decision is needed...

## Options
### Option A: ...
### Option B: ...

## Decision
Option A accepted.

## Consequences
What this means for the project...
```

### Architecture

```
decisions/*.md  ──→  Parser (server/parse.ts)  ──→  JSON Graph
                                                         │
                                                         ▼
                         Express API  ←────  React UI (SimpleTree)
                         GET /api/graph       Tree visualization
                         GET /api/decisions/  Detail panel
```

### Decision Types

| Type | Icon | Description |
|------|------|-------------|
| requirement | 📋 | A constraint or need (top of tree) |
| decision | ⚙️ | A technical choice resolving a requirement |
| task | 🔨 | Implementation work from a decision |

### Statuses

| Status | Icon | Description |
|--------|------|-------------|
| proposed | 💡 | Newly suggested, not yet discussed |
| debating | 🔥 | Under active discussion/voting |
| accepted | ✅ | Chosen as the active path |
| rejected | ❌ | Considered and not chosen |
| superseded | ⏭️ | Replaced by a newer decision |

### Vote Weights

| Role | Weight |
|------|--------|
| architect | 3 |
| senior | 2 |
| developer | 1 |
| CTO | override (can accept despite vote) |

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/graph` | GET | All nodes + connections for tree |
| `/api/decisions/:id` | GET | Single decision with body + vote tally |
| `/api/health` | GET | Health check |

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Backend:** Node.js, Express
- **Storage:** Git (markdown files = database)
- **Visualization:** Custom React tree component (SVG connections)

## Roadmap

- [ ] Git-native voting (votes via PR)
- [ ] AI contradiction detection (LLM checks new vs existing decisions)
- [ ] Export to DOT/Graphviz
- [ ] Decision template generator
- [ ] Branch-aware (show decisions per git branch)

## License

MIT
