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

// Module-level lane tracker: ensures unique bendY per band
const laneTracker = new Map<string, number[]>();

function getUniqueBendY(bandKey: string, idealY: number, min: number, max: number): number {
  let lanes = laneTracker.get(bandKey);
  if (!lanes) { lanes = []; laneTracker.set(bandKey, lanes); }

  let bendY = Math.max(min, Math.min(idealY, max));
  let attempts = 0;
  while (attempts < 200) {
    const tooClose = lanes.some(y => Math.abs(y - bendY) < LANE_MIN_STEP);
    if (!tooClose) break;
    bendY += LANE_MIN_STEP;
    if (bendY > max) bendY = min + LANE_MIN_STEP;
    attempts++;
  }
  lanes.push(bendY);
  return bendY;
}

let laneResetKey = '';
export function resetLanes(key: string) {
  if (key !== laneResetKey) {
    laneTracker.clear();
    laneResetKey = key;
  }
}

interface ConnectionProps {
  connection: ConnectionType;
  fromNode: TreeNode;
  toNode: TreeNode;
  points: Point[];
  isSelected: boolean;
  onClick: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
  portOffset?: PortOffset;
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
  laneKey: string,
  portOffset?: PortOffset,
): string {
  const fromSize = getNodeSize(fromNode);
  const toSize = getNodeSize(toNode);

  const fromY = fromNode.y + fromSize.height;
  const toY = toNode.y;
  const fromX = portOffset
    ? fromNode.x + (fromSize.width * (portOffset.exitIndex + 1)) / (portOffset.exitCount + 1)
    : fromNode.x + fromSize.width / 2;
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

  const idealBend = (fromY + toY) / 2;
  const bendY = getUniqueBendY(laneKey, idealBend, minBend, maxBend);

  const r = Math.min(CORNER_RADIUS, (bendY - fromY) / 2, (toY - bendY) / 2);
  const direction = toX > fromX ? 1 : -1;

  const pts = [
    { x: fromX, y: fromY },
    { x: fromX, y: bendY },
    { x: toX, y: bendY },
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
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  const laneKey = useMemo(() => {
    const fy = Math.round(fromNode.y);
    const ty = Math.round(toNode.y);
    return `${Math.min(fy, ty)}-${Math.max(fy, ty)}`;
  }, [fromNode.y, toNode.y]);

  const pathData = useMemo(
    () => buildPath(points, fromNode, toNode, laneKey, portOffset),
    [points, fromNode, toNode, laneKey, portOffset],
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
