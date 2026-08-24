/**
 * DetailPanel — right sidebar with ADR details.
 * Resizable, expandable to modal, sections, comments with likes/sorting.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { DecisionNode, Comment, Vote } from './api';
import {
  postComment, deleteCommentApi, castVoteApi, removeVoteApi, addCustomOptionApi, updateCustomOptionApi,
  updateCommentApi,
  updateDecision,
  startAnalysis, getAnalysisStatus, suggestSection,
  reactToComment,
  fetchHistory,
  type HistoryEntry,
  authFetch,
} from './api';

const STATUS_ICONS: Record<string, string> = {
  accepted: '✅', rejected: '❌', proposed: '💡', debating: '🔥', superseded: '⏭️',
};
const STATUS_LABELS: Record<string, string> = {
  accepted: 'принято', rejected: 'отклонено', proposed: 'предложено',
  debating: 'обсуждение', superseded: 'заменено',
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
  currentUserId: number | null;
  currentRole: string;
  onCommentsChange: (c: Comment[]) => void;
  onVotesChange: (v: Vote[]) => void;
  onOptionsChange?: () => void; // callback to refetch detail when options change
  onTitleChange?: (newTitle: string) => void; // callback to update parent state after title edit
  onBodyChange?: (newBody: string) => void; // callback to update parent state after body/context edit
  onClose: () => void;
  onDeleteNode?: () => void;
  initialMode?: 'sidebar' | 'modal';
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  detail, comments, votes,
  currentUserId, currentRole,
  onCommentsChange, onVotesChange, onOptionsChange, onTitleChange, onBodyChange, onClose, onDeleteNode, initialMode,
}) => {
  const [mode, setMode] = useState<PanelMode>(initialMode || 'sidebar');
  const [width, setWidth] = useState(420);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showAddOption, setShowAddOption] = useState(false);
  const [newOptionTitle, setNewOptionTitle] = useState('');
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [editingContext, setEditingContext] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [commentSort, setCommentSort] = useState<CommentSort>('date');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiAlternatives, setAiAlternatives] = useState<string[]>([]);
  const [editingOptionLetter, setEditingOptionLetter] = useState<string | null>(null);
  const [editingOptionTitle, setEditingOptionTitle] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [suggestingSection, setSuggestingSection] = useState<string | null>(null);
  const [suggestedContent, setSuggestedContent] = useState<string>('');
  const [suggestedSectionName, setSuggestedSectionName] = useState<'context' | 'options' | 'consequences' | null>(null);
  const [suggestError, setSuggestError] = useState('');

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
  const allOptions = useMemo(() => [...(detail.options || [])].sort((a, b) => a.letter.localeCompare(b.letter)), [detail.options]);

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
      const v = await castVoteApi(detail.id, selectedOption, w);
      onVotesChange([...votes.filter(x => x.user_id !== v.user_id), v]);
      setSelectedOption(null);
    } catch (err) { console.error('Vote error:', err); }
  }, [selectedOption, detail, votes, onVotesChange]);

  const handleRemoveVote = useCallback(async () => {
    try {
      await removeVoteApi(detail.id);
      onVotesChange(votes.filter(v => v.user_id !== currentUserId));
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

  const handleUpdateComment = useCallback(async (commentId: number, newText: string) => {
    if (!newText.trim()) return;
    try {
      const updated = await updateCommentApi(commentId, newText.trim());
      onCommentsChange(comments.map(c => c.id === commentId ? { ...c, content: updated.content } : c));
    } catch (err) { console.error('Update comment error:', err); }
    setEditingCommentId(null);
  }, [comments, onCommentsChange]);

  const handleReact = useCallback(async (commentId: number, reaction: 'like' | 'dislike') => {
    try {
      const result = await reactToComment(commentId, reaction);
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
      await addCustomOptionApi(detail.id, nextLetter, newOptionTitle.trim());
      onOptionsChange?.();
      setNewOptionTitle(''); setShowAddOption(false);
    } catch (err) { console.error('Add option error:', err); }
  }, [newOptionTitle, detail, onOptionsChange, allOptions]);

  const handleUpdateOption = useCallback(async (letter: string) => {
    if (!editingOptionTitle.trim()) { setEditingOptionLetter(null); return; }
    try {
      await updateCustomOptionApi(detail.id, letter, editingOptionTitle.trim());
      onOptionsChange?.();
    } catch (err) { console.error('Update option error:', err); }
    setEditingOptionLetter(null); setEditingOptionTitle('');
  }, [editingOptionTitle, detail, onOptionsChange]);

  // ─── Section AI suggestion handler ──────────────────────
  const handleSuggest = useCallback(async (section: 'context' | 'options' | 'consequences') => {
    setSuggestingSection(section);
    setSuggestedContent('');
    setSuggestError('');
    try {
      const result = await suggestSection(detail.id, section);
      setSuggestedContent(result.content);
      setSuggestedSectionName(section);
    } catch (err: any) {
      setSuggestError(err.message || 'Ошибка AI');
    } finally {
      setSuggestingSection(null);
    }
  }, [detail.id]);

  // ─── Title edit handler ────────────────────────────────

  const handleSaveTitle = useCallback(async () => {
    if (!editingTitle.trim()) { setIsEditingTitle(false); return; }
    try {
      await updateDecision(detail.id, { title: editingTitle.trim() });
      if (onTitleChange) onTitleChange(editingTitle.trim());
    } catch (err) { console.error('Title update error:', err); }
    finally { setIsEditingTitle(false); }
  }, [editingTitle, detail, onTitleChange]);

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
        if (status.analysis) {
          setAiAnalysis(status.analysis);
          // Parse alternatives from the analysis text
          const lines = status.analysis.split('\n');
          const alts: string[] = [];
          let inAlt = false;
          for (const line of lines) {
            const t = line.trim();
            if (/^#{1,3}\s*(Альтернативы|Alternatives)/i.test(t)) { inAlt = true; continue; }
            if (/^#{1,3}\s/.test(t) && inAlt) { inAlt = false; }
            if (inAlt && /^[-*]\s+/.test(t)) {
              const clean = t.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim();
              if (clean.length > 5) alts.push(clean);
            }
          }
          setAiAlternatives(alts);
        }
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
    setAiAlternatives([]);
    getAnalysisStatus(detail.id).then(s => {
      if (s.analyzing) { setAnalyzing(true); pollAnalysis(); }
      else if (s.analysis) setAiAnalysis(s.analysis);
    }).catch(() => {});
    return () => { if (analysisTimer.current) clearTimeout(analysisTimer.current); };
  }, [detail.id, pollAnalysis]);

  // ─── Load git history ──────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const entries = await fetchHistory(detail.id);
      setHistory(entries);
    } catch (err) { console.error('History load error:', err); }
    setLoadingHistory(false);
  }, [detail.id]);

  useEffect(() => {
    setHistory([]);
    setShowHistory(false);
  }, [detail.id]);

  const handleApplySuggestion = useCallback(async (section: 'context' | 'options' | 'consequences') => {
    if (!suggestedContent) return;
    try {
      if (section === 'context') {
        const existing = sections.context || '';
        const merged = existing ? existing + '\n\n' + suggestedContent : suggestedContent;
        await updateDecision(detail.id, { context: merged });
        if (onOptionsChange) onOptionsChange();
      }
      setSuggestedContent('');
      setSuggestedSectionName(null);
    } catch (err) { console.error('Apply suggestion error:', err); }
  }, [suggestedContent, detail.id, sections, onOptionsChange]);

  const handleSaveContext = useCallback(async () => {
    try {
      await updateDecision(detail.id, { context: editingContext });
      if (onOptionsChange) onOptionsChange();
      setIsEditingContext(false);
    } catch (err) { console.error('Context save error:', err); }
  }, [editingContext, detail, onOptionsChange]);

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
            {onDeleteNode && (
              <button
                onClick={() => { if (confirm('Удалить карточку?')) onDeleteNode(); }}
                title="Удалить карточку"
                style={{
                  border: '1px solid #ffccc7', background: '#fff', borderRadius: '4px',
                  padding: '5px 10px', cursor: 'pointer', fontSize: '14px', color: '#cc4444',
                }}
              >🗑</button>
            )}
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
          </div>

          {/* КОНТЕКСТ */}
          <Section title="Контекст" accent="#1890ff"
            extra={(
              <button
                onClick={() => handleSuggest('context')}
                disabled={suggestingSection === 'context'}
                title="AI: дополнить контекст"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: '0 2px', opacity: suggestingSection === 'context' ? 0.5 : 0.6 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = suggestingSection === 'context' ? '0.5' : '0.6'}
              >{suggestingSection === 'context' ? '⏳' : '🪄'}</button>
            )}
          >
            {isEditingContext ? (
              <div>
                <textarea value={editingContext} onChange={e => setEditingContext(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSaveContext(); } if (e.key === 'Escape') { setIsEditingContext(false); } }}
                  style={{
                  width: '100%', minHeight: '80px', padding: '8px',
                  border: '1px solid #1890ff', borderRadius: '4px',
                  fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
                }} autoFocus />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                  <button onClick={handleSaveContext} style={btnPrimary}>Сохранить</button>
                  <button onClick={() => setIsEditingContext(false)} style={btnSecondary}>Отмена</button>
                  <span style={{ fontSize: '10px', color: '#999', marginLeft: '4px' }}>Ctrl+Enter — быстрое сохранение</span>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#333' }}>
                  <ReactMarkdown>{sections.context || '*Контекст не указан*'}</ReactMarkdown>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button onClick={() => { setEditingContext(sections.context || ''); setIsEditingContext(true); }} style={btnLink}>✏️ Редактировать</button>
                  <button onClick={() => { if (!showHistory) loadHistory(); setShowHistory(!showHistory); }} style={btnLink}>📜 История</button>
                </div>
                {(suggestingSection === 'context' || (suggestingSection === null && suggestedContent && suggestedSectionName === 'context')) && (
                  <div style={{ marginTop: '8px', padding: '10px', background: '#f0f5ff', borderRadius: '4px', border: '1px solid #adc6ff' }}>
                    {suggestingSection === 'context' ? (
                      <div style={{ textAlign: 'center', color: '#2f54eb', fontSize: '12px' }}>
                        <span style={{ fontSize: '16px' }}>🪄</span> AI генерирует дополнения...
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#2f54eb' }}>🪄 AI дополнение:</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => handleApplySuggestion('context')} style={{ border: '1px solid #52c41a', background: '#f6ffed', color: '#389e0d', borderRadius: '3px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>+ Добавить</button>
                            <button onClick={() => { setSuggestedContent(''); setSuggestedSectionName(null); }} style={{ border: '1px solid #d0d0d0', background: '#fff', color: '#666', borderRadius: '3px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}>Отклонить</button>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: '#333', lineHeight: 1.5 }}>
                          <ReactMarkdown>{suggestedContent}</ReactMarkdown>
                        </div>
                      </>
                    )}
                    {suggestError && suggestingSection === null && (
                      <div style={{ color: '#ff4d4f', fontSize: '11px', marginTop: '4px' }}>{suggestError}</div>
                    )}
                  </div>
                )}
                {showHistory && (
                  <div style={{ marginTop: '8px' }}>
                    {loadingHistory && <div style={{ fontSize: '11px', color: '#999' }}>Загрузка...</div>}
                    {!loadingHistory && history.length === 0 && <div style={{ fontSize: '11px', color: '#999' }}>Нет истории изменений</div>}
                    {history.map((entry, i) => (
                      <div key={i} style={{ marginTop: '6px', padding: '8px', background: '#f5f5f5', borderRadius: '4px', fontSize: '12px', borderLeft: '3px solid #1890ff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ color: '#1890ff', fontWeight: 'bold' }}>{entry.hash}</span>
                          <span style={{ color: '#999', fontSize: '10px' }}>{entry.date}</span>
                        </div>
                        <div style={{ color: '#666', marginBottom: '4px' }}>{entry.message}</div>
                        {entry.changes.length > 0 && (
                          <details style={{ marginTop: '4px' }}>
                            <summary style={{ fontSize: '10px', color: '#999', cursor: 'pointer' }}>Изменения ({entry.changes.length})</summary>
                            <pre style={{ fontSize: '10px', color: '#333', whiteSpace: 'pre-wrap', marginTop: '4px', maxHeight: '200px', overflow: 'auto' }}>
                              {entry.changes.filter(l => l.startsWith('+') || l.startsWith('-')).join('\n')}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ОПЦИИ */}
          <Section title="Опции" accent="#722ed1"
            extra={(
              <button
                onClick={() => handleSuggest('options')}
                disabled={suggestingSection === 'options'}
                title="AI: предложить варианты"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: '0 2px', opacity: suggestingSection === 'options' ? 0.5 : 0.6 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = suggestingSection === 'options' ? '0.5' : '0.6'}
              >{suggestingSection === 'options' ? '⏳' : '🪄'}</button>
            )}
          >
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
                        setEditingOptionLetter(opt.letter); setEditingOptionTitle(opt.title);
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
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Удалить вариант ${opt.letter}?`)) {
                        // Delete option via API (now writes to MD)
                        authFetch(`/api/options/${detail.id}/${opt.letter}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Project-Id': localStorage.getItem('archtrace-pid') || '1' } })
                          .then(() => onOptionsChange?.())
                          .catch(err => console.error('Delete option:', err));
                      } }}
                      title="Удалить вариант"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cc4444', fontSize: '12px', padding: '0', marginLeft: '2px', flexShrink: 0, opacity: 0.5 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                    >✕</button>
                  </div>
                );
              })}
            </div>

            {showAddOption && (
              <div style={{ marginBottom: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input type="text" placeholder="Название варианта..." value={newOptionTitle} onChange={e => setNewOptionTitle(e.target.value)} style={{ flex: 1, padding: '4px', border: '1px solid #d0d0d0', borderRadius: '3px', fontSize: '13px' }} autoFocus />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddOption} style={btnPrimary}>Добавить</button>
                  <button onClick={() => setShowAddOption(false)} style={btnSecondary}>Отмена</button>
                </div>
              </div>
            )}
            {!showAddOption && (
              <button onClick={() => setShowAddOption(true)} style={{ ...btnLink, marginBottom: '8px' }}>+ Добавить вариант</button>
            )}
            {(suggestingSection === 'options' || (suggestingSection === null && suggestedContent && suggestedSectionName === 'options')) && (
              <div style={{ marginTop: '8px', padding: '10px', background: '#f0f5ff', borderRadius: '4px', border: '1px solid #adc6ff' }}>
                {suggestingSection === 'options' ? (
                  <div style={{ textAlign: 'center', color: '#2f54eb', fontSize: '12px' }}>
                    <span style={{ fontSize: '16px' }}>🪄</span> AI генерирует варианты...
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#2f54eb' }}>🪄 AI-варианты:</span>
                      <button onClick={() => { setSuggestedContent(''); setSuggestedSectionName(null); }} style={{ border: '1px solid #d0d0d0', background: '#fff', color: '#666', borderRadius: '3px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}>Отклонить</button>
                    </div>
                    {(() => {
                      const lines = suggestedContent.split('\n').map((l: string) => l.trim()).filter((l: string) => l.match(/^[-*]/)).map((l: string) => l.replace(/^[-*]\s+/, '').trim()).filter((l: string) => l.length > 2);
                      // Track which AI suggestions have been added
                      const addedTitles = new Set(allOptions.map(o => o.title));
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {lines.filter(title => !addedTitles.has(title)).map((title: string, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ flex: 1, fontSize: '12px', color: '#333' }}>{title}</span>
                              <button onClick={async () => {
                                const usedLetters = new Set(allOptions.map(o => o.letter));
                                let nextLetter = '';
                                for (let j = 65; j <= 90; j++) { const l = String.fromCharCode(j); if (!usedLetters.has(l)) { nextLetter = l; break; } }
                                if (!nextLetter) nextLetter = String.fromCharCode(65 + allOptions.length);
                                try {
                                  await addCustomOptionApi(detail.id, nextLetter, title);
                                  onOptionsChange?.();
                                  setSuggestedContent(prev => {
                                    const remaining = prev.split('\n').filter(l => {
                                      const clean = l.trim().replace(/^[-*]\s+/, '').trim();
                                      return clean !== title;
                                    });
                                    if (remaining.filter(l => l.trim().match(/^[-*]/)).length === 0) {
                                      setSuggestedSectionName(null);
                                      return '';
                                    }
                                    return remaining.join('\n');
                                  });
                                } catch (err) { console.error('Add AI option:', err); }
                              }} style={{ border: '1px solid #52c41a', background: '#f6ffed', color: '#389e0d', borderRadius: '3px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                + Добавить
                              </button>
                            </div>
                          ))}
                          {lines.filter(title => !addedTitles.has(title)).length === 0 && lines.length > 0 && (
                            <div style={{ fontSize: '11px', color: '#999', padding: '4px' }}>Все варианты добавлены ✅</div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
                {suggestError && suggestingSection === null && (
                  <div style={{ color: '#ff4d4f', fontSize: '11px', marginTop: '4px' }}>{suggestError}</div>
                )}
              </div>
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
          <Section title="Последствия" accent="#fa8c16"
            extra={(
              <button
                onClick={() => handleSuggest('consequences')}
                disabled={suggestingSection === 'consequences'}
                title="AI: дополнить последствия"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: '0 2px', opacity: suggestingSection === 'consequences' ? 0.5 : 0.6 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = suggestingSection === 'consequences' ? '0.5' : '0.6'}
              >{suggestingSection === 'consequences' ? '⏳' : '🪄'}</button>
            )}
          >
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#333' }}>
                <ReactMarkdown>{sections.consequences}</ReactMarkdown>
              </div>
            </Section>

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
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button onClick={handleAnalyze} style={{
                    ...btnLink, color: '#fa541c',
                  }}>🔄 Обновить анализ</button>
                  <button onClick={() => setAiAnalysis(null)} style={{
                    ...btnLink, color: '#999',
                  }}>✕ Закрыть</button>
                </div>
                {aiAlternatives.length > 0 && (
                  <div style={{ marginTop: '10px', padding: '8px', background: '#f0f5ff', borderRadius: '4px', border: '1px solid #adc6ff' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#2f54eb', marginBottom: '6px' }}>
                      💡 Предложенные альтернативы:
                    </div>
                    {aiAlternatives.map((alt, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#333', flex: 1, lineHeight: 1.4 }}>{alt}</span>
                        <button onClick={async () => {
                          const usedLetters = new Set(allOptions.map(o => o.letter));
                          let nextLetter = '';
                          for (let j = 65; j <= 90; j++) {
                            const l = String.fromCharCode(j);
                            if (!usedLetters.has(l)) { nextLetter = l; break; }
                          }
                          if (!nextLetter) nextLetter = String.fromCharCode(65 + allOptions.length);
                          try {
                            await addCustomOptionApi(detail.id, nextLetter, alt);
                            onOptionsChange?.();
                            // Remove from alternatives list
                            setAiAlternatives(prev => prev.filter((_, idx) => idx !== i));
                          } catch (err) { console.error('Add alt as option:', err); }
                        }} style={{
                          border: '1px solid #52c41a', background: '#f6ffed', color: '#389e0d',
                          borderRadius: '3px', padding: '2px 6px', fontSize: '10px',
                          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                        }} title="Добавить как вариант в карточку">
                          + вариант
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                    {editingCommentId === c.id ? (
                      <input
                        type="text"
                        value={editingCommentText}
                        onChange={e => setEditingCommentText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); handleUpdateComment(c.id, editingCommentText); }
                          if (e.key === 'Escape') { setEditingCommentId(null); }
                        }}
                        onBlur={() => { if (editingCommentText.trim() !== c.content) handleUpdateComment(c.id, editingCommentText); else setEditingCommentId(null); }}
                        autoFocus
                        style={{ flex: 1, fontSize: '12px', padding: '3px 6px', border: '1px solid #1890ff', borderRadius: '3px', color: '#333', lineHeight: 1.4, fontFamily: 'inherit' }}
                      />
                    ) : (
                      <div
                        onDoubleClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }}
                        style={{ flex: 1, fontSize: '12px', color: '#333', lineHeight: 1.4, cursor: 'text' }}
                        title="Двойной клик для редактирования"
                      >{c.content}</div>
                    )}
                    {editingCommentId === c.id && (
                      <button
                        onClick={() => { if (confirm('Удалить комментарий?')) handleDeleteComment(c.id); }}
                        title="Удалить"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cc4444', fontSize: '14px', padding: '0', flexShrink: 0 }}
                      >🗑</button>
                    )}
                  </div>
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
                onKeyDown={e => { if (e.key === 'Enter') handlePostComment();
                  if (e.key === 'Escape') { setEditingCommentId(null); setEditingCommentText(''); } }}
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

const Section: React.FC<{ title: string; accent: string; children: React.ReactNode; extra?: React.ReactNode }> = ({ title, accent, children, extra }) => (
  <div style={{ marginBottom: '16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <div style={{ width: '4px', height: '16px', background: accent, borderRadius: '2px' }} />
      <h4 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{title}</h4>
      {extra}
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
