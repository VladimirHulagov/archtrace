import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { TreeNode, Connection as ConnectionType, Point } from './types';
import { getNodeSize } from './utils/positions';
import type { PortOffset } from './utils/positions';
import styles from './styles.module.css';

const ENDPOINT_RADIUS = 5;
const CORNER_RADIUS = 10;
const LANE_MIN_STEP = 14;
const LANE_MARGIN = 20;
const BACKWARD_MARGIN = 60;

// Lane tracking moved to Tree.tsx (computeBendYs in positions.ts)
// Module-level tracking doesn't work with React concurrent rendering.
export function resetLanes(_key: string) {}

interface ConnectionProps {
  connection: ConnectionType;
  fromNode: TreeNode;
  toNode: TreeNode;
  points: Point[];
  isSelected: boolean;
  onClick: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
  portOffset?: PortOffset;
  bendY?: number;
}

/**
 * Rounded corner helper: returns the path segment for a smooth turn.
 */
function roundedCorner(
  inX: number, inY: number,
  cornerX: number, cornerY: number,
  outX: number, outY: number,
  r: number,
): string {
  const dx1 = cornerX - inX;
  const dy1 = cornerY - inY;
  const dx2 = outX - cornerX;
  const dy2 = outY - cornerY;
  const len1 = Math.hypot(dx1, dy1);
  const len2 = Math.hypot(dx2, dy2);

  if (len1 === 0 || len2 === 0) return `L ${cornerX} ${cornerY}`;

  const rr = Math.min(r, len1 / 2, len2 / 2);
  const p1x = cornerX - (dx1 / len1) * rr;
  const p1y = cornerY - (dy1 / len1) * rr;
  const p2x = cornerX + (dx2 / len2) * rr;
  const p2y = cornerY + (dy2 / len2) * rr;

  return `L ${p1x} ${p1y} Q ${cornerX} ${cornerY} ${p2x} ${p2y}`;
}

/**
 * Build orthogonal path with guaranteed vertical entry/exit at node edges.
 * Forward: down → H(lane) → down
 * Backward: down → right side → up → left → down (around right side)
 */
function buildPath(
  _rawPoints: Point[],
  fromNode: TreeNode,
  toNode: TreeNode,
  _laneKey: string,
  portOffset?: PortOffset,
  bendY?: number,
): string {
  const fromSize = getNodeSize(fromNode);
  const toSize = getNodeSize(toNode);

  // Account for vote sector bar (14px) at bottom of rich nodes
  const hasSectors = fromNode.voteSectors && fromNode.voteSectors.length > 0;
  const sectorHeight = hasSectors ? 4 : 0; // 12px bar, 8px overlaps with padding
  const fromY = fromNode.y + fromSize.height + sectorHeight;
  const toY = toNode.y;
  // Exit from the winning vote sector's center position
  let fromX: number;
  if (fromNode.voteSectors && fromNode.voteSectors.length > 0) {
    const totalWeight = fromNode.voteSectors.reduce((s, sec) => s + sec.weight, 0);
    const winner = fromNode.voteSectors.find(s => s.option === fromNode.winnerVote);
    if (winner && totalWeight > 0) {
      // Find sector start position (sectors sorted alphabetically)
      let accumW = 0;
      for (const sec of fromNode.voteSectors) {
        if (sec.option === winner.option) break;
        accumW += sec.weight;
      }
      fromX = fromNode.x + ((accumW + winner.weight / 2) / totalWeight) * fromSize.width;
    } else {
      fromX = fromNode.x + fromSize.width / 2;
    }
  } else if (portOffset) {
    fromX = fromNode.x + (fromSize.width * (portOffset.exitIndex + 1)) / (portOffset.exitCount + 1);
  } else {
    fromX = fromNode.x + fromSize.width / 2;
  }
  const toX = portOffset
    ? toNode.x + (toSize.width * (portOffset.entryIndex + 1)) / (portOffset.entryCount + 1)
    : toNode.x + toSize.width / 2;

  // Straight vertical
  if (Math.abs(fromX - toX) < 1 && toY > fromY) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  const isBackward = toY <= fromY;

  if (isBackward) {
    // Route around the right side: down → right → up → left → down
    const rightX = Math.max(fromNode.x + fromSize.width, toNode.x + toSize.width) + BACKWARD_MARGIN;
    const downY = fromY + LANE_MARGIN;
    const upY = toY - LANE_MARGIN;
    const r = Math.min(CORNER_RADIUS, LANE_MARGIN / 2);

    // Build path with rounded corners
    // Points: start, corner1(down-right), corner2(right-up), corner3(up-left), corner4(left-down), end
    const pts = [
      { x: fromX, y: fromY },
      { x: fromX, y: downY },      // go down
      { x: rightX, y: downY },      // go right
      { x: rightX, y: upY },        // go up
      { x: toX, y: upY },           // go left
      { x: toX, y: toY },           // go down into target
    ];

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      path += ' ' + roundedCorner(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y, r);
    }
    path += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    return path;
  }

  // Forward: down → H(lane) → down
  const minBend = fromY + LANE_MARGIN;
  const maxBend = toY - LANE_MARGIN;

  if (maxBend <= minBend) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  // Use pre-computed bendY from Tree (guarantees unique lane per source)
  const actualBendY = bendY != null
    ? Math.max(minBend, Math.min(bendY, maxBend))
    : (fromY + toY) / 2;

  const r = Math.min(CORNER_RADIUS, (actualBendY - fromY) / 2, (toY - actualBendY) / 2);
  const direction = toX > fromX ? 1 : -1;

  const pts = [
    { x: fromX, y: fromY },
    { x: fromX, y: actualBendY },
    { x: toX, y: actualBendY },
    { x: toX, y: toY },
  ];

  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    path += ' ' + roundedCorner(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y, r);
  }
  path += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  return path;
}

export const Connection: React.FC<ConnectionProps> = ({
  connection,
  fromNode,
  toNode,
  points,
  isSelected,
  onClick,
  onDelete,
  portOffset,
  bendY,
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  const laneKey = useMemo(() => {
    // Group by source bottom Y — all connections leaving the same source level
    // share one lane pool so their horizontal segments don't overlap
    const fromSize = getNodeSize(fromNode);
    const sourceBottom = Math.round(fromNode.y + fromSize.height);
    return `src-${sourceBottom}`;
  }, [fromNode.y]);

  const pathData = useMemo(
    () => buildPath(points, fromNode, toNode, laneKey, portOffset, bendY),
    [points, fromNode, toNode, laneKey, portOffset, bendY],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(connection.id);
    },
    [onClick, connection.id],
  );

  useEffect(() => {
    if (!isSelected) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete(connection.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, onDelete, connection.id]);

  if (!pathData || points.length === 0) return null;

  const crossRefClass = connection.kind === 'cross-ref' ? styles['connection--cross-ref'] : '';
  const endpointClass = `${styles.endpoint} ${isHovered || isSelected ? styles['endpoint--hover'] : ''}`;

  const startMatch = pathData.match(/M\s+([\d.]+)\s+([\d.]+)/);
  const endMatch = pathData.match(/L\s+([\d.]+)\s+([\d.]+)\s*$/);
  const startPoint = startMatch
    ? { x: parseFloat(startMatch[1]), y: parseFloat(startMatch[2]) }
    : { x: fromNode.x, y: fromNode.y };
  const endPoint = endMatch
    ? { x: parseFloat(endMatch[1]), y: parseFloat(endMatch[2]) }
    : { x: toNode.x, y: toNode.y };

  return (
    <g>
      <path
        ref={pathRef}
        d={pathData}
        className={`${styles.connection} ${crossRefClass} ${isSelected ? styles['connection--selected'] : ''}`}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        tabIndex={0}
        role="button"
        aria-label={`Connection from ${fromNode.text} to ${toNode.text}`}
      />
      <circle cx={startPoint.x} cy={startPoint.y} r={ENDPOINT_RADIUS} className={endpointClass} />
      <circle cx={endPoint.x} cy={endPoint.y} r={ENDPOINT_RADIUS} className={endpointClass} />
    </g>
  );
};

export default Connection;
