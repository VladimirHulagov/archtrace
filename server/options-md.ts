/**
 * Options MD — helpers for reading/writing options directly in ADR markdown files.
 * Source of truth for options = the MD file (git-versioned).
 */

import fs from 'fs';
import path from 'path';

export interface MdOption {
  letter: string;
  title: string;
}

/**
 * Parse options from a markdown body (## Опции / ### Option A: Title).
 * Same logic as parseOptions in parse.ts, kept here for independence.
 */
export function parseOptionsFromMd(body: string): MdOption[] {
  const options: MdOption[] = [];
  const lines = body.split('\n');
  for (const line of lines) {
    const m = line.match(/^#{2,3}\s+(?:Option\s+)?([A-Z])\s*[:.·]\s*(.+)/i);
    if (m) {
      const letter = m[1].toUpperCase();
      const title = m[2].trim();
      if (title.length > 2 && !['Context', 'Decision', 'Requirement', 'Consequences', 'Options'].includes(title)) {
        if (!options.find(o => o.letter === letter)) {
          options.push({ letter, title });
        }
      }
    }
  }
  return options;
}

/**
 * Find the file path for a decision node by searching the decisions dir.
 */
export function findDecisionFile(decisionsDir: string, nodeId: string): string | null {
  const files = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const fullPath = path.join(decisionsDir, file);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const idMatch = fmMatch[1].match(/^id:\s*["']?([^"'\n]+)["']?/m);
      if (idMatch && idMatch[1].trim() === nodeId) {
        return fullPath;
      }
    }
  }
  return null;
}

/**
 * Add an option to the MD file. Inserts into the ## Опции section,
 * or creates the section if it doesn't exist.
 * Returns the updated raw file content.
 */
export function addOptionToMd(rawMd: string, letter: string, title: string): string {
  const optionLine = `### Option ${letter}: ${title}`;

  // Check if this option already exists (by letter)
  const existing = parseOptionsFromMd(rawMd);
  if (existing.find(o => o.letter === letter.toUpperCase())) {
    // Update instead of add
    return updateOptionInMd(rawMd, letter, title);
  }

  // Find the ## Опции section
  const optionsSectionRegex = /^## (Опции|Options)\s*$/gim;
  const match = optionsSectionRegex.exec(rawMd);

  if (match) {
    // Find the end of the options section (next ## heading or end of file)
    const afterSection = rawMd.slice(match.index + match[0].length);
    const nextSectionMatch = afterSection.match(/\n##\s/);
    let insertPos: number;
    if (nextSectionMatch) {
      // Insert before the next ## heading
      insertPos = match.index + match[0].length + (nextSectionMatch.index ?? 0);
      const before = rawMd.slice(0, insertPos);
      const after = rawMd.slice(insertPos);
      // Trim trailing whitespace/newlines in 'before' before adding option
      const trimmedBefore = before.replace(/\n*$/, '\n\n');
      return trimmedBefore + optionLine + '\n\n' + after.replace(/^\n*/, '');
    } else {
      // No next section — append at end of options section
      const sectionContent = rawMd.slice(match.index + match[0].length);
      const before = rawMd.slice(0, match.index + match[0].length);
      return before + '\n' + sectionContent.trimEnd() + '\n\n' + optionLine + '\n';
    }
  } else {
    // No ## Опции section — create one.
    // Insert before ## Решение if it exists, otherwise at end of body (after frontmatter).
    const decisionSection = rawMd.match(/^## (Решение|Decision)\s*$/m);
    if (decisionSection) {
      const insertBefore = decisionSection.index!;
      const before = rawMd.slice(0, insertBefore);
      const after = rawMd.slice(insertBefore);
      return before + `## Опции\n\n${optionLine}\n\n` + after;
    }
    // No Решение section either — append at end
    return rawMd.trimEnd() + `\n\n## Опции\n\n${optionLine}\n`;
  }
}

/**
 * Update an option's title in the MD file.
 */
export function updateOptionInMd(rawMd: string, letter: string, newTitle: string): string {
  const escapedLetter = letter.toUpperCase();
  // Match: ### Option A: Old Title  OR  ### A: Old Title
  const regex = new RegExp(
    `^(#{2,3}\\s+(?:Option\\s+)?${escapedLetter}\\s*[:.·]\\s*)(.+)$`,
    'm'
  );
  return rawMd.replace(regex, `$1${newTitle}`);
}

/**
 * Remove an option from the MD file by letter.
 * Removes the ### Option X: Title line and any description lines following it
 * (until the next ### or ## heading or end of options section).
 */
export function removeOptionFromMd(rawMd: string, letter: string): string {
  const escapedLetter = letter.toUpperCase();
  const lines = rawMd.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line is the option to remove
    const optMatch = line.match(
      new RegExp(`^#{2,3}\\s+(?:Option\\s+)?${escapedLetter}\\s*[:.·]\\s*.+`, 'i')
    );

    if (optMatch) {
      skipping = true;
      continue;
    }

    // If we're skipping and hit a new heading, stop skipping
    if (skipping) {
      if (line.match(/^#{1,3}\s/)) {
        skipping = false;
        result.push(line);
      }
      // Skip description lines (part of the removed option)
      continue;
    }

    result.push(line);
  }

  // Clean up: if ## Опции section is now empty, remove it
  let joined = result.join('\n');
  joined = joined.replace(/^(## (Опции|Options)\s*)\n+(?=\n*##\s|$)/gim, '');

  return joined;
}
