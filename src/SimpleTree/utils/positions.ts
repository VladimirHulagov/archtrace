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
  const placed = new Set<string>();
  let currentLevel = getRootNodes(nodes, connections);
  
  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: TreeNode[] = [];
    for (const node of currentLevel) {
      placed.add(node.id);
      const children = adj.get(node.id) || [];
      children.forEach(childId => {
        const child = nodes.find(n => n.id === childId);
        if (child && !placed.has(child.id)) nextLevel.push(child);
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
): TreeNode[] {
  const levels = groupByLevel(nodes, connections);
  let y = PADDING;
  
  for (const level of levels) {
    const totalWidth = level.reduce((sum, n) => {
      const size = getNodeSize(n);
      return sum + size.width + HORIZONTAL_GAP;
    }, -HORIZONTAL_GAP);
    
    let x = (containerWidth - totalWidth) / 2;
    
    for (const node of level) {
      const size = getNodeSize(node);
      node.x = x;
      node.y = y;
      x += size.width + HORIZONTAL_GAP;
    }
    
    const maxHeight = Math.max(...level.map(n => getNodeSize(n).height));
    y += maxHeight + VERTICAL_GAP;
  }
  
  return nodes;
}

export function hasDuplicateConnection(
  connections: Connection[],
  from: string,
  to: string
): boolean {
  return connections.some(c => c.from === from && c.to === to);
}
