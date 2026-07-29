/**
 * ADR Parser — reads markdown files from decisions/ directory,
 * extracts YAML frontmatter + markdown body,
 * builds a graph of nodes and connections.
 */

import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────

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
  type: 'requirement' | 'decision' | 'task';
  parent: string | null;
  cross_refs: string[];
  created: string;
  decided: string | null;
  voters: Voter[];
  options: { letter: string; title: string }[];
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

    // Key-value pair
    const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
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

const DECISIONS_DIR = path.resolve(process.cwd(), 'decisions');


/**
 * Parse option names from markdown body.
 * Matches: ### Option A: Title  OR  ### A: Title  OR  ## A: Title
 */
function parseOptions(body: string): { letter: string; title: string }[] {
  const options: { letter: string; title: string }[] = [];
  const lines = body.split('\n');
  for (const line of lines) {
    // Match: ### Option A: ... or ### A: ... (but not ### Context, ### Decision, etc.)
    const m = line.match(/^#{2,3}\s+(?:Option\s+)?([A-Z])\s*[:.·]\s*(.+)/i);
    if (m) {
      const letter = m[1].toUpperCase();
      const title = m[2].trim();
      // Filter out false positives (Context, Requirement, etc.)
      if (title.length > 2 && !['Context', 'Decision', 'Requirement', 'Consequences', 'Options'].includes(title)) {
        if (!options.find(o => o.letter === letter)) {
          options.push({ letter, title });
        }
      }
    }
  }
  return options;
}

export function parseDecisionFile(filePath: string): DecisionNode | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  return {
    id: frontmatter.id || path.basename(filePath, '.md'),
    title: frontmatter.title || 'Untitled',
    status: frontmatter.status || 'proposed',
    type: frontmatter.type || 'decision',
    parent: frontmatter.parent ?? null,
    cross_refs: frontmatter.cross_refs || [],
    created: frontmatter.created || new Date().toISOString().split('T')[0],
    decided: frontmatter.decided ?? null,
    voters: frontmatter.voters || [],
    options: parseOptions(body),
    body: body.trim(),
    file: path.basename(filePath),
  };
}

export function buildGraph(decisionsDir: string = DECISIONS_DIR): Graph {
  const nodes: DecisionNode[] = [];
  const connections: GraphConnection[] = [];

  // Read all .md files
  const files = fs.readdirSync(decisionsDir)
    .filter(f => f.endsWith('.md'))
    .sort();

  for (const file of files) {
    const fullPath = path.join(decisionsDir, file);
    const node = parseDecisionFile(fullPath);
    if (node) {
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
