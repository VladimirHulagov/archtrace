import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { TreeNode, Connection as ConnectionType } from './types';
import { getNodeSize } from './utils/positions';
import styles from './styles.module.css';

const CORNER_RADIUS = 4;
const ENDPOINT_RADIUS = 5;
const LANE_STEP = 12;
const BEND_MARGIN = 15;
const BACKWARD_SIDE_OFFSET = 50;

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
  const fromY = fromNode.y + fromSize.height;
  const toX = toNode.x + toSize.width / 2;
  const toY = toNode.y;

  const isForward = toY >= fromY;

  if (!isForward) {
    // Backward (cross-ref): route AROUND the right side to avoid crossing nodes.
    // Each backward connection uses its own lane on the right margin.
    const rightX = Math.max(fromNode.x + fromSize.width, toNode.x + toSize.width) 
                   + BACKWARD_SIDE_OFFSET + offsetIndex * LANE_STEP;
    const fromBendY = fromY + BEND_MARGIN;
    const toBendY = toY - BEND_MARGIN;

    const path = [
      `M ${fromX} ${fromY}`,
      `L ${fromX} ${fromBendY}`,
      `L ${rightX} ${fromBendY}`,
      `L ${rightX} ${toBendY}`,
      `L ${toX} ${toBendY}`,
      `L ${toX} ${toY}`,
    ].join(' ');
    return { path, fromX, fromY, toX, toY };
  }

  // Forward connection: route through the gap between levels.
  // Global lane: offsetIndex is unique within the source's level band.
  const gap = toY - fromY;
  const laneStep = Math.min(LANE_STEP, (gap - 2 * BEND_MARGIN) / Math.max(offsetIndex + 1, 1));
  const bendY = fromY + BEND_MARGIN + offsetIndex * laneStep;
  const clampedBendY = Math.max(fromY + CORNER_RADIUS * 2, Math.min(bendY, toY - CORNER_RADIUS * 2));

  if (fromX === toX) {
    return { path: `M ${fromX} ${fromY} L ${toX} ${toY}`, fromX, fromY, toX, toY };
  }

  const direction = toX > fromX ? 1 : -1;
  const horizDist = Math.abs(toX - fromX);
  const r = Math.min(CORNER_RADIUS, horizDist / 2, (clampedBendY - fromY) / 2, (toY - clampedBendY) / 2);

  if (r < 2) {
    const path = `M ${fromX} ${fromY} L ${fromX} ${clampedBendY} L ${toX} ${clampedBendY} L ${toX} ${toY}`;
    return { path, fromX, fromY, toX, toY };
  }

  const path = [
    `M ${fromX} ${fromY}`,
    `L ${fromX} ${clampedBendY - r}`,
    `Q ${fromX} ${clampedBendY} ${fromX + r * direction} ${clampedBendY}`,
    `L ${toX - r * direction} ${clampedBendY}`,
    `Q ${toX} ${clampedBendY} ${toX} ${clampedBendY + r}`,
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
