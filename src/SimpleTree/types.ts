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
