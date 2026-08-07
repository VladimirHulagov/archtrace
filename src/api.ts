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

export interface CustomOption {
  id: number;
  node_id: string;
  letter: string;
  title: string;
  created_by: number | null;
  created_at: string;
}

// ─── DB API Functions ────────────────────────────────────

export async function fetchComments(nodeId: string): Promise<Comment[]> {
  const res = await fetch(`${API_BASE}/comments/${nodeId}`, { headers: projectHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function postComment(nodeId: string, content: string, parentCommentId?: number, userId?: number): Promise<Comment> {
  const res = await fetch(`${API_BASE}/comments/${nodeId}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ content, parentCommentId, userId }),
  });
  if (!res.ok) throw new Error('Failed to post comment');
  return res.json();
}

export async function deleteCommentApi(commentId: number): Promise<void> {
  await fetch(`${API_BASE}/comments/${commentId}`, { method: 'DELETE', headers: projectHeaders() });
}

export async function updateCommentApi(commentId: number, content: string): Promise<Comment> {
  const res = await fetch(`${API_BASE}/comments/${commentId}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to update comment');
  return res.json();
}

export async function reactToComment(commentId: number, reaction: 'like' | 'dislike', userId?: number): Promise<{ likes: number; dislikes: number; userReaction: string | null }> {
  const res = await fetch(`${API_BASE}/comments/${commentId}/react`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ reaction, userId }),
  });
  if (!res.ok) throw new Error('Failed to react');
  return res.json();
}

export async function updateCustomOptionApi(nodeId: string, letter: string, title: string): Promise<CustomOption> {
  const res = await fetch(`${API_BASE}/options/${nodeId}/${letter}`, {
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
  const res = await fetch(`${API_BASE}/votes/${nodeId}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ optionLetter, weight, rationale, userId }),
  });
  if (!res.ok) throw new Error('Failed to cast vote');
  return res.json();
}

export async function removeVoteApi(nodeId: string, userId?: number): Promise<void> {
  const url = userId ? `${API_BASE}/votes/${nodeId}?userId=${userId}` : `${API_BASE}/votes/${nodeId}`;
  await fetch(url, { method: 'DELETE', headers: projectHeaders() });
}

export async function fetchCustomOptions(nodeId: string): Promise<CustomOption[]> {
  const res = await fetch(`${API_BASE}/options/${nodeId}`, { headers: projectHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function addCustomOptionApi(nodeId: string, letter: string, title: string): Promise<CustomOption> {
  const res = await fetch(`${API_BASE}/options/${nodeId}`, {
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
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}


// Current project ID — updated when user switches project
let _currentProjectId = 1;
export function setProjectId(id: number) { _currentProjectId = id; }


function projectHeaders(): Record<string, string> {
  return { 'X-Project-Id': String(_currentProjectId) };
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
  const res = await fetch(`${API_BASE}/sync`, { method: 'POST' });
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
  const res = await fetch(`${API_BASE}/decisions`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create decision');
  return res.json();
}

export async function updateDecision(id: string, data: Partial<AdrInput> & { status?: string }): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_BASE}/decisions/${id}`, {
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
  const res = await fetch(`${API_BASE}/git-revert`, {
    method: 'POST',
    headers: jsonHeaders(),
  });
  if (!res.ok) throw new Error('Revert failed');
  return res.json();
}

// ─── AI Analysis ──────────────────────────────────────────

export async function suggestSection(nodeId: string, section: 'context' | 'options' | 'consequences'): Promise<{ content: string; alternatives?: string[] }> {
  const res = await fetch(`${API_BASE}/decisions/${nodeId}/suggest`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ section }),
  });
  if (!res.ok) throw new Error('Suggestion failed');
  return res.json();
}

export async function startAnalysis(nodeId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/decisions/${nodeId}/analyze`, {
    method: 'POST',
    headers: projectHeaders(),
  });
  if (!res.ok) throw new Error('Analysis failed to start');
  return res.json();
}

export async function getAnalysisStatus(nodeId: string): Promise<{ analyzing: boolean; analysis: string | null; model?: string; created_at?: string }> {
  const res = await fetch(`${API_BASE}/decisions/${nodeId}/analysis`, { headers: projectHeaders() });
  if (!res.ok) return { analyzing: false, analysis: null };
  return res.json();
}
