# Tree Visualization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React component for hierarchical tree visualization with dynamic updates, drag & drop, and perpendicular connection lines.

**Architecture:** Stateless controlled component with CSS modules. Parent manages all state via props/callbacks. SVG for connections, absolute positioning for nodes.

**Tech Stack:** React 18, TypeScript, CSS Modules

---

## File Structure

```
src/
├── SimpleTree/
│   ├── index.ts              # Public exports
│   ├── Tree.tsx              # Main container
│   ├── TreeNode.tsx          # Node component
│   ├── Connection.tsx        # SVG connection line
│   ├── Controls.tsx          # Toolbar
│   ├── Modal.tsx             # Rich node editor
│   ├── styles.module.css     # All styles
│   ├── types.ts              # TypeScript interfaces
│   └── utils/
│       └── positions.ts      # Layout algorithm
```

---

## Chunk 1: Foundation (Types & Utils)

### Task 1: TypeScript Types

**Files:**
- Create: `src/SimpleTree/types.ts`

- [ ] **Step 1: Create types file**

```typescript
export interface TreeNode {
  id: string;
  x: number;
  y: number;
  text: string;
  type: 'simple' | 'rich';
  status?: string;
  icon?: string;
  description?: string;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
}

export interface SimpleTreeProps {
  nodes: TreeNode[];
  connections: Connection[];
  onNodeClick?: (node: TreeNode) => void;
  onNodeDoubleClick?: (node: TreeNode) => void;
  onNodeDrag?: (nodeId: string, x: number, y: number) => void;
  onAddNode?: (parentId?: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  onUpdateNode?: (node: TreeNode) => void;
  onAddConnection?: (fromId: string, toId: string) => void;
  onDeleteConnection?: (connectionId: string) => void;
  width?: number;
  height?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/types.ts
git commit -m "feat: add TypeScript interfaces for tree component"
```

### Task 2: Position Calculation Utils

**Files:**
- Create: `src/SimpleTree/utils/positions.ts`

- [ ] **Step 1: Create position utilities**

```typescript
import { TreeNode, Connection } from '../types';

const NODE_WIDTH = 120;
const NODE_HEIGHT = 50;
const RICH_NODE_WIDTH = 200;
const RICH_NODE_HEIGHT = 80;
const VERTICAL_GAP = 50;
const HORIZONTAL_GAP = 100;
const PADDING = 20;

export function getNodeSize(node: TreeNode): { width: number; height: number } {
  return node.type === 'rich'
    ? { width: RICH_NODE_WIDTH, height: RICH_NODE_HEIGHT }
    : { width: NODE_WIDTH, height: NODE_HEIGHT };
}

export function buildAdjacencyList(
  nodes: TreeNode[],
  connections: Connection[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  connections.forEach(c => {
    const children = adj.get(c.from);
    if (children) children.push(c.to);
  });
  return adj;
}

export function getRootNodes(nodes: TreeNode[], connections: Connection[]): TreeNode[] {
  const childIds = new Set(connections.map(c => c.to));
  return nodes.filter(n => !childIds.has(n.id));
}

export function groupByLevel(
  nodes: TreeNode[],
  connections: Connection[]
): TreeNode[][] {
  const adj = buildAdjacencyList(nodes, connections);
  const levels: TreeNode[][] = [];
  let currentLevel = getRootNodes(nodes, connections);
  
  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: TreeNode[] = [];
    for (const node of currentLevel) {
      const children = adj.get(node.id) || [];
      children.forEach(childId => {
        const child = nodes.find(n => n.id === childId);
        if (child) nextLevel.push(child);
      });
    }
    currentLevel = nextLevel;
  }
  
  return levels;
}

export function calculatePositions(
  nodes: TreeNode[],
  connections: Connection[],
  containerWidth: number
): void {
  const levels = groupByLevel(nodes, connections);
  let y = PADDING;
  
  for (const level of levels) {
    const totalWidth = level.reduce((sum, node) => {
      const size = getNodeSize(node);
      return sum + size.width;
    }, 0) + (level.length - 1) * HORIZONTAL_GAP;
    
    let x = Math.max(PADDING, (containerWidth - totalWidth) / 2);
    
    for (const node of level) {
      node.x = x;
      node.y = y;
      x += getNodeSize(node).width + HORIZONTAL_GAP;
    }
    
    const maxHeight = Math.max(...level.map(n => getNodeSize(n).height));
    y += maxHeight + VERTICAL_GAP;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/utils/positions.ts
git commit -m "feat: add position calculation utilities"
```

---

## Chunk 2: Core Components

### Task 3: CSS Styles

**Files:**
- Create: `src/SimpleTree/styles.module.css`

- [ ] **Step 1: Create styles**

```css
.container {
  position: relative;
  overflow: auto;
  background: var(--tree-bg, #fafafa);
  border: 1px solid var(--tree-border, #e0e0e0);
}

.node {
  position: absolute;
  background: var(--node-bg, #ffffff);
  border: 2px solid var(--node-border, #e0e0e0);
  border-radius: 4px;
  cursor: move;
  user-select: none;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.node:hover {
  background: var(--node-hover-bg, #f5f5f5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.nodeSelected {
  border-color: var(--node-selected, #1890ff);
  background: var(--node-selected-bg, #e6f7ff);
}

.nodeDragging {
  opacity: 0.8;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  z-index: 100;
}

.nodeSimple {
  width: 120px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  font-size: 14px;
}

.nodeRich {
  width: 200px;
  min-height: 80px;
  padding: 12px;
}

.nodeHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin-bottom: 4px;
}

.nodeIcon {
  font-size: 16px;
}

.nodeStatus {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--status-bg, #f0f0f0);
}

.nodeDescription {
  font-size: 12px;
  color: var(--node-text-secondary, #666);
  margin-top: 4px;
}

.connectionLayer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.connectionPath {
  fill: none;
  stroke: var(--connection-color, #666);
  stroke-width: 2;
  pointer-events: stroke;
  cursor: pointer;
}

.connectionPath:hover {
  stroke: var(--connection-hover, #1890ff);
  stroke-width: 3;
}

.connectionSelected {
  stroke: var(--connection-selected, #1890ff);
  stroke-width: 3;
}

.connectionEndpoint {
  fill: var(--connection-color, #666);
}

.controls {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 50;
}

.controlBtn {
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid var(--btn-border, #d9d9d9);
  background: var(--btn-bg, #ffffff);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.controlBtn:hover:not(:disabled) {
  border-color: var(--btn-hover-border, #1890ff);
  color: var(--btn-hover-color, #1890ff);
}

.controlBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.controlBtnActive {
  background: var(--btn-active-bg, #1890ff);
  color: #ffffff;
  border-color: var(--btn-active-bg, #1890ff);
}

.connectionMode .node {
  cursor: crosshair;
}

.connectionSource {
  border-color: var(--connection-source, #52c41a) !important;
  box-shadow: 0 0 0 2px var(--connection-source-glow, rgba(82, 196, 26, 0.2));
}

.modalOverlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--modal-bg, #ffffff);
  border-radius: 8px;
  padding: 24px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.modalTitle {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
}

.modalField {
  margin-bottom: 12px;
}

.modalLabel {
  display: block;
  font-size: 12px;
  color: var(--label-color, #666);
  margin-bottom: 4px;
}

.modalInput {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--input-border, #d9d9d9);
  border-radius: 4px;
  font-size: 14px;
}

.modalInput:focus {
  outline: none;
  border-color: var(--input-focus-border, #1890ff);
}

.modalTextarea {
  min-height: 80px;
  resize: vertical;
}

.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.modalBtn {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
}

.modalBtnPrimary {
  background: var(--btn-primary-bg, #1890ff);
  color: #ffffff;
  border: none;
}

.modalBtnSecondary {
  background: var(--btn-bg, #ffffff);
  border: 1px solid var(--btn-border, #d9d9d9);
}

.inlineEdit {
  border: none;
  background: transparent;
  width: 100%;
  text-align: center;
  font-size: inherit;
  outline: none;
}

.emptyState {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--empty-color, #999);
  font-size: 14px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/styles.module.css
git commit -m "feat: add CSS module styles for tree component"
```

### Task 4: TreeNode Component

**Files:**
- Create: `src/SimpleTree/TreeNode.tsx`

- [ ] **Step 1: Create TreeNode component**

```typescript
import React, { useState, useRef, useCallback } from 'react';
import { TreeNode as TreeNodeType } from './types';
import { getNodeSize } from './utils/positions';
import styles from './styles.module.css';

interface TreeNodeProps {
  node: TreeNodeType;
  isSelected: boolean;
  isConnectionSource: boolean;
  isConnectionMode: boolean;
  onSelect: (id: string) => void;
  onDoubleClick: (node: TreeNodeType) => void;
  onDrag: (id: string, x: number, y: number) => void;
  onUpdate: (node: TreeNodeType) => void;
}

export const TreeNodeComponent: React.FC<TreeNodeProps> = ({
  node,
  isSelected,
  isConnectionSource,
  isConnectionMode,
  onSelect,
  onDoubleClick,
  onDrag,
  onUpdate,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(node.text);
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

  const size = getNodeSize(node);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isConnectionMode || node.type === 'rich') return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
    };
  }, [isConnectionMode, node.type, node.x, node.y]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    onDrag(node.id, dragStart.current.nodeX + dx, dragStart.current.nodeY + dy);
  }, [isDragging, node.id, onDrag]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'simple') {
      setIsEditing(true);
      setEditText(node.text);
    } else {
      onDoubleClick(node);
    }
  };

  const handleEditBlur = () => {
    setIsEditing(false);
    if (editText.trim() && editText !== node.text) {
      onUpdate({ ...node, text: editText.trim() });
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditText(node.text);
    }
  };

  const nodeClasses = [
    styles.node,
    node.type === 'simple' ? styles.nodeSimple : styles.nodeRich,
    isSelected && styles.nodeSelected,
    isDragging && styles.nodeDragging,
    isConnectionSource && styles.connectionSource,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={nodeClasses}
      style={{ left: node.x, top: node.y, width: size.width, minHeight: size.height }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={0}
    >
      {node.type === 'simple' ? (
        isEditing ? (
          <input
            className={styles.inlineEdit}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleEditBlur}
            onKeyDown={handleEditKeyDown}
            autoFocus
          />
        ) : (
          <span>{node.text}</span>
        )
      ) : (
        <>
          <div className={styles.nodeHeader}>
            {node.icon && <span className={styles.nodeIcon}>{node.icon}</span>}
            <span>{node.text}</span>
            {node.status && (
              <span className={styles.nodeStatus}>{node.status}</span>
            )}
          </div>
          {node.description && (
            <div className={styles.nodeDescription}>{node.description}</div>
          )}
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/TreeNode.tsx
git commit -m "feat: add TreeNode component with drag and inline edit"
```

---

## Chunk 3: Connections & Controls

### Task 5: Connection Component

**Files:**
- Create: `src/SimpleTree/Connection.tsx`

- [ ] **Step 1: Create Connection component**

```typescript
import React from 'react';
import { TreeNode, Connection as ConnectionType } from './types';
import { getNodeSize } from './utils/positions';
import styles from './styles.module.css';

interface ConnectionProps {
  connection: ConnectionType;
  nodes: TreeNode[];
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  offset?: number;
}

export const Connection: React.FC<ConnectionProps> = ({
  connection,
  nodes,
  isSelected,
  onSelect,
  onDelete,
  offset = 0,
}) => {
  const fromNode = nodes.find(n => n.id === connection.from);
  const toNode = nodes.find(n => n.id === connection.to);

  if (!fromNode || !toNode) return null;

  const fromSize = getNodeSize(fromNode);
  const toSize = getNodeSize(toNode);

  const x1 = fromNode.x + fromSize.width / 2;
  const y1 = fromNode.y + fromSize.height;
  const x2 = toNode.x + toSize.width / 2;
  const y2 = toNode.y + offset;

  const midY = y1 + (y2 - y1) / 2;
  const cornerRadius = 4;

  const path = `M ${x1} ${y1} 
                L ${x1} ${midY - cornerRadius} 
                Q ${x1} ${midY} ${x1 + Math.sign(x2 - x1) * cornerRadius} ${midY}
                L ${x2 - Math.sign(x2 - x1) * cornerRadius} ${midY}
                Q ${x2} ${midY} ${x2} ${midY + cornerRadius}
                L ${x2} ${y2}`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(connection.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      onDelete(connection.id);
    }
  };

  return (
    <g onClick={handleClick} onKeyDown={handleKeyDown} tabIndex={0}>
      <path
        className={`${styles.connectionPath} ${isSelected ? styles.connectionSelected : ''}`}
        d={path}
      />
      <circle className={styles.connectionEndpoint} cx={x1} cy={y1} r={3} />
      <circle className={styles.connectionEndpoint} cx={x2} cy={y2} r={3} />
    </g>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/Connection.tsx
git commit -m "feat: add Connection component with perpendicular paths"
```

### Task 6: Controls Component

**Files:**
- Create: `src/SimpleTree/Controls.tsx`

- [ ] **Step 1: Create Controls component**

```typescript
import React from 'react';
import styles from './styles.module.css';

interface ControlsProps {
  hasSelection: boolean;
  isConnectionMode: boolean;
  onAddNode: () => void;
  onDeleteNode: () => void;
  onToggleConnectionMode: () => void;
  onDeleteConnection: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  hasSelection,
  isConnectionMode,
  onAddNode,
  onDeleteNode,
  onToggleConnectionMode,
  onDeleteConnection,
}) => {
  return (
    <div className={styles.controls}>
      <button
        className={styles.controlBtn}
        onClick={onAddNode}
        title="Add node"
      >
        + Add
      </button>
      <button
        className={styles.controlBtn}
        onClick={onDeleteNode}
        disabled={!hasSelection}
        title="Delete selected node"
      >
        Delete
      </button>
      <button
        className={`${styles.controlBtn} ${isConnectionMode ? styles.controlBtnActive : ''}`}
        onClick={onToggleConnectionMode}
        title="Connection mode"
      >
        {isConnectionMode ? 'Cancel Connect' : 'Connect'}
      </button>
      <button
        className={styles.controlBtn}
        onClick={onDeleteConnection}
        disabled={!hasSelection}
        title="Delete selected connection"
      >
        Delete Link
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/Controls.tsx
git commit -m "feat: add Controls toolbar component"
```

---

## Chunk 4: Modal & Main Tree

### Task 7: Modal Component

**Files:**
- Create: `src/SimpleTree/Modal.tsx`

- [ ] **Step 1: Create Modal component**

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { TreeNode } from './types';
import styles from './styles.module.css';

interface ModalProps {
  node: TreeNode;
  onSave: (node: TreeNode) => void;
  onClose: () => void;
}

export const Modal: React.FC<ModalProps> = ({ node, onSave, onClose }) => {
  const [text, setText] = useState(node.text);
  const [description, setDescription] = useState(node.description || '');
  const [status, setStatus] = useState(node.status || '');
  const [icon, setIcon] = useState(node.icon || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = () => {
    onSave({
      ...node,
      text: text.trim() || node.text,
      description,
      status,
      icon,
    });
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalTitle}>Edit Node</div>
        
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Title</label>
          <input
            ref={inputRef}
            className={styles.modalInput}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Description</label>
          <textarea
            className={`${styles.modalInput} ${styles.modalTextarea}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Status</label>
          <input
            className={styles.modalInput}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="e.g., Active, Pending, Done"
          />
        </div>

        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Icon (emoji or text)</label>
          <input
            className={styles.modalInput}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="e.g., 📋, ✓, •"
          />
        </div>

        <div className={styles.modalActions}>
          <button className={`${styles.modalBtn} ${styles.modalBtnSecondary}`} onClick={onClose}>
            Cancel
          </button>
          <button className={`${styles.modalBtn} ${styles.modalBtnPrimary}`} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/Modal.tsx
git commit -m "feat: add Modal component for rich node editing"
```

### Task 8: Main Tree Component

**Files:**
- Create: `src/SimpleTree/Tree.tsx`

- [ ] **Step 1: Create Tree component**

```typescript
import React, { useState, useCallback, useMemo } from 'react';
import { SimpleTreeProps, TreeNode } from './types';
import { calculatePositions, getConnectionsByPair } from './utils/positions';
import { TreeNodeComponent } from './TreeNode';
import { Connection } from './Connection';
import { Controls } from './Controls';
import { Modal } from './Modal';
import styles from './styles.module.css';

export const Tree: React.FC<SimpleTreeProps> = ({
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
  width = 800,
  height = 600,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [isConnectionMode, setIsConnectionMode] = useState(false);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<TreeNode | null>(null);

  const positionedNodes = useMemo(() => {
    const nodesCopy = nodes.map(n => ({ ...n }));
    calculatePositions(nodesCopy, connections, width);
    return nodesCopy;
  }, [nodes, connections, width]);

  const connectionOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const pairCounts = new Map<string, number>();
    
    connections.forEach(conn => {
      const key = `${conn.from}-${conn.to}`;
      const count = pairCounts.get(key) || 0;
      pairCounts.set(key, count + 1);
      offsets.set(conn.id, count * 8);
    });
    
    return offsets;
  }, [connections]);

  const handleNodeSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedConnectionId(null);
    onNodeClick?.(nodes.find(n => n.id === id)!);
  }, [nodes, onNodeClick]);

  const handleNodeDoubleClick = useCallback((node: TreeNode) => {
    if (node.type === 'rich') {
      setEditingNode(node);
    }
    onNodeDoubleClick?.(node);
  }, [onNodeDoubleClick]);

  const handleNodeDrag = useCallback((id: string, x: number, y: number) => {
    onNodeDrag?.(id, x, y);
  }, [onNodeDrag]);

  const handleConnectionSelect = useCallback((id: string) => {
    setSelectedConnectionId(id);
    setSelectedNodeId(null);
  }, []);

  const handleContainerClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
    setIsConnectionMode(false);
    setConnectionSourceId(null);
  }, []);

  const handleAddNode = useCallback(() => {
    onAddNode?.(selectedNodeId || undefined);
  }, [onAddNode, selectedNodeId]);

  const handleDeleteNode = useCallback(() => {
    if (selectedNodeId) {
      onDeleteNode?.(selectedNodeId);
      setSelectedNodeId(null);
    }
  }, [onDeleteNode, selectedNodeId]);

  const handleToggleConnectionMode = useCallback(() => {
    setIsConnectionMode(prev => !prev);
    setConnectionSourceId(null);
    setSelectedNodeId(null);
  }, []);

  const handleNodeClickInConnectionMode = useCallback((id: string) => {
    if (!connectionSourceId) {
      setConnectionSourceId(id);
    } else if (connectionSourceId !== id) {
      onAddConnection?.(connectionSourceId, id);
      setConnectionSourceId(null);
      setIsConnectionMode(false);
    }
  }, [connectionSourceId, onAddConnection]);

  const handleDeleteConnection = useCallback(() => {
    if (selectedConnectionId) {
      onDeleteConnection?.(selectedConnectionId);
      setSelectedConnectionId(null);
    }
  }, [onDeleteConnection, selectedConnectionId]);

  const handleModalSave = useCallback((node: TreeNode) => {
    onUpdateNode?.(node);
    setEditingNode(null);
  }, [onUpdateNode]);

  const containerClasses = [
    styles.container,
    isConnectionMode && styles.connectionMode,
  ].filter(Boolean).join(' ');

  if (nodes.length === 0) {
    return (
      <div className={containerClasses} style={{ width, height }}>
        <Controls
          hasSelection={false}
          isConnectionMode={false}
          onAddNode={handleAddNode}
          onDeleteNode={handleDeleteNode}
          onToggleConnectionMode={handleToggleConnectionMode}
          onDeleteConnection={handleDeleteConnection}
        />
        <div className={styles.emptyState}>No nodes. Click "Add" to create one.</div>
      </div>
    );
  }

  return (
    <div className={containerClasses} style={{ width, height }} onClick={handleContainerClick}>
      <Controls
        hasSelection={!!selectedNodeId || !!selectedConnectionId}
        isConnectionMode={isConnectionMode}
        onAddNode={handleAddNode}
        onDeleteNode={handleDeleteNode}
        onToggleConnectionMode={handleToggleConnectionMode}
        onDeleteConnection={handleDeleteConnection}
      />

      <svg className={styles.connectionLayer}>
        {connections.map(conn => (
          <Connection
            key={conn.id}
            connection={conn}
            nodes={positionedNodes}
            isSelected={selectedConnectionId === conn.id}
            onSelect={handleConnectionSelect}
            onDelete={handleDeleteConnection}
            offset={connectionOffsets.get(conn.id) || 0}
          />
        ))}
      </svg>

      {positionedNodes.map(node => (
        <TreeNodeComponent
          key={node.id}
          node={node}
          isSelected={selectedNodeId === node.id}
          isConnectionSource={connectionSourceId === node.id}
          isConnectionMode={isConnectionMode}
          onSelect={isConnectionMode ? handleNodeClickInConnectionMode : handleNodeSelect}
          onDoubleClick={handleNodeDoubleClick}
          onDrag={handleNodeDrag}
          onUpdate={onUpdateNode!}
        />
      ))}

      {editingNode && (
        <Modal
          node={editingNode}
          onSave={handleModalSave}
          onClose={() => setEditingNode(null)}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/Tree.tsx
git commit -m "feat: add main Tree component with all interactions"
```

### Task 9: Public Exports

**Files:**
- Create: `src/SimpleTree/index.ts`

- [ ] **Step 1: Create index exports**

```typescript
export { Tree } from './Tree';
export type { TreeNode, Connection, SimpleTreeProps } from './types';
```

- [ ] **Step 2: Commit**

```bash
git add src/SimpleTree/index.ts
git commit -m "feat: add public exports for SimpleTree component"
```

---

## Chunk 5: Demo & Testing

### Task 10: Demo Application

**Files:**
- Create: `src/App.tsx`
- Create: `src/main.tsx`

- [ ] **Step 1: Create demo App**

```typescript
import React, { useState, useCallback } from 'react';
import { Tree, TreeNode, Connection } from './SimpleTree';

const initialNodes: TreeNode[] = [
  { id: '1', x: 0, y: 0, text: 'Root', type: 'rich', status: 'Active', icon: '📁' },
  { id: '2', x: 0, y: 0, text: 'Child 1', type: 'simple' },
  { id: '3', x: 0, y: 0, text: 'Child 2', type: 'simple' },
  { id: '4', x: 0, y: 0, text: 'Grandchild', type: 'rich', description: 'Nested item' },
];

const initialConnections: Connection[] = [
  { id: 'c1', from: '1', to: '2' },
  { id: 'c2', from: '1', to: '3' },
  { id: 'c3', from: '2', to: '4' },
];

let nodeIdCounter = 5;
let connIdCounter = 100;

export const App: React.FC = () => {
  const [nodes, setNodes] = useState<TreeNode[]>(initialNodes);
  const [connections, setConnections] = useState<Connection[]>(initialConnections);

  const handleNodeDrag = useCallback((id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
  }, []);

  const handleAddNode = useCallback((parentId?: string) => {
    const newNode: TreeNode = {
      id: `node-${nodeIdCounter++}`,
      x: 0,
      y: 0,
      text: `Node ${nodeIdCounter}`,
      type: 'simple',
    };
    setNodes(prev => [...prev, newNode]);
    
    if (parentId) {
      const newConn: Connection = {
        id: `conn-${connIdCounter++}`,
        from: parentId,
        to: newNode.id,
      };
      setConnections(prev => [...prev, newConn]);
    }
  }, []);

  const handleDeleteNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
  }, []);

  const handleUpdateNode = useCallback((node: TreeNode) => {
    setNodes(prev => prev.map(n => n.id === node.id ? node : n));
  }, []);

  const handleAddConnection = useCallback((fromId: string, toId: string) => {
    const exists = connections.some(c => c.from === fromId && c.to === toId);
    if (!exists) {
      setConnections(prev => [...prev, {
        id: `conn-${connIdCounter++}`,
        from: fromId,
        to: toId,
      }]);
    }
  }, [connections]);

  const handleDeleteConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Simple Tree Demo</h1>
      <Tree
        nodes={nodes}
        connections={connections}
        onNodeDrag={handleNodeDrag}
        onAddNode={handleAddNode}
        onDeleteNode={handleDeleteNode}
        onUpdateNode={handleUpdateNode}
        onAddConnection={handleAddConnection}
        onDeleteConnection={handleDeleteConnection}
        width={900}
        height={500}
      />
    </div>
  );
};
```

- [ ] **Step 2: Create main entry**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/main.tsx
git commit -m "feat: add demo application"
```

### Task 11: Build Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "simple-tree-view",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Simple Tree View</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Install and test**

```bash
npm install
npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html
git commit -m "feat: add build configuration with Vite"
```

---

## Execution Notes

1. Run tasks in order within each chunk
2. Each task produces working, testable code
3. Commit after each task
4. Test demo app after Task 11
