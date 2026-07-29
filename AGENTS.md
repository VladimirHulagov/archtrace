# ArchTrace — Development Guide

## Project Overview

ArchTrace is an architecture decision graph tool for hardware/software teams.
It renders ADR (Architecture Decision Record) markdown files as an interactive
tree with weighted voting, vote sectors, and cross-references.

**Live:** https://archtrace.collaborationism.tech  
**Repo:** https://github.com/VladimirHulagov/archtrace

## Architecture

```
decisions/*.md  ->  Parser (server/parse.ts)  ->  JSON Graph
                                                        |
                                                        v
                         Express API  <----  React UI (SimpleTree)
                         GET /api/graph       dagre layout + SVG rendering
                         GET /api/decisions/  Detail panel
```

### Data Flow

1. Developers write ADR markdown files in `decisions/` (git-tracked)
2. `server/parse.ts` reads files, parses YAML frontmatter + option names from body
3. Express API (`server/index.ts`) serves graph as JSON
4. React frontend fetches `/api/graph`, renders interactive tree via dagre
5. Clicking a node fetches full decision via `/api/decisions/:id`

### No Database

Git IS the database. Markdown files are the source of truth. The server is
stateless — it reads files on every request.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Node.js + Express + tsx (dev runner)
- **Layout:** dagre (`@dagrejs/dagre`) — Sugiyama hierarchical graph algorithm
- **Pan/Zoom:** react-zoom-pan-pinch v4
- **Storage:** Git (markdown files in `decisions/`)
- **Tests:** Vitest (14 tests)

## Project Structure

```
archtrace/
├── decisions/              # ADR markdown files (the "database")
├── server/                 # API server
│   ├── index.ts            # Express app, routes
│   └── parse.ts            # YAML parser, graph builder, option parser
├── src/                    # React frontend
│   ├── App.tsx             # Main app — fetches graph, vote sectors, detail panel
│   ├── api.ts              # API client types and fetch functions
│   ├── main.tsx            # React entry point
│   └── SimpleTree/         # Tree visualization component library
│       ├── Tree.tsx        # Container — rendering, keyboard nav, click-to-close
│       ├── TreeNode.tsx    # Node — title, options list, vote sector bar
│       ├── Connection.tsx  # SVG path — orthogonal routing, lanes, collision avoidance
│       ├── Controls.tsx    # Toolbar — add/delete/connect/zoom buttons
│       ├── Modal.tsx       # Rich node editor modal
│       ├── types.ts        # TreeNode, Connection, Point, PortOffset interfaces
│       ├── styles.module.css
│       └── utils/
│           └── positions.ts  # dagre layout, port offsets, bendY computation
├── Dockerfile              # node:20-alpine, npm run dev:all
├── docker-compose.yml      # Volume mounts: ./src, ./server, ./decisions
├── vite.config.ts
├── vitest.config.ts
└── AGENTS.md               # This file
```

## Development

### Run (Development)

```bash
npm run dev:all    # Vite (port 5233) + Express (port 3001) concurrently
```

### Run (Docker)

```bash
docker-compose up --build
```

Volume mounts src/server/decisions. HMR auto-reloads on file change.
node_modules NOT mounted — `docker exec archtrace npm install <pkg>` for new deps.

## ADR File Format

```yaml
---
id: "002"
title: "Form factor: Open Rack V3 (21-inch) vs standard 19-inch"
status: accepted          # proposed | debating | accepted | rejected | superseded
type: decision             # requirement | decision | task
parent: "001"              # parent ID (builds tree), or null for root
cross_refs: ["003"]        # cross-reference IDs (graph edges)
created: 2026-07-21
decided: 2026-07-25
voters:
  - name: Ivan
    role: architect        # architect=3, senior=2, developer=1
    vote: "A"
    weight: 3
    rationale: "Reason"
---

## Options

### Option A: Open Rack V3 (21-inch, OU)
### Option B: 19-inch EIA-310
```

`### Option A: Title` headers are parsed by `parseOptions()` into option lists.

## Layout System

### dagre (positions.ts)

- `rankdir: TB`, `nodesep: 50`, `ranksep: 120`, `edgesep: 30`
- Node: `RICH_NODE_WIDTH=200, RICH_NODE_HEIGHT=120`

### Connection Routing (Connection.tsx)

- **Forward:** down -> H(lane) -> down, vertical entry/exit guaranteed
- **Backward (cross-ref):** down -> right side -> up -> left -> down
- **Lane system:** `computeBendYs()` assigns unique bendY per source
- **Port distribution:** entry/exit X distributed via `computePortOffsets()`
- **Sector exit:** exit X = center of winning vote sector
- **Collision avoidance:** reroutes around node boxes

### CSS Requirements

`RICH_NODE_HEIGHT` (120) MUST match CSS `.node--rich { height: 120px }`.
Sector bar uses `marginTop: auto` in flex column to pin to bottom.

## Interaction Model

- **Single click** -> detail panel (right sidebar)
- **Double click** -> edit modal
- **Click empty canvas** -> closes detail panel
- **Swipe left-to-right** (touch) -> closes detail panel
- **Mouse wheel** -> zoom (step 0.1, smooth=false)
- **Click+drag empty** -> pan

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/graph | GET | Nodes + connections + options |
| /api/decisions/:id | GET | Single decision with body + vote tally |
| /api/health | GET | Health check |

## Testing

```bash
npx tsc --noEmit    # Type check
npx vitest run      # 14 tests
```

## Pitfalls

- **HMR stale after git stash/checkout** -> `docker restart archtrace`
- **RICH_NODE_HEIGHT must match CSS height** -> change both together
- **overflow: hidden on .node--rich is required** -> visible breaks layout
- **position: absolute on sector bar is broken** -> use flex marginTop: auto
- **smooth=true on wheel zoom** -> multiplies step x deltaY, jumps to min/max

## Roadmap

- [ ] AI contradiction detection
- [ ] Git-native voting workflow (PR comments -> ADR)
- [ ] Decision template CLI
- [ ] Export to Graphviz DOT
- [ ] Branch-aware mode
- [ ] Drag nodes -> re-layout
