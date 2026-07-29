import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { TreeNode, Connection as ConnectionType, Point } from './types';
import styles from './styles.module.css';

const ENDPOINT_RADIUS = 5;
const CORNER_RADIUS = 10;

interface ConnectionProps {
  connection: ConnectionType;
  fromNode: TreeNode;
  toNode: TreeNode;
  points: Point[];
  isSelected: boolean;
  onClick: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
}

/**
 * Build a smooth orthogonal SVG path from dagre waypoints.
 * Each pair of consecutive segments gets a rounded corner (Q curve).
 */
function buildPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length <= 2) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  const path: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);

    // Only round if direction actually changes
    const sameDir = (dx1 === 0) === (dx2 === 0) && (dy1 === 0) === (dy2 === 0)
      && Math.sign(dx1) === Math.sign(dx2) && Math.sign(dy1) === Math.sign(dy2);

    if (sameDir || len1 === 0 || len2 === 0) {
      path.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    const r = Math.min(CORNER_RADIUS, len1 / 2, len2 / 2);

    // Points along the incoming/outgoing segments at distance r from corner
    const p1x = curr.x - (dx1 / len1) * r;
    const p1y = curr.y - (dy1 / len1) * r;
    const p2x = curr.x + (dx2 / len2) * r;
    const p2y = curr.y + (dy2 / len2) * r;

    path.push(`L ${p1x} ${p1y}`);
    path.push(`Q ${curr.x} ${curr.y} ${p2x} ${p2y}`);
  }

  const last = points[points.length - 1];
  path.push(`L ${last.x} ${last.y}`);

  return path.join(' ');
}

export const Connection: React.FC<ConnectionProps> = ({
  connection,
  fromNode,
  toNode,
  points,
  isSelected,
  onClick,
  onDelete,
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  const pathData = useMemo(() => buildPath(points), [points]);

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

  const startPoint = points[0];
  const endPoint = points[points.length - 1];

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
