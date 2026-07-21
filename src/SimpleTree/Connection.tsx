import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { TreeNode, Connection as ConnectionType } from './types';
import { getNodeSize } from './utils/positions';
import styles from './styles.module.css';

const CORNER_RADIUS = 4;
const ENDPOINT_RADIUS = 5;
const OFFSET_INCREMENT = 8;

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

  const offset = offsetIndex * OFFSET_INCREMENT;
  const adjustedFromX = fromX + offset;
  const adjustedToX = toX + offset;

  const r = CORNER_RADIUS;

  const verticalDistance = toY - fromY;
  const horizontalDistance = Math.abs(adjustedToX - adjustedFromX);

  if (adjustedFromX === adjustedToX) {
    return {
      path: `M ${adjustedFromX} ${fromY} L ${adjustedToX} ${toY}`,
      fromX: adjustedFromX,
      fromY,
      toX: adjustedToX,
      toY,
    };
  }

  if (verticalDistance <= r * 4) {
    const direction = adjustedToX > adjustedFromX ? 1 : -1;
    const path = [
      `M ${adjustedFromX} ${fromY}`,
      `L ${adjustedFromX} ${toY}`,
      `L ${adjustedToX} ${toY}`,
    ].join(' ');

    return { path, fromX: adjustedFromX, fromY, toX: adjustedToX, toY };
  }

  const midY = (fromY + toY) / 2;
  const direction = adjustedToX > adjustedFromX ? 1 : -1;

  const effectiveR = Math.min(
    r,
    verticalDistance / 2 - 1,
    horizontalDistance / 2
  );

  const path = [
    `M ${adjustedFromX} ${fromY}`,
    `L ${adjustedFromX} ${midY - effectiveR}`,
    `Q ${adjustedFromX} ${midY} ${adjustedFromX + effectiveR * direction} ${midY}`,
    `L ${adjustedToX - effectiveR * direction} ${midY}`,
    `Q ${adjustedToX} ${midY} ${adjustedToX} ${midY + effectiveR}`,
    `L ${adjustedToX} ${toY}`,
  ].join(' ');

  return { path, fromX: adjustedFromX, fromY, toX: adjustedToX, toY };
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
