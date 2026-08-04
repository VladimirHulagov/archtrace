import { useState, useCallback, useRef, useEffect } from 'react';
import { Tree, TreeNode } from './SimpleTree';
import {
  fetchGraph, syncRepo, fetchProjects, setProjectId,
  fetchComments, postComment, deleteCommentApi,
  fetchVotes, castVoteApi, removeVoteApi,
  fetchCustomOptions, addCustomOptionApi,
  type Graph, type DecisionNode, type SyncResult,
  type Comment, type Vote, type CustomOption, type Project,
} from './api';
import { calculateLayout } from './SimpleTree/utils/positions';
import type { Point } from './SimpleTree/types';
import ReactMarkdown from 'react-markdown';
import { DetailPanel } from './DetailPanel';

const STATUS_ICONS: Record<string, string> = {
  accepted: '✅', rejected: '❌', proposed: '💡', debating: '🔥', superseded: '⏭️',
};
const TYPE_ICONS: Record<string, string> = { requirement: '📋', decision: '⚙️', task: '🔨' };
const VOTE_COLORS: Record<string, string> = { A: '#52c41a', B: '#fa8c16', C: '#1890ff', D: '#722ed1' };

function decisionToTreeNode(d: DecisionNode): TreeNode {
  let voteTally = '';
  let voteSectors: { option: string; weight: number; color: string }[] = [];
  let winnerVote: string | undefined;

  if (d.voters?.length > 0) {
    const tally: Record<string, number> = {};
    for (const v of d.voters) { tally[v.vote] = (tally[v.vote] || 0) + v.weight; }
    voteTally = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([opt, w]) => `${opt}:${w}`).join(' ');
    voteSectors = Object.entries(tally).sort(([a], [b]) => a.localeCompare(b)).map(([opt, w]) => ({ option: opt, weight: w, color: VOTE_COLORS[opt] || '#8c8c8c' }));
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) winnerVote = sorted[0][0];
  }

  return {
    id: d.id, x: 0, y: 0, text: d.title, type: 'rich', status: d.status,
    icon: STATUS_ICONS[d.status] || TYPE_ICONS[d.type] || '📄',
    description: d.type, nodeType: d.type, voteTally, voteSectors, winnerVote, options: d.options || [],
  };
}

function App() {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DecisionNode | null>(null);
  const nodeIdCounter = useRef(1000);
  const connectionIdCounter = useRef(1000);
  const swipeStartX = useRef<number | null>(null);
  const [edgePoints, setEdgePoints] = useState<Map<string, Point[]>>(new Map());
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [customOptions, setCustomOptions] = useState<CustomOption[]>([]);
  const [commentText, setCommentText] = useState('');
  const [newOptionLetter, setNewOptionLetter] = useState('');
  const [newOptionTitle, setNewOptionTitle] = useState('');
  const [showAddOption, setShowAddOption] = useState(false);

  // ─── ALL useCallback hooks (before any early return) ───

  const reloadGraph = useCallback(async () => {
    const graph = await fetchGraph();
    const treeNodes = graph.nodes.map(decisionToTreeNode);
    const treeConnections = graph.connections.map(c => ({ id: c.id, from: c.from, to: c.to, kind: c.kind }));
    const { nodes: positioned, edgePoints: ePoints } = calculateLayout(treeNodes, treeConnections, window.innerWidth);
    setNodes(positioned);
    setConnections(treeConnections);
    setEdgePoints(ePoints);
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncRepo();
      setLastSync(result);
      setShowSyncBanner(true);
      await reloadGraph();
      setTimeout(() => setShowSyncBanner(false), 5000);
    } catch (err: any) {
      setLastSync({ success: false, action: 'none', message: err.message, timestamp: new Date().toISOString() });
      setShowSyncBanner(true);
      setTimeout(() => setShowSyncBanner(false), 5000);
    } finally { setSyncing(false); }
  }, [reloadGraph]);

  const handleProjectSwitch = useCallback((project: Project) => {
    setCurrentProject(project);
    setProjectId(project.id);
    setShowProjectMenu(false);
    if (project.git_repo_url) {
      syncRepo().then(() => reloadGraph());
    } else {
      reloadGraph();
    }
  }, [reloadGraph]);

  const handleNodeDrag = useCallback((nodeId: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x, y } : n));
  }, []);

  const handleAddNode = useCallback((parentId?: string) => {
    const parentNode = parentId ? nodes.find(n => n.id === parentId) : null;
    const newId = `new-${nodeIdCounter.current++}`;
    const newNode: TreeNode = {
      id: newId, x: parentNode ? parentNode.x + 50 : 400, y: parentNode ? parentNode.y + 150 : 50 + nodes.length * 80,
      text: 'New Decision', type: 'rich', status: 'proposed', icon: '💡', description: 'decision',
    };
    setNodes(prev => [...prev, newNode]);
    if (parentId) {
      const connId = `c${connectionIdCounter.current++}`;
      setConnections(prev => [...prev, { id: connId, from: parentId, to: newNode.id, kind: 'parent' }]);
    }
  }, [nodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
  }, []);

  const handleUpdateNode = useCallback((updatedNode: TreeNode) => {
    setNodes(prev => prev.map(n => n.id === updatedNode.id ? updatedNode : n));
  }, []);

  const handleAddConnection = useCallback((fromId: string, toId: string) => {
    const connId = `c${connectionIdCounter.current++}`;
    setConnections(prev => [...prev, { id: connId, from: fromId, to: toId, kind: 'cross-ref' }]);
  }, []);

  const handleDeleteConnection = useCallback((connectionId: string) => {
    setConnections(prev => prev.filter(c => c.id !== connectionId));
  }, []);

  const handlePostComment = useCallback(async () => {
    if (!selectedDetail || !commentText.trim()) return;
    try {
      const c = await postComment(selectedDetail.id, commentText.trim());
      setComments(prev => [...prev, c]);
      setCommentText('');
    } catch (err) { console.error('Failed to post comment:', err); }
  }, [selectedDetail, commentText]);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    try { await deleteCommentApi(commentId); setComments(prev => prev.filter(c => c.id !== commentId)); }
    catch (err) { console.error('Failed to delete comment:', err); }
  }, []);

  const handleCastVote = useCallback(async (optionLetter: string) => {
    if (!selectedDetail) return;
    try {
      const w = 3;
      const v = await castVoteApi(selectedDetail.id, optionLetter, w);
      setVotes(prev => [...prev.filter(x => x.user_id !== v.user_id), v]);
    } catch (err) { console.error('Failed to cast vote:', err); }
  }, [selectedDetail]);

  const handleRemoveVote = useCallback(async () => {
    if (!selectedDetail) return;
    try { await removeVoteApi(selectedDetail.id); setVotes(prev => prev.filter(v => v.user_id !== 1)); }
    catch (err) { console.error('Failed to remove vote:', err); }
  }, [selectedDetail]);

  const handleAddOption = useCallback(async () => {
    if (!selectedDetail || !newOptionLetter.trim() || !newOptionTitle.trim()) return;
    try {
      const opt = await addCustomOptionApi(selectedDetail.id, newOptionLetter.trim().toUpperCase(), newOptionTitle.trim());
      setCustomOptions(prev => [...prev, opt]);
      setNewOptionLetter(''); setNewOptionTitle(''); setShowAddOption(false);
    } catch (err) { console.error('Failed to add option:', err); }
  }, [selectedDetail, newOptionLetter, newOptionTitle]);

  const handleNodeClick = useCallback((node: TreeNode) => {
    fetch(`/api/decisions/${node.id}`).then(r => r.json()).then(data => {
      setSelectedDetail(data);
      setComments([]); setVotes([]); setCustomOptions([]);
      fetchComments(node.id).then(setComments).catch(() => {});
      fetchVotes(node.id).then(setVotes).catch(() => {});
      fetchCustomOptions(node.id).then(setCustomOptions).catch(() => {});
    }).catch(() => setSelectedDetail(null));
  }, []);

  // ─── Fetch graph on mount ──────────────────────────────

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
    fetchGraph().then((graph: Graph) => {
      const treeNodes = graph.nodes.map(decisionToTreeNode);
      const treeConnections = graph.connections.map(c => ({ id: c.id, from: c.from, to: c.to, kind: c.kind }));
      const { nodes: positioned, edgePoints: ePoints } = calculateLayout(treeNodes, treeConnections, window.innerWidth);
      setNodes(positioned); setConnections(treeConnections); setEdgePoints(ePoints); setLoading(false);
    }).catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  // ─── Early returns (AFTER all hooks) ───────────────────

  if (loading) return (<div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><h2>Loading...</h2></div>);
  if (error) return (<div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}><h2 style={{ color: '#ff4d4f' }}>Failed to load</h2><p>{error}</p></div>);

  // ─── Render ────────────────────────────────────────────

  // Compute vote data for detail panel
  const allOptions = selectedDetail ? [
    ...(selectedDetail.options || []),
    ...customOptions.map(o => ({ letter: o.letter, title: o.title })),
  ] : [];
  const userVote = votes.find(v => v.user_id === 1);
  const voteTally: Record<string, number> = {};
  for (const v of votes) { voteTally[v.option_letter] = (voteTally[v.option_letter] || 0) + v.weight; }
  const sortedTally = Object.entries(voteTally).sort(([, a], [, b]) => b - a);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', position: 'relative' }}>
      {/* Sync button — bottom-left, away from panel controls */}
      <button onClick={handleSync} disabled={syncing} style={{
        position: 'fixed', bottom: '16px', left: '16px', zIndex: 1000,
        padding: '6px 14px', borderRadius: '6px', border: '1px solid #d0d0d0',
        background: syncing ? '#f0f0f0' : '#fff', cursor: syncing ? 'wait' : 'pointer',
        fontSize: '12px', color: '#666', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }} title="Обновить из Git">
        {syncing ? '⟳...' : '⇅ Синхр.'}
      </button>

      {/* Sync banner */}
      {showSyncBanner && lastSync && (
        <div style={{
          position: 'fixed', bottom: '52px', left: '16px', zIndex: 1000,
          padding: '8px 14px', borderRadius: '6px', maxWidth: '360px',
          background: lastSync.success ? '#f6ffed' : '#fff2f0',
          border: `1px solid ${lastSync.success ? '#b7eb8f' : '#ffccc7'}`,
          fontSize: '12px', color: '#333', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {lastSync.success ? '✅' : '❌'} {lastSync.message}
        </div>
      )}

      {/* Project selector — top-left */}
      <div style={{ position: 'fixed', top: '12px', left: '16px', zIndex: 1000 }}>
        <button
          onClick={() => setShowProjectMenu(!showProjectMenu)}
          style={{
            border: '1px solid #d0d0d0', background: '#fff', borderRadius: '4px',
            padding: '6px 14px', cursor: 'pointer', fontSize: '13px', color: '#333',
            display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          {currentProject ? currentProject.name : '📂 Проект'} ▾
        </button>
        {showProjectMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: '4px',
            background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: '260px', overflow: 'hidden',
          }}>
            {projects.map(p => (
              <div key={p.id} onClick={() => handleProjectSwitch(p)} style={{
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                background: currentProject?.id === p.id ? '#e6f7ff' : '#fff',
                fontSize: '13px',
              }}>
                <div style={{ fontWeight: 'bold' }}>{p.name}</div>
                {p.description && <div style={{ fontSize: '11px', color: '#999' }}>{p.description}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tree */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Tree
          nodes={nodes} connections={connections}
          onNodeDrag={handleNodeDrag} onAddNode={handleAddNode}
          onDeleteNode={handleDeleteNode} onUpdateNode={handleUpdateNode}
          onAddConnection={handleAddConnection} onDeleteConnection={handleDeleteConnection}
          edgePoints={edgePoints}
          onDeselect={() => setSelectedDetail(null)}
          onNodeClick={handleNodeClick}
        />
      </div>

      {/* Detail Panel */}
      {selectedDetail && (
        <DetailPanel
          detail={selectedDetail}
          comments={comments}
          votes={votes}
          customOptions={customOptions}
          onCommentsChange={setComments}
          onVotesChange={setVotes}
          onCustomOptionsChange={setCustomOptions}
          onClose={() => setSelectedDetail(null)}
        />
      )}
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case 'accepted': return '#52c41a';
    case 'rejected': return '#ff4d4f';
    case 'proposed': return '#1890ff';
    case 'debating': return '#fa8c16';
    case 'superseded': return '#8c8c8c';
    default: return '#8c8c8c';
  }
}

export default App;
