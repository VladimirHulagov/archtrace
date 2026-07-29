import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { TreeNode, SimpleTreeProps } from './types';
import { TreeNodeComponent } from './TreeNode';
import { Connection as ConnectionComponent, resetLanes } from './Connection';
import { computePortOffsets, computeBendYs, type PortOffset } from './utils/positions';
import { Controls } from './Controls';
import { Modal } from './Modal';
import { groupByLevel, getNodeSize } from './utils/positions';
import styles from './styles.module.css';

export interface TreeProps extends SimpleTreeProps {
  className?: string;
  edgePoints?: Map<string, import('./types').Point[]>;
  onDeselect?: () => void;
}

// Edge points are computed by dagre and passed via edgePoints prop

export const Tree: React.FC<TreeProps> = ({
  nodes,
  connections,
  onNodeClick,
  onNodeDoubleClick,
  onNodeDrag,
  onAddNode,
  onDeleteNode,
  onUpdateNode,
  onAddConnection,
  onDeleteConnection,
  edgePoints,
  onDeselect,
  className,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [isConnectionMode, setIsConnectionMode] = useState(false);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<TreeNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<any>(null);
  const announcementRef = useRef<HTMLDivElement>(null);

  // Only use parent connections for level grouping (cross-refs create cycles)
  const parentConnections = useMemo(
    () => connections.filter(c => !c.kind || c.kind === 'parent'),
    [connections]
  );
  const levels = useMemo(() => groupByLevel(nodes, parentConnections), [nodes, parentConnections]);
  
  // Node lookup map for Connection component
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  
  // Compute port offsets: distribute entry/exit points across node edges
  const portOffsets = useMemo(() => computePortOffsets(connections), [connections]);
  const bendYs = useMemo(() => computeBendYs(connections, nodes, portOffsets), [connections, nodes, portOffsets]);

  const bounds = useMemo(() => {
    if (nodes.length === 0) return { width: 0, height: 0 };
    let maxX = 0;
    let maxY = 0;
    nodes.forEach((node) => {
      const size = getNodeSize(node);
      maxX = Math.max(maxX, node.x + size.width);
      maxY = Math.max(maxY, node.y + size.height);
    });
    return { width: maxX + 20, height: maxY + 20 };
  }, [nodes]);

  const announce = useCallback((message: string) => {
    if (announcementRef.current) {
      announcementRef.current.textContent = message;
    }
  }, []);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains(styles.connectionLayer)) {
      setSelectedNodeId(null);
      setSelectedConnectionId(null);
      
      if (onDeselect) onDeselect();
      
      if (isConnectionMode) {
        setIsConnectionMode(false);
        setConnectionSourceId(null);
        announce('Connection mode cancelled');
      }
    }
  }, [isConnectionMode, announce]);

  const handleNodeSelect = useCallback(
    (node: TreeNode, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedConnectionId(null);
      setSelectedNodeId(node.id);
      announce(`Node ${node.text} selected`);
      
      if (onNodeClick) {
        onNodeClick(node);
      }
    },
    [onNodeClick, announce]
  );

  const handleNodeDoubleClick = useCallback(
    (node: TreeNode) => {
      setEditingNode(node);
      announce(`Editing node ${node.text}`);
      
      if (onNodeDoubleClick) {
        onNodeDoubleClick(node);
      }
    },
    [onNodeDoubleClick, announce]
  );

  const handleNodeDrag = useCallback(
    (nodeId: string, x: number, y: number) => {
      if (onNodeDrag) {
        onNodeDrag(nodeId, x, y);
      }
    },
    [onNodeDrag]
  );

  const handleNodeUpdate = useCallback(
    (node: TreeNode) => {
      if (onUpdateNode) {
        onUpdateNode(node);
      }
    },
    [onUpdateNode]
  );

  const handleConnectionStart = useCallback((nodeId: string) => {
    setConnectionSourceId(nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    announce(`Connection started from ${node?.text}. Click another node to connect.`);
  }, [nodes, announce]);

  const handleConnectionEnd = useCallback(
    (targetNodeId: string) => {
      if (connectionSourceId && connectionSourceId !== targetNodeId) {
        const existingConnection = connections.find(
          (c) => c.from === connectionSourceId && c.to === targetNodeId
        );
        
        if (!existingConnection && onAddConnection) {
          onAddConnection(connectionSourceId, targetNodeId);
          const targetNode = nodes.find((n) => n.id === targetNodeId);
          const sourceNode = nodes.find((n) => n.id === connectionSourceId);
          announce(`Connection created from ${sourceNode?.text} to ${targetNode?.text}`);
        } else if (existingConnection) {
          announce('Connection already exists');
        }
      }
      
      setIsConnectionMode(false);
      setConnectionSourceId(null);
    },
    [connectionSourceId, connections, onAddConnection, nodes, announce]
  );

  const handleConnectionClick = useCallback(
    (connectionId: string) => {
      setSelectedNodeId(null);
      setSelectedConnectionId(connectionId);
      const conn = connections.find((c) => c.id === connectionId);
      if (conn) {
        const fromNode = nodes.find((n) => n.id === conn.from);
        const toNode = nodes.find((n) => n.id === conn.to);
        announce(`Connection from ${fromNode?.text} to ${toNode?.text} selected`);
      }
    },
    [connections, nodes, announce]
  );

  const handleAddNode = useCallback(() => {
    if (onAddNode) {
      onAddNode(selectedNodeId || undefined);
      announce('New node added');
    }
  }, [onAddNode, selectedNodeId, announce]);

  const handleDeleteNode = useCallback(() => {
    if (selectedNodeId && onDeleteNode) {
      const node = nodes.find((n) => n.id === selectedNodeId);
      onDeleteNode(selectedNodeId);
      setSelectedNodeId(null);
      announce(`Node ${node?.text} deleted`);
    }
  }, [selectedNodeId, onDeleteNode, nodes, announce]);

  const handleDeleteConnection = useCallback(() => {
    if (selectedConnectionId && onDeleteConnection) {
      onDeleteConnection(selectedConnectionId);
      setSelectedConnectionId(null);
      announce('Connection deleted');
    }
  }, [selectedConnectionId, onDeleteConnection, announce]);

  const handleToggleConnectMode = useCallback(() => {
    setIsConnectionMode((prev) => {
      const newState = !prev;
      announce(newState ? 'Connection mode enabled. Click a node to start.' : 'Connection mode disabled');
      return newState;
    });
    setConnectionSourceId(null);
  }, [announce]);

  const handleCancelConnection = useCallback(() => {
    setConnectionSourceId(null);
    announce('Connection cancelled. Click a node to start a new connection.');
  }, [announce]);

  const handleModalSave = useCallback(
    (node: TreeNode) => {
      handleNodeUpdate(node);
      setEditingNode(null);
      announce(`Node ${node.text} updated`);
    },
    [handleNodeUpdate, announce]
  );

  const handleModalCancel = useCallback(() => {
    setEditingNode(null);
    announce('Edit cancelled');
  }, [announce]);

  // Click-to-close: listen for clicks on the transform wrapper background
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If click is on the transform wrapper/content area (not a node or connection)
      const isNode = target.closest('[role="treeitem"]');
      const isConnection = target.closest('svg path');
      const isButton = target.closest('button');
      const isCanvas = target.closest('[class*="transformContent"]') ||
                       target.closest('[class*="transformWrapper"]') ||
                       target.tagName === 'svg';

      if (!isNode && !isConnection && !isButton && isCanvas) {
        setSelectedNodeId(null);
        setSelectedConnectionId(null);
        if (onDeselect) onDeselect();
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [onDeselect]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNode) return;
      
      if (e.key === 'Escape') {
        if (isConnectionMode) {
          setIsConnectionMode(false);
          setConnectionSourceId(null);
          announce('Connection mode cancelled');
        } else {
          setSelectedNodeId(null);
          setSelectedConnectionId(null);
          announce('Selection cleared');
        }
        return;
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId && onDeleteNode) {
          e.preventDefault();
          handleDeleteNode();
        } else if (selectedConnectionId && onDeleteConnection) {
          e.preventDefault();
          handleDeleteConnection();
        }
        return;
      }
      
      if (!selectedNodeId || nodes.length === 0) return;
      
      const currentNodeId = selectedNodeId;
      let nextNodeId: string | null = null;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const conn = connections.find((c) => c.from === currentNodeId);
        if (conn) {
          nextNodeId = conn.to;
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const conn = connections.find((c) => c.to === currentNodeId);
        if (conn) {
          nextNodeId = conn.from;
        }
      } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
        e.preventDefault();
        const parentConn = connections.find((c) => c.to === currentNodeId);
        if (parentConn) {
          const siblings = connections.filter((c) => c.from === parentConn.from);
          const currentIndex = siblings.findIndex((c) => c.to === currentNodeId);
          if (currentIndex < siblings.length - 1) {
            nextNodeId = siblings[currentIndex + 1].to;
          }
        }
      } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        const parentConn = connections.find((c) => c.to === currentNodeId);
        if (parentConn) {
          const siblings = connections.filter((c) => c.from === parentConn.from);
          const currentIndex = siblings.findIndex((c) => c.to === currentNodeId);
          if (currentIndex > 0) {
            nextNodeId = siblings[currentIndex - 1].to;
          }
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (e.ctrlKey) {
          const rootNodes = nodes.filter(
            (n) => !connections.some((c) => c.to === n.id)
          );
          if (rootNodes.length > 0) {
            nextNodeId = rootNodes[0].id;
          }
        } else {
          if (levels.length > 0 && levels[0].length > 0) {
            nextNodeId = levels[0][0].id;
          }
        }
      } else if (e.key === 'End') {
        e.preventDefault();
        if (levels.length > 0) {
          const lastLevel = levels[levels.length - 1];
          if (lastLevel.length > 0) {
            nextNodeId = lastLevel[lastLevel.length - 1].id;
          }
        }
      }
      
      if (nextNodeId && nextNodeId !== currentNodeId) {
        setSelectedNodeId(nextNodeId);
        const nextNode = nodes.find((n) => n.id === nextNodeId);
        if (nextNode) {
          announce(`Node ${nextNode.text} selected`);
          if (onNodeClick) {
            onNodeClick(nextNode);
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedNodeId,
    selectedConnectionId,
    nodes,
    connections,
    levels,
    isConnectionMode,
    editingNode,
    onDeleteNode,
    onDeleteConnection,
    onNodeClick,
    handleDeleteNode,
    handleDeleteConnection,
    announce,
  ]);

  if (nodes.length === 0) {
    return (
      <div className={`${styles.container} ${className || ''}`}>
        <div className={styles.empty}>
          <div className={styles.empty__icon}>+</div>
          <h3 className={styles.empty__title}>No nodes yet</h3>
          <p className={styles.empty__description}>
            Click the add button to create your first node
          </p>
          {onAddNode && (
            <button
              type="button"
              className={`${styles.btn} ${styles['btn--primary']}`}
              onClick={handleAddNode}
              style={{ marginTop: '16px' }}
            >
              Add Node
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${className || ''}`}
      onClick={handleContainerClick}
      role="tree"
      aria-label="Decision tree"
    >
      <div
        ref={announcementRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />
      
      <TransformWrapper
        ref={transformRef}
        minScale={0.2}
        maxScale={3}
        initialScale={1}
        centerOnInit={false}
        limitToBounds={false}
        wheel={{ step: 0.1 }}
        smooth={false}
        doubleClick={{ mode: 'reset' }}
        panning={{ velocityDisabled: true }}
      >
        <TransformComponent
          wrapperClass={styles.transformWrapper}
          contentClass={styles.transformContent}
        >
          <div
            style={{ position: 'absolute', inset: 0, cursor: 'grab' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedNodeId(null);
                setSelectedConnectionId(null);
                if (onDeselect) onDeselect();
              }
            }}
          />
          <svg
            className={styles.connectionLayer}
            width={bounds.width}
            height={bounds.height}
            style={{ position: 'absolute', top: 0, left: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedNodeId(null);
                setSelectedConnectionId(null);
                if (onDeselect) onDeselect();
              }
            }}
          >
            {(() => { resetLanes(`${nodes.length}-${connections.length}`); return null; })()}
            {connections.map((conn) => {
              const fromNode = nodeMap.get(conn.from);
              const toNode = nodeMap.get(conn.to);
              if (!fromNode || !toNode) return null;
              const pts = edgePoints?.get(conn.id) || [];
              if (pts.length < 2) return null;
              const ports = portOffsets.get(conn.id);
              return (
                <ConnectionComponent
                  key={conn.id}
                  connection={conn}
                  fromNode={fromNode}
                  toNode={toNode}
                  points={pts}
                  portOffset={ports}
                  bendY={bendYs.get(conn.id)}
                  isSelected={selectedConnectionId === conn.id}
                  onClick={handleConnectionClick}
                  onDelete={handleDeleteConnection}
                />
              );
            })}
          </svg>
          
          {nodes.map((node) => (
            <TreeNodeComponent
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              isConnecting={isConnectionMode}
              connectionSource={connectionSourceId}
              onSelect={handleNodeSelect}
              onDoubleClick={handleNodeDoubleClick}
              onDrag={handleNodeDrag}
              onUpdate={handleNodeUpdate}
              onConnectionStart={handleConnectionStart}
              onConnectionEnd={handleConnectionEnd}
            />
          ))}
        </TransformComponent>
      </TransformWrapper>
      
      <Controls
        selectedNodeId={selectedNodeId}
        selectedConnectionId={selectedConnectionId}
        isConnectingMode={isConnectionMode}
        connectionSourceId={connectionSourceId}
        onAddNode={handleAddNode}
        onDeleteNode={handleDeleteNode}
        onToggleConnectMode={handleToggleConnectMode}
        onDeleteConnection={handleDeleteConnection}
        onCancelConnection={handleCancelConnection}
        onZoomIn={() => transformRef.current?.zoomIn()}
        onZoomOut={() => transformRef.current?.zoomOut()}
        onZoomReset={() => transformRef.current?.resetTransform()}
      />
      
      {editingNode && (
        <Modal
          node={editingNode}
          isOpen={!!editingNode}
          onSave={handleModalSave}
          onCancel={handleModalCancel}
        />
      )}
    </div>
  );
};

export default Tree;
