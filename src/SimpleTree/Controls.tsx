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
        title="Добавить карточку"
        aria-label="Добавить карточку"
      >
        <span className={styles['controls__btn--icon']}>+</span>
      </button>

      <button
        type="button"
        className={styles.controls__btn}
        onClick={onDeleteNode}
        disabled={!canDeleteNode}
        title="Удалить выбранную карточку"
        aria-label="Удалить выбранную карточку"
      >
        <span className={styles['controls__btn--icon']}>−</span>
      </button>

      <button
        type="button"
        className={`${styles.controls__btn} ${isConnectingMode ? styles['controls__btn--active'] : ''}`}
        onClick={handleConnectClick}
        title={isInConnectionProcess ? 'Отменить связь' : isConnectingMode ? 'Выйти из режима связей' : 'Создать связь между карточками'}
        aria-label={isInConnectionProcess ? 'Отменить связь' : isConnectingMode ? 'Выйти из режима связей' : 'Создать связь между карточками'}
        aria-pressed={isConnectingMode}
      >
        <span className={styles['controls__btn--icon']}>↔</span>
      </button>

      <button
        type="button"
        className={styles.controls__btn}
        onClick={onDeleteConnection}
        disabled={!canDeleteConnection}
        title="Удалить выбранную связь"
        aria-label="Удалить выбранную связь"
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
            title="Увеличить"
            aria-label="Увеличить"
          >
            <span className={styles['controls__btn--icon']}>+</span>
          </button>

          <button
            type="button"
            className={styles.controls__btn}
            onClick={onZoomOut}
            title="Уменьшить"
            aria-label="Уменьшить"
          >
            <span className={styles['controls__btn--icon']}>−</span>
          </button>

          <button
            type="button"
            className={styles.controls__btn}
            onClick={onZoomReset}
            title="Сбросить масштаб"
            aria-label="Сбросить масштаб"
          >
            <span className={styles['controls__btn--icon']}>⤄</span>
          </button>
        </>
      )}
    </div>
  );
};

export default Controls;
