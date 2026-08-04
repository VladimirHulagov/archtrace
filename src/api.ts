export interface DecisionNode {
  id: string;
  title: string;
  status: 'proposed' | 'debating' | 'accepted' | 'rejected' | 'superseded';
  type: 'requirement' | 'decision' | 'task';
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
