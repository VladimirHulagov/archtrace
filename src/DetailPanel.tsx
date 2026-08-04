/**
 * DetailPanel — right sidebar with ADR details.
 *
 * Features:
 * - Resizable (drag left border to resize width)
 * - Expandable to centered modal (up to 90% viewport)
 * - Sections: Context (editable+versioned), Options (click-select+vote),
 *   Decision, Consequences, Comments
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { DecisionNode, Comment, Vote, CustomOption } from './api';
import {
  postComment, deleteCommentApi, castVoteApi, removeVoteApi, addCustomOptionApi,
} from './api';

const STATUS_ICONS: Record<string, string> = {
  accepted: '✅', rejected: '❌', proposed: '💡', debating: '🔥', superseded: '⏭️',
};

const STATUS_LABELS: Record<string, string> = {
  accepted: 'принято', rejected: 'отклонено', proposed: 'предложено',
  debating: 'обсуждение', superseded: 'заменено',
};

const TYPE_LABELS: Record<string, string> = {
  requirement: 'требование', decision: 'решение', task: 'задача',
};

const VOTE_COLORS: Record<string, string> = {
  A: '#52c41a', B: '#fa8c16', C: '#1890ff', D: '#722ed1',
};

type PanelMode = 'sidebar' | 'modal';

export interface DetailPanelProps {
  detail: DecisionNode;
  comments: Comment[];
  votes: Vote[];
  customOptions: CustomOption[];
  onCommentsChange: (c: Comment[]) => void;
  onVotesChange: (v: Vote[]) => void;
  onCustomOptionsChange: (o: CustomOption[]) => void;
  onClose: () => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  detail, comments, votes, customOptions,
  onCommentsChange, onVotesChange, onCustomOptionsChange, onClose,
}) => {
  const [mode, setMode] = useState<PanelMode>('sidebar');
  const [width, setWidth] = useState(420);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showAddOption, setShowAddOption] = useState(false);
  const [newOptionLetter, setNewOptionLetter] = useState('');
  const [newOptionTitle, setNewOptionTitle] = useState('');
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [editingContext, setEditingContext] = useState('');
  const [contextVersions, setContextVersions] = useState<string[]>([]);
  const [showContextHistory, setShowContextHistory] = useState(false);

  // ─── Resize logic ───────────────────────────────────────
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(320, Math.min(800, newWidth)));
    };
    const handleUp = () => { isResizing.current = false; document.body.style.cursor = ''; };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
  }, []);

  // ─── Parse body sections ────────────────────────────────
  const sections = parseAdrBody(detail.body);

  // ─── Compute vote data ──────────────────────────────────
  const allOptions = [
    ...(detail.options || []),
    ...customOptions.map(o => ({ letter: o.letter, title: o.title })),
  ];
  const userVote = votes.find(v => v.user_id === 1);
  const voteTally: Record<string, number> = {};
  for (const v of votes) { voteTally[v.option_letter] = (voteTally[v.option_letter] || 0) + v.weight; }
  const sortedTally = Object.entries(voteTally).sort(([, a], [, b]) => b - a);

  // ─── Handlers ───────────────────────────────────────────

  const handleVote = useCallback(async () => {
    if (!selectedOption) return;
    try {
      const weight = 3;
      const v = await castVoteApi(detail.id, selectedOption, weight);
      onVotesChange([...votes.filter(x => x.user_id !== v.user_id), v]);
      setSelectedOption(null);
    } catch (err) { console.error('Vote error:', err); }
  }, [selectedOption, detail, votes, onVotesChange]);

  const handleRemoveVote = useCallback(async () => {
    try {
      await removeVoteApi(detail.id);
      onVotesChange(votes.filter(v => v.user_id !== 1));
    } catch (err) { console.error('Remove vote error:', err); }
  }, [detail, votes, onVotesChange]);

  const handlePostComment = useCallback(async () => {
    if (!commentText.trim()) return;
    try {
      const c = await postComment(detail.id, commentText.trim());
      onCommentsChange([...comments, c]);
      setCommentText('');
    } catch (err) { console.error('Comment error:', err); }
  }, [commentText, detail, comments, onCommentsChange]);

  const handleDeleteComment = useCallback(async (id: number) => {
    await deleteCommentApi(id);
    onCommentsChange(comments.filter(c => c.id !== id));
  }, [comments, onCommentsChange]);

  const handleAddOption = useCallback(async () => {
    if (!newOptionLetter.trim() || !newOptionTitle.trim()) return;
    try {
      const opt = await addCustomOptionApi(detail.id, newOptionLetter.trim().toUpperCase(), newOptionTitle.trim());
      onCustomOptionsChange([...customOptions, opt]);
      setNewOptionLetter(''); setNewOptionTitle(''); setShowAddOption(false);
    } catch (err) { console.error('Add option error:', err); }
  }, [newOptionLetter, newOptionTitle, detail, customOptions, onCustomOptionsChange]);

  const handleSaveContext = useCallback(() => {
    // Save context version to local state (versioning)
    const newVersions = [...contextVersions, editingContext];
    setContextVersions(newVersions);
    setIsEditingContext(false);
    // TODO: API call to persist context change
  }, [editingContext, contextVersions]);

  // ─── Compute styles based on mode ───────────────────────
  const isModal = mode === 'modal';

  const containerStyle: React.CSSProperties = isModal ? {
    position: 'fixed', top: '5vh', left: '5vw',
    width: '90vw', height: '90vh', zIndex: 2000,
    background: '#fff', borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  } : {
    width: `${width}px`, height: '100vh', flexShrink: 0,
    borderLeft: '1px solid #e0e0e0', background: '#fafafa',
    position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  };

  const contentScrollStyle: React.CSSProperties = {
    flex: 1, overflowY: 'auto', padding: '20px',
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <>
      {/* Modal backdrop */}
      {isModal && (
        <div onClick={() => setMode('sidebar')} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          zIndex: 1999,
        }} />
      )}

      <div style={containerStyle}>
        {/* Resize handle (sidebar mode only) */}
        {!isModal && (
          <div
            ref={resizeRef}
            onMouseDown={startResize}
            style={{
              position: 'absolute', left: -3, top: 0, width: 6, height: '100%',
              cursor: 'col-resize', zIndex: 10,
              background: 'transparent',
            }}
          />
        )}

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid #e8e8e8',
          background: '#fff', flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>
            {STATUS_ICONS[detail.status] || '📄'} ADR-{detail.id}
          </h2>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setMode(m => m === 'sidebar' ? 'modal' : 'sidebar')}
              title={isModal ? 'Свернуть в панель' : 'Развернуть'}
              style={{
                border: '1px solid #d0d0d0', background: '#fff', borderRadius: '4px',
                padding: '4px 8px', cursor: 'pointer', fontSize: '14px',
              }}
            >
              {isModal ? '⬐' : '⬔'}
            </button>
            <button onClick={onClose} title="Закрыть" style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '20px', color: '#999',
            }}>×</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={contentScrollStyle}>
          <h3 style={{ marginTop: 0, fontSize: '16px' }}>{detail.title}</h3>

          {/* Tags */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: statusColor(detail.status), fontSize: '11px', color: '#fff' }}>
              {STATUS_LABELS[detail.status] || detail.status}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e0e0', fontSize: '11px' }}>
              {TYPE_LABELS[detail.type] || detail.type}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e0e0', fontSize: '11px' }}>
              {detail.created}
            </span>
          </div>

          {/* ─── КОНТЕКСТ ─────────────────────────────── */}
          <Section title="Контекст" accent="#1890ff">
            {isEditingContext ? (
              <div>
                <textarea
                  value={editingContext}
                  onChange={e => setEditingContext(e.target.value)}
                  style={{
                    width: '100%', minHeight: '80px', padding: '8px',
                    border: '1px solid #1890ff', borderRadius: '4px',
                    fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button onClick={handleSaveContext} style={btnPrimary}>Сохранить</button>
                  <button onClick={() => { setIsEditingContext(false); }} style={btnSecondary}>Отмена</button>
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#333' }}>
                  <ReactMarkdown>{sections.context || '*Контекст не указан*'}</ReactMarkdown>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button onClick={() => { setEditingContext(sections.context || ''); setIsEditingContext(true); }} style={btnLink}>
                    ✏️ Редактировать
                  </button>
                  {contextVersions.length > 0 && (
                    <button onClick={() => setShowContextHistory(!showContextHistory)} style={btnLink}>
                      📜 Версии ({contextVersions.length})
                    </button>
                  )}
                </div>
                {/* Version history */}
                {showContextHistory && contextVersions.map((v, i) => (
                  <div key={i} style={{
                    marginTop: '6px', padding: '8px', background: '#f5f5f5',
                    borderRadius: '4px', fontSize: '12px', borderLeft: '3px solid #1890ff',
                  }}>
                    <div style={{ color: '#999', marginBottom: '4px' }}>Версия {contextVersions.length - i}</div>
                    {v}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ─── ОПЦИИ ───────────────────────────────── */}
          <Section title="Опции" accent="#722ed1">
            {/* Option list with click-to-select */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
              {allOptions.map(opt => {
                const isSelected = selectedOption === opt.letter;
                const isVoted = userVote?.option_letter === opt.letter;
                const w = voteTally[opt.letter] || 0;
                const color = VOTE_COLORS[opt.letter] || '#8c8c8c';
                return (
                  <div
                    key={opt.letter}
                    onClick={() => setSelectedOption(isSelected ? null : opt.letter)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                      borderRadius: '4px', cursor: 'pointer',
                      border: `2px solid ${isSelected ? color : isVoted ? color + '88' : '#e0e0e0'}`,
                      background: isSelected ? color + '15' : isVoted ? color + '08' : '#fff',
                    }}
                  >
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '24px', height: '24px', borderRadius: '4px',
                      background: color, color: '#fff', fontWeight: 'bold', fontSize: '13px',
                    }}>{opt.letter}</span>
                    <span style={{ flex: 1, fontSize: '13px', color: '#333' }}>{opt.title}</span>
                    {w > 0 && (
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', background: color + '20',
                        color: color, fontSize: '11px', fontWeight: 'bold',
                      }}>{w} голосов</span>
                    )}
                    {isVoted && <span title="Ваш голос" style={{ fontSize: '14px' }}>✅</span>}
                  </div>
                );
              })}
            </div>

            {/* Add custom option */}
            {showAddOption ? (
              <div style={{ marginBottom: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input type="text" placeholder="Буква" value={newOptionLetter} onChange={e => setNewOptionLetter(e.target.value)} style={inputStyle(60)} />
                  <input type="text" placeholder="Название варианта..." value={newOptionTitle} onChange={e => setNewOptionTitle(e.target.value)} style={inputStyle(0)} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddOption} style={btnPrimary}>Добавить</button>
                  <button onClick={() => setShowAddOption(false)} style={btnSecondary}>Отмена</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddOption(true)} style={{ ...btnLink, marginBottom: '8px' }}>
                + Добавить вариант
              </button>
            )}

            {/* Vote button */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handleVote}
                disabled={!selectedOption}
                style={{
                  padding: '8px 24px', borderRadius: '4px', border: 'none',
                  background: selectedOption ? '#1890ff' : '#d0d0d0',
                  color: '#fff', cursor: selectedOption ? 'pointer' : 'not-allowed',
                  fontSize: '14px', fontWeight: 'bold',
                }}
              >
                {selectedOption ? `Проголосовать за ${selectedOption}` : 'Выберите вариант'}
              </button>
              {userVote && (
                <button onClick={handleRemoveVote} style={{
                  padding: '4px 12px', borderRadius: '4px', border: '1px solid #ffccc7',
                  background: '#fff2f0', color: '#ff4d4f', cursor: 'pointer', fontSize: '12px',
                }}>✕ Отменить голос</button>
              )}
            </div>

            {/* Vote table */}
            {sortedTally.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '12px' }}>
                <thead><tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Вариант</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>Вес</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Голосовавшие</th>
                </tr></thead>
                <tbody>
                  {sortedTally.map(([opt, w]) => (
                    <tr key={opt} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px', fontWeight: 'bold', color: VOTE_COLORS[opt] || '#333' }}>{opt}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{w}</td>
                      <td style={{ padding: '4px', color: '#666', fontSize: '11px' }}>
                        {votes.filter(v => v.option_letter === opt).map(v => v.username || '?').join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* ─── РЕШЕНИЕ ─────────────────────────────── */}
          {sections.decision && (
            <Section title="Решение" accent="#52c41a">
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#333' }}>
                <ReactMarkdown>{sections.decision}</ReactMarkdown>
              </div>
            </Section>
          )}

          {/* ─── ПОСЛЕДСТВИЯ ────────────────────────── */}
          {sections.consequences && (
            <Section title="Последствия" accent="#fa8c16">
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#333' }}>
                <ReactMarkdown>{sections.consequences}</ReactMarkdown>
              </div>
            </Section>
          )}

          {/* ─── КОММЕНТАРИИ ─────────────────────────── */}
          <Section title={`Комментарии (${comments.length})`} accent="#8c8c8c">
            {comments.map(c => (
              <div key={c.id} style={{
                marginBottom: '8px', padding: '8px', background: '#fff',
                borderRadius: '4px', border: '1px solid #e8e8e8',
                marginLeft: c.parent_comment_id ? '20px' : '0',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{c.author_name || 'Аноним'}</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#999' }}>
                      {new Date(c.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={() => handleDeleteComment(c.id)} style={btnIcon}>×</button>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#333', lineHeight: 1.4 }}>{c.content}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <input
                type="text" placeholder="Написать комментарий..."
                value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handlePostComment(); }}
                style={{ flex: 1, padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '13px' }}
              />
              <button onClick={handlePostComment} disabled={!commentText.trim()} style={{
                padding: '6px 14px', borderRadius: '4px', border: 'none',
                background: commentText.trim() ? '#1890ff' : '#d0d0d0',
                color: '#fff', cursor: commentText.trim() ? 'pointer' : 'not-allowed', fontSize: '13px',
              }}>Отправить</button>
            </div>
          </Section>

          {/* Source file info */}
          <div style={{ marginTop: '16px', paddingTop: '8px', borderTop: '1px solid #e0e0e0', fontSize: '11px', color: '#aaa' }}>
            Файл: {detail.file}
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Helper components ─────────────────────────────────────

const Section: React.FC<{ title: string; accent: string; children: React.ReactNode }> = ({ title, accent, children }) => (
  <div style={{ marginBottom: '16px' }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
    }}>
      <div style={{ width: '4px', height: '16px', background: accent, borderRadius: '2px' }} />
      <h4 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{title}</h4>
    </div>
    {children}
  </div>
);

// ─── Style helpers ─────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  padding: '4px 12px', background: '#1890ff', color: '#fff',
  border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
};
const btnSecondary: React.CSSProperties = {
  padding: '4px 12px', background: '#f0f0f0', color: '#333',
  border: '1px solid #d0d0d0', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
};
const btnLink: React.CSSProperties = {
  padding: '2px 8px', background: 'transparent', border: 'none',
  color: '#1890ff', cursor: 'pointer', fontSize: '12px',
};
const btnIcon: React.CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer',
  color: '#ff4d4f', fontSize: '14px',
};
const inputStyle = (w: number): React.CSSProperties => ({
  width: w || 'auto', flex: w ? 'none' : 1, padding: '4px',
  border: '1px solid #d0d0d0', borderRadius: '3px', fontSize: '13px',
});

// ─── ADR body parser ───────────────────────────────────────

interface AdrSections {
  context: string;
  options: string;
  decision: string;
  consequences: string;
  other: string;
}

function parseAdrBody(body: string): AdrSections {
  const sections: AdrSections = { context: '', options: '', decision: '', consequences: '', other: '' };

  // Match ## headers to split sections
  const headerRegex = /^## (.+)$/gm;
  const matches: { title: string; start: number; end: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(body)) !== null) {
    matches.push({
      title: m[1].trim().toLowerCase(),
      start: m.index + m[0].length,
      end: body.length,
    });
  }

  // Set ends
  for (let i = 0; i < matches.length; i++) {
    matches[i].end = i + 1 < matches.length ? matches[i + 1].start - matches[i + 1].title.length - 3 : body.length;
  }

  for (const match of matches) {
    const content = body.substring(match.start, match.end).trim();
    if (match.title === 'context' || match.title === 'контекст' || match.title === 'контекста') {
      sections.context = content;
    } else if (match.title === 'options' || match.title === 'опции' || match.title === 'варианты') {
      sections.options = content;
    } else if (match.title === 'decision' || match.title === 'решение') {
      sections.decision = content;
    } else if (match.title === 'consequences' || match.title === 'последствия') {
      sections.consequences = content;
    }
  }

  return sections;
}

function statusColor(status: string): string {
  switch (status) {
    case 'accepted': return '#52c41a';
    case 'rejected': return '#ff4d4f';
    case 'proposed': return '#1890ff';
    case 'debating': return '#fa8c16';
    case 'superseded': return '#8c8c8c';
    default: return '#8c8c8c';
  }
}
