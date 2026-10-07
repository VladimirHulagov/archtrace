/**
 * Consequence-line convention (MADR-compatible ±):
 *   `+ text`  — positive consequence
 *   `− text`  — negative consequence / cost
 *   `~ text`  — neutral consequence / obligation
 * Lines may carry a leading list marker (`- + text`, `* + text`).
 * Canonical MADR form is also recognized: "Good, because …" / "Bad, because …"
 * / "Neutral, because …" and RU keywords («Плюс: …», «Минус: …», «Нейтрально: …»).
 * Anything that doesn't match stays plain markdown.
 */

export type Polarity = '+' | '−' | '~';

export interface ConsequenceItem {
  polarity: Polarity;
  text: string;
}

export type ConsequenceSegment =
  | { kind: 'md'; text: string }
  | { kind: 'item'; polarity: Polarity; text: string };

/** Classify one raw markdown line as a consequence item, or null. */
export function classifyConsequenceLine(rawLine: string): ConsequenceItem | null {
  const line = rawLine.trim();
  if (!line) return null;
  // Strip a leading list marker so both `- + text` and `+ text` work.
  const rest = line.replace(/^[-*]\s+/, '').trim();
  if (!rest) return null;

  // Our convention: line starts with +/-/~/- followed by a space.
  const mMarker = rest.match(/^([+−~])\s+(.+)$/s);
  if (mMarker) {
    const p = mMarker[1];
    return { polarity: p as Polarity, text: mMarker[2].trim() };
  }

  // MADR / RU keyword form.
  // NB: JS \w does NOT match Cyrillic — RU stems use explicit [а-яё] classes.
  const mKw = rest.match(
    /^(good|bad|neutral|плюс|минус|положительн[а-яё]*|отрицательн[а-яё]*|нейтральн[а-яё]*)([,:—-]?)\s*(.*)$/i,
  );
  if (mKw) {
    const kw = mKw[1].toLowerCase();
    const tail = mKw[3].trim();
    const isRu = /[а-яё]/i.test(kw);
    // EN keywords require an explicit comma/colon right after ("Good, because"),
    // so "Good practices include …" is not misread as a consequence.
    const enOk = /^(good|bad|neutral)$/.test(kw) && mKw[2] !== '';
    if (isRu || enOk) {
      const polarity: Polarity = /^(good|плюс|положительн)/i.test(kw)
        ? '+'
        : /^(bad|минус|отрицательн)/i.test(kw)
          ? '−'
          : '~';
      const text = tail.replace(/^(because|потому что)\s+/i, '').trim();
      return { polarity, text: text || tail };
    }
  }
  return null;
}

/** Split a consequences section into styled items and plain markdown chunks. */
export function splitConsequences(section: string): ConsequenceSegment[] {
  const segs: ConsequenceSegment[] = [];
  const mdBuf: string[] = [];
  const flush = () => {
    if (mdBuf.length) {
      const text = mdBuf.join('\n');
      if (text) segs.push({ kind: 'md', text });
      mdBuf.length = 0;
    }
  };
  for (const line of section.split('\n')) {
    const item = classifyConsequenceLine(line);
    if (item) {
      flush();
      segs.push({ kind: 'item', polarity: item.polarity, text: item.text });
    } else {
      mdBuf.push(line);
    }
  }
  flush();
  return segs;
}
