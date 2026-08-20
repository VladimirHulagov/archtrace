// ─── Auth (GitHub PAT session) ───────────────────────────

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  avatarUrl?: string | null;
}

const SESSION_KEY = 'archtrace-session';

export function getSessionToken(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function authHeaders(): Record<string, string> {
  const t = getSessionToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function loginWithPat(pat: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pat }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  setSessionToken(data.token);
  window.dispatchEvent(new CustomEvent('archtrace-auth-changed'));
  return data;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.user) { setSessionToken(null); return null; }
  return data.user;
}

export async function logout(): Promise<void> {
  try { await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }); } catch {}
  setSessionToken(null);
  window.dispatchEvent(new CustomEvent('archtrace-auth-changed'));
}

export interface DecisionNode {
  id: string;
  title: string;
  status: 'proposed' | 'debating' | 'accepted' | 'rejected' | 'superseded';
  type: 'problem' | 'requirement' | 'paradigm' | 'decision' | 'task';
  phase?: 1 | 2 | 3 | 4;
  parent: string | null;
  cross_refs: string[];
  created: string;
  decided: string | null;
  voters: Voter[];
  options: { letter: string; title: string }[];
  body: string;
  file: string;
}

export interface Voter {
  name: string;
  role: string;
  vote: string;
  weight: number;
  rationale: string;
}

export interface GraphConnection {
  id: string;
  from: string;
  to: string;
  kind: 'parent' | 'cross-ref';
}

export interface Graph {
  nodes: DecisionNode[];
  connections: GraphConnection[];
}

export interface SyncResult {
  success: boolean;
  action: 'clone' | 'pull' | 'none';
  message: string;
  commitHash?: string;
  timestamp: string;
}

export interface SyncStatus {
  ready: boolean;
  repoUrl: string;
  branch: string;
  decisionsDir: string | null;
  localFallback: boolean;
}


// ─── DB Types ────────────────────────────────────────────

export interface Comment {
  id: number;
  node_id: string;
  project_id: number;
  parent_comment_id: number | null;
  author_id: number;
  author_name?: string;
  author_avatar?: string | null;
  content: string;
  likes: number;
  dislikes: number;
  user_reaction?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vote {
  id: number;
  node_id: string;
  option_letter: string;
  user_id: number;
  username?: string;
  weight: number;
  rationale: string | null;
  created_at: string;
  updated_at: string;
}

// ─── DB API Functions ────────────────────────────────────

export async function fetchComments(nodeId: string): Promise<Comment[]> {
  const res = await fetch(`${API_BASE}/comments/${nodeId}`, { headers: projectHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function postComment(nodeId: string, content: string, parentCommentId?: number, userId?: number): Promise<Comment> {
  const res = await authFetch(`${API_BASE}/comments/${nodeId}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ content, parentCommentId }),
  });
  if (!res.ok) throw new Error('Failed to post comment');
  return res.json();
}

export async function deleteCommentApi(commentId: number): Promise<void> {
  await authFetch(`${API_BASE}/comments/${commentId}`, { method: 'DELETE', headers: projectHeaders() });
}

export async function updateCommentApi(commentId: number, content: string): Promise<Comment> {
  const res = await authFetch(`${API_BASE}/comments/${commentId}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to update comment');
  return res.json();
}

export async function reactToComment(commentId: number, reaction: 'like' | 'dislike', userId?: number): Promise<{ likes: number; dislikes: number; userReaction: string | null }> {
  const res = await authFetch(`${API_BASE}/comments/${commentId}/react`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ reaction }),
  });
  if (!res.ok) throw new Error('Failed to react');
  return res.json();
}

export async function updateCustomOptionApi(nodeId: string, letter: string, title: string): Promise<{ letter: string; title: string }> {
  const res = await authFetch(`${API_BASE}/options/${nodeId}/${letter}?projectId=${_currentProjectId}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to update option');
  return res.json();
}

export async function fetchVotes(nodeId: string): Promise<Vote[]> {
  const res = await fetch(`${API_BASE}/votes/${nodeId}`, { headers: projectHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function castVoteApi(nodeId: string, optionLetter: string, weight: number, rationale?: string, userId?: number): Promise<Vote> {
  const res = await authFetch(`${API_BASE}/votes/${nodeId}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ optionLetter, rationale }),
  });
  if (!res.ok) throw new Error('Failed to cast vote');
  return res.json();
}

export async function removeVoteApi(nodeId: string, userId?: number): Promise<void> {
  await authFetch(`${API_BASE}/votes/${nodeId}`, { method: 'DELETE', headers: projectHeaders() });
}

// Options now live in the MD file — fetch from same endpoint
export async function fetchCustomOptions(nodeId: string): Promise<{ letter: string; title: string }[]> {
  const res = await fetch(`${API_BASE}/options/${nodeId}`, { headers: projectHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function addCustomOptionApi(nodeId: string, letter: string, title: string): Promise<{ letter: string; title: string }> {
  const res = await authFetch(`${API_BASE}/options/${nodeId}?projectId=${_currentProjectId}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ letter, title }),
  });
  if (!res.ok) throw new Error('Failed to add option');
  return res.json();
}


export interface Project {
  id: number;
  name: string;
  description: string | null;
  git_repo_url: string | null;
  git_branch: string;
  git_path: string;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) return [];
  return res.json();
}

export async function createProjectApi(data: {
  name: string;
  description?: string;
  git_repo_url?: string;
  git_branch?: string;
  git_path?: string;
}): Promise<Project> {
  const res = await authFetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = `Не удалось создать проект (HTTP ${res.status})`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}


// Current project ID — updated when user switches project
let _currentProjectId = 1;
export function setProjectId(id: number) { _currentProjectId = id; }


function projectHeaders(): Record<string, string> {
  return { 'X-Project-Id': String(_currentProjectId) };
}

/** fetch wrapper: adds auth + project headers; dispatches 401 event for the login modal. */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const t = getSessionToken();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('archtrace-auth-required'));
  }
  return res;
}

function jsonHeaders(): Record<string, string> {
  return { ...projectHeaders(), 'Content-Type': 'application/json' };
}

const API_BASE = '/api';

export async function fetchGraph(projectId?: number): Promise<Graph> {
  const url = projectId ? `${API_BASE}/graph?projectId=${projectId}` : `${API_BASE}/graph`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch graph: ${res.statusText}`);
  return res.json();
}

export async function fetchDecision(id: string, projectId?: number): Promise<DecisionNode & { voteTally: Record<string, number> }> {
  const url = projectId ? `${API_BASE}/decisions/${id}?projectId=${projectId}` : `${API_BASE}/decisions/${id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch decision: ${res.statusText}`);
  return res.json();
}

export async function syncRepo(): Promise<SyncResult> {
  const res = await authFetch(`${API_BASE}/sync`, { method: 'POST' });
  if (!res.ok) throw new Error(`Sync failed: ${res.statusText}`);
  return res.json();
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${API_BASE}/sync/status`);
  if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
  return res.json();
}


// ─── ADR CRUD ─────────────────────────────────────────────

export interface AdrInput {
  title: string;
  parent?: string | null;
  type?: string;
  phase?: number;
  context?: string;
  options?: { letter: string; title: string; description?: string }[];
  decision?: string;
  consequences?: string;
}

export async function createDecision(data: AdrInput): Promise<{ id: string; filename: string; message: string }> {
  const res = await authFetch(`${API_BASE}/decisions`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create decision');
  return res.json();
}

export async function updateDecision(id: string, data: Partial<AdrInput> & { status?: string }): Promise<{ id: string; message: string }> {
  const res = await authFetch(`${API_BASE}/decisions/${id}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update decision');
  return res.json();
}


// ─── Git Info ────────────────────────────────────────────

export interface GitInfo {
  commitHash: string | null;
  repoUrl: string | null;
  prevHash: string | null;
}

export async function fetchGitInfo(): Promise<GitInfo> {
  const res = await fetch(`${API_BASE}/git-info`, { headers: projectHeaders() });
  if (!res.ok) return { commitHash: null, repoUrl: null, prevHash: null };
  return res.json();
}

export async function revertGit(): Promise<{ success: boolean; message: string; commitHash: string }> {
  const res = await authFetch(`${API_BASE}/git-revert`, {
    method: 'POST',
    headers: jsonHeaders(),
  });
  if (!res.ok) throw new Error('Revert failed');
  return res.json();
}

// ─── AI Analysis ──────────────────────────────────────────

export async function suggestSection(nodeId: string, section: 'context' | 'options' | 'consequences'): Promise<{ content: string; alternatives?: string[] }> {
  const res = await authFetch(`${API_BASE}/decisions/${nodeId}/suggest`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ section }),
  });
  if (!res.ok) throw new Error('Suggestion failed');
  return res.json();
}

// ─── GitHub PAT ───────────────────────────────────────────




export async function startAnalysis(nodeId: string): Promise<{ status: string }> {
  const res = await authFetch(`${API_BASE}/decisions/${nodeId}/analyze?projectId=${_currentProjectId}`, {
    method: 'POST',
    headers: projectHeaders(),
  });
  if (!res.ok) throw new Error('Analysis failed to start');
  return res.json();
}

export async function getAnalysisStatus(nodeId: string): Promise<{ analyzing: boolean; analysis: string | null; model?: string; created_at?: string }> {
  const res = await fetch(`${API_BASE}/decisions/${nodeId}/analysis?projectId=${_currentProjectId}`, { headers: projectHeaders() });
  if (!res.ok) return { analyzing: false, analysis: null };
  return res.json();
}

// ─── Decision History (git log) ──────────────────────────

export interface HistoryEntry {
  hash: string;
  date: string;
  message: string;
  changes: string[];
}

export async function fetchHistory(nodeId: string): Promise<HistoryEntry[]> {
  const res = await fetch(`${API_BASE}/decisions/${nodeId}/history`, { headers: projectHeaders() });
  if (!res.ok) return [];
  return res.json();
}
