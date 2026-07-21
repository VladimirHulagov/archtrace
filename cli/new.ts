#!/usr/bin/env node

/**
 * ArchTrace CLI — create new ADR files from template.
 *
 * Usage:
 *   npm run new "Decision title"
 *   npm run new "Decision title" -- --parent 002
 *   npm run new "Decision title" -- --type requirement
 *   npm run new "Decision title" -- --parent 002 --type task
 */

import fs from 'fs';
import path from 'path';

// ─── Args ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const title = args.find(a => !a.startsWith('--'));
const parentArg = args.find(a => a.startsWith('--parent'));
const typeArg = args.find(a => a.startsWith('--type'));

if (!title) {
  console.error('Usage: npm run new "Decision title" [--parent ID] [--type requirement|decision|task]');
  process.exit(1);
}

const parent = parentArg ? parentArg.split('=')[1] || parentArg.split(' ')[1] : null;
const type = typeArg ? (typeArg.split('=')[1] || typeArg.split(' ')[1]) : 'decision';

// ─── Determine next ID ─────────────────────────────────────

const decisionsDir = path.resolve(process.cwd(), 'decisions');

if (!fs.existsSync(decisionsDir)) {
  fs.mkdirSync(decisionsDir, { recursive: true });
}

const existingFiles = fs.readdirSync(decisionsDir)
  .filter(f => f.endsWith('.md'))
  .map(f => parseInt(f.match(/^(\d+)/)?.[1] || '0', 10))
  .filter(n => !isNaN(n));

const nextId = existingFiles.length > 0 ? Math.max(...existingFiles) + 1 : 1;
const idStr = String(nextId).padStart(3, '0');

// ─── Slugify ───────────────────────────────────────────────

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

const filename = `${idStr}-${slug}.md`;
const filepath = path.join(decisionsDir, filename);

// ─── Template ──────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0];

const template = `---
id: "${idStr}"
title: "${title}"
status: proposed
type: ${type}
parent: ${parent ? `"${parent}"` : 'null'}
cross_refs: []
created: ${today}
decided: null
voters: []
---

## Context

Why this decision is needed. Reference parent: ${parent || '— (root)'}.

## Options

### Option A

- Pros:
- Cons:

### Option B

- Pros:
- Cons:

## Decision

_Under discussion._

## Consequences

_To be filled after decision._
`;

// ─── Write ─────────────────────────────────────────────────

fs.writeFileSync(filepath, template, 'utf-8');

console.log(`\n  ✅ Created: decisions/${filename}`);
console.log(`     ID: ${idStr}`);
console.log(`     Type: ${type}`);
console.log(`     Parent: ${parent || '— (root)'}`);
console.log(`\n  Edit: decisions/${filename}\n`);
