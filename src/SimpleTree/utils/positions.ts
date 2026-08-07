import { TreeNode, Connection, Point } from '../types';
import dagre from '@dagrejs/dagre';

const NODE_WIDTH = 120;
const NODE_HEIGHT = 50;
const RICH_NODE_WIDTH = 200;
const RICH_NODE_HEIGHT = 120;
const VERTICAL_GAP = 70;
const HORIZONTAL_GAP = 40;
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


// ─── Phase layout constants ──────────────────────────────
const PHASE_BAND_HEIGHT = 250;  // vertical space per phase band
const PHASE_BAND_GAP = 20;      // gap between phase bands
const PHASE_LABEL_WIDTH = 140;  // left margin for phase label

// Phase metadata for layout colors
export const PHASE_LAYOUT: Record<number, { color: string; bg: string; name: string }> = {
  1: { color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.06)', name: 'Проблема' },
  2: { color: '#3498db', bg: 'rgba(52, 152, 219, 0.06)', name: 'Требования' },
  3: { color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.06)', name: 'Концепция' },
  4: { color: '#9b59b6', bg: 'rgba(155, 89, 182, 0.06)', name: 'Решения' },
};

export interface PhaseBand {
  phase: number;
  name: string;
  color: string;
  bg: string;
  y: number;
  height: number;
}

/**
 * Run dagre layout on nodes + connections.
 * Returns positioned nodes (x/y = top-left) and edge waypoints for each connection.
 */

export interface PortOffset {
  exitIndex: number;   // index among outgoing connections from source
  exitCount: number;   // total outgoing from source
  entryIndex: number;  // index among incoming connections to target
  entryCount: number;  // total incoming to target
}

/**
 * For each connection, compute its entry/exit port index.
 * Multiple connections entering the same node get distributed
 * across the top edge. Multiple leaving get distributed across bottom.
 */

/**
 * Pre-compute unique bendY for each forward connection.
 * Groups by source node's bottom Y — all outgoing from same source
 * get sequential lanes with LANE_MIN_STEP spacing.
 * Returns Map<connId, bendY>.
 */
export function computeBendYs(
  connections: Connection[],
  nodes: TreeNode[],
  portOffsets: Map<string, PortOffset>,
): Map<string, number> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const result = new Map<string, number>();

  // Group forward connections by source bottom Y
  const groups = new Map<string, string[]>(); // bandKey → [connId]

  connections.forEach(conn => {
    const fromNode = nodeMap.get(conn.from);
    const toNode = nodeMap.get(conn.to);
    if (!fromNode || !toNode) return;

    const fromSize = getNodeSize(fromNode);
    const fromBottom = Math.round(fromNode.y + fromSize.height);
    const toTop = Math.round(toNode.y);
    const isForward = toTop > fromBottom;
    if (!isForward) return; // skip backward — they use side routing

    const bandKey = `src-${fromBottom}`;
    if (!groups.has(bandKey)) groups.set(bandKey, []);
    groups.get(bandKey)!.push(conn.id);
  });

  const LANE_MIN_STEP = 14;
  const LANE_MARGIN = 20;

  // Assign bendY within each group
  groups.forEach((connIds, bandKey) => {
    connIds.forEach((connId, idx) => {
      const conn = connections.find(c => c.id === connId);
      if (!conn) return;
      const fromNode = nodeMap.get(conn.from)!;
      const toNode = nodeMap.get(conn.to)!;
      const fromSize = getNodeSize(fromNode);

      const fromY = fromNode.y + fromSize.height;
      const toY = toNode.y;
      const minBend = fromY + LANE_MARGIN;
      const maxBend = toY - LANE_MARGIN;

      if (maxBend <= minBend) {
        result.set(connId, (fromY + toY) / 2);
        return;
      }

      // Sequential lane assignment
      const idealBend = (fromY + toY) / 2;
      // Try ideal first, then step up by LANE_MIN_STEP
      let bendY = idealBend + idx * LANE_MIN_STEP;
      // Clamp to [minBend, maxBend]
      if (bendY > maxBend) {
        bendY = idealBend - (bendY - maxBend);
      }
      bendY = Math.max(minBend, Math.min(bendY, maxBend));
      result.set(connId, bendY);
    });
  });

  return result;
}

export function computePortOffsets(connections: Connection[]): Map<string, PortOffset> {
  // Count incoming/outgoing per node
  const incomingByNode = new Map<string, string[]>(); // nodeId → [connId]
  const outgoingByNode = new Map<string, string[]>();

  connections.forEach(conn => {
    if (!outgoingByNode.has(conn.from)) outgoingByNode.set(conn.from, []);
    outgoingByNode.get(conn.from)!.push(conn.id);

    if (!incomingByNode.has(conn.to)) incomingByNode.set(conn.to, []);
    incomingByNode.get(conn.to)!.push(conn.id);
  });

  const result = new Map<string, PortOffset>();

  connections.forEach(conn => {
    const outgoing = outgoingByNode.get(conn.from) || [conn.id];
    const incoming = incomingByNode.get(conn.to) || [conn.id];

    result.set(conn.id, {
      exitIndex: outgoing.indexOf(conn.id),
      exitCount: outgoing.length,
      entryIndex: incoming.indexOf(conn.id),
      entryCount: incoming.length,
    });
  });

  return result;
}

export function calculateLayout(
  nodes: TreeNode[],
  connections: Connection[],
  containerWidth: number
): { nodes: TreeNode[]; edgePoints: Map<string, Point[]>; phaseBands: PhaseBand[] } {
  // Group nodes by phase
  const phaseGroups = new Map<number, TreeNode[]>();
  nodes.forEach(node => {
    const phase = node.phase || 4;
    if (!phaseGroups.has(phase)) phaseGroups.set(phase, []);
    phaseGroups.get(phase)!.push(node);
  });

  const sortedPhases = [...phaseGroups.keys()].sort((a, b) => a - b);
  const phaseBands: PhaseBand[] = [];
  const edgePoints = new Map<string, Point[]>();
  let currentY = PADDING;

  for (const phase of sortedPhases) {
    const phaseNodes = phaseGroups.get(phase)!;
    const phaseConnections = connections.filter(c => {
      const fromNode = nodes.find(n => n.id === c.from);
      const toNode = nodes.find(n => n.id === c.to);
      // Include connections where either endpoint is in this phase
      return (fromNode && (fromNode.phase || 4) === phase) ||
             (toNode && (toNode.phase || 4) === phase);
    });

    // Build a subgraph for this phase using dagre
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'TB',
      nodesep: 50,
      ranksep: 80,
      marginx: PADDING + PHASE_LABEL_WIDTH,
      marginy: PADDING,
      edgesep: 30,
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Only add nodes from this phase
    phaseNodes.forEach(node => {
      const size = getNodeSize(node);
      g.setNode(node.id, { width: size.width, height: size.height });
    });

    // Add connections within this phase only
    phaseConnections.forEach(conn => {
      // Only add edge if both nodes exist in this subgraph
      if (g.hasNode(conn.from) && g.hasNode(conn.to)) {
        const isParent = !conn.kind || conn.kind === 'parent';
        g.setEdge(conn.from, conn.to, {
          id: conn.id,
          weight: isParent ? 1 : 0,
          minlen: 1,
        });
      }
    });

    dagre.layout(g);

    // Find bounds of this phase subgraph
    let pMinX = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
    phaseNodes.forEach(node => {
      const dn = g.node(node.id);
      if (dn) {
        pMinX = Math.min(pMinX, dn.x - dn.width / 2);
        pMaxX = Math.max(pMaxX, dn.x + dn.width / 2);
        pMaxY = Math.max(pMaxY, dn.y + dn.height / 2);
      }
    });
    const phaseWidth = pMaxX - pMinX;
    const phaseOffsetX = Math.max(0, (containerWidth - phaseWidth) / 2 - pMinX);

    // Position nodes within the phase band
    phaseNodes.forEach(node => {
      const dn = g.node(node.id);
      if (dn) {
        node.x = dn.x - dn.width / 2 + phaseOffsetX;
        node.y = dn.y - dn.height / 2 + currentY;
      }
    });

    // Extract edge waypoints for this phase
    g.edges().forEach(e => {
      const edge = g.edge(e);
      const connId = edge.id as string;
      if (edge.points && connId) {
        edgePoints.set(connId, edge.points.map((p: { x: number; y: number }) => ({ x: p.x + phaseOffsetX, y: p.y + currentY })));
      }
    });

    const bandHeight = Math.max(pMaxY + PADDING, 100);
    const layout = PHASE_LAYOUT[phase] || PHASE_LAYOUT[4];
    phaseBands.push({
      phase,
      name: layout.name,
      color: layout.color,
      bg: layout.bg,
      y: currentY - PADDING,
      height: bandHeight + PADDING,
    });

    currentY += bandHeight + PHASE_BAND_GAP;
  }

  // Now handle cross-phase connections (parent links between phases)
  connections.forEach(conn => {
    if (edgePoints.has(conn.id)) return; // already handled within a phase
    const fromNode = nodes.find(n => n.id === conn.from);
    const toNode = nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return;

    const fromSize = getNodeSize(fromNode);
    const toSize = getNodeSize(toNode);
    const fromCx = fromNode.x + fromSize.width / 2;
    const fromBottom = fromNode.y + fromSize.height;
    const toCx = toNode.x + toSize.width / 2;
    const toTop = toNode.y;

    // Simple orthogonal route for cross-phase links
    const midY = (fromBottom + toTop) / 2;
    edgePoints.set(conn.id, [
      { x: fromCx, y: fromBottom },
      { x: fromCx, y: midY },
      { x: toCx, y: midY },
      { x: toCx, y: toTop },
    ]);
  });

  return { nodes, edgePoints, phaseBands };
}

/**
 * Backward-compatible wrapper — returns only positioned nodes.
 */
export function calculatePositions(
  nodes: TreeNode[],
  connections: Connection[],
  containerWidth: number
): TreeNode[] {
  return calculateLayout(nodes, connections, containerWidth).nodes;
}

/** Get phase bands for background rendering */
export function getPhaseBands(
  nodes: TreeNode[],
  connections: Connection[],
  containerWidth: number
): PhaseBand[] {
  return calculateLayout(nodes, connections, containerWidth).phaseBands;
}

export function hasDuplicateConnection(
  connections: Connection[],
  from: string,
  to: string
): boolean {
  return connections.some(c => c.from === from && c.to === to);
}
