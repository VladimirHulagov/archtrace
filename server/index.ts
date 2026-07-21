/**
 * ArchTrace API Server
 *
 * Reads ADR markdown files from decisions/ directory,
 * serves the decision graph as JSON.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGraph, tallyVotes, type DecisionNode } from './parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const decisionsDir = path.resolve(__dirname, '..', 'decisions');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────

/**
 * GET /api/graph
 * Returns all nodes and connections for tree visualization.
 */
app.get('/api/graph', (_req, res) => {
  try {
    const graph = buildGraph(decisionsDir);
    res.json(graph);
  } catch (err: any) {
    console.error('Failed to build graph:', err.message);
    res.status(500).json({ error: 'Failed to build graph', detail: err.message });
  }
});

/**
 * GET /api/decisions/:id
 * Returns a single decision with full markdown body.
 */
app.get('/api/decisions/:id', (req, res) => {
  try {
    const graph = buildGraph(decisionsDir);
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

/**
 * GET /api/health
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/client-errors
 * Receives error reports from the React frontend.
 */
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
  console.log(`Decisions directory: ${decisionsDir}`);
});
