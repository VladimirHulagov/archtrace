import { describe, it, expect } from 'vitest';
import { classifyConsequenceLine, splitConsequences } from '../../src/consequences';

describe('classifyConsequenceLine', () => {
  it('parses +/−/~ markers', () => {
    expect(classifyConsequenceLine('+ нулевая инфраструктура')).toEqual({ polarity: '+', text: 'нулевая инфраструктура' });
    expect(classifyConsequenceLine('− инвалидация кэша')).toEqual({ polarity: '−', text: 'инвалидация кэша' });
    expect(classifyConsequenceLine('~ обязательство держать LRU в синхроне')).toEqual({ polarity: '~', text: 'обязательство держать LRU в синхроне' });
  });

  it('parses list-wrapped markers', () => {
    expect(classifyConsequenceLine('- + хорошо для тестов')).toEqual({ polarity: '+', text: 'хорошо для тестов' });
    expect(classifyConsequenceLine('* − дороже железо')).toEqual({ polarity: '−', text: 'дороже железо' });
  });

  it('parses canonical MADR Good/Bad/Neutral because', () => {
    expect(classifyConsequenceLine('* Good, because zero new infra')).toEqual({ polarity: '+', text: 'zero new infra' });
    expect(classifyConsequenceLine('* Bad, because cache invalidation on update')).toEqual({ polarity: '−', text: 'cache invalidation on update' });
    expect(classifyConsequenceLine('Neutral, because bounded memory')).toEqual({ polarity: '~', text: 'bounded memory' });
  });

  it('parses RU keyword forms', () => {
    expect(classifyConsequenceLine('Плюс: дешёвый старт')).toEqual({ polarity: '+', text: 'дешёвый старт' });
    expect(classifyConsequenceLine('Минус: сложная эксплуатация')).toEqual({ polarity: '−', text: 'сложная эксплуатация' });
    expect(classifyConsequenceLine('Нейтрально: зависит от поставщика')).toEqual({ polarity: '~', text: 'зависит от поставщика' });
  });

  it('rejects plain prose and false-positive EN keywords', () => {
    expect(classifyConsequenceLine('Обычный параграф без признаков.')).toBeNull();
    expect(classifyConsequenceLine('Good practices include caching.')).toBeNull();
    expect(classifyConsequenceLine('')).toBeNull();
  });

  it('rejects headers and nested markdown', () => {
    expect(classifyConsequenceLine('### Consequences')).toBeNull();
    expect(classifyConsequenceLine('| a | b |')).toBeNull();
  });
});

describe('splitConsequences', () => {
  it('splits mixed content into md and item segments', () => {
    const src = [
      'Кэш вводится для снижения нагрузки.',
      '',
      '+ нулевая латентность',
      '− инвалидация при обновлении эфемерид',
      '',
      '## не секция, просто строка',
    ].join('\n');
    const segs = splitConsequences(src);
    expect(segs[0]).toEqual({ kind: 'md', text: 'Кэш вводится для снижения нагрузки.\n' });
    expect(segs[1]).toEqual({ kind: 'item', polarity: '+', text: 'нулевая латентность' });
    expect(segs[2]).toEqual({ kind: 'item', polarity: '−', text: 'инвалидация при обновлении эфемерид' });
    expect(segs.some(s => s.kind === 'md' && s.text.includes('не секция'))).toBe(true);
  });

  it('returns single md segment for plain content', () => {
    const segs = splitConsequences('Просто текст.\n\nЕщё абзац.');
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('md');
  });

  it('handles empty section', () => {
    expect(splitConsequences('')).toEqual([]);
  });
});
