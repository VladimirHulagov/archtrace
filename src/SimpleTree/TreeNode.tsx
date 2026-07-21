import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TreeNode } from './types';
import styles from './styles.module.css';

export interface TreeNodeProps {
  node: TreeNode;
  isSelected: boolean;
  isConnecting: boolean;
  connectionSource: string | null;
  onSelect: (node: TreeNode, e: React.MouseEvent) => void;
  onDoubleClick: (node: TreeNode) => void;
  onDrag: (nodeId: string, x: number, y: number) => void;
  onUpdate: (node: TreeNode) => void;
  onConnectionStart: (nodeId: string) => void;
  onConnectionEnd: (nodeId: string) => void;
}

const STATUS_MAP: Record<string, string> = {
  success: styles['node__status--success'],
  warning: styles['node__status--warning'],
  error: styles['node__status--error'],
  info: styles['node__status--info'],
};

export const TreeNodeComponent: React.FC<TreeNodeProps> = ({
  node,
  isSelected,
  isConnecting,
  connectionSource,
  onSelect,
  onDoubleClick,
  onDrag,
  onUpdate,
  onConnectionStart,
  onConnectionEnd,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(node.text);
  const dragStartPos = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSimpleNode = node.type === 'simple';
  const canDrag = isSimpleNode;
  const isConnectionSource = connectionSource === node.id;

  useEffect(() => {
    setEditText(node.text);
  }, [node.text]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (!canDrag) return;
      if (isEditing) return;

      e.stopPropagation();
      dragStartPos.current = {
        x: e.clientX,
        y: e.clientY,
        nodeX: node.x,
        nodeY: node.y,
      };
      setIsDragging(true);
    },
    [canDrag, isEditing, node.x, node.y]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragStartPos.current || !isDragging) return;

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      const newX = dragStartPos.current.nodeX + deltaX;
      const newY = dragStartPos.current.nodeY + deltaY;

      onDrag(node.id, newX, newY);
    },
    [isDragging, node.id, onDrag]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartPos.current = null;
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      if (isConnecting && connectionSource) {
        onConnectionEnd(node.id);
      } else if (isConnecting && !connectionSource) {
        onConnectionStart(node.id);
      } else {
        onSelect(node, e);
      }
    },
    [isConnecting, connectionSource, node, onSelect, onConnectionStart, onConnectionEnd]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      
      if (isSimpleNode) {
        setIsEditing(true);
      } else {
        onDoubleClick(node);
      }
    },
    [isSimpleNode, node, onDoubleClick]
  );

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onUpdate({ ...node, text: editText });
        setIsEditing(false);
      } else if (e.key === 'Escape') {
        setEditText(node.text);
        setIsEditing(false);
      }
    },
    [node, editText, onUpdate]
  );

  const handleEditBlur = useCallback(() => {
    onUpdate({ ...node, text: editText });
    setIsEditing(false);
  }, [node, editText, onUpdate]);

  const nodeClasses = [
    styles.node,
    isSimpleNode ? styles['node--simple'] : styles['node--rich'],
    isSelected && styles['node--selected'],
    isDragging && styles['node--dragging'],
    isConnectionSource && styles['node--selected'],
  ]
    .filter(Boolean)
    .join(' ');

  const statusClass = node.status ? STATUS_MAP[node.status] : '';

  const nodeStyle: React.CSSProperties = {
    left: node.x,
    top: node.y,
    cursor: isConnecting ? 'crosshair' : canDrag ? 'grab' : 'pointer',
  };

  if (isDragging) {
    nodeStyle.cursor = 'grabbing';
  }

  return (
    <div
      className={nodeClasses}
      style={nodeStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      role="treeitem"
      aria-selected={isSelected}
      aria-label={node.text}
      tabIndex={0}
    >
      {isSimpleNode ? (
        isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={handleEditBlur}
            className={styles['field__input']}
            style={{
              width: '100%',
              height: '100%',
              textAlign: 'center',
              padding: '4px',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.node__title}>{node.text}</span>
        )
      ) : (
        <>
          <div className={styles.node__header}>
            {node.icon && (
              <span className={styles.node__icon} aria-hidden="true">
                {node.icon}
              </span>
            )}
            <span className={styles.node__title}>{node.text}</span>
            {node.status && (
              <span
                className={`${styles.node__status} ${statusClass}`}
                aria-label={`Status: ${node.status}`}
              />
            )}
          </div>
          {node.description && (
            <div className={styles.node__content}>
              <p className={styles.node__description}>{node.description}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TreeNodeComponent;
