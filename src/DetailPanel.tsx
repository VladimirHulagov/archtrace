/**
 * DetailPanel — right sidebar with ADR details.
 * Resizable, expandable to modal, sections, comments with likes/sorting.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { DecisionNode, Comment, Vote, CustomOption } from './api';
import {
  postComment, deleteCommentApi, castVoteApi, removeVoteApi, addCustomOptionApi, updateCustomOptionApi,
  updateDecision,
  startAnalysis, getAnalysisStatus,
  reactToComment,
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
type CommentSort = 'date' | 'rating';

export interface DetailPanelProps {
  detail: DecisionNode;
  comments: Comment[];
  votes: Vote[];
  customOptions: CustomOption[];
  currentUserId: number;
  currentRole: string;
  onCommentsChange: (c: Comment[]) => void;
  onVotesChange: (v: Vote[]) => void;
  onCustomOptionsChange: (o: CustomOption[]) => void;
  onClose: () => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  detail, comments, votes, customOptions,
  currentUserId, currentRole,
  onCommentsChange, onVotesChange, onCustomOptionsChange, onClose,
}) => {
  const [mode, setMode] = useState<PanelMode>('sidebar');
  const [width, setWidth] = useState(420);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showAddOption, setShowAddOption] = useState(false);
  const [newOptionTitle, setNewOptionTitle] = useState('');
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [editingContext, setEditingContext] = useState('');
  const [contextVersions, setContextVersions] = useState<string[]>([]);
  const [showContextHistory, setShowContextHistory] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [commentSort, setCommentSort] = useState<CommentSort>('date');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [editingOptionLetter, setEditingOptionLetter] = useState<string | null>(null);
  const [editingOptionTitle, setEditingOptionTitle] = useState('');

  // ─── Resize logic ───────────────────────────────────────
  const isResizing = useRef(false);
  const swipeStartX = useRef<number | null>(null);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const nw = window.innerWidth - e.clientX;
      setWidth(Math.max(320, Math.min(800, nw)));
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
  const allOptions = useMemo(() => [
    ...(detail.options || []),
    ...customOptions.map(o => ({ letter: o.letter, title: o.title })),
  ], [detail.options, customOptions]);

  const userVote = votes.find(v => v.user_id === currentUserId);
  const voteTally: Record<string, number> = {};
  for (const v of votes) { voteTally[v.option_letter] = (voteTally[v.option_letter] || 0) + v.weight; }
  const sortedTally = Object.entries(voteTally).sort(([, a], [, b]) => b - a);

  // ─── Sorted comments ────────────────────────────────────
  const sortedComments = useMemo(() => {
    const arr = [...comments];
    if (commentSort === 'rating') {
      arr.sort((a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes));
    } else {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return arr;
  }, [comments, commentSort]);

  // ─── Handlers ───────────────────────────────────────────

  const handleVote = useCallback(async () => {
    if (!selectedOption) return;
    try {
      const w = currentRole === 'architect' ? 3 : currentRole === 'senior' ? 2 : 1;
      const v = await castVoteApi(detail.id, selectedOption, w, undefined, currentUserId);
      onVotesChange([...votes.filter(x => x.user_id !== v.user_id), v]);
      setSelectedOption(null);
    } catch (err) { console.error('Vote error:', err); }
  }, [selectedOption, detail, votes, onVotesChange]);

  const handleRemoveVote = useCallback(async () => {
    try {
      await removeVoteApi(detail.id, currentUserId);
      onVotesChange(votes.filter(v => v.user_id !== currentUserId));
    } catch (err) { console.error('Remove vote error:', err); }
  }, [detail, votes, onVotesChange]);

  const handlePostComment = useCallback(async () => {
    if (!commentText.trim()) return;
    try {
      const c = await postComment(detail.id, commentText.trim(), undefined, currentUserId);
      onCommentsChange([...comments, c]);
      setCommentText('');
    } catch (err) { console.error('Comment error:', err); }
  }, [commentText, detail, comments, onCommentsChange]);

  const handleDeleteComment = useCallback(async (id: number) => {
    await deleteCommentApi(id);
    onCommentsChange(comments.filter(c => c.id !== id));
  }, [comments, onCommentsChange]);

  const handleReact = useCallback(async (commentId: number, reaction: 'like' | 'dislike') => {
    try {
      const result = await reactToComment(commentId, reaction, currentUserId);
      onCommentsChange(comments.map(c =>
        c.id === commentId
          ? { ...c, likes: result.likes, dislikes: result.dislikes, user_reaction: result.userReaction }
          : c
      ));
    } catch (err) { console.error('Reaction error:', err); }
  }, [comments, onCommentsChange]);

  const handleAddOption = useCallback(async () => {
    if (!newOptionTitle.trim()) return;
    // Auto-compute next letter: A, B, C, D, E, F...
    const usedLetters = new Set(allOptions.map(o => o.letter));
    let nextLetter = '';
    for (let i = 65; i <= 90; i++) {
      const l = String.fromCharCode(i);
      if (!usedLetters.has(l)) { nextLetter = l; break; }
    }
    if (!nextLetter) nextLetter = String.fromCharCode(65 + allOptions.length);
    try {
      const opt = await addCustomOptionApi(detail.id, nextLetter, newOptionTitle.trim());
      onCustomOptionsChange([...customOptions, opt]);
      setNewOptionTitle(''); setShowAddOption(false);
    } catch (err) { console.error('Add option error:', err); }
  }, [newOptionTitle, detail, customOptions, onCustomOptionsChange, allOptions]);

  const handleUpdateOption = useCallback(async (letter: string) => {
    if (!editingOptionTitle.trim()) { setEditingOptionLetter(null); return; }
    try {
      const updated = await updateCustomOptionApi(detail.id, letter, editingOptionTitle.trim());
      onCustomOptionsChange(customOptions.map(o => o.letter === letter ? updated : o));
    } catch (err) { console.error('Update option error:', err); }
    setEditingOptionLetter(null); setEditingOptionTitle('');
  }, [editingOptionTitle, detail, customOptions, onCustomOptionsChange]);

  // ─── Title edit handler ────────────────────────────────

  const handleSaveTitle = useCallback(async () => {
    if (!editingTitle.trim()) { setIsEditingTitle(false); return; }
    try {
      await updateDecision(detail.id, { title: editingTitle.trim() });
      // Update is local — graph reload will pick up the change from git
      setIsEditingTitle(false);
    } catch (err) { console.error('Title update error:', err); }
  }, [editingTitle, detail]);

  // ─── AI Analysis handler ────────────────────────────────

  const analysisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollAnalysis = useCallback(() => {
    if (analysisTimer.current) clearTimeout(analysisTimer.current);
    analysisTimer.current = setTimeout(async () => {
      const status = await getAnalysisStatus(detail.id);
      if (status.analyzing) {
        pollAnalysis(); // keep polling
      } else {
        setAnalyzing(false);
        if (status.analysis) setAiAnalysis(status.analysis);
      }
    }, 3000);
  }, [detail.id]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setAiError('');
    try {
      await startAnalysis(detail.id);
      pollAnalysis();
    } catch (err: any) {
      setAiError(err.message);
      setAnalyzing(false);
    }
  }, [detail, pollAnalysis]);

  // Load existing analysis on mount
  useEffect(() => {
    setAiAnalysis(null);
    setAiError('');
    setAnalyzing(false);
    getAnalysisStatus(detail.id).then(s => {
      if (s.analyzing) { setAnalyzing(true); pollAnalysis(); }
      else if (s.analysis) setAiAnalysis(s.analysis);
    }).catch(() => {});
    return () => { if (analysisTimer.current) clearTimeout(analysisTimer.current); };
  }, [detail.id, pollAnalysis]);

  const handleSaveContext = useCallback(() => {
    const nv = [...contextVersions, editingContext];
    setContextVersions(nv);
    setIsEditingContext(false);
  }, [editingContext, contextVersions]);

  // ─── Styles ─────────────────────────────────────────────
  const isModal = mode === 'modal';

  const containerStyle: React.CSSProperties = isModal ? {
    position: 'fixed', top: '5vh', left: '5vw',
    width: '90vw', height: '90vh', zIndex: 2000,
    background: '#fff', borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  } : {
    width: `${width}px`, height: '100vh', flexShrink: 0,
    borderLeft: '1px solid #e0e0e0', background: '#fafafa',
    position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  };

  return (
    <>
      {isModal && (
        <div onClick={() => setMode('sidebar')} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1999,
        }} />
      )}

      <div
        style={containerStyle}
        onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (swipeStartX.current !== null) {
            const dx = e.changedTouches[0].clientX - swipeStartX.current;
            if (dx > 50) onClose();
            swipeStartX.current = null;
          }
        }}
      >
        {/* Resize handle */}
        {!isModal && (
          <div onMouseDown={startResize} style={{
            position: 'absolute', left: -4, top: 0, width: 8, height: '100%',
            cursor: 'col-resize', zIndex: 10,
          }} />
        )}

        {/* Header with prominent expand/close buttons */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderBottom: '1px solid #e8e8e8',
          background: '#fff', flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '15px', color: '#333' }}>
            {STATUS_ICONS[detail.status] || '📄'} ADR-{detail.id}
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setMode(m => m === 'sidebar' ? 'modal' : 'sidebar')}
              title={isModal ? 'Свернуть в панель' : 'Развернуть'}
              style={{
                border: '1px solid #d0d0d0', background: '#fff', borderRadius: '4px',
                padding: '5px 10px', cursor: 'pointer', fontSize: '16px',
                color: '#666',
              }}
            >
              {isModal ? '⬐' : '⤢'}
            </button>
            <button onClick={onClose} title="Закрыть" style={{
              border: '1px solid #d0d0d0', background: '#fff', borderRadius: '4px',
              padding: '5px 10px', cursor: 'pointer', fontSize: '16px', color: '#666',
            }}>×</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {isEditingTitle ? (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
              <input
                type="text"
                value={editingTitle}
                onChange={e => setEditingTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                onBlur={handleSaveTitle}
                style={{ flex: 1, fontSize: '15px', padding: '4px 8px', border: '1px solid #1890ff', borderRadius: '4px', fontFamily: 'inherit' }}
                autoFocus
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ marginTop: 0, fontSize: '15px', margin: 0 }}>{detail.title}</h3>
              <button
                onClick={() => { setEditingTitle(detail.title); setIsEditingTitle(true); }}
                title="Редактировать название"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: '#1890ff', padding: '0' }}
              >✏️</button>
            </div>
          )}

          {/* Tags */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: statusColor(detail.status), fontSize: '11px', color: '#fff' }}>
              {STATUS_LABELS[detail.status] || detail.status}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e0e0', fontSize: '11px' }}>
              {TYPE_LABELS[detail.type] || detail.type}
            </span>
          </div>

          {/* КОНТЕКСТ */}
          <Section title="Контекст" accent="#1890ff">
            {isEditingContext ? (
              <div>
                <textarea value={editingContext} onChange={e => setEditingContext(e.target.value)} style={{
                  width: '100%', minHeight: '80px', padding: '8px',
                  border: '1px solid #1890ff', borderRadius: '4px',
                  fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
                }} autoFocus />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button onClick={handleSaveContext} style={btnPrimary}>Сохранить</button>
                  <button onClick={() => setIsEditingContext(false)} style={btnSecondary}>Отмена</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#333' }}>
                  <ReactMarkdown>{sections.context || '*Контекст не указан*'}</ReactMarkdown>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button onClick={() => { setEditingContext(sections.context || ''); setIsEditingContext(true); }} style={btnLink}>✏️ Редактировать</button>
                  {contextVersions.length > 0 && (
                    <button onClick={() => setShowContextHistory(!showContextHistory)} style={btnLink}>📜 Версии ({contextVersions.length})</button>
                  )}
                </div>
                {showContextHistory && contextVersions.map((v, i) => (
                  <div key={i} style={{ marginTop: '6px', padding: '8px', background: '#f5f5f5', borderRadius: '4px', fontSize: '12px', borderLeft: '3px solid #1890ff' }}>
                    <div style={{ color: '#999', marginBottom: '4px' }}>Версия {contextVersions.length - i}</div>
                    {v}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ОПЦИИ */}
          <Section title="Опции" accent="#722ed1">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
              {allOptions.map(opt => {
                const isSel = selectedOption === opt.letter;
                const isVoted = userVote?.option_letter === opt.letter;
                const w = voteTally[opt.letter] || 0;
                const color = VOTE_COLORS[opt.letter] || '#8c8c8c';
                return (
                  <div key={opt.letter}
                      onClick={() => setSelectedOption(isSel ? null : opt.letter)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        const isCustom = customOptions.some(co => co.letter === opt.letter);
                        if (isCustom) { setEditingOptionLetter(opt.letter); setEditingOptionTitle(opt.title); }
                      }}
                      title="Двойной клик — редактировать"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                        borderRadius: '4px', cursor: 'pointer',
                        border: `2px solid ${isSel ? color : isVoted ? color + '88' : '#e0e0e0'}`,
                        background: isSel ? color + '15' : isVoted ? color + '08' : '#fff',
                      }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '4px', background: color, color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>{opt.letter}</span>
                    {editingOptionLetter === opt.letter ? (
                      <input type="text" value={editingOptionTitle}
                        onChange={e => setEditingOptionTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleUpdateOption(opt.letter); }
                          if (e.key === 'Escape') { setEditingOptionLetter(null); }
                        }}
                        onBlur={() => handleUpdateOption(opt.letter)}
                        autoFocus
                        style={{ flex: 1, padding: '3px 6px', border: '1px solid #1890ff', borderRadius: '3px', fontSize: '13px' }} />
                    ) : (
                      <span style={{ flex: 1, fontSize: '13px', color: '#333' }}>{opt.title}</span>
                    )}
                    {w > 0 && <span style={{ padding: '2px 8px', borderRadius: '10px', background: color + '20', color, fontSize: '11px', fontWeight: 'bold' }}>{w}</span>}
                    {isVoted && <span style={{ fontSize: '14px' }}>✅</span>}
                  </div>
                );
              })}
            </div>

            {showAddOption ? (
              <div style={{ marginBottom: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input type="text" placeholder="Название варианта..." value={newOptionTitle} onChange={e => setNewOptionTitle(e.target.value)} style={{ flex: 1, padding: '4px', border: '1px solid #d0d0d0', borderRadius: '3px', fontSize: '13px' }} autoFocus />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddOption} style={btnPrimary}>Добавить</button>
                  <button onClick={() => setShowAddOption(false)} style={btnSecondary}>Отмена</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddOption(true)} style={{ ...btnLink, marginBottom: '8px' }}>+ Добавить вариант</button>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={handleVote} disabled={!selectedOption} style={{
                padding: '8px 24px', borderRadius: '4px', border: 'none',
                background: selectedOption ? '#1890ff' : '#d0d0d0',
                color: '#fff', cursor: selectedOption ? 'pointer' : 'not-allowed',
                fontSize: '14px', fontWeight: 'bold',
              }}>{selectedOption ? `Проголосовать за ${selectedOption}` : 'Выберите вариант'}</button>
              {userVote && (
                <button onClick={handleRemoveVote} style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid #ffccc7', background: '#fff2f0', color: '#ff4d4f', cursor: 'pointer', fontSize: '12px' }}>✕ Отменить</button>
              )}
            </div>

            {sortedTally.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '10px' }}>
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
                      <td style={{ padding: '4px', color: '#666', fontSize: '11px' }}>{votes.filter(v => v.option_letter === opt).map(v => v.username || '?').join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* РЕШЕНИЕ */}
          {sections.decision && (
            <Section title="Решение" accent="#52c41a">
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#333' }}>
                <ReactMarkdown>{sections.decision}</ReactMarkdown>
              </div>
            </Section>
          )}

          {/* ПОСЛЕДСТВИЯ */}
          {sections.consequences && (
            <Section title="Последствия" accent="#fa8c16">
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#333' }}>
                <ReactMarkdown>{sections.consequences}</ReactMarkdown>
              </div>
            </Section>
          )}

          {/* ─── AI АНАЛИЗ ─────────────────────────────────── */}
          <Section title="🔥 AI-анализ" accent="#fa541c">
            {analyzing ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                <span style={{ fontSize: '20px' }}>🔥</span> Анализирую архитектуру...
              </div>
            ) : aiAnalysis ? (
              <div>
                <div style={{ fontSize: '12px', lineHeight: 1.6, color: '#333',
                  background: '#fff7e6', padding: '10px', borderRadius: '4px',
                  border: '1px solid #ffd591',
                }}>
                  <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                </div>
                <button onClick={handleAnalyze} style={{
                  ...btnLink, marginTop: '6px', color: '#fa541c',
                }}>🔄 Обновить анализ</button>
              </div>
            ) : (
              <div>
                {aiError && <div style={{ color: '#ff4d4f', fontSize: '11px', marginBottom: '6px' }}>{aiError}</div>}
                <button onClick={handleAnalyze} style={{
                  padding: '8px 16px', borderRadius: '4px', border: '1px solid #fa541c',
                  background: '#fff', color: '#fa541c', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  🔥 Прожарить
                </button>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  Анализ покрытия требований и архитектурных противоречий
                </div>
              </div>
            )}
          </Section>

          {/* КОММЕНТАРИИ с лайками и сортировкой */}
          <Section title={`Комментарии (${comments.length})`} accent="#8c8c8c">
            {/* Sort toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <button
                onClick={() => setCommentSort(s => s === 'date' ? 'rating' : 'date')}
                style={{
                  border: '1px solid #d0d0d0', background: '#fff', borderRadius: '4px',
                  padding: '3px 8px', cursor: 'pointer', fontSize: '11px',
                  display: 'flex', alignItems: 'center', gap: '4px', color: '#666',
                }}
                title="Сортировка"
              >
                {commentSort === 'date' ? '📅 по дате' : '⭐ по рейтингу'}
                <span style={{ fontSize: '10px' }}>↕</span>
              </button>
            </div>

            {/* Comment list */}
            {sortedComments.map(c => {
              const score = (c.likes || 0) - (c.dislikes || 0);
              const userLiked = c.user_reaction === 'like';
              const userDisliked = c.user_reaction === 'dislike';
              return (
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
                      <button
                        onClick={() => {
                          if (confirm('Удалить комментарий?')) handleDeleteComment(c.id);
                        }}
                        title="Удалить"
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer',
                          color: '#cc4444', fontSize: '14px', padding: '2px',
                        }}
                      >🗑</button>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#333', lineHeight: 1.4, marginBottom: '6px' }}>{c.content}</div>
                  {/* Like/dislike buttons */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => handleReact(c.id, 'like')}
                      style={{
                        border: `1px solid ${userLiked ? '#52c41a' : '#d0d0d0'}`,
                        background: userLiked ? '#f6ffed' : '#fff',
                        borderRadius: '3px', padding: '2px 8px', cursor: 'pointer',
                        fontSize: '12px', color: userLiked ? '#52c41a' : '#999',
                        display: 'flex', alignItems: 'center', gap: '3px',
                      }}
                    >👍 {c.likes || 0}</button>
                    <button
                      onClick={() => handleReact(c.id, 'dislike')}
                      style={{
                        border: `1px solid ${userDisliked ? '#ff4d4f' : '#d0d0d0'}`,
                        background: userDisliked ? '#fff2f0' : '#fff',
                        borderRadius: '3px', padding: '2px 8px', cursor: 'pointer',
                        fontSize: '12px', color: userDisliked ? '#ff4d4f' : '#999',
                        display: 'flex', alignItems: 'center', gap: '3px',
                      }}
                    >👎 {c.dislikes || 0}</button>
                    {score !== 0 && (
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: score > 0 ? '#52c41a' : '#ff4d4f' }}>
                        {score > 0 ? '+' : ''}{score}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Comment input */}
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

          <div style={{ marginTop: '16px', paddingTop: '8px', borderTop: '1px solid #e0e0e0', fontSize: '11px', color: '#aaa' }}>
            Файл: {detail.file}
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Helpers ───────────────────────────────────────────────

const Section: React.FC<{ title: string; accent: string; children: React.ReactNode }> = ({ title, accent, children }) => (
  <div style={{ marginBottom: '16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <div style={{ width: '4px', height: '16px', background: accent, borderRadius: '2px' }} />
      <h4 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{title}</h4>
    </div>
    {children}
  </div>
);

const btnPrimary: React.CSSProperties = { padding: '4px 12px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
const btnSecondary: React.CSSProperties = { padding: '4px 12px', background: '#f0f0f0', color: '#333', border: '1px solid #d0d0d0', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
const btnLink: React.CSSProperties = { padding: '2px 8px', background: 'transparent', border: 'none', color: '#1890ff', cursor: 'pointer', fontSize: '12px' };
const btnIcon: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: '14px' };
const inputStyle = (w: number): React.CSSProperties => ({ width: w || 'auto', flex: w ? 'none' : 1, padding: '4px', border: '1px solid #d0d0d0', borderRadius: '3px', fontSize: '13px' });

interface AdrSections { context: string; options: string; decision: string; consequences: string; other: string; }

function parseAdrBody(body: string): AdrSections {
  const sections: AdrSections = { context: '', options: '', decision: '', consequences: '', other: '' };
  const headerRegex = /^## (.+)$/gm;
  const matches: { title: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(body)) !== null) {
    matches.push({ title: m[1].trim().toLowerCase(), start: m.index + m[0].length, end: body.length });
  }
  for (let i = 0; i < matches.length; i++) {
    matches[i].end = i + 1 < matches.length ? matches[i + 1].start - matches[i + 1].title.length - 3 : body.length;
  }
  for (const match of matches) {
    const content = body.substring(match.start, match.end).trim();
    if (match.title === 'context' || match.title === 'контекст' || match.title === 'контекста' || match.title === 'требование') {
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
