import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TreeNode } from './types';
import styles from './styles.module.css';

export interface ModalProps {
  node: TreeNode;
  isOpen: boolean;
  onSave?: (node: TreeNode) => void;
  onCancel: () => void;
  readOnly?: boolean;
  onEdit?: (node: TreeNode) => void;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Нет' },
  { value: 'success', label: 'Успех' },
  { value: 'warning', label: 'Предупреждение' },
  { value: 'error', label: 'Ошибка' },
  { value: 'info', label: 'Информация' },
];

const ICON_OPTIONS = [
  { value: '', label: 'None' },
  { value: '📄', label: 'Документ' },
  { value: '📁', label: 'Папка' },
  { value: '✓', label: 'Галочка' },
  { value: '★', label: 'Звезда' },
  { value: '●', label: 'Круг' },
];

export const Modal: React.FC<ModalProps> = ({ node, isOpen, onSave, onCancel, readOnly, onEdit }) => {
  const [title, setTitle] = useState(node.text);
  const [description, setDescription] = useState(node.description || '');
  const [status, setStatus] = useState(node.status || '');
  const [icon, setIcon] = useState(node.icon || '');
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(node.text);
      setDescription(node.description || '');
      setStatus(node.status || '');
      setIcon(node.icon || '');
      
      setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 0);
    }
  }, [isOpen, node]);

  const handleSave = useCallback(() => {
    if (!onSave) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    onSave({
      ...node,
      text: trimmedTitle,
      description: description.trim() || undefined,
      status: status || undefined,
      icon: icon || undefined,
    });
  }, [node, title, description, status, icon, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave, onCancel]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  }, [onCancel]);

  if (!isOpen) return null;

  return (
    <div 
      className={styles.modalOverlay} 
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className={styles.modal} ref={modalRef}>
        <div className={styles.modal__header}>
          <h3 className={styles.modal__title} id="modal-title">{readOnly ? 'Карточка решения' : 'Редактирование'}</h3>
          <button 
            className={styles.modal__close}
            onClick={onCancel}
            aria-label="Закрыть"
            type="button"
          >
            ×
          </button>
        </div>
        
        <div className={styles.modal__body}>
          <div className={styles.field}>
            <label className={styles.field__label} htmlFor="node-title">Название</label>
            {readOnly ? (
              <div className={styles.field__readonly}>{title}</div>
            ) : (
              <input
                id="node-title"
                ref={titleInputRef}
                type="text"
                className={styles.field__input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter node title"
              />
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.field__label} htmlFor="node-description">Контекст</label>
            {readOnly ? (
              <div className={styles.field__readonly}>{description || '—'}</div>
            ) : (
              <textarea
                id="node-description"
                className={styles.field__textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description (optional)"
                rows={3}
              />
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.field__label} htmlFor="node-status">Статус</label>
            {readOnly ? (
              <div className={styles.field__readonly}>{STATUS_OPTIONS.find(o => o.value === status)?.label || 'None'}</div>
            ) : (
              <select
                id="node-status"
                className={styles.field__select}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.field__label} htmlFor="node-icon">Иконка</label>
            {readOnly ? (
              <div className={styles.field__readonly}>{icon || 'None'}</div>
            ) : (
              <select
                id="node-icon"
                className={styles.field__select}
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
              >
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value ? `${opt.value} ${opt.label}` : opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className={styles.modal__footer}>
          {readOnly ? (
            onEdit && (
              <button
                className={`${styles.btn} ${styles['btn--primary']}`}
                onClick={() => onEdit(node)}
                type="button"
              >
                Edit
              </button>
            )
          ) : (
            <>
              <button
                className={`${styles.btn} ${styles['btn--secondary']}`}
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles['btn--primary']}`}
                onClick={handleSave}
                disabled={!title.trim()}
                type="button"
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
