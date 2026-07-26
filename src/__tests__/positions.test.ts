import { describe, it, expect } from 'vitest';
import {
  calculatePositions,
  groupByLevel,
  getRootNodes,
  buildAdjacencyList,
  getNodeSize,
} from '../SimpleTree/utils/positions';
import type { TreeNode, Connection } from '../SimpleTree/types';

// ─── Helpers ─────────────────────────────────────────────

function makeNode(id: string): TreeNode {
  return { id, x: 0, y: 0, text: `Node ${id}`, type: 'rich' };
}

function makeParentConnection(from: string, to: string): Connection {
  return { id: `c-${from}-${to}`, from, to, kind: 'parent' };
}

function makeNodes(ids: string[]): TreeNode[] {
  return ids.map(makeNode);
}

function getNodePositions(nodes: TreeNode[]): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    map.set(n.id, { x: n.x, y: n.y });
  }
  return map;
}

// ─── Tests ───────────────────────────────────────────────

describe('calculatePositions', () => {
  it('should not leave all nodes at (0, 0)', () => {
    const nodes = makeNodes(['1', '2', '3', '4']);
    const connections = [
      makeParentConnection('1', '2'),
      makeParentConnection('1', '3'),
      makeParentConnection('2', '4'),
    ];
    const containerWidth = 1000;

    const result = calculatePositions(nodes, connections, containerWidth);

    const allZero = result.every(n => n.x === 0 && n.y === 0);
    expect(allZero).toBe(false);
  });

  it('should assign different positions to different nodes', () => {
    const nodes = makeNodes(['1', '2', '3']);
    const connections = [
      makeParentConnection('1', '2'),
      makeParentConnection('1', '3'),
    ];
    const containerWidth = 1000;

    const result = calculatePositions(nodes, connections, containerWidth);
    const positions = getNodePositions(result);

    // All positions should be unique
    const positionSet = new Set<string>();
    for (const [id, pos] of positions) {
      const key = `${pos.x},${pos.y}`;
      positionSet.add(key);
    }
    expect(positionSet.size).toBe(nodes.length);
  });

  it('should place root node at the top (smallest y)', () => {
    const nodes = makeNodes(['1', '2', '3', '4']);
    const connections = [
      makeParentConnection('1', '2'),
      makeParentConnection('2', '3'),
      makeParentConnection('3', '4'),
    ];
    const containerWidth = 1000;

    const result = calculatePositions(nodes, connections, containerWidth);
    const positions = getNodePositions(result);

    const rootY = positions.get('1')!.y;
    for (const [, pos] of positions) {
      expect(pos.y).toBeGreaterThanOrEqual(rootY);
    }
  });

  it('should place children below their parent (y increases by level)', () => {
    const nodes = makeNodes(['1', '2', '3']);
    const connections = [
      makeParentConnection('1', '2'),
      makeParentConnection('1', '3'),
    ];
    const containerWidth = 1000;

    const result = calculatePositions(nodes, connections, containerWidth);
    const positions = getNodePositions(result);

    const rootY = positions.get('1')!.y;
    const child2Y = positions.get('2')!.y;
    const child3Y = positions.get('3')!.y;

    expect(child2Y).toBeGreaterThan(rootY);
    expect(child3Y).toBeGreaterThan(rootY);
  });

  it('should horizontally separate sibling nodes', () => {
    const nodes = makeNodes(['1', '2', '3', '4']);
    const connections = [
      makeParentConnection('1', '2'),
      makeParentConnection('1', '3'),
      makeParentConnection('1', '4'),
    ];
    const containerWidth = 1000;

    const result = calculatePositions(nodes, connections, containerWidth);
    const positions = getNodePositions(result);

    // Children at same level should have different x positions
    const childXs = [positions.get('2')!.x, positions.get('3')!.x, positions.get('4')!.x];
    const uniqueXs = new Set(childXs);
    expect(uniqueXs.size).toBe(childXs.length);

    // And they should be sorted left to right
    for (let i = 1; i < childXs.length; i++) {
      expect(childXs[i]).toBeGreaterThan(childXs[i - 1]);
    }
  });

  it('should not overlap nodes horizontally within the same level', () => {
    const nodes = makeNodes(['1', '2', '3', '4', '5']);
    const connections = [
      makeParentConnection('1', '2'),
      makeParentConnection('1', '3'),
      makeParentConnection('1', '4'),
      makeParentConnection('1', '5'),
    ];
    const containerWidth = 2000;

    const result = calculatePositions(nodes, connections, containerWidth);

    // Level 1 = nodes 2,3,4,5 — all at same y, different x, no overlap
    const level1 = result.filter(n => ['2', '3', '4', '5'].includes(n.id));
    const ys = new Set(level1.map(n => n.y));
    expect(ys.size).toBe(1); // same level = same y

    // Check no overlap: gap between nodes >= node width
    const sorted = [...level1].sort((a, b) => a.x - b.x);
    const nodeWidth = getNodeSize(nodes[0]).width;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].x - (sorted[i - 1].x + nodeWidth);
      expect(gap).toBeGreaterThanOrEqual(0);
    }
  });

  it('should handle a single root node with no children', () => {
    const nodes = makeNodes(['1']);
    const connections: Connection[] = [];
    const containerWidth = 1000;

    const result = calculatePositions(nodes, connections, containerWidth);

    expect(result).toHaveLength(1);
    expect(result[0].x).toBeGreaterThanOrEqual(0);
    expect(result[0].y).toBeGreaterThanOrEqual(0);
  });

  it('should handle multiple independent trees (forest)', () => {
    const nodes = makeNodes(['r1', 'r2', 'c1', 'c2']);
    const connections = [
      makeParentConnection('r1', 'c1'),
      makeParentConnection('r2', 'c2'),
    ];
    const containerWidth = 1000;

    const result = calculatePositions(nodes, connections, containerWidth);
    const positions = getNodePositions(result);

    // Both roots at the same y (level 0)
    expect(positions.get('r1')!.y).toBe(positions.get('r2')!.y);

    // Both children at the same y (level 1)
    expect(positions.get('c1')!.y).toBe(positions.get('c2')!.y);

    // Children below roots
    expect(positions.get('c1')!.y).toBeGreaterThan(positions.get('r1')!.y);
  });

  it('should respect containerWidth for centering', () => {
    const nodes = makeNodes(['1', '2']);
    const connections = [makeParentConnection('1', '2')];
    const containerWidth = 500;

    const result = calculatePositions(nodes, connections, containerWidth);
    const positions = getNodePositions(result);

    // All nodes should be within container bounds (with padding)
    for (const [id, pos] of positions) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(containerWidth);
    }
  });
});

describe('groupByLevel', () => {
  it('should group root nodes at level 0', () => {
    const nodes = makeNodes(['1', '2', '3']);
    const connections = [makeParentConnection('1', '2'), makeParentConnection('2', '3')];
    const levels = groupByLevel(nodes, connections);

    expect(levels).toHaveLength(3);
    expect(levels[0].map(n => n.id)).toEqual(['1']);
    expect(levels[1].map(n => n.id)).toEqual(['2']);
    expect(levels[2].map(n => n.id)).toEqual(['3']);
  });

  it('should group siblings at the same level', () => {
    const nodes = makeNodes(['root', 'a', 'b', 'c']);
    const connections = [
      makeParentConnection('root', 'a'),
      makeParentConnection('root', 'b'),
      makeParentConnection('root', 'c'),
    ];
    const levels = groupByLevel(nodes, connections);

    expect(levels).toHaveLength(2);
    expect(levels[0].map(n => n.id)).toEqual(['root']);
    expect(levels[1].map(n => n.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('should handle forest (multiple roots)', () => {
    const nodes = makeNodes(['r1', 'r2', 'c1']);
    const connections = [makeParentConnection('r1', 'c1')];
    const levels = groupByLevel(nodes, connections);

    expect(levels[0].map(n => n.id).sort()).toEqual(['r1', 'r2']);
  });
});

describe('getRootNodes', () => {
  it('should identify nodes with no incoming parent connections', () => {
    const nodes = makeNodes(['1', '2', '3']);
    const connections = [
      makeParentConnection('1', '2'),
      makeParentConnection('2', '3'),
    ];
    const roots = getRootNodes(nodes, connections);

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('1');
  });
});

describe('buildAdjacencyList', () => {
  it('should build parent → children map', () => {
    const nodes = makeNodes(['1', '2', '3']);
    const connections = [
      makeParentConnection('1', '2'),
      makeParentConnection('1', '3'),
    ];
    const adj = buildAdjacencyList(nodes, connections);

    expect(adj.get('1')).toEqual(['2', '3']);
    expect(adj.get('2')).toEqual([]);
    expect(adj.get('3')).toEqual([]);
  });
});
