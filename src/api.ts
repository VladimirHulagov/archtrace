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
