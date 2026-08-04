import { useState, useCallback, useRef, useEffect } from 'react';
import { Tree, TreeNode } from './SimpleTree';
import {
  fetchGraph, syncRepo,
  fetchComments, postComment, deleteCommentApi,
  fetchVotes, castVoteApi, removeVoteApi,
  fetchCustomOptions, addCustomOptionApi,
  type Graph, type DecisionNode, type SyncResult,
  type Comment, type Vote, type CustomOption,
} from './api';
import { calculateLayout } from './SimpleTree/utils/positions';
import type { Point } from './SimpleTree/types';
import ReactMarkdown from 'react-markdown';

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
      {/* Sync button */}
      <button onClick={handleSync} disabled={syncing} style={{
        position: 'fixed', top: '12px', right: '12px', zIndex: 1000,
        padding: '6px 14px', borderRadius: '6px', border: '1px solid #d0d0d0',
        background: syncing ? '#f0f0f0' : '#fff', cursor: syncing ? 'wait' : 'pointer',
        fontSize: '13px', color: '#333', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }} title="Pull from Git">
        {syncing ? '⟳ Syncing...' : '⇅ Sync'}
      </button>

      {/* Sync banner */}
      {showSyncBanner && lastSync && (
        <div style={{
          position: 'fixed', top: '48px', right: '12px', zIndex: 1000,
          padding: '8px 14px', borderRadius: '6px', maxWidth: '360px',
          background: lastSync.success ? '#f6ffed' : '#fff2f0',
          border: `1px solid ${lastSync.success ? '#b7eb8f' : '#ffccc7'}`,
          fontSize: '12px', color: '#333', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {lastSync.success ? '✅' : '❌'} {lastSync.message}
        </div>
      )}

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
        <div style={{
          width: '400px', height: '100vh', overflowY: 'auto',
          borderLeft: '1px solid #e0e0e0', padding: '20px',
          background: '#fafafa', flexShrink: 0, touchAction: 'pan-y',
        }}
        onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (swipeStartX.current !== null) {
            const dx = e.changedTouches[0].clientX - swipeStartX.current;
            if (dx > 50) setSelectedDetail(null);
            swipeStartX.current = null;
          }
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>{STATUS_ICONS[selectedDetail.status] || '📄'} ADR-{selectedDetail.id}</h2>
            <button onClick={() => setSelectedDetail(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#999' }}>×</button>
          </div>
          <h3 style={{ marginTop: 0 }}>{selectedDetail.title}</h3>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: statusColor(selectedDetail.status), fontSize: '12px', color: '#fff' }}>{selectedDetail.status}</span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e0e0', fontSize: '12px' }}>{selectedDetail.type}</span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e0e0', fontSize: '12px' }}>{selectedDetail.created}</span>
          </div>

          {/* Interactive Voting */}
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ marginBottom: '8px', fontSize: '14px' }}>Vote</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {allOptions.map(opt => {
                const isVoted = userVote?.option_letter === opt.letter;
                const w = voteTally[opt.letter] || 0;
                return (
                  <button key={opt.letter} onClick={() => handleCastVote(opt.letter)} style={{
                    padding: '4px 10px', borderRadius: '4px', cursor: 'pointer',
                    border: `2px solid ${isVoted ? (VOTE_COLORS[opt.letter] || '#1890ff') : '#d0d0d0'}`,
                    background: isVoted ? (VOTE_COLORS[opt.letter] || '#1890ff') : '#fff',
                    color: isVoted ? '#fff' : '#333', fontSize: '12px', fontWeight: 'bold',
                  }} title={opt.title}>{opt.letter} ({w})</button>
                );
              })}
              {userVote && (
                <button onClick={handleRemoveVote} style={{
                  padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                  border: '1px solid #ffccc7', background: '#fff2f0', color: '#ff4d4f', fontSize: '11px',
                }}>✕ Remove</button>
              )}
            </div>
            {/* Add custom option */}
            {showAddOption ? (
              <div style={{ marginBottom: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input type="text" placeholder="Letter" value={newOptionLetter} onChange={e => setNewOptionLetter(e.target.value)} style={{ width: '60px', padding: '4px', border: '1px solid #d0d0d0', borderRadius: '3px', fontSize: '13px' }} />
                  <input type="text" placeholder="Title..." value={newOptionTitle} onChange={e => setNewOptionTitle(e.target.value)} style={{ flex: 1, padding: '4px', border: '1px solid #d0d0d0', borderRadius: '3px', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddOption} style={{ padding: '4px 10px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>Add</button>
                  <button onClick={() => setShowAddOption(false)} style={{ padding: '4px 10px', background: '#f0f0f0', border: '1px solid #d0d0d0', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddOption(true)} style={{ padding: '2px 8px', fontSize: '11px', border: '1px dashed #bbb', background: 'transparent', borderRadius: '3px', cursor: 'pointer', color: '#666', marginBottom: '8px' }}>+ Add option</button>
            )}
            {/* Vote table */}
            {sortedTally.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Opt</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>Weight</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Voters</th>
                </tr></thead>
                <tbody>
                  {sortedTally.map(([opt, w]) => (
                    <tr key={opt} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px', fontWeight: 'bold', color: VOTE_COLORS[opt] || '#333' }}>{opt}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{w}</td>
                      <td style={{ padding: '4px', color: '#666', fontSize: '12px' }}>{votes.filter(v => v.option_letter === opt).map(v => v.username || '?').join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Comments */}
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ marginBottom: '8px', fontSize: '14px' }}>Comments ({comments.length})</h4>
            {comments.map(c => (
              <div key={c.id} style={{ marginBottom: '8px', padding: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #e8e8e8', marginLeft: c.parent_comment_id ? '20px' : '0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{c.author_name || 'Unknown'}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#999' }}>{new Date(c.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <button onClick={() => handleDeleteComment(c.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: '14px' }} title="Delete">×</button>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: '#333', lineHeight: 1.4 }}>{c.content}</div>
              </div>
            ))}
            {/* Comment input */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <input type="text" placeholder="Write a comment..." value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handlePostComment(); }} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '13px' }} />
              <button onClick={handlePostComment} disabled={!commentText.trim()} style={{ padding: '6px 14px', borderRadius: '4px', border: 'none', background: commentText.trim() ? '#1890ff' : '#d0d0d0', color: '#fff', cursor: commentText.trim() ? 'pointer' : 'not-allowed', fontSize: '13px' }}>Send</button>
            </div>
          </div>

          {/* Markdown body */}
          <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
            <ReactMarkdown>{selectedDetail.body}</ReactMarkdown>
          </div>
          <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #e0e0e0', fontSize: '12px', color: '#999' }}>Source: {selectedDetail.file}</div>
        </div>
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
