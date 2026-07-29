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

// Module-level lane tracker
const laneTracker = new Map<string, number[]>();

function getUniqueBendY(bandKey: string, idealY: number, min: number, max: number): number {
  let lanes = laneTracker.get(bandKey);
  if (!lanes) { lanes = []; laneTracker.set(bandKey, lanes); }

  let bendY = Math.max(min, Math.min(idealY, max));
  let attempts = 0;
  while (attempts < 100) {
    const tooClose = lanes.some(y => Math.abs(y - bendY) < LANE_MIN_STEP);
    if (!tooClose) break;
    bendY += LANE_MIN_STEP;
    if (bendY > max) bendY = min + (bendY - max) * 0.5;
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
 * Build orthogonal path with guaranteed vertical entry/exit at node edges.
 * Forward: down → H → down (lane-separated)
 * Backward: down → right → up → left → down (around right side)
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
    // Route around the right side
    const rightX = Math.max(fromNode.x + fromSize.width, toNode.x + toSize.width) + BACKWARD_MARGIN;
    const downY = fromY + LANE_MARGIN;
    const upY = toY - LANE_MARGIN;

    const r = Math.min(CORNER_RADIUS, LANE_MARGIN / 2);
    const dirR = 1;  // always go right

    return [
      `M ${fromX} ${fromY}`,
      `L ${fromX} ${downY - r}`,
      `Q ${fromX} ${downY} ${fromX + r * dirR} ${downY}`,
      `L ${rightX - r * dirR} ${downY}`,
      `Q ${rightX} ${downY} ${rightX} ${downY + r}`,
      `L ${rightX} ${upY - r}`,
      `Q ${rightX} ${upY} ${rightX - r * dirR} ${upY}`,
      `L ${toX + r * dirR} ${upY}`,
      `Q ${toX} ${upY} ${toX} ${upY + r}`,
      `L ${toX} ${toY}`,
    ].join(' ');
  }

  // Forward: down → H → down
  const minBend = fromY + LANE_MARGIN;
  const maxBend = toY - LANE_MARGIN;

  if (maxBend <= minBend) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  const idealBend = (fromY + toY) / 2;
  const bendY = getUniqueBendY(laneKey, idealBend, minBend, maxBend);

  const r = Math.min(CORNER_RADIUS, (bendY - fromY) / 2, (toY - bendY) / 2);
  const direction = toX > fromX ? 1 : -1;

  return [
    `M ${fromX} ${fromY}`,
    `L ${fromX} ${bendY - r}`,
    `Q ${fromX} ${bendY} ${fromX + direction * r} ${bendY}`,
    `L ${toX - direction * r} ${bendY}`,
    `Q ${toX} ${bendY} ${toX} ${bendY + r}`,
    `L ${toX} ${toY}`,
  ].join(' ');
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

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

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

  // Extract start/end from path for endpoint circles
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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
