/**
 * ArchTrace API Server
 *
 * Reads ADR markdown files from a Git repository (synced to git-data/),
 * serves the decision graph as JSON.
 *
 * Source of truth: git repo configured in archtrace.config.json.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGraph, tallyVotes, type DecisionNode } from './parse.js';
import { loadConfig, saveConfig, type ArchTraceConfig } from './config.js';
import { syncRepo, isRepoReady, getActiveDecisionsDir } from './git-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDecisionsDir = path.resolve(__dirname, '..', 'decisions');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/**
 * Get the active decisions directory.
 * If the repo is synced, read from git-data/. Otherwise fall back to local decisions/.
 */
function activeDecisionsDir(): string {
  if (isRepoReady()) {
    return getActiveDecisionsDir();
  }
  return localDecisionsDir;
}

// ─── Config Routes ───────────────────────────────────────

app.get('/api/config', (_req, res) => {
  try {
    const config = loadConfig();
    const safe = {
      ...config,
      repo: {
        ...config.repo,
        auth: {
          type: config.repo.auth.type,
          token: config.repo.auth.token ? '***' : '',
        },
      },
    };
    res.json(safe);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const current = loadConfig();
    const incoming = req.body;

    const updated: ArchTraceConfig = {
      repo: {
        url: incoming.repo?.url || current.repo.url,
        branch: incoming.repo?.branch || current.repo.branch,
        path: incoming.repo?.path || current.repo.path,
        auth: {
          type: incoming.repo?.auth?.type || current.repo.auth.type,
          token: (incoming.repo?.auth?.token && incoming.repo.auth.token !== '***')
            ? incoming.repo.auth.token
            : current.repo.auth.token,
        },
      },
      users: incoming.users || current.users,
    };

    saveConfig(updated);
    res.json({ status: 'ok', message: 'Configuration updated' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sync Routes ─────────────────────────────────────────

app.post('/api/sync', (_req, res) => {
  try {
    const result = syncRepo();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync/status', (_req, res) => {
  try {
    const config = loadConfig();
    const ready = isRepoReady();
    res.json({
      ready,
      repoUrl: config.repo.url,
      branch: config.repo.branch,
      decisionsDir: ready ? getActiveDecisionsDir() : null,
      localFallback: !ready,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Graph and Decision Routes ───────────────────────────

app.get('/api/graph', (_req, res) => {
  try {
    const dir = activeDecisionsDir();
    const graph = buildGraph(dir);
    res.json(graph);
  } catch (err: any) {
    console.error('Failed to build graph:', err.message);
    res.status(500).json({ error: 'Failed to build graph', detail: err.message });
  }
});

app.get('/api/decisions/:id', (req, res) => {
  try {
    const dir = activeDecisionsDir();
    const graph = buildGraph(dir);
    const node = graph.nodes.find(n => n.id === req.params.id);
    if (!node) {
      return res.status(404).json({ error: 'Decision not found' });
    }
    res.json({
      ...node,
      voteTally: tallyVotes(node.voters),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    repoReady: isRepoReady(),
    decisionsDir: activeDecisionsDir(),
  });
});

app.post('/api/client-errors', (req, res) => {
  const { message, stack, componentStack, url, timestamp, userAgent } = req.body || {};
  console.error(`[CLIENT ERROR] ${timestamp || new Date().toISOString()}`);
  console.error(`  Message: ${message || 'Unknown'}`);
  console.error(`  URL: ${url || 'N/A'}`);
  if (userAgent) console.error(`  UA: ${userAgent}`);
  if (stack) console.error(`  Stack:\n${stack}`);
  if (componentStack) console.error(`  ComponentStack:\n${componentStack}`);
  console.error(`[/CLIENT ERROR]`);
  res.status(204).end();
});

// ─── Static frontend (production) ─────────────────────────

const distDir = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`ArchTrace API server running on http://localhost:${PORT}`);

  const config = loadConfig();
  if (config.repo.url) {
    console.log(`Auto-syncing from ${config.repo.url} (${config.repo.branch})...`);
    const result = syncRepo(config);
    console.log(`Sync result: ${result.action} - ${result.message}`);
  }

  console.log(`Decisions directory: ${activeDecisionsDir()}`);
});
