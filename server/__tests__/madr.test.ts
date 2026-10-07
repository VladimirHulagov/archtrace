import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseDecisionFile,
  buildGraph,
  parseBodySections,
  generateAdrMarkdown,
  normalizeStatus,
  extractH1Title,
  parseMadrOptions,
  type DecisionNode,
} from '../parse';

// ─── Canonical MADR v3 fixture (filled, per adr/madr template) ──────────

const CANONICAL_MADR = `---
status: adopted
date: 2026-10-01
decision-makers: Alice, Bob
tags: storage, cdc
---

# Use append-only event log for audit trail

## Context and Problem Statement

We need an immutable audit trail for all state changes.

## Decision Drivers

* Regulators require 7-year retention
* Replay must be deterministic

## Considered Options

* Append-only Kafka topic
* Postgres table with trigger-based history

## Decision Outcome

Chosen option: "Postgres table with trigger-based history", because it keeps ops simple.

### Consequences

* Good, because one datastore to back up
* Bad, because table growth needs partitioning

### Confirmation

CI test replays events nightly.

## Pros and Cons of the Options

### Append-only Kafka topic

* Good, because horizontal scale
* Bad, because extra infra

### Postgres table with trigger-based history

* Good, because no new infra
* Neutral, because slower at extreme write rates

## More Information

See ADR-007 for retention policy.
`;

let tmpDir: string;

function writeMd(name: string, content: string): DecisionNode {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf-8');
  const node = parseDecisionFile(p);
  if (!node) throw new Error(`parseDecisionFile returned null for ${name}`);
  return node;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madr-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Ingest: canonical MADR file ─────────────────────────────────────────

describe('MADR ingest', () => {
  it('extracts title from body H1 (no title frontmatter)', () => {
    const node = writeMd('001-use-event-log.md', CANONICAL_MADR);
    expect(node.title).toBe('Use append-only event log for audit trail');
  });

  it('normalizes status: adopted → accepted', () => {
    const node = writeMd('001-use-event-log.md', CANONICAL_MADR);
    expect(node.status).toBe('accepted');
  });

  it('parses Considered Options into letters A, B', () => {
    const node = writeMd('001-use-event-log.md', CANONICAL_MADR);
    expect(node.options.map(o => o.letter)).toEqual(['A', 'B']);
    expect(node.options[0].title).toBe('Append-only Kafka topic');
    expect(node.options[1].title).toBe('Postgres table with trigger-based history');
  });

  it('attaches Pros/Cons bullets as option descriptions', () => {
    const node = writeMd('001-use-event-log.md', CANONICAL_MADR);
    expect(node.options[1].description).toContain('Good, because no new infra');
    expect(node.options[0].description).toContain('Bad, because extra infra');
  });

  it('keeps unknown frontmatter keys as extra (tags, decision-makers, date)', () => {
    const node = writeMd('001-use-event-log.md', CANONICAL_MADR);
    expect(node.extra['tags']).toBe('storage, cdc');
    expect(node.extra['decision-makers']).toBe('Alice, Bob');
    expect(node.extra['date']).toBe('2026-10-01');
  });

  it('maps date → decided when no archtrace decided key exists', () => {
    const node = writeMd('001-use-event-log.md', CANONICAL_MADR);
    expect(node.decided).toBe('2026-10-01');
  });

  it('maps canonical sections: drivers→symptoms, options→options, outcome→decision', () => {
    const node = writeMd('001-use-event-log.md', CANONICAL_MADR);
    const s = parseBodySections(node.body);
    expect(s.context).toContain('immutable audit trail');
    expect(s.symptoms).toContain('7-year retention');
    expect(s.options).toContain('Append-only Kafka topic');
    expect(s.options).toContain('Good, because horizontal scale'); // Pros/Cons appended, not overwritten
    expect(s.decision).toContain('Chosen option');
    expect(s.legacy).toContain('# Use append-only event log'); // H1 preamble preserved
    expect(s.legacy).toContain('See ADR-007'); // More Information preserved
  });

  it('bare MADR template (comment placeholders) yields Untitled + no phantom options', () => {
    const bare = `---

# <!-- short title, representative of solved problem and found solution -->

## Context and Problem Statement

## Decision Drivers

* <!-- decision driver -->

## Considered Options

* <!-- option -->

## Decision Outcome

Chosen option: "", because
`;
    const node = writeMd('002-bare.md', bare);
    expect(node.title).toBe('Untitled');
    expect(node.options).toEqual([]);
  });

  it("'superseded by ADR-012' → status superseded + implicit cross-ref", () => {
    const node = writeMd('003-old.md', `---\nstatus: superseded by ADR-012\n---\n\n# Old decision\n\n## Context\n\nobsolete\n`);
    expect(node.status).toBe('superseded');
    expect(node.cross_refs).toContain('ADR-012');
  });

  it('MADR v2 nested status object (date + deciders) parses', () => {
    const node = writeMd('004-v2.md', `---\nstatus:\n  date: 2026-01-15\n  deciders: Alice, Bob\n---\n\n# V2 style\n\n## Context\n\nc\n`);
    expect(node.status).toBe('proposed');
    expect(node.decided).toBe('2026-01-15');
    expect(node.extra['deciders']).toBe('Alice, Bob');
  });

  it('buildGraph skips bare/untitled MADR files', () => {
    writeMd('002-bare.md', `---\nstatus:\n---\n\n# <!-- x -->\n\n## Context\n\nc\n`);
    const graph = buildGraph(tmpDir);
    expect(graph.nodes.find(n => n.id === '002-bare')).toBeUndefined();
    expect(graph.nodes.find(n => n.id === '001-use-event-log')).toBeDefined();
  });
});

// ─── Round-trip: archtrace → generate → parse ────────────────────────────

describe('round-trip stability', () => {
  it('generateAdrMarkdown output re-parses with same sections, extra, decided', () => {
    const { filename, content } = generateAdrMarkdown({
      id: '005',
      title: 'Use CDC pipeline',
      status: 'accepted',
      type: 'decision',
      parent: null,
      cross_refs: ['007'],
      context: 'We need change capture.',
      options: [
        { letter: 'A', title: 'Kafka', description: 'Good, because scale\nBad, because ops' },
        { letter: 'B', title: 'Debezium', description: 'Good, because mature' },
      ],
      decision: 'Chosen Debezium, because mature.',
      consequences: 'Good, because less glue code.',
      extra: { tags: 'cdc, storage', 'decision-makers': 'Alice, Bob' },
      decided: '2026-10-02',
      created: '2026-10-01',
    });
    const p = path.join(tmpDir, filename);
    fs.writeFileSync(p, content, 'utf-8');
    const node = parseDecisionFile(p)!;

    expect(node.id).toBe('005');
    expect(node.title).toBe('Use CDC pipeline');
    expect(node.status).toBe('accepted');
    expect(node.decided).toBe('2026-10-02');
    expect(node.cross_refs).toEqual(['007']);
    expect(node.extra['tags']).toBe('cdc, storage');
    expect(node.extra['decision-makers']).toBe('Alice, Bob');
    expect(node.options.map(o => o.letter)).toEqual(['A', 'B']);
    expect(node.options[0].description).toContain('Good, because scale');

    const s = parseBodySections(content);
    expect(s.context).toBe('We need change capture.');
    expect(s.decision).toContain('Chosen Debezium');
    expect(s.consequences).toContain('less glue code');
  });

  it('double round-trip is idempotent', () => {
    const first = generateAdrMarkdown({
      id: '006',
      title: 'Idempotent ADR',
      status: 'proposed',
      type: 'decision',
      parent: null,
      cross_refs: [],
      context: 'C',
      decision: 'D',
      consequences: 'K',
      extra: { tags: 'x' },
      created: '2026-10-01',
    });
    const p1 = path.join(tmpDir, first.filename);
    fs.writeFileSync(p1, first.content, 'utf-8');
    const node = parseDecisionFile(p1)!;
    const second = generateAdrMarkdown({
      id: node.id,
      title: node.title,
      status: node.status,
      type: node.type,
      parent: node.parent,
      cross_refs: node.cross_refs,
      context: parseBodySections(node.body).context,
      decision: parseBodySections(node.body).decision,
      consequences: parseBodySections(node.body).consequences,
      options: node.options,
      extra: node.extra,
      created: node.created,
      decided: node.decided,
    });
    expect(second.content).toBe(first.content);
  });
});

// ─── Units ────────────────────────────────────────────────────────────────

describe('units', () => {
  it('normalizeStatus maps all MADR variants', () => {
    expect(normalizeStatus('draft').status).toBe('proposed');
    expect(normalizeStatus('proposed').status).toBe('proposed');
    expect(normalizeStatus('debating').status).toBe('debating');
    expect(normalizeStatus('accepted').status).toBe('accepted');
    expect(normalizeStatus('adopted').status).toBe('accepted');
    expect(normalizeStatus('rejected').status).toBe('rejected');
    expect(normalizeStatus('superseded by ADR-012')).toMatchObject({ status: 'superseded', supersededBy: 'ADR-012' });
    expect(normalizeStatus('weird-value').status).toBe('proposed');
    expect(normalizeStatus(null).status).toBe('proposed');
  });

  it('extractH1Title strips comment placeholders and picks first H1', () => {
    expect(extractH1Title('# Real title\n\n## Context')).toBe('Real title');
    expect(extractH1Title('# <!-- placeholder -->')).toBe('');
    expect(extractH1Title('## Only H2')).toBe('');
  });

  it('parseMadrOptions dedupes case-insensitively', () => {
    const opts = parseMadrOptions('## Considered Options\n\n* Alpha\n* alpha\n* Beta\n');
    expect(opts.map(o => o.title)).toEqual(['Alpha', 'Beta']);
  });
});
