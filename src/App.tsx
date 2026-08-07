import { useState, useCallback, useRef, useEffect } from 'react';
import { Tree, TreeNode } from './SimpleTree';
import {
  fetchGraph, syncRepo, fetchProjects, setProjectId,
  fetchComments, postComment, deleteCommentApi,
  fetchVotes, castVoteApi, removeVoteApi,
  fetchCustomOptions, addCustomOptionApi,
  type Graph, type DecisionNode, type SyncResult,
  type Comment, type Vote, type CustomOption, type Project,
  createDecision, updateDecision,
} from './api';
import { calculateLayout } from './SimpleTree/utils/positions';
import type { Point } from './SimpleTree/types';
import ReactMarkdown from 'react-markdown';
import { DetailPanel } from './DetailPanel';

const STATUS_ICONS: Record<string, string> = {
  accepted: '✅', rejected: '❌', proposed: '💡', debating: '🔥', superseded: '⏭️',
};
const TYPE_ICONS: Record<string, string> = { problem: '🔥', requirement: '📋', paradigm: '💡', decision: '⚙️', task: '🔨' };
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
    phase: d.phase || (d.type === 'problem' ? 1 : d.type === 'requirement' ? 2 : d.type === 'paradigm' ? 3 : 4),
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
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string; role: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [pendingNewNode, setPendingNewNode] = useState<TreeNode | null>(null);
  const [showRepoSetup, setShowRepoSetup] = useState(false);
  const [repoSetupProject, setRepoSetupProject] = useState<Project | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [repoFolder, setRepoFolder] = useState('');
  const [users, setUsers] = useState<{ id: number; username: string; role: string }[]>([]);
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

  const [phaseBands, setPhaseBands] = useState<any[]>([]);
  const reloadGraph = useCallback(async () => {
    const graph = await fetchGraph(currentProject?.id || 1);
    const treeNodes = graph.nodes.map(decisionToTreeNode);
    const treeConnections = graph.connections.map(c => ({ id: c.id, from: c.from, to: c.to, kind: c.kind }));
    const { nodes: positioned, edgePoints: ePoints, phaseBands: pBands } = calculateLayout(treeNodes, treeConnections, window.innerWidth);
    setNodes(positioned);
    setConnections(treeConnections);
    setEdgePoints(ePoints);
    setPhaseBands(pBands);
  }, [currentProject]);

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

  // Create empty node and open editor modal
  const handleCreateAndEdit = useCallback(() => {
    // Close any open dropdowns
    setShowProjectMenu(false);
    setShowUserMenu(false);
    const newId = `new-${nodeIdCounter.current++}`;
    const newNode: TreeNode = {
      id: newId,
      x: 400, y: 50 + nodes.length * 80,
      text: '', type: 'rich', status: 'proposed',
      icon: '💡', description: '', nodeType: 'problem', phase: 1,
    };
    setPendingNewNode(newNode);
    setNodes(prev => [...prev, newNode]);
  }, [nodes]);

  // When new node is saved via modal → create in API
  const handleUpdateNode = useCallback(async (updatedNode: TreeNode) => {
    // Check if this is a new node (starts with 'new-')
    if (updatedNode.id.startsWith('new-') && updatedNode.text.trim()) {
      try {
        const result = await createDecision({
          title: updatedNode.text.trim(),
          parent: null,
          type: updatedNode.nodeType || 'problem',
          phase: updatedNode.phase || 1,
          context: updatedNode.description || undefined,
        });
        // Replace local node with real one
        setNodes(prev => prev.map(n => n.id === updatedNode.id ? { ...updatedNode, id: result.id } : n));
        setPendingNewNode(null);
        // Reload graph to get proper layout
        reloadGraph();
      } catch (err) {
        console.error('Create failed:', err);
        // Remove the failed node
        setNodes(prev => prev.filter(n => n.id !== updatedNode.id));
        setPendingNewNode(null);
      }
    } else {
      // Existing node — just update locally
      setNodes(prev => prev.map(n => n.id === updatedNode.id ? updatedNode : n));
    }
  }, [reloadGraph]);

  const handleProjectSwitch = useCallback(async (project: Project) => {
    setCurrentProject(project);
    setProjectId(project.id);
    setShowProjectMenu(false);
    setSelectedDetail(null);

    // If project has no git repo, show setup modal
    if (!project.git_repo_url) {
      const prevUrl = currentProject?.git_repo_url || 'https://github.com/VladimirHulagov/archtrace-decisions.git';
      // Extract base URL (without folder) for display
      const baseUrl = prevUrl.replace(/\/[^/]+\.git$/, '/');
      setRepoUrl(baseUrl);
      setRepoFolder('');
      setRepoSetupProject(project);
      setShowRepoSetup(true);
      // Don't load graph yet — wait for modal
      setNodes([]); setConnections([]); setEdgePoints(new Map());
      return;
    }

    try {
      const graph = await fetchGraph(project.id);
      const treeNodes = graph.nodes.map(decisionToTreeNode);
      const treeConnections = graph.connections.map(c => ({ id: c.id, from: c.from, to: c.to, kind: c.kind }));
      const { nodes: positioned, edgePoints: ePoints, phaseBands: pBands } = calculateLayout(treeNodes, treeConnections, window.innerWidth);
      setNodes(positioned); setConnections(treeConnections); setEdgePoints(ePoints); setPhaseBands(pBands);
    } catch (err) {
      // If fails, show empty tree
      setNodes([]); setConnections([]); setEdgePoints(new Map()); setPhaseBands([]);
    }
  }, []);

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
    if (!confirm('Удалить карточку?')) return;
    fetch(`/api/decisions/${nodeId}`, {
      method: 'DELETE',
      headers: { 'X-Project-Id': String(currentProject?.id || 1) },
    }).then(() => {
      setSelectedDetail(null);
      reloadGraph();
    }).catch(err => console.error('Delete failed:', err));
  }, [currentProject, reloadGraph]);



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

  // Sync URL hash on state changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (currentProject) params.set('project', String(currentProject.id));
    if (selectedDetail) params.set('node', selectedDetail.id);
    const hash = params.toString();
    if (hash && window.location.hash !== '#' + hash) {
      window.location.hash = hash;
    }
  }, [currentProject, selectedDetail]);

  const handleNodeClick = useCallback((node: TreeNode) => {
    fetch(`/api/decisions/${node.id}?projectId=${currentProject?.id || 1}`).then(r => r.json()).then(data => {
      setSelectedDetail(data);
      setComments([]); setVotes([]); setCustomOptions([]);
      fetchComments(node.id).then(setComments).catch(() => {});
      fetchVotes(node.id).then(setVotes).catch(() => {});
      fetchCustomOptions(node.id).then(setCustomOptions).catch(() => {});
    }).catch(() => setSelectedDetail(null));
  }, [currentProject]);

  // ─── Fetch graph on mount ──────────────────────────────

  useEffect(() => {
    // Restore state from URL hash
    const params = new URLSearchParams(window.location.hash.slice(1));
    const initialPid = parseInt(params.get('project') || '1', 10);
    const initialNode = params.get('node');

    fetchProjects().then(ps => {
      setProjects(ps);
      const proj = ps.find(p => p.id === initialPid);
      if (proj) { setCurrentProject(proj); setProjectId(proj.id); }
    }).catch(() => {});
    fetch('/api/users').then(r => r.json()).then(setUsers).catch(() => {});

    fetchGraph(initialPid).then((graph: Graph) => {
      const treeNodes = graph.nodes.map(decisionToTreeNode);
      const treeConnections = graph.connections.map(c => ({ id: c.id, from: c.from, to: c.to, kind: c.kind }));
      const { nodes: positioned, edgePoints: ePoints, phaseBands: pBands } = calculateLayout(treeNodes, treeConnections, window.innerWidth);
      setNodes(positioned); setConnections(treeConnections); setEdgePoints(ePoints); setPhaseBands(pBands); setLoading(false);

      // Restore selected node
      if (initialNode) {
        fetch(`/api/decisions/${initialNode}?projectId=${initialPid}`)
          .then(r => r.json()).then(data => {
            if (data && data.id) {
              setSelectedDetail(data);
              fetchComments(initialNode).then(setComments).catch(() => {});
              fetchVotes(initialNode).then(setVotes).catch(() => {});
              fetchCustomOptions(initialNode).then(setCustomOptions).catch(() => {});
            }
          }).catch(() => {});
      }
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
      {/* New decision button — bottom-left */}
      <button
        onClick={handleCreateAndEdit}
        style={{
          position: 'fixed', bottom: '16px', left: '90px', zIndex: 1000,
          padding: '6px 14px', borderRadius: '6px', border: '1px solid #1890ff',
          background: '#1890ff', cursor: 'pointer',
          fontSize: '12px', color: '#fff', fontWeight: 'bold',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
        title="Создать новое решение"
      >
        + Решение
      </button>

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
      <div style={{ position: 'fixed', top: '12px', left: '16px', zIndex: 1001 }}>
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

      {/* User selector — left, below project selector */}
      <div style={{ position: 'fixed', top: '48px', left: '16px', zIndex: 1000 }}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          style={{
            border: '1px solid #d0d0d0', background: '#fff', borderRadius: '4px',
            padding: '6px 14px', cursor: 'pointer', fontSize: '13px', color: '#333',
            display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          👤 {currentUser ? currentUser.username : 'Гость'} ▾
        </button>
        {showUserMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: '4px',
            background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: '200px', overflow: 'hidden',
          }}>
            {users.map(u => (
              <div key={u.id} onClick={() => {
                setCurrentUser(u);
                setShowUserMenu(false);
              }} style={{
                padding: '8px 14px', cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                background: currentUser?.id === u.id ? '#e6f7ff' : '#fff',
                fontSize: '12px',
              }}>
                <span style={{ fontWeight: 'bold' }}>{u.username}</span>
                <span style={{ marginLeft: '8px', fontSize: '10px', color: '#999' }}>
                  {u.role === 'architect' ? '🏗 (×3)' : u.role === 'senior' ? '⚙️ (×2)' : '👤 (×1)'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tree */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Tree
          nodes={nodes} connections={connections}
          pendingNewNode={pendingNewNode}
          phaseBands={phaseBands}
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
          currentUserId={currentUser?.id || 1}
          currentRole={currentUser?.role || 'developer'}
          onCommentsChange={setComments}
          onVotesChange={setVotes}
          onCustomOptionsChange={setCustomOptions}
          onClose={() => setSelectedDetail(null)}
        />
      )}
      {/* Repo Setup Modal */}
      {showRepoSetup && repoSetupProject && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 3000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowRepoSetup(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '8px', padding: '24px',
            width: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Подключение репозитория</h2>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              Проект «{repoSetupProject.name}» не имеет репозитория с ADR.
              Укажите Git-репозиторий:
            </p>

            {/* URL display (editable on click) */}
            <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '4px' }}>URL репозитория</label>
            <input
              type="text"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              style={{
                width: '100%', padding: '8px', marginBottom: '12px',
                border: '1px solid #d0d0d0', borderRadius: '4px',
                fontSize: '13px', color: '#999', boxSizing: 'border-box',
              }}
            />

            {/* Folder name */}
            <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '4px' }}>Папка с ADR (внутри репозитория)</label>
            <input
              type="text"
              placeholder="например: decisions или . (корень)"
              value={repoFolder}
              onChange={e => setRepoFolder(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') {
                // Submit
                const fullUrl = repoUrl + (repoFolder ? repoFolder : '');
                fetch('/api/projects/' + repoSetupProject.id, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ git_repo_url: repoUrl + (repoFolder.endsWith('.git') ? repoFolder : repoFolder + '.git') }),
                }).then(() => {
                  setShowRepoSetup(false);
                  if (repoSetupProject) handleProjectSwitch({ ...repoSetupProject, git_repo_url: repoUrl });
                });
              }}}
              style={{
                width: '100%', padding: '8px', marginBottom: '16px',
                border: '1px solid #1890ff', borderRadius: '4px',
                fontSize: '13px', color: '#333', boxSizing: 'border-box',
              }}
              autoFocus
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRepoSetup(false)} style={{
                padding: '8px 16px', border: '1px solid #d0d0d0', background: '#f0f0f0',
                borderRadius: '4px', cursor: 'pointer', fontSize: '13px',
              }}>Отмена</button>
              <button onClick={() => {
                const finalUrl = repoUrl.endsWith('.git') ? repoUrl : repoUrl.replace(/\/$/, '') + (repoFolder ? '/' + repoFolder : '') + '.git';
                fetch('/api/projects/' + repoSetupProject.id, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ git_repo_url: finalUrl }),
                }).then(() => {
                  setShowRepoSetup(false);
                  handleProjectSwitch({ ...repoSetupProject, git_repo_url: finalUrl });
                });
              }} style={{
                padding: '8px 16px', border: 'none', background: '#1890ff', color: '#fff',
                borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
              }}>Подключить</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Decision Modal */}
      {showCreateForm && (
        <CreateDecisionForm
          nodes={nodes}
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            reloadGraph();
          }}
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


// ─── Create Decision Form ─────────────────────────────────

function CreateDecisionForm({ nodes, onClose, onCreated }: {
  nodes: TreeNode[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState('');
  const [type, setType] = useState('decision');
  const [context, setContext] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [decision, setDecision] = useState('');
  const [consequences, setConsequences] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Введите заголовок'); return; }
    setSaving(true);
    setError('');
    try {
      const options = [];
      if (optionA.trim()) options.push({ letter: 'A', title: optionA.trim() });
      if (optionB.trim()) options.push({ letter: 'B', title: optionB.trim() });
      const phaseMap: Record<string, number> = { problem: 1, requirement: 2, paradigm: 3, decision: 4, task: 4 };
      await createDecision({
        title: title.trim(),
        parent: parent || null,
        type,
        phase: phaseMap[type] || 4,
        context: context.trim() || undefined,
        options: options.length > 0 ? options : undefined,
        decision: decision.trim() || undefined,
        consequences: consequences.trim() || undefined,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '8px', padding: '24px',
        width: '500px', maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Новое решение</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Заголовок *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Напр: Выбор системы охлаждения"
            style={{ width: '100%', padding: '8px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSubmit(); }}
          />
        </div>

        {/* Parent */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Родительское решение</label>
          <select value={parent} onChange={e => setParent(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}>
            <option value="">— Корень (нет родителя) —</option>
            {nodes.map(n => <option key={n.id} value={n.id}>ADR-{n.id}: {n.text}</option>)}
          </select>
        </div>

        {/* Type */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Тип</label>
          <select value={type} onChange={e => setType(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}>
            <option value="problem">🔥 Проблема (Фаза 1)</option>
            <option value="requirement">📋 Требование (Фаза 2)</option>
            <option value="paradigm">💡 Концепция/Парадигма (Фаза 3)</option>
            <option value="decision">⚙️ Решение (Фаза 4)</option>
          </select>
        </div>

        {/* Context */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Контекст</label>
          <textarea value={context} onChange={e => setContext(e.target.value)}
            placeholder="Описание контекста и предпосылок..."
            style={{ width: '100%', minHeight: '80px', padding: '8px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        {/* Options */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Варианты</label>
          <input type="text" value={optionA} onChange={e => setOptionA(e.target.value)}
            placeholder="A: первый вариант..."
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '13px', marginBottom: '6px', boxSizing: 'border-box' }} />
          <input type="text" value={optionB} onChange={e => setOptionB(e.target.value)}
            placeholder="B: второй вариант..."
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }} />
        </div>

        {/* Decision */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Решение</label>
          <textarea value={decision} onChange={e => setDecision(e.target.value)}
            placeholder="Какой вариант выбран и почему..."
            style={{ width: '100%', minHeight: '50px', padding: '8px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>

        {/* Consequences */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Последствия</label>
          <textarea value={consequences} onChange={e => setConsequences(e.target.value)}
            placeholder="Следствия принятого решения..."
            style={{ width: '100%', minHeight: '50px', padding: '8px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>

        {error && <div style={{ color: '#ff4d4f', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d0d0d0', background: '#f0f0f0', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Отмена</button>
          <button onClick={handleSubmit} disabled={saving || !title.trim()} style={{
            padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: saving ? 'wait' : 'pointer',
            background: saving ? '#91d5ff' : (title.trim() ? '#1890ff' : '#d0d0d0'),
            color: '#fff', fontSize: '13px', fontWeight: 'bold',
          }}>
            {saving ? 'Сохранение...' : 'Создать (Ctrl+Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
}
