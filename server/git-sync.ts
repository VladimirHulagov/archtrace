/**
 * Git Sync Module
 *
 * Clones/pulls the ADR repository to git-data/ on disk.
 * Uses child_process git CLI — no native git bindings needed.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getCloneDir, getCloneUrl, getDecisionsDir, loadConfig, type ArchTraceConfig } from './config.js';

function authGitUrl(url: string): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return url;
  if (url.startsWith('https://github.com')) {
    return url.replace('https://', `https://x-access-token:${token}@`);
  }
  return url;
}


export interface SyncResult {
  success: boolean;
  action: 'clone' | 'pull' | 'none';
  message: string;
  commitHash?: string;
  timestamp: string;
}

/**
 * Ensure the repo is cloned and up-to-date.
 * - If git-data/ doesn't exist → clone
 * - If git-data/ exists → pull
 */
export function syncRepo(config?: ArchTraceConfig): SyncResult {
  const cfg = config || loadConfig();
  const cloneDir = getCloneDir();
  const cloneUrl = getCloneUrl(cfg);
  const branch = cfg.repo.branch || 'main';
  const timestamp = new Date().toISOString();

  try {
    // Check if already cloned
    const gitDirExists = fs.existsSync(path.join(cloneDir, '.git'));

    if (!gitDirExists) {
      // Clone fresh. If dir exists (e.g. docker volume mount point), clone into it.
      // git clone refuses if target dir exists and is non-empty, but works with empty mount points.
      if (fs.existsSync(cloneDir)) {
        // Check if directory is empty (docker volume mounts as empty dir)
        const entries = fs.readdirSync(cloneDir);
        if (entries.length > 0) {
          // Non-empty without .git — try to remove contents, not the dir itself
          for (const entry of entries) {
            const entryPath = path.join(cloneDir, entry);
            try {
              fs.rmSync(entryPath, { recursive: true, force: true });
            } catch {
              // If we can't remove (EBUSY on volume mount), clone to a temp dir and move
            }
          }
        }
      }

      try {
        execSync(
          `git clone  --branch ${branch} "${authGitUrl(cloneUrl)}" "${cloneDir}"`,
          { stdio: 'pipe', timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
        );
      } catch (cloneErr: any) {
        // Fallback: clone to temp dir, then copy contents
        const tempDir = cloneDir + '-tmp-' + Date.now();
        execSync(
          `git clone  --branch ${branch} "${authGitUrl(cloneUrl)}" "${tempDir}"`,
          { stdio: 'pipe', timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
        );
        // Copy all files including .git from temp to cloneDir
        execSync(`cp -a "${tempDir}/." "${cloneDir}/"`, { stdio: 'pipe', timeout: 15000 });
        execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe', timeout: 10000 });
      }

      const commitHash = execSync('git rev-parse --short HEAD', {
        cwd: cloneDir, encoding: 'utf-8',
      }).trim();

      return {
        success: true,
        action: 'clone',
        message: `Cloned ${cfg.repo.url} (branch: ${branch})`,
        commitHash,
        timestamp,
      };
    }

    // Pull latest
    execSync(`git fetch origin ${branch} `, {
      cwd: cloneDir, stdio: 'pipe', timeout: 30000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });

    const localHash = execSync('git rev-parse --short HEAD', {
      cwd: cloneDir, encoding: 'utf-8',
    }).trim();

    execSync(`git reset --hard origin/${branch}`, {
      cwd: cloneDir, stdio: 'pipe', timeout: 15000,
    });

    const newHash = execSync('git rev-parse --short HEAD', {
      cwd: cloneDir, encoding: 'utf-8',
    }).trim();

    if (localHash === newHash) {
      return {
        success: true,
        action: 'pull',
        message: `Already up to date (${newHash})`,
        commitHash: newHash,
        timestamp,
      };
    }

    return {
      success: true,
      action: 'pull',
      message: `Updated ${localHash} → ${newHash}`,
      commitHash: newHash,
      timestamp,
    };

  } catch (err: any) {
    const msg = err.stderr?.toString().trim() || err.message || 'Unknown error';
    return {
      success: false,
      action: cloneDir && fs.existsSync(path.join(cloneDir, '.git')) ? 'pull' : 'clone',
      message: `Sync failed: ${msg}`,
      timestamp,
    };
  }
}

/**
 * Check if the repo is cloned and ready.
 */
export function isRepoReady(): boolean {
  const cloneDir = getCloneDir();
  return fs.existsSync(path.join(cloneDir, '.git'));
}

/**
 * Get the active decisions directory path.
 */
export function getActiveDecisionsDir(): string {
  const cfg = loadConfig();
  return getDecisionsDir(cfg);
}

/**
 * Commit and push changes back to the repo (for CRUD operations).
 */
export function pushChanges(message: string, config?: ArchTraceConfig): SyncResult {
  const cfg = config || loadConfig();
  const cloneDir = getCloneDir();
  const timestamp = new Date().toISOString();

  try {
    execSync('git add -A', { cwd: cloneDir, stdio: 'pipe', timeout: 10000 });

    // Check if there are changes to commit
    try {
      execSync('git diff --cached --quiet', { cwd: cloneDir, stdio: 'pipe' });
      return {
        success: true,
        action: 'none',
        message: 'No changes to commit',
        timestamp,
      };
    } catch {
      // There ARE changes — proceed with commit
    }

    execSync(
      `git commit -m "${message.replace(/"/g, '\\"')}" --author "ArchTrace <archtrace@bots.collaborationism.tech>"`,
      { cwd: cloneDir, stdio: 'pipe', timeout: 10000 }
    );

    execSync('git push origin HEAD', {
      cwd: cloneDir, stdio: 'pipe', timeout: 30000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });

    const commitHash = execSync('git rev-parse --short HEAD', {
      cwd: cloneDir, encoding: 'utf-8',
    }).trim();

    return {
      success: true,
      action: 'pull', // reuse 'pull' type for push context
      message: `Pushed: ${message}`,
      commitHash,
      timestamp,
    };
  } catch (err: any) {
    const msg = err.stderr?.toString().trim() || err.message || 'Unknown error';
    return {
      success: false,
      action: 'none',
      message: `Push failed: ${msg}`,
      timestamp,
    };
  }
}
