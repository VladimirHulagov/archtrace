import React from 'react';
import { TreeNode } from './types';
import styles from './styles.module.css';

export interface InfoPanelProps {
  node: TreeNode | null;
  onClose: () => void;
  onEdit?: (node: TreeNode) => void;
}

const STATUS_LABELS: Record<string, string> = {
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  info: 'Info',
};

const TYPE_LABELS: Record<string, string> = {
  requirement: 'Requirement',
  decision: 'Decision',
  task: 'Task',
};

export const InfoPanel: React.FC<InfoPanelProps> = ({ node, onClose, onEdit }) => {
  if (!node) return null;

  return (
    <div className={styles.infoPanel}>
      <div className={styles.infoPanel__header}>
        <h3 className={styles.infoPanel__title}>Node Info</h3>
        <button
          className={styles.infoPanel__close}
          onClick={onClose}
          aria-label="Close info panel"
          type="button"
        >
          ×
        </button>
      </div>

      <div className={styles.infoPanel__body}>
        <div className={styles.infoPanel__field}>
          <span className={styles.infoPanel__label}>Title</span>
          <span className={styles.infoPanel__value}>{node.text}</span>
        </div>

        {node.description && (
          <div className={styles.infoPanel__field}>
            <span className={styles.infoPanel__label}>Description</span>
            <span className={styles.infoPanel__value}>{node.description}</span>
          </div>
        )}

        {node.nodeType && (
          <div className={styles.infoPanel__field}>
            <span className={styles.infoPanel__label}>Type</span>
            <span className={styles.infoPanel__value}>{TYPE_LABELS[node.nodeType] || node.nodeType}</span>
          </div>
        )}

        {node.status && (
          <div className={styles.infoPanel__field}>
            <span className={styles.infoPanel__label}>Status</span>
            <span className={styles.infoPanel__value}>
              <span className={`${styles.node__status} ${styles[`node__status--${node.status}`] || ''}`} />
              {STATUS_LABELS[node.status] || node.status}
            </span>
          </div>
        )}

        {node.voteTally && (
          <div className={styles.infoPanel__field}>
            <span className={styles.infoPanel__label}>Votes</span>
            <span className={styles.infoPanel__value}>{node.voteTally}</span>
          </div>
        )}

        {node.icon && (
          <div className={styles.infoPanel__field}>
            <span className={styles.infoPanel__label}>Icon</span>
            <span className={styles.infoPanel__value}>{node.icon}</span>
          </div>
        )}

        <div className={styles.infoPanel__field}>
          <span className={styles.infoPanel__label}>Position</span>
          <span className={styles.infoPanel__value}>{Math.round(node.x)}, {Math.round(node.y)}</span>
        </div>
      </div>

      {onEdit && (
        <div className={styles.infoPanel__footer}>
          <button
            className={`${styles.btn} ${styles['btn--primary']}`}
            onClick={() => onEdit(node)}
            type="button"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
};

export default InfoPanel;
