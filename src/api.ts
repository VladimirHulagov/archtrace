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
  const res = await fetch(`${API_BASE}/comments/${nodeId}`);
  if (!res.ok) return [];
  return res.json();
}

export async function postComment(nodeId: string, content: string, parentCommentId?: number): Promise<Comment> {
  const res = await fetch(`${API_BASE}/comments/${nodeId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, parentCommentId }),
  });
  if (!res.ok) throw new Error('Failed to post comment');
  return res.json();
}

export async function deleteCommentApi(commentId: number): Promise<void> {
  await fetch(`${API_BASE}/comments/${commentId}`, { method: 'DELETE' });
}

export async function reactToComment(commentId: number, reaction: 'like' | 'dislike'): Promise<{ likes: number; dislikes: number; userReaction: string | null }> {
  const res = await fetch(`${API_BASE}/comments/${commentId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reaction }),
  });
  if (!res.ok) throw new Error('Failed to react');
  return res.json();
}

export async function fetchVotes(nodeId: string): Promise<Vote[]> {
  const res = await fetch(`${API_BASE}/votes/${nodeId}`);
  if (!res.ok) return [];
  return res.json();
}

export async function castVoteApi(nodeId: string, optionLetter: string, weight: number, rationale?: string): Promise<Vote> {
  const res = await fetch(`${API_BASE}/votes/${nodeId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ optionLetter, weight, rationale }),
  });
  if (!res.ok) throw new Error('Failed to cast vote');
  return res.json();
}

export async function removeVoteApi(nodeId: string): Promise<void> {
  await fetch(`${API_BASE}/votes/${nodeId}`, { method: 'DELETE' });
}

export async function fetchCustomOptions(nodeId: string): Promise<CustomOption[]> {
  const res = await fetch(`${API_BASE}/options/${nodeId}`);
  if (!res.ok) return [];
  return res.json();
}

export async function addCustomOptionApi(nodeId: string, letter: string, title: string): Promise<CustomOption> {
  const res = await fetch(`${API_BASE}/options/${nodeId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ letter, title }),
  });
  if (!res.ok) throw new Error('Failed to add option');
  return res.json();
}

const API_BASE = '/api';

export async function fetchGraph(): Promise<Graph> {
  const res = await fetch(`${API_BASE}/graph`);
  if (!res.ok) throw new Error(`Failed to fetch graph: ${res.statusText}`);
  return res.json();
}

export async function fetchDecision(id: string): Promise<DecisionNode & { voteTally: Record<string, number> }> {
  const res = await fetch(`${API_BASE}/decisions/${id}`);
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
