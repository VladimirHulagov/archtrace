import { useState, useCallback, useRef, useEffect } from 'react';
import { Tree, TreeNode } from './SimpleTree';
import { fetchGraph, syncRepo, getSyncStatus, type Graph, type DecisionNode, type SyncResult } from './api';
import { calculateLayout } from './SimpleTree/utils/positions';
import type { Point } from './SimpleTree/types';
import ReactMarkdown from 'react-markdown';

// ─── ADR → TreeNode mapping ──────────────────────────────

const STATUS_ICONS: Record<string, string> = {
  accepted: '✅',
  rejected: '❌',
  proposed: '💡',
  debating: '🔥',
  superseded: '⏭️',
};

const TYPE_ICONS: Record<string, string> = {
  requirement: '📋',
  decision: '⚙️',
  task: '🔨',
};

const VOTE_COLORS: Record<string, string> = {
  A: '#52c41a',
  B: '#fa8c16',
  C: '#1890ff',
  D: '#722ed1',
};

function decisionToTreeNode(d: DecisionNode): TreeNode {
  // Build vote summary
  let voteTally = '';
  let voteSectors: { option: string; weight: number; color: string }[] = [];
  let winnerVote: string | undefined;

  if (d.voters?.length > 0) {
    const tally: Record<string, number> = {};
    for (const v of d.voters) {
      tally[v.vote] = (tally[v.vote] || 0) + v.weight;
    }
    voteTally = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([opt, weight]) => `${opt}:${weight}`)
      .join(' ');

    // Build sectors sorted by option letter
    voteSectors = Object.entries(tally)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([opt, weight]) => ({
        option: opt,
        weight,
        color: VOTE_COLORS[opt] || '#8c8c8c',
      }));

    // Winner = highest weight
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) winnerVote = sorted[0][0];
  }

  return {
    id: d.id,
    x: 0,
    y: 0,
    text: d.title,
    type: 'rich',
    status: d.status,
    icon: STATUS_ICONS[d.status] || TYPE_ICONS[d.type] || '📄',
    description: d.type,
    nodeType: d.type,
    voteTally,
    voteSectors,
    winnerVote,
    options: d.options || [],
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

  // ─── Fetch graph on mount ──────────────────────────────

  useEffect(() => {
    fetchGraph()
      .then((graph: Graph) => {
        const treeNodes = graph.nodes.map(decisionToTreeNode);
        const treeConnections = graph.connections.map(c => ({
          id: c.id,
          from: c.from,
          to: c.to,
          kind: c.kind,
        }));
        const containerWidth = window.innerWidth;
        const { nodes: positioned, edgePoints: ePoints } = calculateLayout(treeNodes, treeConnections, containerWidth);
        setNodes(positioned);
        setConnections(treeConnections);
        setEdgePoints(ePoints);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // ─── Sync handler ──────────────────────────────────────

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncRepo();
      setLastSync(result);
      setShowSyncBanner(true);
      // Reload graph after sync
      const graph = await fetchGraph();
      const treeNodes = graph.nodes.map(decisionToTreeNode);
      const treeConnections = graph.connections.map(c => ({
        id: c.id, from: c.from, to: c.to, kind: c.kind,
      }));
      const containerWidth = window.innerWidth;
      const { nodes: positioned, edgePoints: ePoints } = calculateLayout(treeNodes, treeConnections, containerWidth);
      setNodes(positioned);
      setConnections(treeConnections);
      setEdgePoints(ePoints);
      // Hide banner after 5 seconds
      setTimeout(() => setShowSyncBanner(false), 5000);
    } catch (err: any) {
      setLastSync({ success: false, action: 'none', message: err.message, timestamp: new Date().toISOString() });
      setShowSyncBanner(true);
      setTimeout(() => setShowSyncBanner(false), 5000);
    } finally {
      setSyncing(false);
    }
  }, []);

  // ─── Handlers (local-only mutations for now) ────────────

  const handleNodeDrag = useCallback((nodeId: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId ? { ...node, x, y } : node
      )
    );
  }, []);

  const handleAddNode = useCallback((parentId?: string) => {
    const parentNode = parentId ? nodes.find((n) => n.id === parentId) : null;
    const newId = `new-${nodeIdCounter.current++}`;
    const newNode: TreeNode = {
      id: newId,
      x: parentNode ? parentNode.x + 50 : 400,
      y: parentNode ? parentNode.y + 150 : 50 + nodes.length * 80,
      text: 'New Decision',
      type: 'rich',
      status: 'proposed',
      icon: '💡',
      description: 'decision',
    };

    setNodes((prev) => [...prev, newNode]);

    if (parentId) {
      const connId = `c${connectionIdCounter.current++}`;
      setConnections((prev) => [...prev, {
        id: connId,
        from: parentId,
        to: newNode.id,
        kind: 'parent',
      }]);
    }
  }, [nodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== nodeId));
    setConnections((prev) =>
      prev.filter((conn) => conn.from !== nodeId && conn.to !== nodeId)
    );
  }, []);

  const handleUpdateNode = useCallback((updatedNode: TreeNode) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === updatedNode.id ? updatedNode : node
      )
    );
  }, []);

  const handleAddConnection = useCallback((fromId: string, toId: string) => {
    const connId = `c${connectionIdCounter.current++}`;
    setConnections((prev) => [...prev, {
      id: connId,
      from: fromId,
      to: toId,
      kind: 'cross-ref',
    }]);
  }, []);

  const handleDeleteConnection = useCallback((connectionId: string) => {
    setConnections((prev) =>
      prev.filter((conn) => conn.id !== connectionId)
    );
  }, []);

  // ─── Render ────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Loading decision graph...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
        <h2 style={{ color: '#ff4d4f' }}>Failed to load</h2>
        <p>{error}</p>
        <p style={{ color: '#999' }}>Make sure the API server is running on :3001</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', position: 'relative' }}>
      {/* Sync button */}
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          position: 'fixed', top: '12px', right: '12px', zIndex: 1000,
          padding: '6px 14px', borderRadius: '6px', border: '1px solid #d0d0d0',
          background: syncing ? '#f0f0f0' : '#fff', cursor: syncing ? 'wait' : 'pointer',
          fontSize: '13px', color: '#333', display: 'flex', alignItems: 'center', gap: '6px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
        title="Pull latest from Git repository"
      >
        {syncing ? '⟳ Syncing...' : '⇅ Sync'}
      </button>

      {/* Sync result banner */}
      {showSyncBanner && lastSync && (
        <div style={{
          position: 'fixed', top: '48px', right: '12px', zIndex: 1000,
          padding: '8px 14px', borderRadius: '6px', maxWidth: '360px',
          background: lastSync.success ? '#f6ffed' : '#fff2f0',
          border: `1px solid ${lastSync.success ? '#b7eb8f' : '#ffccc7'}`,
          fontSize: '12px', color: '#333',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {lastSync.success ? '✅' : '❌'} {lastSync.message}
        </div>
      )}
      {/* ─── Tree View ──────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Tree
          nodes={nodes}
          connections={connections}
          onNodeDrag={handleNodeDrag}
          onAddNode={handleAddNode}
          onDeleteNode={handleDeleteNode}
          onUpdateNode={handleUpdateNode}
          onAddConnection={handleAddConnection}
          onDeleteConnection={handleDeleteConnection}
          edgePoints={edgePoints}
          onDeselect={() => setSelectedDetail(null)}
          onNodeClick={(node) => {
            // Fetch full decision detail
            fetch(`/api/decisions/${node.id}`)
              .then(res => res.json())
              .then(data => setSelectedDetail(data))
              .catch(() => setSelectedDetail(null));
          }}
        />
      </div>

      {/* ─── Detail Panel ────────────────────────────────── */}
      {selectedDetail && (
        <div
          style={{
            width: '400px',
            height: '100vh',
            overflowY: 'auto',
            borderLeft: '1px solid #e0e0e0',
            padding: '20px',
            background: '#fafafa',
            flexShrink: 0,
            touchAction: 'pan-y',
          }}
          onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (swipeStartX.current !== null) {
              const deltaX = e.changedTouches[0].clientX - swipeStartX.current;
              if (deltaX > 50) setSelectedDetail(null);
              swipeStartX.current = null;
            }
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>
              {STATUS_ICONS[selectedDetail.status] || '📄'} ADR-{selectedDetail.id}
            </h2>
            <button
              onClick={() => setSelectedDetail(null)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '20px', color: '#999',
              }}
            >
              ×
            </button>
          </div>

          <h3 style={{ marginTop: 0 }}>{selectedDetail.title}</h3>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: statusColor(selectedDetail.status), fontSize: '12px', color: '#fff' }}>
              {selectedDetail.status}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e0e0', fontSize: '12px' }}>
              {selectedDetail.type}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e0e0', fontSize: '12px' }}>
              {selectedDetail.created}
            </span>
          </div>

          {/* Vote tally */}
          {(selectedDetail.voters?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ marginBottom: '8px', fontSize: '14px' }}>Votes</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ textAlign: 'left', padding: '4px' }}>Voter</th>
                    <th style={{ textAlign: 'left', padding: '4px' }}>Role</th>
                    <th style={{ textAlign: 'center', padding: '4px' }}>Vote</th>
                    <th style={{ textAlign: 'center', padding: '4px' }}>W</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDetail.voters?.map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px' }}>{v.name}</td>
                      <td style={{ padding: '4px', color: '#666' }}>{v.role}</td>
                      <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{v.vote}</td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>{v.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Markdown body */}
          <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
            <ReactMarkdown>{selectedDetail.body}</ReactMarkdown>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #e0e0e0', fontSize: '12px', color: '#999' }}>
            Source: {selectedDetail.file}
          </div>
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
