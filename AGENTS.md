# ArchTrace — Development Guide

## Project Overview

ArchTrace is an architecture decision graph tool for hardware/software teams.
It renders ADR (Architecture Decision Record) markdown files as an interactive
tree with weighted voting and cross-references.

## Architecture

```
decisions/*.md  ──→  Parser (server/parse.ts)  ──→  JSON Graph
                                                         │
                                                         ▼
                         Express API  ←────  React UI (SimpleTree)
                         GET /api/graph       Tree visualization
                         GET /api/decisions/  Detail panel
```

### Data Flow

1. Developers write ADR markdown files in `decisions/` (git-tracked)
2. `server/parse.ts` reads files, parses YAML frontmatter, builds graph
3. Express API (`server/index.ts`) serves graph as JSON
4. React frontend fetches `/api/graph`, renders interactive tree
5. Clicking a node fetches full decision via `/api/decisions/:id`

### No Database

Git IS the database. Markdown files are the source of truth. The server is
stateless — it reads files on every request. This ensures the graph always
reflects the repository state.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Node.js + Express + tsx (dev runner)
- **Visualization:** Custom SimpleTree component (SVG connections, no deps)
- **Storage:** Git (markdown files in `decisions/`)

## Project Structure

```
archtrace/
├── decisions/              # ADR markdown files (the "database")
│   ├── 001-reliability-requirement.md
│   ├── 002-failover-vs-cluster.md
│   ├── 003-battery-backed-rtc.md
│   └── 004-watchdog-timer.md
├── server/                 # API server
│   ├── index.ts            # Express app, routes
│   └── parse.ts            # YAML frontmatter parser, graph builder
├── src/                    # React frontend
│   ├── App.tsx             # Main app — fetches graph, renders tree + detail panel
│   ├── api.ts              # API client types and fetch functions
│   ├── main.tsx            # React entry point
│   └── SimpleTree/         # Tree visualization component library
│       ├── Tree.tsx        # Main container — rendering, keyboard nav, selection
│       ├── TreeNode.tsx    # Individual node — drag, edit, selection states
│       ├── Connection.tsx  # SVG connection — perpendicular paths with rounded corners
│       ├── Controls.tsx    # Toolbar — add/delete/connect buttons
│       ├── Modal.tsx       # Rich node editor modal
│       ├── types.ts        # TreeNode, Connection, SimpleTreeProps interfaces
│       ├── index.ts        # Public exports
│       ├── styles.module.css
│       └── utils/
│           └── positions.ts  # Layout algorithm (BFS level grouping)
├── docs/                   # Design specs and implementation plans
├── Dockerfile
├── docker-compose.yml
├── vite.config.ts          # Vite config with /api proxy to :3001
├── tsconfig.json
├── package.json
└── README.md
```

## Development

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Run (Development)

Two terminals:

```bash
# Terminal 1: API server (hot reload)
npm run server

# Terminal 2: Vite dev server (HMR)
npm run dev
```

Or both at once:

```bash
npm run dev:all
```

Open http://localhost:5233

### Run (Docker)

```bash
docker-compose up --build
```

### Production Build

```bash
npm run build    # TypeScript check + Vite build → dist/
npm run start    # Express serves dist/ + API
```

## ADR File Format

Each `.md` file in `decisions/` has YAML frontmatter + markdown body.

```yaml
---
id: "002"
title: "Decision title"
status: accepted          # proposed | debating | accepted | rejected | superseded
type: decision             # requirement | decision | task
parent: "001"              # parent decision ID (builds tree), or null for root
cross_refs: ["003", "007"] # related decision IDs (graph edges)
created: 2026-07-21
decided: 2026-07-25        # or null if not yet decided
voters:                    # list of vote records
  - name: Ivan
    role: architect        # determines weight
    vote: "A"              # option label
    weight: 3              # architect=3, senior=2, developer=1
    rationale: "Reason"
---
```

### Status Flow

```
proposed → debating → accepted (or rejected)
                     ↓
                superseded (replaced by newer decision)
```

### Tree Structure

- `parent` field creates the primary tree edge (parent → child)
- `cross_refs` creates secondary edges (peer references)
- A node with `parent: null` is a root node
- One active path from root to leaf = the current architecture

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/graph` | GET | All nodes + connections for tree visualization |
| `/api/decisions/:id` | GET | Single decision with body + vote tally |
| `/api/health` | GET | Health check |

## Key Design Decisions

1. **No external YAML library** — the parser in `parse.ts` is minimal (zero deps).
   Handles flat key-value pairs, arrays of scalars, and arrays of objects (voters).
   If the format becomes complex, switch to `js-yaml`.

2. **Server is stateless** — reads files on every request. No caching layer.
   For <100 ADR files this is instant. If needed, add file-watcher cache.

3. **SimpleTree is self-contained** — no D3, no react-flow, no graph library.
   Pure React + SVG. This makes it easy to customize but limits layout features.

4. **Vote weights are in the file, not the server** — the server doesn't know
   about roles. The weight is explicitly recorded per voter in the ADR file.
   This keeps the audit trail complete.

## Roadmap

- [ ] AI contradiction detection (LLM checks new ADR vs existing on PR)
- [ ] Git-native voting workflow (votes via PR comments → auto-merge to ADR)
- [ ] Decision template CLI (`npx archtrace new "Title"`)
- [ ] Export to Graphviz DOT format
- [ ] Branch-aware mode (show decisions per git branch)
- [ ] Decision supersession chains (visualize history of replaced decisions)

## Testing

```bash
npx tsc --noEmit          # Type check
npx vite build            # Production build test
```

No test framework set up yet. Priority: parser tests, API tests, component tests.

## File Dependency Chain

```
server/parse.ts  (no deps — YAML parser, graph builder)
       ↑
server/index.ts  (imports parse.ts, starts Express)
       ↑
src/api.ts       (frontend API client, mirrors parse.ts types)
       ↑
src/App.tsx      (fetches graph, maps to TreeNode[], renders Tree + detail panel)
       ↑
src/SimpleTree/* (pure visualization, no API knowledge)
```
