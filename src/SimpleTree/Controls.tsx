import React from 'react';
import styles from './styles.module.css';

export interface ControlsProps {
  selectedNodeId: string | null;
  selectedConnectionId: string | null;
  isConnectingMode: boolean;
  connectionSourceId: string | null;
  onAddNode: () => void;
  onDeleteNode: () => void;
  onToggleConnectMode: () => void;
  onDeleteConnection: () => void;
  onCancelConnection?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  selectedNodeId,
  selectedConnectionId,
  isConnectingMode,
  connectionSourceId,
  onAddNode,
  onDeleteNode,
  onToggleConnectMode,
  onDeleteConnection,
  onCancelConnection,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}) => {
  const canDeleteNode = selectedNodeId !== null;
  const canDeleteConnection = selectedConnectionId !== null;
  const isInConnectionProcess = isConnectingMode && connectionSourceId !== null;

  const handleConnectClick = () => {
    if (isInConnectionProcess && onCancelConnection) {
      onCancelConnection();
    } else {
      onToggleConnectMode();
    }
  };

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.controls__btn}
        onClick={onAddNode}
        title="Add node"
        aria-label="Add node"
      >
        <span className={styles['controls__btn--icon']}>+</span>
      </button>

      <button
        type="button"
        className={styles.controls__btn}
        onClick={onDeleteNode}
        disabled={!canDeleteNode}
        title="Delete selected node"
        aria-label="Delete selected node"
      >
        <span className={styles['controls__btn--icon']}>−</span>
      </button>

      <button
        type="button"
        className={`${styles.controls__btn} ${isConnectingMode ? styles['controls__btn--active'] : ''}`}
        onClick={handleConnectClick}
        title={isInConnectionProcess ? 'Cancel connection' : isConnectingMode ? 'Exit connection mode' : 'Enter connection mode'}
        aria-label={isInConnectionProcess ? 'Cancel connection' : isConnectingMode ? 'Exit connection mode' : 'Enter connection mode'}
        aria-pressed={isConnectingMode}
      >
        <span className={styles['controls__btn--icon']}>↔</span>
      </button>

      <button
        type="button"
        className={styles.controls__btn}
        onClick={onDeleteConnection}
        disabled={!canDeleteConnection}
        title="Delete selected connection"
        aria-label="Delete selected connection"
      >
        <span className={styles['controls__btn--icon']}>✕</span>
      </button>

      {onZoomIn && onZoomOut && (
        <>
          <span className={styles.controls__divider} />
          <button
            type="button"
            className={styles.controls__btn}
            onClick={onZoomIn}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <span className={styles['controls__btn--icon']}>+</span>
          </button>

          <button
            type="button"
            className={styles.controls__btn}
            onClick={onZoomOut}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <span className={styles['controls__btn--icon']}>−</span>
          </button>

          <button
            type="button"
            className={styles.controls__btn}
            onClick={onZoomReset}
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            <span className={styles['controls__btn--icon']}>⤄</span>
          </button>
        </>
      )}
    </div>
  );
};

export default Controls;
