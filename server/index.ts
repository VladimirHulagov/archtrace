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
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { buildGraph, tallyVotes, type DecisionNode } from './parse.js';
import { loadConfig, saveConfig, type ArchTraceConfig } from './config.js';
import { syncRepo, isRepoReady, getActiveDecisionsDir } from './git-sync.js';
import {
  getComments, addComment, deleteComment,
  getVotes, castVote, removeVote,
  toggleReaction,
  getCustomOptions, addCustomOption,
  getOrCreateUser, getUserById, getProjects,
  checkDb,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDecisionsDir = path.resolve(__dirname, '..', 'decisions');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Cache of project → decisions dir
const projectDirCache = new Map<number, string>();

/**
 * Get decisions directory for a specific project.
 * Each project with a git_repo_url gets its own clone at git-data-<projectId>/.
 * Projects without git_repo_url get an empty temp dir.
 */
async function projectDecisionsDir(projectId: number): Promise<string> {
  if (projectDirCache.has(projectId)) {
    return projectDirCache.get(projectId)!;
  }

  const { getProject } = await import('./db.js');
  const project = await getProject(projectId);

  let dir: string;
  if (project && project.git_repo_url) {
    // Clone/sync this project's repo into a per-project dir
    const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
    const branch = project.git_branch || 'main';
    const repoPath = project.git_path || '.';

    try {
      const gitDirExists = fs.existsSync(path.join(cloneDir, '.git'));
      if (!gitDirExists) {
        if (fs.existsSync(cloneDir)) {
          fs.rmSync(cloneDir, { recursive: true, force: true });
        }
        execSync(`git clone --depth 1 --branch ${branch} "${project.git_repo_url}" "${cloneDir}"`,
          { stdio: 'pipe', timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      } else {
        execSync(`git fetch origin ${branch} --depth 1`, { cwd: cloneDir, stdio: 'pipe', timeout: 30000 });
        execSync(`git reset --hard origin/${branch}`, { cwd: cloneDir, stdio: 'pipe', timeout: 15000 });
      }
      dir = path.resolve(cloneDir, repoPath);
    } catch {
      // Fallback to main git-data if clone fails
      dir = isRepoReady() ? getActiveDecisionsDir() : localDecisionsDir;
    }
  } else if (projectId === 1) {
    // Project 1: use default git-data or local
    dir = isRepoReady() ? getActiveDecisionsDir() : localDecisionsDir;
  } else {
    // No repo — create empty dir
    dir = path.resolve(__dirname, '..', `git-data-${projectId}`);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  projectDirCache.set(projectId, dir);
  return dir;
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

app.get('/api/graph', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const graph = buildGraph(dir);
    res.json(graph);
  } catch (err: any) {
    console.error('Failed to build graph:', err.message);
    res.status(500).json({ error: 'Failed to build graph', detail: err.message });
  }
});

app.get('/api/decisions/:id', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
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

// ─── DB-backed routes: comments, votes, options ──────────

// Project ID from X-Project-Id header or query, defaults to 1
function getProjectId(req: express.Request): number {
  const hdr = req.header('X-Project-Id');
  if (hdr) return parseInt(hdr, 10);
  const q = (req.query as any).projectId;
  if (q) return parseInt(q, 10);
  return 1;
}

/**
 * GET /api/comments/:nodeId
 * Get all comments for a node.
 */
app.get('/api/comments/:nodeId', async (req, res) => {
  try {
    const comments = await getComments(req.params.nodeId, getProjectId(req));
    res.json(comments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/comments/:nodeId
 * Add a comment. Body: { content, parentCommentId }
 * Temporarily uses a default user until OAuth is implemented.
 */
app.post('/api/comments/:nodeId', async (req, res) => {
  try {
    const { content, parentCommentId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // TODO: Replace with real auth. For now use default admin user (id=1).
    const userId = 1;

    const comment = await addComment(
      req.params.nodeId, getProjectId(req), userId, content.trim(), parentCommentId || null
    );
    res.status(201).json(comment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/comments/:commentId
 * Delete a comment (author only).
 */
app.delete('/api/comments/:commentId', async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const userId = 1; // TODO: real auth
    const deleted = await deleteComment(commentId, userId);
    if (!deleted) return res.status(404).json({ error: 'Comment not found or not owned' });
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/votes/:nodeId
 * Get all votes for a node.
 */
app.get('/api/votes/:nodeId', async (req, res) => {
  try {
    const votes = await getVotes(req.params.nodeId, getProjectId(req));
    res.json(votes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/votes/:nodeId
 * Cast or update a vote. Body: { optionLetter, weight, rationale }
 */
app.post('/api/votes/:nodeId', async (req, res) => {
  try {
    const { optionLetter, weight, rationale } = req.body;
    if (!optionLetter) {
      return res.status(400).json({ error: 'optionLetter is required' });
    }

    const userId = 1; // TODO: real auth
    const userWeight = weight || 1;

    const vote = await castVote(
      req.params.nodeId, getProjectId(req), userId,
      optionLetter, userWeight, rationale || null
    );
    res.status(201).json(vote);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/votes/:nodeId
 * Remove user vote.
 */
app.delete('/api/votes/:nodeId', async (req, res) => {
  try {
    const userId = 1; // TODO: real auth
    const removed = await removeVote(req.params.nodeId, getProjectId(req), userId);
    if (!removed) return res.status(404).json({ error: 'Vote not found' });
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/options/:nodeId
 * Get custom options for a node (beyond those in the ADR markdown).
 */
app.get('/api/options/:nodeId', async (req, res) => {
  try {
    const options = await getCustomOptions(req.params.nodeId, getProjectId(req));
    res.json(options);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/options/:nodeId
 * Add a custom option. Body: { letter, title }
 */
app.post('/api/options/:nodeId', async (req, res) => {
  try {
    const { letter, title } = req.body;
    if (!letter || !title) {
      return res.status(400).json({ error: 'letter and title are required' });
    }

    const userId = 1; // TODO: real auth
    const option = await addCustomOption(
      req.params.nodeId, getProjectId(req),
      letter.toUpperCase(), title, userId
    );
    res.status(201).json(option);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/db-health
 * Check database connectivity.
 */

/**
 * GET /api/projects
 * List all projects.
 */
app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await getProjects();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/db-health', async (_req, res) => {
  const ok = await checkDb();
  res.json({ db: ok ? 'ok' : 'error' });
});


/**
 * POST /api/comments/:commentId/react
 * Toggle like/dislike on a comment. Body: { reaction: 'like' | 'dislike' }
 */
app.post('/api/comments/:commentId/react', async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const { reaction } = req.body;
    if (reaction !== 'like' && reaction !== 'dislike') {
      return res.status(400).json({ error: 'reaction must be like or dislike' });
    }
    const userId = 1; // TODO: real auth
    const result = await toggleReaction(commentId, userId, reaction);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

  console.log(`Project 1 decisions: ready`);

  checkDb().then(ok => {
    console.log(`Database: ${ok ? 'connected' : 'NOT CONNECTED (comments/votes disabled)'}`);
  });
});
