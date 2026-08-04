/**
 * ArchTrace Configuration
 *
 * Reads archtrace.config.json (or falls back to defaults).
 * Holds the Git repository URL + branch for ADR decisions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RepoConfig {
  url: string;
  branch: string;
  path: string;       // subdirectory inside the repo (e.g. "decisions" or ".")
  auth: {
    type: 'none' | 'token';
    token: string;
  };
}

export interface UserMapping {
  github: string;
  name: string;
  role: 'architect' | 'senior' | 'developer';
}

export interface ArchTraceConfig {
  repo: RepoConfig;
  users: UserMapping[];
}

const CONFIG_PATH = path.resolve(__dirname, '..', 'archtrace.config.json');

export function loadConfig(): ArchTraceConfig {
  const defaults: ArchTraceConfig = {
    repo: {
      url: 'https://github.com/VladimirHulagov/archtrace-decisions.git',
      branch: 'main',
      path: '.',
      auth: {
        type: 'none',
        token: '',
      },
    },
    users: [
      { github: 'VladimirHulagov', name: 'Vladimir', role: 'architect' },
    ],
  };

  if (!fs.existsSync(CONFIG_PATH)) {
    return defaults;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return { ...defaults, ...raw };
  } catch {
    return defaults;
  }
}

export function saveConfig(config: ArchTraceConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/** Build authenticated clone URL from config */
export function getCloneUrl(config: ArchTraceConfig): string {
  const url = config.repo.url;
  if (config.repo.auth.type === 'token' && config.repo.auth.token) {
    // Insert token into HTTPS URL: https://TOKEN@github.com/...
    return url.replace('https://', `https://${config.repo.auth.token}@`);
  }
  return url;
}

/** Where the repo clone lives on disk */
export function getCloneDir(): string {
  return path.resolve(__dirname, '..', 'git-data');
}

/** Where the decisions directory lives (clone + subpath) */
export function getDecisionsDir(config: ArchTraceConfig): string {
  const cloneDir = getCloneDir();
  return path.resolve(cloneDir, config.repo.path || '.');
}
