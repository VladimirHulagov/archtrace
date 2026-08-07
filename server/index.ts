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
import { buildGraph, tallyVotes, generateAdrMarkdown, parseBodySections, type DecisionNode } from './parse.js';
import { loadConfig, saveConfig, type ArchTraceConfig } from './config.js';
import { runArchitecturalAnalysis, runSectionSuggestion } from './ai-analysis.js';
import { syncRepo, isRepoReady, getActiveDecisionsDir, pushChanges } from './git-sync.js';
import {
  getComments, addComment, deleteComment, updateComment,
  getVotes, castVote, removeVote,
  toggleReaction,
  updateCustomOption,
  getCustomOptions, addCustomOption, deleteCustomOption,
  getOrCreateUser, getUserById, getProjects, createProject,
  checkDb,
  query,
  saveAnalysis, getAnalysis,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDecisionsDir = path.resolve(__dirname, '..', 'decisions');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Inject GitHub token into HTTPS git URL for private repos
function authGitUrl(url: string): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return url;
  if (url.startsWith('https://github.com')) {
    return url.replace('https://', `https://x-access-token:${token}@`);
  }
  return url;
}

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
        execSync(`git clone --branch ${branch} "${authGitUrl(project.git_repo_url)}" "${cloneDir}"`,
          { stdio: 'pipe', timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      } else {
        execSync(`git fetch origin ${branch} `, { cwd: cloneDir, stdio: 'pipe', timeout: 30000 });
        execSync(`git reset --hard origin/${branch}`, { cwd: cloneDir, stdio: 'pipe', timeout: 15000 });
      }
      dir = path.resolve(cloneDir, repoPath);
    } catch (cloneErr: any) {
      // Clone failed — use empty per-project dir, NOT fallback to project 1
      dir = path.resolve(__dirname, '..', `git-data-${projectId}`);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Clear any stale .md files from previous failed clone
      try {
        const existing = fs.readdirSync(dir);
        for (const f of existing) {
          if (f.endsWith('.md')) fs.unlinkSync(path.join(dir, f));
        }
      } catch {}
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

// ─── Git Info Routes ─────────────────────────────────────

/**
 * GET /api/git-info
 * Returns current commit hash, repo URL, and previous commit hash.
 */
app.get('/api/git-info', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);
    
    if (!project?.git_repo_url) {
      return res.json({ commitHash: null, repoUrl: null, prevHash: null });
    }

    const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
    const commitHash = execSync('git rev-parse --short HEAD', {
      cwd: cloneDir, encoding: 'utf-8',
    }).trim();
    
    // Get repo URL for link (strip .git, convert to HTTPS)
    let repoUrl = project.git_repo_url.replace(/\.git$/, '');
    if (repoUrl.startsWith('git@')) {
      repoUrl = repoUrl.replace('git@github.com:', 'https://github.com/');
    }

    // Get previous commit
    let prevHash: string | null = null;
    try {
      prevHash = execSync('git rev-parse --short HEAD~1', {
        cwd: cloneDir, encoding: 'utf-8',
      }).trim();
    } catch { prevHash = null; }

    res.json({ commitHash, repoUrl, prevHash });
  } catch (err: any) {
    res.json({ commitHash: null, repoUrl: null, prevHash: null });
  }
});

/**
 * POST /api/git-revert
 * Reverts to previous commit (git reset --hard HEAD~1) and pushes.
 */
app.post('/api/git-revert', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);
    
    if (!project?.git_repo_url) {
      return res.status(400).json({ error: 'No git repo for this project' });
    }

    const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
    
    // Check if there's a previous commit
    try {
      execSync('git rev-parse HEAD~1', { cwd: cloneDir, encoding: 'utf-8', stdio: 'pipe' });
    } catch {
      return res.status(400).json({ error: 'No previous commit to revert to' });
    }

    const oldHash = execSync('git rev-parse --short HEAD', {
      cwd: cloneDir, encoding: 'utf-8',
    }).trim();
    
    // Reset to previous commit
    execSync('git reset --hard HEAD~1', { cwd: cloneDir, stdio: 'pipe', timeout: 10000 });
    
    const newHash = execSync('git rev-parse --short HEAD', {
      cwd: cloneDir, encoding: 'utf-8',
    }).trim();

    // Force push
    const branch = project.git_branch || 'main';
    try {
      execSync(`git push --force origin ${branch}`, {
        cwd: cloneDir, stdio: 'pipe', timeout: 30000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch (pushErr: any) {
      // Push failed but local is reset
    }

    // Invalidate cache
    projectDirCache.delete(projectId);

    res.json({ 
      success: true, 
      message: `Reverted ${oldHash} → ${newHash}`,
      commitHash: newHash,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Section Suggestion (AI per-section) ──────────────────

app.post('/api/decisions/:id/suggest', async (req, res) => {
  try {
    const { section } = req.body;
    if (!section || !['context', 'options', 'consequences'].includes(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const graph = buildGraph(dir);
    const node = graph.nodes.find(n => n.id === req.params.id);
    if (!node) return res.status(404).json({ error: 'Decision not found' });

    const sections = parseBodySections(node.body);
    const currentContent = section === 'context' ? sections.context
      : section === 'options' ? sections.options
      : sections.consequences;

    const result = await runSectionSuggestion({
      section,
      title: node.title,
      currentContent,
      phase: node.phase || 4,
    });

    res.json(result);
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

    const userId = req.body.userId || 1;

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
    const userId = parseInt(req.query.userId as string) || 1;
    const deleted = await deleteComment(commentId, userId);
    if (!deleted) return res.status(404).json({ error: 'Comment not found or not owned' });
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/comments/:commentId
 * Edit a comment. Body: { content }
 */
app.put('/api/comments/:commentId', async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const userId = req.body.userId || 1;
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
    const updated = await updateComment(commentId, userId, content.trim());
    if (!updated) return res.status(404).json({ error: 'Comment not found or not owned' });
    res.json(updated);
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

    const userId = req.body.userId || 1;

    const vote = await castVote(
      req.params.nodeId, getProjectId(req), userId,
      optionLetter, weight || 1, rationale || null
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
    const userId = parseInt(req.query.userId as string) || req.body?.userId || 1;
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

    const userId = req.body.userId || 1;
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

/**
 * POST /api/projects
 */
app.post('/api/projects', async (req, res) => {
  try {
    const { name, description, git_repo_url, git_branch, git_path } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const project = await createProject(
      name, description || null,
      git_repo_url || null, git_branch || 'main', git_path || '.'
    );
    res.status(201).json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * PUT /api/options/:nodeId/:letter
 * Update custom option title. Body: { title }
 */
app.put('/api/options/:nodeId/:letter', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const result = await updateCustomOption(
      req.params.nodeId, getProjectId(req), req.params.letter.toUpperCase(), title.trim()
    );
    if (!result) return res.status(404).json({ error: 'Option not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/options/:nodeId/:letter
 * Delete a custom option.
 */
app.delete('/api/options/:nodeId/:letter', async (req, res) => {
  try {
    const deleted = await deleteCustomOption(req.params.nodeId, getProjectId(req), req.params.letter.toUpperCase());
    if (!deleted) return res.status(404).json({ error: 'Option not found' });
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/users
 * List all users (for role switching UI).
 */
app.get('/api/users', async (_req, res) => {
  try {
    const users = await query('SELECT id, username, role FROM users ORDER BY id');
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/decisions
 * Create a new ADR. Writes .md file to git, commits + pushes.
 * Body: { title, parent, type, context, options, decision, consequences }
 */
app.post('/api/decisions', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);

    // Compute next ID
    const existing = buildGraph(dir);
    const maxId = existing.nodes.reduce((mx, n) => {
      const num = parseInt(n.id, 10);
      return isNaN(num) ? mx : Math.max(mx, num);
    }, 0);
    const newId = String(maxId + 1).padStart(3, '0');

    const { filename, content: md } = generateAdrMarkdown({
      ...req.body,
      id: newId,
    });

    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, md, 'utf-8');

    // Push to git if project has a repo
    if (project?.git_repo_url) {
      const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
      const pushResult = pushChanges(`ADR-${newId}: ${req.body.title}`, loadConfig());
      res.status(201).json({
        id: newId,
        filename,
        pushResult: pushResult.success ? 'pushed' : 'saved locally',
        message: pushResult.message,
      });
    } else {
      res.status(201).json({ id: newId, filename, message: 'saved locally (no git repo)' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/decisions/:id
 * Edit an existing ADR. Updates the .md file, commits + pushes.
 * Body: { title, context, options, decision, consequences, status }
 */
app.put('/api/decisions/:id', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);

    // Find existing file
    const graph = buildGraph(dir);
    const node = graph.nodes.find(n => n.id === req.params.id);
    if (!node) return res.status(404).json({ error: 'Decision not found' });

    const filePath = path.join(dir, node.file);

    // Parse existing body sections to preserve unmodified fields
    const existing = parseBodySections(node.body);

    // Reconstruct structured options from existing node if not provided
    let optionsForGen = req.body.options;
    if (!optionsForGen && node.options?.length) {
      optionsForGen = node.options.map(o => ({ letter: o.letter, title: o.title }));
    }

    const { content: md } = generateAdrMarkdown({
      id: node.id,
      title: req.body.title || node.title,
      status: req.body.status || node.status,
      type: node.type,
      parent: node.parent,
      cross_refs: node.cross_refs,
      context: req.body.context !== undefined ? req.body.context : existing.context,
      options: optionsForGen,
      decision: req.body.decision !== undefined ? req.body.decision : existing.decision,
      consequences: req.body.consequences !== undefined ? req.body.consequences : existing.consequences,
      created: node.created,
    });

    fs.writeFileSync(filePath, md, 'utf-8');

    if (project?.git_repo_url) {
      const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
      const pushResult = pushChanges(`Edit ADR-${node.id}: ${req.body.title || node.title}`, loadConfig());
      res.json({
        id: node.id,
        pushResult: pushResult.success ? 'pushed' : 'saved locally',
        message: pushResult.message,
      });
    } else {
      res.json({ id: node.id, message: 'saved locally (no git repo)' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * DELETE /api/decisions/:id
 * Delete an ADR file, commit + push.
 */
app.delete('/api/decisions/:id', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);

    const graph = buildGraph(dir);
    const node = graph.nodes.find(n => n.id === req.params.id);
    if (!node) return res.status(404).json({ error: 'Decision not found' });

    const filePath = path.join(dir, node.file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (project?.git_repo_url) {
      const pushResult = pushChanges(`Delete ADR-${node.id}: ${node.title}`, loadConfig());
      res.json({ id: node.id, pushResult: pushResult.success ? 'pushed' : 'saved locally', message: pushResult.message });
    } else {
      res.json({ id: node.id, message: 'deleted locally (no git repo)' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Track in-progress analyses
const analyzingNodes = new Set<string>();

/**
 * POST /api/decisions/:id/analyze
 * Start AI analysis async — returns 202, result available via GET.
 */
app.post('/api/decisions/:id/analyze', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const graph = buildGraph(dir);
    const node = graph.nodes.find(n => n.id === req.params.id);
    if (!node) return res.status(404).json({ error: 'Decision not found' });

    const nodeKey = `${projectId}:${req.params.id}`;
    if (analyzingNodes.has(nodeKey)) {
      return res.status(202).json({ status: 'already_running' });
    }
    analyzingNodes.add(nodeKey);

    // Run in background
    (async () => {
      try {
        let parentTitle: string | undefined;
        let parentBody: string | undefined;
        if (node.parent) {
          const parent = graph.nodes.find(n => n.id === node.parent);
          if (parent) { parentTitle = parent.title; parentBody = parent.body; }
        }
        const children = graph.nodes.filter(n => n.parent === node.id);

        const result = await runArchitecturalAnalysis({
          adrId: node.id,
          adrTitle: node.title,
          adrBody: node.body,
          phase: node.phase || 4,
          parentTitle, parentBody,
          childrenTitles: children.map(c => c.title),
          options: node.options || [],
        });

        await saveAnalysis(node.id, projectId, result.analysis, result.model);
      } catch (err) {
        console.error(`Analysis failed for ${nodeKey}:`, err);
      } finally {
        analyzingNodes.delete(nodeKey);
      }
    })();

    res.status(202).json({ status: 'started' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/decisions/:id/analysis
 */
app.get('/api/decisions/:id/analysis', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const nodeKey = `${projectId}:${req.params.id}`;
    const isAnalyzing = analyzingNodes.has(nodeKey);
    const analysis = await getAnalysis(req.params.id, projectId);
    res.json({ analyzing: isAnalyzing, analysis: analysis?.analysis || null, model: analysis?.model, created_at: analysis?.created_at });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/projects/:id
 * Update project (e.g., set git_repo_url).
 */
app.put('/api/projects/:id', async (req, res) => {
  try {
    const pid = parseInt(req.params.id, 10);
    const { git_repo_url, name, description } = req.body;

    // Update in DB
    if (git_repo_url !== undefined) {
      await query('UPDATE projects SET git_repo_url = $2 WHERE id = $1', [pid, git_repo_url]);
    }
    if (name) {
      await query('UPDATE projects SET name = $2 WHERE id = $1', [pid, name]);
    }
    if (description !== undefined) {
      await query('UPDATE projects SET description = $2 WHERE id = $1', [pid, description]);
    }

    // Clear dir cache so it re-clones
    projectDirCache.delete(pid);

    res.json({ status: 'ok' });
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
    const userId = req.body.userId || 1;
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
