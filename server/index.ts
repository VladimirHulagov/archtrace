/**
 * ArchTrace API Server
 *
 * Reads ADR markdown files from a Git repository (synced to git-data/),
 * serves the decision graph as JSON.
 *
 * Source of truth: git repo configured in archtrace.config.json.
 */

import express from 'express';
import https from 'https';
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
  getOrCreateUser, getUserById, getProjects, createProject,
  updateUserGithubToken, getUserGithubToken,
  createSession, getSessionUser, deleteSession,
  checkDb,
  query,
  saveAnalysis, getAnalysis,
} from './db.js';
import {
  addOptionToMd, updateOptionInMd, removeOptionFromMd, findDecisionFile,
} from './options-md.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDecisionsDir = path.resolve(__dirname, '..', 'decisions');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Auth (GitHub PAT) ────────────────────────────────────

function extractSessionToken(req: express.Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/** Attach authUser if a valid session token is present. Read endpoints skip this silently. */
app.use((req, _res, next) => {
  const token = extractSessionToken(req);
  if (!token) return next();
  getSessionUser(token)
    .then(user => { if (user) (req as any).authUser = { id: user.id, username: user.username, role: user.role }; next(); })
    .catch(() => next());
});

/** Require a logged-in user for write operations. */
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const u = (req as any).authUser;
  if (!u) return res.status(401).json({ error: 'Требуется вход по GitHub PAT' });
  next();
}

/** Require architect role (admin) for destructive operations. */
function requireArchitect(req: express.Request, res: express.Response, next: express.NextFunction) {
  const u = (req as any).authUser;
  if (!u) return res.status(401).json({ error: 'Требуется вход по GitHub PAT' });
  if (u.role !== 'architect') return res.status(403).json({ error: 'Требуется роль architect' });
  next();
}

/**
 * POST /api/auth/login  Body: { pat }
 * Verify GitHub PAT, create user if needed, save PAT for git pushes, issue session.
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { pat } = req.body;
    if (!pat || !pat.trim()) return res.status(400).json({ error: 'pat required' });
    const check = await githubCheckTokenDetailed(pat.trim());
    if (!check.valid) {
      return res.status(401).json({ error: `Недействительный токен: ${check.error}` });
    }
    const user = await getOrCreateUser(check.githubId!, check.username!, check.name || null, check.avatarUrl || null);
    // PAT doubles as the git-push token for this user
    await updateUserGithubToken(user.id, pat.trim());
    const session = await createSession(user.id);
    res.json({
      token: session.token,
      user: { id: user.id, username: user.username, role: user.role, avatarUrl: user.avatar_url },
      expiresAt: session.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me — current session user (null if guest).
 */
app.get('/api/auth/me', async (req, res) => {
  const token = extractSessionToken(req);
  if (!token) return res.json({ user: null });
  const user = await getSessionUser(token);
  if (!user) return res.json({ user: null });
  res.json({ user: { id: user.id, username: user.username, role: user.role, avatarUrl: user.avatar_url } });
});

/**
 * POST /api/auth/logout — invalidate session.
 */
app.post('/api/auth/logout', async (req, res) => {
  const token = extractSessionToken(req);
  if (token) await deleteSession(token);
  res.status(204).end();
});

// Slugify Cyrillic to Latin (for repo names)
function slugifyLatin(text: string): string {
  const map: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z',
    'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
    ' ':'-','_':'-'
  };
  return text.toLowerCase().split('').map(ch => map[ch] ?? ch).join('')
    .replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

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
async function projectDecisionsDir(projectId: number, skipSync: boolean = false): Promise<string> {
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
      if (!fs.existsSync(dir)) {
        // git_path points to a non-existent subdir — fall back to clone root
        // instead of ENOENT (e.g. repo created later, path typo)
        console.warn(`git_path '${repoPath}' not found in clone for project ${projectId}, using clone root`);
        dir = cloneDir;
      }
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

app.put('/api/config', requireArchitect, (req, res) => {
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

app.post('/api/sync', requireArchitect, (_req, res) => {
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

// ─── GitHub API helpers ──────────────────────────────────


async function githubCheckTokenDetailed(token: string): Promise<{ valid: boolean; username?: string; githubId?: number; name?: string | null; avatarUrl?: string | null; error?: string }> {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ArchTrace',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve({ valid: true, username: json.login, githubId: json.id, name: json.name ?? null, avatarUrl: json.avatar_url ?? null });
          } else {
            resolve({ valid: false, error: json.message || `HTTP ${res.statusCode}` });
          }
        } catch {
          resolve({ valid: false, error: 'Parse error' });
        }
      });
    });
    req.on('error', (err) => resolve({ valid: false, error: err.message }));
    req.end();
  });
}

async function githubCheckToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ArchTrace',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve({ valid: true, username: json.login });
          } else {
            resolve({ valid: false, error: json.message || `HTTP ${res.statusCode}` });
          }
        } catch {
          resolve({ valid: false, error: 'Parse error' });
        }
      });
    });
    req.on('error', (err) => resolve({ valid: false, error: err.message }));
    req.end();
  });
}

// Get user's PAT from DB, fallback to global env
async function getGitToken(userId?: number): Promise<string | null> {
  if (userId) {
    const token = await getUserGithubToken(userId);
    if (token) return token;
  }
  return process.env.GITHUB_TOKEN || null;
}

// Override authGitUrl to accept user-specific token
function authGitUrlWithToken(url: string, token: string | null): string {
  if (!token) return url;
  if (url.startsWith('https://github.com')) {
    return url.replace('https://', `https://x-access-token:${token}@`);
  }
  return url;
}

// ─── PAT management routes removed — login via POST /api/auth/login supersedes them ───

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

    // Get repo URL for link (strip .git, convert to HTTPS)
    let repoUrl = project.git_repo_url.replace(/\.git$/, '');
    if (repoUrl.startsWith('git@')) {
      repoUrl = repoUrl.replace('git@github.com:', 'https://github.com/');
    }

    // Project 1 uses git-data (via git-sync.ts), others use git-data-<id>
    const cloneDir = projectId === 1
      ? path.resolve(__dirname, '..', 'git-data')
      : path.resolve(__dirname, '..', `git-data-${projectId}`);
    
    // Check if dir exists and has .git
    if (!fs.existsSync(path.join(cloneDir, '.git'))) {
      return res.json({ commitHash: null, repoUrl: repoUrl, prevHash: null });
    }
    
    const commitHash = execSync('git rev-parse --short HEAD', {
      cwd: cloneDir, encoding: 'utf-8',
    }).trim();
    
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
app.post('/api/git-revert', requireArchitect, async (req, res) => {
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

app.post('/api/decisions/:id/suggest', requireAuth, async (req, res) => {
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

// ─── Decision History (git log) ──────────────────────────

/**
 * GET /api/decisions/:id/history
 * Returns git commit history for the decision's MD file.
 */
app.get('/api/decisions/:id/history', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);

    const graph = buildGraph(dir);
    const node = graph.nodes.find(n => n.id === req.params.id);
    if (!node) return res.status(404).json({ error: 'Decision not found' });

    const filePath = findDecisionFile(dir, req.params.id);
    if (!filePath) return res.json([]);

    const relativePath = path.relative(dir, filePath);

    // Determine clone dir for git commands
    const cloneDir = projectId === 1
      ? path.resolve(__dirname, '..', 'git-data')
      : path.resolve(__dirname, '..', `git-data-${projectId}`);

    // If no git repo, return empty history
    if (!fs.existsSync(path.join(cloneDir, '.git'))) {
      return res.json([]);
    }

    // Get file-specific commit log with diffs
    const fileName = path.basename(filePath);
    const logFormat = '--pretty=format:"%h|%ad|%s" --date=short';
    let logOutput: string;
    try {
      logOutput = execSync(
        `git log -p --follow --diff-filter=AMRD ${logFormat} -- "${fileName}"`,
        { cwd: cloneDir, encoding: 'utf-8', timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
      );
    } catch {
      return res.json([]);
    }

    // Parse the combined log + diff output into structured entries
    const entries: any[] = [];
    const commitBlocks = logOutput.split(/(?=^[a-f0-9]{7,}\|)/m);

    for (const block of commitBlocks) {
      const lines = block.split('\n');
      const headerMatch = lines[0]?.match(/^([a-f0-9]{7,})\|(.+?)\|(.+)$/);
      if (!headerMatch) continue;

      const hash = headerMatch[1];
      const date = headerMatch[2];
      const message = headerMatch[3];

      // Extract diff lines
      const diffLines: string[] = [];
      let inDiff = false;
      for (const line of lines) {
        if (line.startsWith('@@') || line.startsWith('diff --git') || line.startsWith('+++') || line.startsWith('---')) {
          inDiff = true;
          continue;
        }
        if (inDiff) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            diffLines.push('+' + line.slice(1));
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            diffLines.push('-' + line.slice(1));
          } else if (line.startsWith(' ') && line.trim()) {
            diffLines.push(' ' + line.slice(1));
          }
        }
      }

      entries.push({ hash, date, message, changes: diffLines.slice(0, 100) });
    }

    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ─── Graph and Decision Routes ───────────────────────────

// Graph cache: { projectId → { graph, timestamp } }
const graphCache = new Map<number, { graph: any; timestamp: number }>();
const GRAPH_CACHE_TTL = 5000; // 5 seconds

app.get('/api/graph', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const cached = graphCache.get(projectId);
    if (cached && Date.now() - cached.timestamp < GRAPH_CACHE_TTL) {
      return res.json(cached.graph);
    }
    const dir = await projectDecisionsDir(projectId);
    const graph = buildGraph(dir);
    graphCache.set(projectId, { graph, timestamp: Date.now() });
    res.json(graph);
  } catch (err: any) {
    console.error('Failed to build graph:', err.message);
    res.status(500).json({ error: 'Failed to build graph', detail: err.message });
  }
});

// Invalidate graph cache when a decision is created/updated/deleted
function invalidateGraphCache(projectId?: number) {
  if (projectId) graphCache.delete(projectId);
  else graphCache.clear();
}

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
app.post('/api/comments/:nodeId', requireAuth, async (req, res) => {
  try {
    const { content, parentCommentId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const userId = (req as any).authUser.id;

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
app.delete('/api/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const userId = (req as any).authUser.id;
    const deleted = await deleteComment(commentId, userId);
    if (!deleted) return res.status(404).json({ error: 'Comment not found or not owned' });
    invalidateGraphCache(getProjectId(req));
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/comments/:commentId
 * Edit a comment. Body: { content }
 */
app.put('/api/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const userId = (req as any).authUser.id;
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
app.post('/api/votes/:nodeId', requireAuth, async (req, res) => {
  try {
    const { optionLetter, weight, rationale } = req.body;
    if (!optionLetter) {
      return res.status(400).json({ error: 'optionLetter is required' });
    }

    const userId = (req as any).authUser.id;
    // Weight is derived from role server-side — client value is ignored
    const roleWeight = (req as any).authUser.role === 'architect' ? 3 : (req as any).authUser.role === 'senior' ? 2 : 1;

    const vote = await castVote(
      req.params.nodeId, getProjectId(req), userId,
      optionLetter, roleWeight, rationale || null
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
app.delete('/api/votes/:nodeId', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).authUser.id;
    const removed = await removeVote(req.params.nodeId, getProjectId(req), userId);
    if (!removed) return res.status(404).json({ error: 'Vote not found' });
    invalidateGraphCache(getProjectId(req));
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/options/:nodeId
 * Get options for a node from the MD file (source of truth).
 */
app.get('/api/options/:nodeId', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const graph = buildGraph(dir);
    const node = graph.nodes.find(n => n.id === req.params.nodeId);
    if (!node) return res.status(404).json({ error: 'Decision not found' });
    res.json(node.options || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/options/:nodeId
 * Add an option to the MD file. Body: { letter, title }
 */
app.post('/api/options/:nodeId', requireAuth, async (req, res) => {
  try {
    const { letter, title } = req.body;
    if (!letter || !title) {
      return res.status(400).json({ error: 'letter and title are required' });
    }

    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);

    const filePath = findDecisionFile(dir, req.params.nodeId);
    if (!filePath) return res.status(404).json({ error: 'Decision file not found' });

    const rawMd = fs.readFileSync(filePath, 'utf-8');
    const updatedMd = addOptionToMd(rawMd, letter.toUpperCase(), title.trim());
    fs.writeFileSync(filePath, updatedMd, 'utf-8');

    if (project?.git_repo_url) {
      const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
      try {
        pushChanges(`Option ${letter}: add to ADR-${req.params.nodeId}`, loadConfig(), cloneDir);
      } catch (e: any) { console.error('Git push failed (add option):', e.message); }
    }

    invalidateGraphCache(getProjectId(req));
    res.status(201).json({ letter: letter.toUpperCase(), title: title.trim() });
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
app.post('/api/projects', requireArchitect, async (req, res) => {
  try {
    const { name, description, git_branch, git_path, git_repo_url } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!git_repo_url || !/^https:\/\/github\.com\//i.test(git_repo_url.trim())) {
      return res.status(400).json({ error: 'Укажите URL репозитория GitHub (https://github.com/<user>/<repo>). Создайте репозиторий на github.com/new — PAT с правом Administration не требуется.' });
    }

    const project = await createProject(
      name, description || null,
      git_repo_url, git_branch || 'main', git_path || '.'
    );
    res.status(201).json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * PUT /api/options/:nodeId/:letter
 * Update option title in the MD file. Body: { title }
 */
app.put('/api/options/:nodeId/:letter', requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);

    const filePath = findDecisionFile(dir, req.params.nodeId);
    if (!filePath) return res.status(404).json({ error: 'Decision file not found' });

    const rawMd = fs.readFileSync(filePath, 'utf-8');
    const updatedMd = updateOptionInMd(rawMd, req.params.letter.toUpperCase(), title.trim());
    fs.writeFileSync(filePath, updatedMd, 'utf-8');

    if (project?.git_repo_url) {
      const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
      pushChanges(`Option ${req.params.letter}: rename in ADR-${req.params.nodeId}`, loadConfig(), cloneDir);
    }

    res.json({ letter: req.params.letter.toUpperCase(), title: title.trim() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/options/:nodeId/:letter
 * Remove an option from the MD file.
 */
app.delete('/api/options/:nodeId/:letter', requireAuth, async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const dir = await projectDecisionsDir(projectId);
    const { getProject } = await import('./db.js');
    const project = await getProject(projectId);

    const filePath = findDecisionFile(dir, req.params.nodeId);
    if (!filePath) return res.status(404).json({ error: 'Decision file not found' });

    const rawMd = fs.readFileSync(filePath, 'utf-8');
    const updatedMd = removeOptionFromMd(rawMd, req.params.letter.toUpperCase());
    fs.writeFileSync(filePath, updatedMd, 'utf-8');

    if (project?.git_repo_url) {
      const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
      try {
        pushChanges(`Option ${req.params.letter}: remove from ADR-${req.params.nodeId}`, loadConfig(), cloneDir);
      } catch (e: any) { console.error('Git push failed (delete option):', e.message); }
    }

    invalidateGraphCache(getProjectId(req));
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
app.post('/api/decisions', requireAuth, async (req, res) => {
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
      const pushResult = pushChanges(`ADR-${newId}: ${req.body.title}`, loadConfig(), cloneDir);
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
app.put('/api/decisions/:id', requireAuth, async (req, res) => {
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
      const pushResult = pushChanges(`Edit ADR-${node.id}: ${req.body.title || node.title}`, loadConfig(), cloneDir);
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
app.delete('/api/decisions/:id', requireAuth, async (req, res) => {
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
      const cloneDir = path.resolve(__dirname, '..', `git-data-${projectId}`);
      const pushResult = pushChanges(`Delete ADR-${node.id}: ${node.title}`, loadConfig(), cloneDir);
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
app.post('/api/decisions/:id/analyze', requireAuth, async (req, res) => {
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
app.put('/api/projects/:id', requireArchitect, async (req, res) => {
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

/**
 * DELETE /api/projects/:id
 * Remove project from the list: DB row (comments/votes/ai_analyses cascade),
 * local git clone dir, caches. The GitHub repository itself is NOT touched.
 */
app.delete('/api/projects/:id', requireArchitect, async (req, res) => {
  try {
    const pid = parseInt(req.params.id, 10);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project id' });

    const { getProject } = await import('./db.js');
    const project = await getProject(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Delete DB row — comments, votes, ai_analyses, teams cascade via FK
    await query('DELETE FROM projects WHERE id = $1', [pid]);

    // Remove local clone git-data-<pid>
    const cloneDir = path.resolve(__dirname, '..', `git-data-${pid}`);
    if (fs.existsSync(cloneDir)) {
      fs.rmSync(cloneDir, { recursive: true, force: true });
    }

    // Invalidate caches
    projectDirCache.delete(pid);
    graphCache.delete(pid);

    res.json({ status: 'ok', id: pid });
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
app.post('/api/comments/:commentId/react', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const { reaction } = req.body;
    if (reaction !== 'like' && reaction !== 'dislike') {
      return res.status(400).json({ error: 'reaction must be like or dislike' });
    }
    const userId = (req as any).authUser.id;
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
