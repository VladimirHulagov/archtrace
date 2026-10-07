/**
 * ADR Parser — reads markdown files from decisions/ directory,
 * extracts YAML frontmatter + markdown body,
 * builds a graph of nodes and connections.
 */

import fs from 'fs';
import path from 'path';


// ─── Phase mapping ────────────────────────────────────────
// Phase 1 = Problem/Task, 2 = Requirement, 3 = Paradigm/Concept, 4 = ADR Decision
export function typeToPhase(type: string): 1 | 2 | 3 | 4 {
  switch (type) {
    case 'problem': return 1;
    case 'requirement': return 2;
    case 'paradigm': return 3;
    case 'decision':
    case 'task':
    default: return 4;
  }
}

export function phaseToType(phase: number): string {
  switch (phase) {
    case 1: return 'problem';
    case 2: return 'requirement';
    case 3: return 'paradigm';
    case 4: default: return 'decision';
  }
}

// Phase metadata for UI
export const PHASE_INFO: Record<number, { name: string; color: string; bg: string; label: string }> = {
  1: { name: 'Проблема', color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.08)', label: '🔥' },
  2: { name: 'Требования', color: '#3498db', bg: 'rgba(52, 152, 219, 0.08)', label: '📋' },
  3: { name: 'Концепция', color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.08)', label: '💡' },
  4: { name: 'Решения (ADR)', color: '#9b59b6', bg: 'rgba(155, 89, 182, 0.08)', label: '⚙️' },
};

// ─── Types ────────────────────────────────────────────────

// ─── MADR compatibility ───────────────────────────────────
// Canonical MADR uses draft/adopted; archtrace enum differs — normalize on ingest.
const STATUS_ALIASES: Record<string, string> = {
  draft: 'proposed',
  proposed: 'proposed',
  debating: 'debating',
  discussion: 'debating',
  accepted: 'accepted',
  adopted: 'accepted',
  decided: 'accepted',
  rejected: 'rejected',
  superseded: 'superseded',
};

/** Normalize a frontmatter status (string or MADR v2 object) into
 *  archtrace status + optional superseded-by target + decided date. */
export function normalizeStatus(raw: any): { status: DecisionNode['status']; supersededBy: string | null; decided: string | null; extra: Record<string, any> } {
  const extra: Record<string, any> = {};
  if (raw && typeof raw === 'object') {
    // MADR v2: status: { date, deciders }
    if (raw.date) extra['deciders_date'] = String(raw.date);
    if (raw.deciders) extra['deciders'] = raw.deciders;
    return { status: 'proposed', supersededBy: null, decided: raw.date ? String(raw.date) : null, extra };
  }
  const s = String(raw ?? '').trim();
  const by = s.match(/superseded\s+by\s+([\w-]+)/i);
  if (by) return { status: 'superseded', supersededBy: by[1], decided: null, extra };
  const key = s.toLowerCase();
  return { status: (STATUS_ALIASES[key] || 'proposed') as DecisionNode['status'], supersededBy: null, decided: null, extra };
}

/** Extract the first `# H1` title from a MADR body (canonical MADR has no
 *  title frontmatter — the H1 IS the title). Comment-only H1s yield ''. */
export function extractH1Title(body: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  if (!m) return '';
  return m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
}

function stripCommentPlaceholders(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, '').trim();
}

export interface Voter {
  name: string;
  role: string;
  vote: string;
  weight: number;
  rationale: string;
}

export interface DecisionNode {
  id: string;
  title: string;
  status: 'proposed' | 'debating' | 'accepted' | 'rejected' | 'superseded';
  type: 'problem' | 'requirement' | 'paradigm' | 'decision' | 'task';
  phase: 1 | 2 | 3 | 4;
  parent: string | null;
  cross_refs: string[];
  created: string;
  decided: string | null;
  voters: Voter[];
  options: { letter: string; title: string; description?: string }[];
  extra: Record<string, any>; // unknown frontmatter keys (MADR passthrough: tags, decision-makers, ...)
  body: string;        // markdown body (without frontmatter)
  file: string;        // source filename
}

export interface GraphConnection {
  id: string;
  from: string;
  to: string;
  kind: 'parent' | 'cross-ref';
}

export interface Graph {
  nodes: DecisionNode[];
  connections: GraphConnection[];
}

// ─── YAML frontmatter parser (minimal, no deps) ───────────

function parseFrontmatter(raw: string): { frontmatter: Record<string, any>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const yamlText = match[1];
  const body = match[2];
  const frontmatter = parseSimpleYAML(yamlText);

  return { frontmatter, body };
}

/**
 * Minimal YAML parser for flat key-value pairs and simple arrays.
 * Handles: key: value, key: "value", nested arrays of objects, null.
 */
function parseSimpleYAML(text: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Skip empty lines and comments
    if (!trimmed.trim() || trimmed.trim().startsWith('#')) {
      i++;
      continue;
    }

    // Key-value pair (hyphens allowed: MADR 'decision-makers' etc.)
    const kvMatch = trimmed.match(/^([\w-]+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value = kvMatch[2].trim();

      // null
      if (value === '' || value === 'null' || value === '~') {
        // Check if next lines are indented array items
        if (i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
          // It's an array with items on following lines
          const arr = parseYAMLArray(lines, i + 1);
          result[key] = arr.value;
          i = arr.nextLine;
          continue;
        }
        // Nested object (MADR v2: status: { date, deciders })
        const nested = parseYAMLNestedObject(lines, i + 1);
        if (nested) {
          result[key] = nested.value;
          i = nested.nextLine;
          continue;
        }
        result[key] = null;
        i++;
        continue;
      }

      // Remove quotes — quoted values are ALWAYS strings
      const wasQuoted = (value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"));
      if (wasQuoted) {
        value = value.slice(1, -1);
        result[key] = value;  // keep as string, no scalar conversion
        i++;
        continue;
      }

      // Parse unquoted value
      result[key] = parseScalarValue(value);
      i++;
      continue;
    }

    i++;
  }

  return result;
}

function parseScalarValue(value: string): any {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Number
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  // Array inline [a, b]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(s => {
      const v = s.trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        return v.slice(1, -1);
      }
      return parseScalarValue(v);
    });
  }
  return value;
}

/**
 * Parse YAML array: can be simple list (- value) or list of objects (- key: value).
 */
function parseYAMLArray(lines: string[], startIdx: number): { value: any[]; nextLine: number } {
  const items: any[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];

    // Not an array item?
    if (!line.match(/^\s+-\s/)) {
      break;
    }

    // Check if it's an object (starts with "- key: value")
    const objMatch = line.match(/^\s+-\s+(\w+):\s*(.*)$/);
    if (objMatch) {
      // Parse multi-line object
      const obj: Record<string, any> = {};
      const firstKey = objMatch[1];
      const firstVal = objMatch[2].trim();

      if (firstVal === '' || firstVal === 'null' || firstVal === '~') {
        obj[firstKey] = null;
      } else {
        let v = firstVal;
        const fq = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
        if (fq) {
          v = v.slice(1, -1);
          obj[firstKey] = v;  // quoted = string
        } else {
          obj[firstKey] = parseScalarValue(v);
        }
      }

      // Parse remaining keys of this object (more indented lines)
      i++;
      while (i < lines.length) {
        const subLine = lines[i];
        const subMatch = subLine.match(/^\s+(\w+):\s*(.*)$/);
        if (subMatch && !subLine.match(/^\s+-\s/)) {
          const subKey = subMatch[1];
          let subVal = subMatch[2].trim();
          if (subVal === '' || subVal === 'null' || subVal === '~') {
            subVal = '';
          }
          const sq = (subVal.startsWith('"') && subVal.endsWith('"')) || (subVal.startsWith("'") && subVal.endsWith("'"));
          if (sq) {
            subVal = subVal.slice(1, -1);
            obj[subKey] = subVal;  // quoted = string
          } else {
            obj[subKey] = parseScalarValue(subVal);
          }
          i++;
        } else {
          break;
        }
      }
      items.push(obj);
      continue;
    }

    // Simple scalar item
    const scalarMatch = line.match(/^\s+-\s+(.*)$/);
    if (scalarMatch) {
      let v = scalarMatch[1].trim();
      const sq = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
      if (sq) {
        v = v.slice(1, -1);
        items.push(v);  // quoted = string
      } else {
        items.push(parseScalarValue(v));
      }
    }
    i++;
  }

  return { value: items, nextLine: i };
}

// ─── Graph builder ────────────────────────────────────────

/**
 * Parse an indented key: value block (MADR v2 nests date/deciders under status).
 * Returns null if the first line isn't an indented key (then it's a plain null).
 */
function parseYAMLNestedObject(lines: string[], startIdx: number): { value: Record<string, any>; nextLine: number } | null {
  const obj: Record<string, any> = {};
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (line.match(/^\s+-\s/)) break;
    const m = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (!m) break;
    let v = m[2].trim();
    const fq = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
    if (fq) {
      v = v.slice(1, -1);
      obj[m[1]] = v;
    } else if (v === '' || v === 'null' || v === '~') {
      obj[m[1]] = null;
    } else {
      obj[m[1]] = parseScalarValue(v);
    }
    i++;
  }
  return i > startIdx ? { value: obj, nextLine: i } : null;
}

const DECISIONS_DIR = path.resolve(process.cwd(), 'decisions');


/**
 * Parse option names from markdown body.
 * Matches: ### Option A: Title  OR  ### A: Title  OR  ## A: Title
 */
function parseOptions(body: string): { letter: string; title: string; description?: string }[] {
  const options: { letter: string; title: string; description: string[] }[] = [];
  const lines = body.split('\n');
  let current: { letter: string; title: string; description: string[] } | null = null;
  for (const line of lines) {
    // Match: ### Option A: ... or ### A: ... (but not ### Context, ### Decision, etc.)
    const m = line.match(/^#{2,3}\s+(?:Option\s+)?([A-Z])\s*[:.·]\s*(.+)/i);
    let matched = false;
    if (m) {
      const letter = m[1].toUpperCase();
      const title = m[2].trim();
      // Filter out false positives (Context, Requirement, etc.)
      if (title.length > 2 && !['Context', 'Decision', 'Requirement', 'Consequences', 'Options'].includes(title)) {
        if (!options.find(o => o.letter === letter)) {
          current = { letter, title, description: [] };
          options.push(current);
          matched = true;
        }
      }
    }
    // Collect body lines after the option header as its description.
    // A `##` section header CLOSES the current option: only the header line
    // itself is skipped — content after `## Решение` / `## Последствия`
    // must never be swallowed into the last option's description.
    if (current && !matched && /^##\s/.test(line)) {
      current = null;
    } else if (current && !matched) {
      current.description.push(line);
    }
  }
  return options.map(o => {
    const desc = o.description.join('\n').trim();
    return desc ? { letter: o.letter, title: o.title, description: desc } : { letter: o.letter, title: o.title };
  });
}

/**
 * MADR fallback: parse bulleted options under '## Considered Options'
 * (canonical MADR has no '### Option A:' headers) → letters A, B, C, ...
 * Pros/Cons blocks ('## Pros and Cons of the Options' → '### <option title>'
 * → bullet lines) are attached as the option description.
 */
export function parseMadrOptions(body: string): { letter: string; title: string; description?: string }[] {
  const m = body.match(/^##\s+Considered Options\s*$/im);
  if (!m) return [];
  const rest = body.slice(m.index! + m[0].length);
  const section = rest.split(/^##\s+/m)[0];
  const options: { letter: string; title: string; description?: string }[] = [];
  for (const line of section.split('\n')) {
    const t = line.trim();
    const lm = t.match(/^[-*]\s+(.+)$/) || t.match(/^\d+[.)]\s+(.+)$/);
    if (lm) {
      const title = stripCommentPlaceholders(lm[1]);
      if (title && !options.find(o => o.title.toLowerCase() === title.toLowerCase())) {
        options.push({ letter: String.fromCharCode(65 + options.length), title });
      }
    }
  }
  // Attach Pros/Cons as descriptions
  const pc = body.match(/^##\s+Pros and Cons of the Options\s*$/im);
  if (pc) {
    const pcBody = body.slice(pc.index! + pc[0].length);
    const chunks = pcBody.split(/^###\s+/m).slice(1);
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      const title = stripCommentPlaceholders(lines[0] || '');
      const bullets = lines.slice(1)
        .map(l => l.trim())
        .filter(l => /^[-*]\s+/.test(l))
        .map(l => l.replace(/^[-*]\s+/, '').trim())
        .filter(b => stripCommentPlaceholders(b));
      const opt = options.find(o => o.title.toLowerCase() === title.toLowerCase());
      if (opt && bullets.length > 0) opt.description = bullets.join('\n');
    }
  }
  return options;
}

/**
 * Parse bulleted list items from a named '## <header>' section into
 * option-shaped entries (P1..Pn) so tree cards can render them exactly like
 * decision options (incl. winner-vote strikethrough). Used for requirement
 * items (Требования, prefix R) and problem symptoms (Симптомы и факты, S).
 */
function parseSectionItemsAsOptions(body: string, header: string, prefix: string): { letter: string; title: string }[] {
  const m = body.match(new RegExp(`^##\\s+${header}\\s*$`, 'm'));
  if (!m) return [];
  const rest = body.slice(m.index! + m[0].length);
  const section = rest.split(/^##\s+/m)[0];
  const items: { letter: string; title: string }[] = [];
  for (const line of section.split('\n')) {
    const t = line.trim();
    const lm = t.match(/^[-*\u2014\u2013]\s+(.+)$/) || t.match(/^\d+[.)]\s+(.+)$/);
    if (lm) {
      const title = lm[1].trim();
      if (title) items.push({ letter: prefix + (items.length + 1), title });
    }
  }
  return items;
}

function parseRequirementItems(body: string): { letter: string; title: string }[] {
  return parseSectionItemsAsOptions(body, 'Требования', 'R');
}

function parseSymptomItems(body: string): { letter: string; title: string }[] {
  return parseSectionItemsAsOptions(body, 'Симптомы и факты', 'S');
}

// Frontmatter keys owned by archtrace — everything else passes through as `extra`
const KNOWN_FRONTMATTER_KEYS = new Set(['id', 'title', 'status', 'type', 'phase', 'parent', 'cross_refs', 'created', 'decided', 'voters']);

export function parseDecisionFile(filePath: string): DecisionNode | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const rawType = frontmatter.type || 'decision';
  const rawPhase = frontmatter.phase;
  const classicOptions = parseOptions(body);
  const parsedOptions = classicOptions.length > 0
    ? classicOptions
    : parseMadrOptions(body);

  // MADR status normalization: adopted→accepted, draft→proposed,
  // 'superseded by NNN'→superseded + implicit cross-ref to the successor
  const norm = normalizeStatus(frontmatter.status);
  const crossRefs: string[] = frontmatter.cross_refs || [];
  if (norm.supersededBy && !crossRefs.includes(norm.supersededBy)) {
    crossRefs.push(norm.supersededBy);
  }

  // Unknown frontmatter keys survive round-trips (MADR: tags, decision-makers, ...)
  const extra: Record<string, any> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(k)) extra[k] = v;
  }
  for (const [k, v] of Object.entries(norm.extra)) extra[k] = v;

  // Canonical MADR: title lives in the body H1, not in frontmatter
  const title = frontmatter.title || extractH1Title(body);

  // MADR v3 flat `date:` = decision date → decided (+ created fallback)
  const flatDate = typeof extra['date'] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(extra['date']) ? extra['date'] : null;

  return {
    id: frontmatter.id || path.basename(filePath, '.md'),
    title: title || 'Untitled',
    status: norm.status,
    type: rawType,
    phase: rawPhase ? (parseInt(String(rawPhase), 10) as 1|2|3|4) : typeToPhase(rawType),
    parent: frontmatter.parent ?? null,
    cross_refs: crossRefs,
    created: frontmatter.created || flatDate || new Date().toISOString().split('T')[0],
    decided: frontmatter.decided ?? norm.decided ?? flatDate,
    voters: frontmatter.voters || [],
    options: parsedOptions.length > 0
      ? parsedOptions
      : rawType === 'requirement'
        ? parseRequirementItems(body)
        : rawType === 'problem'
          ? parseSymptomItems(body)
          : [],
    extra,
    body: body.trim(),
    file: path.basename(filePath),
  };
}

export function buildGraph(decisionsDir: string = DECISIONS_DIR): Graph {
  const nodes: DecisionNode[] = [];
  const connections: GraphConnection[] = [];

  // Read all .md files
  const files = fs.readdirSync(decisionsDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('README'))
    .sort();

  for (const file of files) {
    const fullPath = path.join(decisionsDir, file);
    const node = parseDecisionFile(fullPath);
    // Skip files without frontmatter id (e.g. README.md)
    if (node && node.id && node.id !== 'README' && node.title !== 'Untitled') {
      nodes.push(node);
    }
  }

  // Build connections
  const connIds = new Set<string>();
  const addConnection = (from: string, to: string, kind: 'parent' | 'cross-ref') => {
    const id = `${kind}:${from}:${to}`;
    if (!connIds.has(id)) {
      connIds.add(id);
      connections.push({ id, from, to, kind });
    }
  };

  for (const node of nodes) {
    // Parent connection (parent → this node)
    if (node.parent) {
      addConnection(node.parent, node.id, 'parent');
    }

    // Cross-reference connections
    for (const ref of node.cross_refs) {
      addConnection(node.id, ref, 'cross-ref');
    }
  }

  return { nodes, connections };
}

/**
 * Vote tally: sums weights per option.
 */
export function tallyVotes(voters: Voter[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const v of voters) {
    tally[v.vote] = (tally[v.vote] || 0) + v.weight;
  }
  return tally;
}


// ─── Body Section Parser ───────────────────────────────────

export interface BodySections {
  context: string;
  options: string;
  decision: string;
  consequences: string;
  // type-specific
  symptoms: string;       // problem: симптомы/факты
  relevance: string;      // problem: критерии актуальности
  requirements: string;   // requirement: список требований
  constraints: string;    // requirement: ограничения
  acceptance: string;     // requirement: критерии приёмки
  approaches: string;     // paradigm: подходы
  tradeoffs: string;      // paradigm: трейд-оффы
  legacy: string;         // migrated unknown content ('## Перенесено')
}

/** Empty superset record. */
export function emptySections(): BodySections {
  return { context: '', options: '', decision: '', consequences: '', symptoms: '', relevance: '', requirements: '', constraints: '', acceptance: '', approaches: '', tradeoffs: '', legacy: '' };
}

/**
 * Section schema per node type: ordered list of [sectionKey, RU header].
 * Defines which sections a type's card shows/edits AND the write order in MD.
 */
export const TYPE_SECTIONS: Record<string, [keyof BodySections, string][]> = {
  problem: [
    ['context', 'Контекст'],
    ['symptoms', 'Симптомы и факты'],
    ['relevance', 'Критерии актуальности'],
  ],
  requirement: [
    ['context', 'Контекст'],
    ['requirements', 'Требования'],
    ['constraints', 'Ограничения'],
    ['acceptance', 'Критерии приёмки'],
  ],
  paradigm: [
    ['context', 'Контекст'],
    ['approaches', 'Подходы'],
    ['tradeoffs', 'Трейд-оффы'],
  ],
  decision: [
    ['context', 'Контекст'],
    ['options', 'Опции'],
    ['decision', 'Решение'],
    ['consequences', 'Последствия'],
  ],
  task: [
    ['context', 'Контекст'],
    ['decision', 'Решение'],
    ['consequences', 'Последствия'],
  ],
};

/** RU/EN header → section key (used by parser). */
const SECTION_ALIASES: Record<string, keyof BodySections> = {
  'контекст': 'context', 'контекста': 'context', 'context': 'context',
  'опции': 'options', 'options': 'options', 'варианты': 'options',
  'решение': 'decision', 'decision': 'decision',
  'последствия': 'consequences', 'consequences': 'consequences',
  'симптомы и факты': 'symptoms', 'симптомы': 'symptoms', 'symptoms': 'symptoms',
  'критерии актуальности': 'relevance', 'актуальность': 'relevance', 'relevance': 'relevance',
  'требования': 'requirements', 'requirements': 'requirements',
  'ограничения': 'constraints', 'constraints': 'constraints',
  'критерии приёмки': 'acceptance', 'приёмка': 'acceptance', 'acceptance': 'acceptance',
  'подходы': 'approaches', 'approaches': 'approaches',
  'трейд-оффы': 'tradeoffs', 'trade-offs': 'tradeoffs', 'tradeoffs': 'tradeoffs',
  'перенесено': 'legacy',
  // Canonical MADR (EN) headers — ingest compatibility
  'context and problem statement': 'context',
  'decision drivers': 'symptoms',
  'considered options': 'options',
  'pros and cons of the options': 'options',
  'decision outcome': 'decision',
  'confirmation': 'legacy',
  'more information': 'legacy',
  'links': 'legacy',
};

/** Normalized-content key for section dedupe (collapse whitespace). */
function sectionKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** True when `content` (or every line of it) is already present in `existing`. */
function sectionContains(existing: string, content: string): boolean {
  if (!existing) return false;
  const ke = sectionKey(existing);
  const kc = sectionKey(content);
  if (!kc) return true;
  if (ke.includes(kc)) return true;
  // Line-wise: every non-empty line of content already in existing
  const lines = kc.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0 && lines.every(l => ke.includes(l))) return true;
  return false;
}

/** Append content to a section field unless it's already there (dedupe). */
function mergeSection(target: { value: string }, content: string): void {
  if (!content.trim()) return;
  if (sectionContains(target.value, content)) return;
  target.value = target.value ? target.value + '\n\n' + content : content;
}

/** Split `## Decision Outcome` content into decision text, nested
 * `### Consequences` body and trailing H3 blocks (`### Confirmation`, ...). */
function splitOutcomeSection(content: string): { decision: string; consequences: string; rest: string } {
  const consIdx = content.search(/^### Consequences\s*$/m);
  if (consIdx >= 0) {
    const decision = content.slice(0, consIdx).trim();
    const after = content.slice(consIdx).replace(/^### Consequences\s*\n/, '');
    const confIdx = after.search(/^### Confirmation\s*$/m);
    if (confIdx >= 0) {
      return { decision, consequences: after.slice(0, confIdx).trim(), rest: after.slice(confIdx).trim() };
    }
    return { decision, consequences: after.trim(), rest: '' };
  }
  const confIdx = content.search(/^### Confirmation\s*$/m);
  if (confIdx >= 0) {
    return { decision: content.slice(0, confIdx).trim(), consequences: '', rest: content.slice(confIdx).trim() };
  }
  return { decision: content.trim(), consequences: '', rest: '' };
}

export function parseBodySections(body: string): BodySections {
  const sections = emptySections();
  const headerRegex = /^## (.+)$/gm;
  const matches: { title: string; start: number; headerStart: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(body)) !== null) {
    matches.push({ title: m[1].trim().toLowerCase(), headerStart: m.index, start: m.index + m[0].length, end: body.length });
  }
  for (let i = 0; i < matches.length; i++) {
    matches[i].end = i + 1 < matches.length ? matches[i + 1].headerStart : body.length;
  }
  // Preamble before the first '##': canonical MADR bodies start with `# Title`.
  // The H1 IS the title (extracted separately) — don't duplicate it into legacy.
  // Any non-H1 preamble content (intro text) is preserved via legacy.
  if (matches.length > 0 && matches[0].headerStart > 0) {
    const preamble = body.slice(0, matches[0].headerStart).trim();
    if (preamble) {
      const stripped = preamble.replace(/^#\s+.+\n?/, '').trim();
      if (stripped) {
        sections.legacy += (sections.legacy ? '\n\n' : '') + stripped;
      }
    }
  }
  for (const match of matches) {
    const content = body.substring(match.start, match.end).trim();
    if (!content) continue;
    const key = SECTION_ALIASES[match.title];
    if (key === 'context' && sections.context) {
      // legacy files sometimes used '## Требование' as context header — don't overwrite real context
      if (!sectionContains(sections.legacy, content)) {
        sections.legacy += (sections.legacy ? '\n\n' : '') + `## ${match.title}\n\n${content}`;
      }
    } else if (key === 'decision') {
      // Canonical MADR nests `### Consequences` and `### Confirmation` INSIDE
      // ## Decision Outcome — split them into their own fields / legacy.
      const parts = splitOutcomeSection(content);
      mergeSection({ get value() { return (sections as any).decision; }, set value(v: string) { (sections as any).decision = v; } }, parts.decision);
      mergeSection({ get value() { return (sections as any).consequences; }, set value(v: string) { (sections as any).consequences = v; } }, parts.consequences);
      if (parts.rest && !sectionContains(sections.legacy, parts.rest)) {
        sections.legacy += (sections.legacy ? '\n\n' : '') + parts.rest;
      }
    } else if (key) {
      mergeSection(
        { get value() { return (sections as any)[key]; }, set value(v: string) { (sections as any)[key] = v; } },
        content,
      );
    } else {
      // Unknown section — preserve it in legacy so no data is lost on rewrite
      if (!sectionContains(sections.legacy, `## ${match.title}\n\n${content}`) && !sectionContains(sections.legacy, content)) {
        sections.legacy += (sections.legacy ? '\n\n' : '') + `## ${match.title}\n\n${content}`;
      }
    }
  }
  return sections;
}

// ─── ADR Markdown Generator ───────────────────────────────

export interface AdrInput {
  id?: string;
  title: string;
  status?: string;
  type?: string;
  phase?: number;
  parent?: string | null;
  cross_refs?: string[];
  context?: string;
  options?: { letter: string; title: string; description?: string }[];
  decision?: string;
  consequences?: string;
  // type-specific sections
  symptoms?: string;
  relevance?: string;
  requirements?: string;
  constraints?: string;
  acceptance?: string;
  approaches?: string;
  tradeoffs?: string;
  legacy?: string;
  created?: string;
  decided?: string | null;
  voters?: { name: string; role?: string; vote?: string; weight?: number; rationale?: string }[];
  extra?: Record<string, any>; // unknown frontmatter passthrough (MADR: tags, decision-makers, ...)
}

/** Canonical MADR v3 section headers (file format). UI display stays RU. */
const CANON_HEADERS = {
  context: 'Context and Problem Statement',
  drivers: 'Decision Drivers',
  considered: 'Considered Options',
  outcome: 'Decision Outcome',
  proscons: 'Pros and Cons of the Options',
  moreInfo: 'More Information',
};

/** Quote a YAML scalar only when needed (colons/specials would break `key: value`). */
function yamlScalar(v: unknown): string {
  if (typeof v === 'number') return String(v);
  const str = String(v ?? '');
  return /^[^:#\n]+$/.test(str) && str.trim() === str && str.length > 0 ? str : JSON.stringify(str);
}

export function generateAdrMarkdown(input: AdrInput): { filename: string; content: string } {
  const id = input.id || String(Date.now()).slice(-3);
  const status = input.status || 'proposed';
  const type = input.type || 'decision';
  const phase = input.phase || typeToPhase(type);
  const parent = input.parent || 'null';
  const created = input.created || new Date().toISOString().split('T')[0];

  // ── Frontmatter: archtrace extensions + canonical MADR keys.
  // No `title:` — canonical MADR carries the title as body H1.
  let fm = `---\nid: "${id}"\n`;
  fm += `status: ${status}\n`;
  fm += `type: ${type}\n`;
  fm += `phase: ${phase}\n`;
  fm += `parent: ${parent === 'null' ? 'null' : `"${parent}"`}\n`;
  fm += `cross_refs: ${input.cross_refs?.length ? JSON.stringify(input.cross_refs).replace(/\[|\]|"/g, m => m === '[' ? '[' : m === ']' ? ']' : '"') : '[]'}\n`;
  fm += `created: ${created}\n`;
  if (input.decided) fm += `date: ${input.decided}\n`;
  if (input.voters?.length) {
    fm += `voters:\n`;
    for (const v of input.voters) {
      fm += `  - name: ${yamlScalar(v.name)}\n`;
      if (v.role) fm += `    role: ${yamlScalar(v.role)}\n`;
      if (v.vote) fm += `    vote: ${yamlScalar(v.vote)}\n`;
      if (v.weight !== undefined) fm += `    weight: ${v.weight}\n`;
      if (v.rationale) fm += `    rationale: ${yamlScalar(v.rationale)}\n`;
    }
  }
  if (input.extra) {
    for (const [k, v] of Object.entries(input.extra)) {
      if (v === undefined || v === null || v === '') continue;
      // Canonical names win: decided → date already emitted above.
      if (k === 'date') continue;
      const serialized = typeof v === 'string' && /^[\w./:+ -]+$/.test(v) ? v : JSON.stringify(v);
      fm += `${k}: ${serialized}\n`;
    }
  }
  fm += `---\n\n`;

  // ── Body: canonical MADR layout (H1 title, EN headers). UI stays RU.
  let body = `# ${input.title}\n\n`;

  if (type === 'problem') {
    if (input.context) body += `## Контекст\n\n${input.context}\n\n`;
    if (input.symptoms) body += `## Симптомы и факты\n\n${input.symptoms}\n\n`;
    if (input.relevance) body += `## Критерии актуальности\n\n${input.relevance}\n\n`;
  } else if (type === 'requirement') {
    if (input.context) body += `## Контекст\n\n${input.context}\n\n`;
    if (input.requirements) body += `## Требования\n\n${input.requirements}\n\n`;
    if (input.constraints) body += `## Ограничения\n\n${input.constraints}\n\n`;
    if (input.acceptance) body += `## Критерии приёмки\n\n${input.acceptance}\n\n`;
  } else if (type === 'paradigm') {
    if (input.context) body += `## Контекст\n\n${input.context}\n\n`;
    if (input.approaches) body += `## Подходы\n\n${input.approaches}\n\n`;
    if (input.tradeoffs) body += `## Трейд-оффы\n\n${input.tradeoffs}\n\n`;
  } else {
    // decision / task / legacy types — canonical MADR layout
    if (input.context) {
      body += `## ${CANON_HEADERS.context}\n\n${input.context}\n\n`;
    }
    if (input.symptoms) {
      // MADR ingested drivers live in symptoms; keep them in canonical place.
      body += `## ${CANON_HEADERS.drivers}\n\n${input.symptoms}\n\n`;
    }
    if (input.options?.length) {
      body += `## ${CANON_HEADERS.considered}\n\n`;
      for (const opt of input.options) {
        body += `* ${opt.title}\n`;
      }
      body += `\n## ${CANON_HEADERS.outcome}\n\n`;
      const chosen = input.decision
        ? input.decision
        : `Chosen option: "${input.options[0]?.title || ''}", because`;
      body += `${chosen}\n\n`;
    } else if (input.decision) {
      body += `## ${CANON_HEADERS.outcome}\n\n${input.decision}\n\n`;
    }
    if (input.consequences) {
      body += `### Consequences\n\n${input.consequences}\n\n`;
    }
    if (input.options?.length && input.options.some(o => o.description)) {
      body += `## ${CANON_HEADERS.proscons}\n\n`;
      for (const opt of input.options) {
        if (!opt.description) continue;
        body += `### ${opt.title}\n\n`;
        for (const line of opt.description.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          body += `* ${t}\n`;
        }
        body += `\n`;
      }
    }
  }

  if (input.legacy) {
    body += `${input.legacy}\n\n`;
  }

  // Filename: slugify title
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
  const filename = `${id.padStart(3, '0')}-${slug}.md`;

  return { filename, content: fm + body };
}
