/**
 * Timeline — horizontal commit timeline (bottom-left, aligned with Sync button).
 * Oldest state on the left, newest on the right. Hover = date + message,
 * click = jump to that state. "сейчас" jumps back to the current (HEAD) state.
 */
import { useState, useRef, useEffect } from 'react';

export interface TimelineCommit {
  hash: string;
  fullHash: string;
  date: string;
  message: string;
}

export interface TimelineProps {
  commits: TimelineCommit[];        // newest first
  selectedIndex: number | null;     // null = current (HEAD), else index into commits
  onSelect: (index: number) => void;
  onJumpToCurrent: () => void;
  disabled?: boolean;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const DOT = 14;
const STEP = 26; // px between dot centers
const PADDING_X = 14;

export const Timeline: React.FC<TimelineProps> = ({
  commits, selectedIndex, onSelect, onJumpToCurrent, disabled,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const width = commits.length > 0 ? PADDING_X * 2 + STEP * (commits.length - 1) : 40;

  // X position of commit i: index 0 (newest) sits at the RIGHT end.
  const xOf = (i: number) => PADDING_X + STEP * (commits.length - 1 - i);

  // Keep the selected (or newest) dot visible in the scrollable strip
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const idx = selectedIndex ?? 0;
    const x = xOf(idx);
    const target = x - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, commits.length]);

  if (commits.length === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '4px 8px', borderRadius: '8px',
      background: 'rgba(255,255,255,0.95)', border: '1px solid #e0e0e0',
      boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
      maxWidth: 'min(560px, calc(100vw - 48px))',
    }}>
      <div ref={listRef} style={{
        position: 'relative', height: '34px', overflowX: 'auto', overflowY: 'hidden',
        minWidth: '120px', maxWidth: '440px',
        scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch',
      }}>
        {/* the line */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%',
          height: '2px', background: '#d0d0d0', transform: 'translateY(-1px)',
          minWidth: width,
        }} />
        <div style={{ position: 'relative', width, height: '100%' }}>
          {commits.map((c, i) => {
            const isSelected = selectedIndex === i;
            const isHovered = hovered === i;
            const isCurrentState = selectedIndex === null && i === 0;
            return (
              <button
                key={c.fullHash || c.hash || i}
                onClick={() => onSelect(i)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                title={`${fmtDate(c.date)}\n${c.message}`}
                style={{
                  position: 'absolute',
                  left: xOf(i) - DOT / 2,
                  top: '50%',
                  width: DOT, height: DOT, borderRadius: '50%',
                  transform: 'translateY(-50%)',
                  padding: 0,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  background: isSelected || isCurrentState ? '#1890ff' : '#fff',
                  border: isSelected || isCurrentState
                    ? '2px solid #1890ff'
                    : isHovered ? '2px solid #69c0ff' : '2px solid #bfbfbf',
                  boxShadow: isSelected ? '0 0 0 3px rgba(24,144,255,0.25)' : 'none',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease',
                }}
              />
            );
          })}
        </div>
        {/* tooltip */}
        {hovered !== null && commits[hovered] && (
          <div style={{
            position: 'absolute', bottom: '40px',
            left: Math.min(
              Math.max(xOf(hovered) - 90, 0),
              Math.max(width - 180, 0)
            ),
            width: '180px', zIndex: 1200,
            background: 'rgba(0,0,0,0.8)', color: '#fff',
            borderRadius: '6px', padding: '6px 8px', fontSize: '11px',
            pointerEvents: 'none', whiteSpace: 'normal',
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{fmtDate(commits[hovered].date)}</div>
            <div style={{ fontFamily: 'monospace', opacity: 0.8 }}>{commits[hovered].hash}</div>
            <div style={{ marginTop: '2px', lineHeight: 1.3 }}>{commits[hovered].message}</div>
          </div>
        )}
      </div>

      {/* back to present (newest is on the right, so "now" sits at the right edge) */}
      <button
        onClick={onJumpToCurrent}
        disabled={disabled || selectedIndex === null}
        title="Вернуться к текущему состоянию"
        style={{
          border: '1px solid #d0d0d0', background: '#fff', borderRadius: '4px',
          cursor: disabled || selectedIndex === null ? 'not-allowed' : 'pointer',
          fontSize: '11px', color: selectedIndex === null ? '#bbb' : '#389e0d',
          padding: '3px 8px', flexShrink: 0, fontWeight: 'bold',
        }}
      >сейчас</button>
    </div>
  );
};

export default Timeline;
