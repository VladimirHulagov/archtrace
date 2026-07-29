import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { TreeNode, Connection as ConnectionType, Point } from './types';
import { getNodeSize } from './utils/positions';
import type { PortOffset } from './utils/positions';
import styles from './styles.module.css';

const ENDPOINT_RADIUS = 5;
const CORNER_RADIUS = 10;
const LANE_MIN_STEP = 12; // minimum px between parallel horizontal segments

// Module-level lane tracker: ensures unique bendY per source-Y band
const laneTracker = new Map<string, number[]>();

function getUniqueBendY(bandKey: string, idealY: number): number {
  let lanes = laneTracker.get(bandKey);
  if (!lanes) { lanes = []; laneTracker.set(bandKey, lanes); }

  // Try idealY first, then nudge until we find a gap
  let bendY = idealY;
  let attempts = 0;
  while (attempts < 50) {
    const tooClose = lanes.some(y => Math.abs(y - bendY) < LANE_MIN_STEP);
    if (!tooClose) break;
    bendY += LANE_MIN_STEP;
    attempts++;
  }
  lanes.push(bendY);
  // Keep lanes sorted for deterministic behavior
  lanes.sort((a, b) => a - b);
  return bendY;
}

// Reset lanes when nodes/connections change (called from useMemo)
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
 * Force a diagonal segment between two points into an orthogonal L-bend.
 * Returns intermediate points to insert between p1 and p2.
 */
/**
 * Build a strictly orthogonal path: down → horizontal → down.
 * Uses a lane system to guarantee no two horizontal segments share the same Y.
 * Guarantees vertical entry/exit at top/bottom centers.
 */
function buildPath(rawPoints: Point[], fromNode: TreeNode, toNode: TreeNode, laneKey: string, portOffset?: PortOffset): string {
  const fromSize = getNodeSize(fromNode);
  const toSize = getNodeSize(toNode);

  // Distribute exit/entry points across bottom/top edge
  const fromY = fromNode.y + fromSize.height;
  const toY = toNode.y;
  const fromX = portOffset
    ? fromNode.x + (fromSize.width * (portOffset.exitIndex + 1)) / (portOffset.exitCount + 1)
    : fromNode.x + fromSize.width / 2;
  const toX = portOffset
    ? toNode.x + (toSize.width * (portOffset.entryIndex + 1)) / (portOffset.entryCount + 1)
    : toNode.x + toSize.width / 2;

  if (Math.abs(fromX - toX) < 1) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  // Ideal bendY from dagre waypoints or midpoint
  let idealBend: number;
  if (rawPoints.length >= 3) {
    idealBend = rawPoints[Math.floor(rawPoints.length / 2)].y;
  } else if (rawPoints.length === 2) {
    idealBend = (rawPoints[0].y + rawPoints[1].y) / 2;
  } else {
    idealBend = (fromY + toY) / 2;
  }

  // Clamp to gap
  const minBend = fromY + CORNER_RADIUS * 2 + 5;
  const maxBend = toY - CORNER_RADIUS * 2 - 5;
  idealBend = Math.max(minBend, Math.min(idealBend, maxBend));

  // Get unique lane Y — no overlap with other connections in this band
  const bendY = getUniqueBendY(laneKey, idealBend);

  const r = Math.min(CORNER_RADIUS, Math.abs(bendY - fromY) / 2, Math.abs(toY - bendY) / 2);
  const direction = toX > fromX ? 1 : -1;

  return [
    `M ${fromX} ${fromY}`,
    `L ${fromX} ${bendY - r}`,
    `Q ${fromX} ${bendY} ${fromX + r * direction} ${bendY}`,
    `L ${toX - r * direction} ${bendY}`,
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
    const fromY = Math.round(fromNode.y);
    const toY = Math.round(toNode.y);
    return `${Math.min(fromY, toY)}-${Math.max(fromY, toY)}`;
  }, [fromNode.y, toNode.y]);
  
  const pathData = useMemo(() => buildPath(points, fromNode, toNode, laneKey, portOffset), [points, fromNode, toNode, laneKey, portOffset]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(connection.id);
    },
    [onClick, connection.id]
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

  // Recompute start/end for circles (matching buildPath port offsets)
  const fromSize2 = getNodeSize(fromNode);
  const toSize2 = getNodeSize(toNode);
  const startPort = pathData ? pathData.match(/M\s+([\d.]+)\s+([\d.]+)/) : null;
  const endPort = pathData ? pathData.match(/L\s+([\d.]+)\s+([\d.]+)\s*$/) : null;
  const startPoint = startPort
    ? { x: parseFloat(startPort[1]), y: parseFloat(startPort[2]) }
    : { x: fromNode.x + fromSize2.width / 2, y: fromNode.y + fromSize2.height };
  const endPoint = endPort
    ? { x: parseFloat(endPort[1]), y: parseFloat(endPort[2]) }
    : { x: toNode.x + toSize2.width / 2, y: toNode.y };

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
      <circle
        cx={startPoint.x}
        cy={startPoint.y}
        r={ENDPOINT_RADIUS}
        className={endpointClass}
      />
      <circle
        cx={endPoint.x}
        cy={endPoint.y}
        r={ENDPOINT_RADIUS}
        className={endpointClass}
      />
    </g>
  );
};

export default Connection;
