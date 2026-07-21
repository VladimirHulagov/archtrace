import { useState, useCallback, useRef } from 'react';
import { Tree, TreeNode, Connection } from './SimpleTree';

const initialNodes: TreeNode[] = [
  {
    id: '1',
    x: 400,
    y: 50,
    text: 'Start Decision',
    type: 'simple',
    status: 'active',
  },
  {
    id: '2',
    x: 200,
    y: 200,
    text: 'Option A',
    type: 'rich',
    status: 'pending',
    description: 'First option with detailed description',
  },
  {
    id: '3',
    x: 600,
    y: 200,
    text: 'Option B',
    type: 'simple',
    status: 'pending',
  },
  {
    id: '4',
    x: 100,
    y: 350,
    text: 'Result A1',
    type: 'simple',
    status: 'approved',
  },
  {
    id: '5',
    x: 300,
    y: 350,
    text: 'Result A2',
    type: 'rich',
    status: 'rejected',
    description: 'This result was rejected due to constraints',
  },
  {
    id: '6',
    x: 600,
    y: 350,
    text: 'Result B1',
    type: 'simple',
    status: 'approved',
  },
];

const initialConnections: Connection[] = [
  { id: 'c1', from: '1', to: '2' },
  { id: 'c2', from: '1', to: '3' },
  { id: 'c3', from: '2', to: '4' },
  { id: 'c4', from: '2', to: '5' },
  { id: 'c5', from: '3', to: '6' },
];

function App() {
  const [nodes, setNodes] = useState<TreeNode[]>(initialNodes);
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const nodeIdCounter = useRef(7);
  const connectionIdCounter = useRef(6);

  const handleNodeDrag = useCallback((nodeId: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId ? { ...node, x, y } : node
      )
    );
  }, []);

  const handleAddNode = useCallback((parentId?: string) => {
    const parentNode = parentId ? nodes.find((n) => n.id === parentId) : null;
    const newId = String(nodeIdCounter.current++);
    const newNode: TreeNode = {
      id: newId,
      x: parentNode ? parentNode.x : 400 + Math.random() * 100,
      y: parentNode ? parentNode.y + 150 : 50 + nodes.length * 80,
      text: `New Node ${newId}`,
      type: Math.random() > 0.5 ? 'simple' : 'rich',
      status: 'pending',
      description: 'Click to edit this node',
    };

    setNodes((prev) => [...prev, newNode]);

    if (parentId) {
      const connId = `c${connectionIdCounter.current++}`;
      const newConnection: Connection = {
        id: connId,
        from: parentId,
        to: newNode.id,
      };
      setConnections((prev) => [...prev, newConnection]);
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
    const newConnection: Connection = {
      id: connId,
      from: fromId,
      to: toId,
    };
    setConnections((prev) => [...prev, newConnection]);
  }, []);

  const handleDeleteConnection = useCallback((connectionId: string) => {
    setConnections((prev) =>
      prev.filter((conn) => conn.id !== connectionId)
    );
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Tree
        nodes={nodes}
        connections={connections}
        onNodeDrag={handleNodeDrag}
        onAddNode={handleAddNode}
        onDeleteNode={handleDeleteNode}
        onUpdateNode={handleUpdateNode}
        onAddConnection={handleAddConnection}
        onDeleteConnection={handleDeleteConnection}
      />
    </div>
  );
}

export default App;
