export interface Point {
  x: number;
  y: number;
}

export interface TreeNode {
  id: string;
  x: number;
  y: number;
  text: string;
  type: 'simple' | 'rich';
  status?: string;
  icon?: string;
  description?: string;
  nodeType?: 'requirement' | 'decision' | 'task';  // ADR type
  voteTally?: string;  // e.g. "A:4 B:2"
  voteSectors?: { option: string; weight: number; color: string }[];
  winnerVote?: string;
  options?: { letter: string; title: string }[];
  connectionKind?: 'parent' | 'cross-ref';  // for connection styling
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  kind?: 'parent' | 'cross-ref';
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
  onDeselect?: () => void;
  width?: number;
  height?: number;
  pendingNewNode?: TreeNode | null;
}
