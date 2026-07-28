import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { TreeNode, Connection as ConnectionType } from './types';
import { getNodeSize } from './utils/positions';
import styles from './styles.module.css';

const CORNER_RADIUS = 4;
const ENDPOINT_RADIUS = 5;
const OFFSET_STEP = 15;
const BEND_OFFSET = 20; // distance from node border before horizontal turn

interface ConnectionProps {
  connection: ConnectionType;
  nodes: TreeNode[];
  isSelected: boolean;
  offsetIndex: number;
  onClick: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
}

function calculatePath(
  fromNode: TreeNode,
  toNode: TreeNode,
  offsetIndex: number
): { path: string; fromX: number; fromY: number; toX: number; toY: number } {
  const fromSize = getNodeSize(fromNode);
  const toSize = getNodeSize(toNode);

  const fromX = fromNode.x + fromSize.width / 2;
  const fromY = fromNode.y + fromSize.height; // bottom center of source
  const toX = toNode.x + toSize.width / 2;
  const toY = toNode.y; // top center of target

  // Each connection gets its own horizontal lane:
  // bendY = fixed offset from source bottom + offsetIndex * STEP
  // This ensures parallel connections don't share the same horizontal Y
  const isBackward = toY < fromY;

  if (isBackward) {
    // Backward (cross-ref) connection: route BELOW source, then horizontal, then UP to target
    // Go down from source bottom, then horizontal far below, then up to target top
    const bendY = fromY + BEND_OFFSET + offsetIndex * OFFSET_STEP;
    const r = CORNER_RADIUS;
    const direction = toX > fromX ? 1 : -1;
    const horizDistance = Math.abs(toX - fromX);

    if (horizDistance < r * 4) {
      // Nearly vertical: just draw straight (down then up)
      const path = [
        `M ${fromX} ${fromY}`,
        `L ${fromX} ${bendY}`,
        `L ${toX} ${bendY}`,
        `L ${toX} ${toY}`,
      ].join(' ');
      return { path, fromX, fromY, toX, toY };
    }

    const effectiveR = Math.min(r, horizDistance / 2);
    const path = [
      `M ${fromX} ${fromY}`,
      `L ${fromX} ${bendY - effectiveR}`,
      `Q ${fromX} ${bendY} ${fromX + effectiveR * direction} ${bendY}`,
      `L ${toX - effectiveR * direction} ${bendY}`,
      `Q ${toX} ${bendY} ${toX} ${bendY - effectiveR}`,
      `L ${toX} ${toY}`,
    ].join(' ');
    return { path, fromX, fromY, toX, toY };
  }

  // Forward connection: route from source bottom → down → horizontal → down to target top
  // Each connection uses a unique horizontal lane based on offsetIndex
  const bendY = fromY + BEND_OFFSET + offsetIndex * OFFSET_STEP;

  // Clamp bendY so it doesn't overshoot the target
  const clampedBendY = Math.min(bendY, toY - BEND_OFFSET);

  const r = CORNER_RADIUS;
  const direction = toX > fromX ? 1 : -1;
  const horizDistance = Math.abs(toX - fromX);

  if (fromX === toX) {
    // Straight vertical line
    return {
      path: `M ${fromX} ${fromY} L ${toX} ${toY}`,
      fromX, fromY, toX, toY,
    };
  }

  if (horizDistance < r * 4 || clampedBendY >= toY - r * 2) {
    // Too close horizontally or vertically for rounded path: simple L-bend
    const path = [
      `M ${fromX} ${fromY}`,
      `L ${fromX} ${clampedBendY}`,
      `L ${toX} ${clampedBendY}`,
      `L ${toX} ${toY}`,
    ].join(' ');
    return { path, fromX, fromY, toX, toY };
  }

  const effectiveR = Math.min(r, horizDistance / 2, (clampedBendY - fromY) / 2, (toY - clampedBendY) / 2);

  const path = [
    `M ${fromX} ${fromY}`,
    `L ${fromX} ${clampedBendY - effectiveR}`,
    `Q ${fromX} ${clampedBendY} ${fromX + effectiveR * direction} ${clampedBendY}`,
    `L ${toX - effectiveR * direction} ${clampedBendY}`,
    `Q ${toX} ${clampedBendY} ${toX} ${clampedBendY + effectiveR}`,
    `L ${toX} ${toY}`,
  ].join(' ');

  return { path, fromX, fromY, toX, toY };
}

export const Connection: React.FC<ConnectionProps> = ({
  connection,
  nodes,
  isSelected,
  offsetIndex,
  onClick,
  onDelete,
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  const fromNode = useMemo(
    () => nodes.find((n) => n.id === connection.from),
    [nodes, connection.from]
  );
  const toNode = useMemo(
    () => nodes.find((n) => n.id === connection.to),
    [nodes, connection.to]
  );

  const pathData = useMemo(() => {
    if (!fromNode || !toNode) return null;
    return calculatePath(fromNode, toNode, offsetIndex);
  }, [fromNode, toNode, offsetIndex]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(connection.id);
    },
    [onClick, connection.id]
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

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

  if (!pathData || !fromNode || !toNode) {
    return null;
  }

  const offsetClass = offsetIndex === 0
    ? styles['connection--offset-1']
    : offsetIndex === 1
    ? styles['connection--offset-2']
    : styles['connection--offset-3'];

  const crossRefClass = connection.kind === 'cross-ref' ? styles['connection--cross-ref'] : '';

  const endpointClass = `${styles.endpoint} ${isHovered || isSelected ? styles['endpoint--hover'] : ''}`;

  return (
    <g>
      <path
        ref={pathRef}
        d={pathData.path}
        className={`${styles.connection} ${offsetClass} ${crossRefClass} ${isSelected ? styles['connection--selected'] : ''}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        tabIndex={0}
        role="button"
        aria-label={`Connection from ${fromNode.text} to ${toNode.text}`}
      />
      <circle
        cx={pathData.fromX}
        cy={pathData.fromY}
        r={ENDPOINT_RADIUS}
        className={endpointClass}
      />
      <circle
        cx={pathData.toX}
        cy={pathData.toY}
        r={ENDPOINT_RADIUS}
        className={endpointClass}
      />
    </g>
  );
};

export default Connection;
