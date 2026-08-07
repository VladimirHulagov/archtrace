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
  onDeleteNode?: (nodeId: string) => void;
}

const VOTE_COLORS: Record<string, string> = {
  A: '#52c41a',
  B: '#fa8c16',
  C: '#1890ff',
  D: '#722ed1',
};

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
  onDeleteNode,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(node.text);
  const dragStartPos = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSimpleNode = node.type === 'simple';
  const canDrag = isSimpleNode;
  const isConnectionSource = connectionSource === node.id;

  useEffect(() => { setEditText(node.text); }, [node.text]);

  useEffect(() => {
    if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [isEditing]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !canDrag || isEditing) return;
    e.stopPropagation();
    dragStartPos.current = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y };
    setIsDragging(true);
  }, [canDrag, isEditing, node.x, node.y]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStartPos.current || !isDragging) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    onDrag(node.id, dragStartPos.current.nodeX + deltaX, dragStartPos.current.nodeY + deltaY);
  }, [isDragging, node.id, onDrag]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); dragStartPos.current = null; }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnecting && connectionSource) onConnectionEnd(node.id);
    else if (isConnecting && !connectionSource) onConnectionStart(node.id);
    else onSelect(node, e);
  }, [isConnecting, connectionSource, node, onSelect, onConnectionStart, onConnectionEnd]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onDoubleClick(node); }, [node, onDoubleClick]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); onUpdate({ ...node, text: editText }); setIsEditing(false); }
    else if (e.key === 'Escape') { setEditText(node.text); setIsEditing(false); }
  }, [node, editText, onUpdate]);

  const handleEditBlur = useCallback(() => { onUpdate({ ...node, text: editText }); setIsEditing(false); }, [node, editText, onUpdate]);

  const statusClass = node.status ? STATUS_MAP[node.status] : '';
  const statusBorderClass = node.status ? styles[`node--status-${node.status}`] || '' : '';

  const nodeClasses = [
    styles.node,
    isSimpleNode ? styles['node--simple'] : styles['node--rich'],
    isSelected && styles['node--selected'],
    isDragging && styles['node--dragging'],
    isConnectionSource && styles['node--selected'],
    statusBorderClass,
  ].filter(Boolean).join(' ');

  const nodeStyle: React.CSSProperties = {
    left: node.x, top: node.y,
    cursor: isDragging ? 'grabbing' : isConnecting ? 'crosshair' : canDrag ? 'grab' : 'pointer',
  };

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
            style={{ width: '100%', height: '100%', textAlign: 'center', padding: '4px' }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.node__title}>{node.text}</span>
        )
      ) : (
        <>
          {/* Header: icon + title (compact, wrapping) */}
          <div className={styles.node__header}>
            {node.icon && (
              <span className={styles.node__icon} aria-hidden="true" style={{ fontSize: '12px' }}>
                {node.icon}
              </span>
            )}
            <span style={{
              fontSize: '11px',
              lineHeight: '1.2',
              fontWeight: 600,
              wordBreak: 'break-word',
              hyphens: 'auto',
              flex: 1,
            }}>
              {node.text}
            </span>
            {node.status && (
              <span
                className={`${styles.node__status} ${statusClass}`}
                aria-label={`Status: ${node.status}`}
              />
            )}
          </div>

          {/* Option list */}
          {node.options && node.options.length > 0 && (
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: '4px 0 0 0',
              fontSize: '10px',
              lineHeight: '1.3',
              color: '#666',
            }}>
              {node.options.map(opt => (
                <li key={opt.letter} style={{ display: 'flex', gap: '4px', padding: '1px 0' }}>
                  <span style={{
                    fontWeight: 'bold',
                    color: node.winnerVote === opt.letter
                      ? VOTE_COLORS[opt.letter] || '#333'
                      : '#999',
                    minWidth: '12px',
                  }}>
                    {opt.letter}:
                  </span>
                  <span style={{
                    textDecoration: node.winnerVote && node.winnerVote !== opt.letter ? 'line-through' : 'none',
                    opacity: node.winnerVote && node.winnerVote !== opt.letter ? 0.5 : 1,
                  }}>
                    {opt.title}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Fallback description if no options */}
          {!node.options?.length && node.description && (
            <div className={styles.node__content}>
              <p className={styles.node__description}>{node.description}</p>
            </div>
          )}

          {/* Vote sector bar */}
          {node.voteSectors && node.voteSectors.length > 0 && (
            <div style={{
              display: 'flex',
              height: '16px',
              borderRadius: '0 0 6px 6px',
              overflow: 'visible',
              marginTop: 'auto',
              marginLeft: '-12px',
              marginRight: '-12px',
            }}>
              {node.voteSectors.map(sec => {
                const isWinner = node.winnerVote === sec.option;
                return (
                  <div
                    key={sec.option}
                    style={{
                      flex: sec.weight,
                      backgroundColor: sec.color,
                      opacity: isWinner ? 1 : 0.3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    <span style={{
                      fontSize: '8px',
                      fontWeight: 'bold',
                      color: '#fff',
                      textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                      whiteSpace: 'nowrap',
                    }}>
                      {sec.option}:{sec.weight}
                    </span>
                    {isWinner && (
                      <span style={{
                        position: 'absolute',
                        bottom: '-4px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        border: `2px solid ${sec.color}`,
                        zIndex: 10,
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TreeNodeComponent;
