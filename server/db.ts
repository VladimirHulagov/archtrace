/**
 * ArchTrace Database Module
 *
 * PostgreSQL connection + query helpers.
 * Used for comments, votes, custom options, users, projects.
 * ADR content stays in Git — this DB is for service data only.
 */

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://archtrace:archtrace_dev_2026@archtrace-db:5432/archtrace';

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
});

/**
 * Run a parameterized query. Returns rows.
 */
export async function query(text: string, params?: any[]): Promise<any[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Run a single query and return first row.
 */
export async function queryOne(text: string, params?: any[]): Promise<any | null> {
  const rows = await query(text, params);
  return rows[0] || null;
}

/**
 * Check DB connectivity.
 */
export async function checkDb(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ─── Types ───────────────────────────────────────────────

export interface User {
  id: number;
  github_id: number;
  username: string;
  name: string | null;
  avatar_url: string | null;
  role: 'architect' | 'senior' | 'developer';
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  git_repo_url: string | null;
  git_branch: string;
  git_path: string;
  owner_id: number | null;
}

export interface Comment {
  id: number;
  node_id: string;
  project_id: number;
  parent_comment_id: number | null;
  author_id: number;
  author_name?: string;
  author_avatar?: string | null;
  content: string;
  likes: number;
  dislikes: number;
  user_reaction?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vote {
  id: number;
  node_id: string;
  project_id: number;
  option_letter: string;
  user_id: number;
  username?: string;
  weight: number;
  rationale: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomOption {
  id: number;
  node_id: string;
  project_id: number;
  letter: string;
  title: string;
  created_by: number | null;
  created_at: string;
}

// ─── Comments API ────────────────────────────────────────

export async function getComments(nodeId: string, projectId: number = 1): Promise<Comment[]> {
  return query(
    `SELECT c.*, u.username AS author_name, u.avatar_url AS author_avatar,
            c.likes, c.dislikes
     FROM comments c
     JOIN users u ON c.author_id = u.id
     WHERE c.node_id = $1 AND c.project_id = $2
     ORDER BY c.created_at ASC`,
    [nodeId, projectId]
  );
}

export async function addComment(
  nodeId: string,
  projectId: number,
  authorId: number,
  content: string,
  parentCommentId: number | null = null
): Promise<Comment> {
  const rows = await query(
    `INSERT INTO comments (node_id, project_id, author_id, content, parent_comment_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [nodeId, projectId, authorId, content, parentCommentId]
  );
  // Enrich with author info
  if (rows[0]) {
    const user = await queryOne('SELECT username, avatar_url FROM users WHERE id = $1', [authorId]);
    rows[0].author_name = user?.username;
    rows[0].author_avatar = user?.avatar_url;
  }
  return rows[0];
}

export async function updateComment(commentId: number, userId: number, content: string): Promise<any> {
  const rows = await query(
    'UPDATE comments SET content = $3, updated_at = NOW() WHERE id = $1 AND author_id = $2 RETURNING *',
    [commentId, userId, content]
  );
  return rows[0] || null;
}

export async function deleteCustomOption(nodeId: string, projectId: number, letter: string): Promise<boolean> {
  const rows = await query(
    'DELETE FROM custom_options WHERE node_id = $1 AND project_id = $2 AND letter = $3 RETURNING id',
    [nodeId, projectId, letter]
  );
  return rows.length > 0;
}

export async function deleteComment(commentId: number, userId: number): Promise<boolean> {
  const rows = await query(
    'DELETE FROM comments WHERE id = $1 AND author_id = $2 RETURNING id',
    [commentId, userId]
  );
  return rows.length > 0;
}

// ─── Votes API ───────────────────────────────────────────

export async function getVotes(nodeId: string, projectId: number = 1): Promise<Vote[]> {
  return query(
    `SELECT v.*, u.username
     FROM votes v
     JOIN users u ON v.user_id = u.id
     WHERE v.node_id = $1 AND v.project_id = $2
     ORDER BY v.created_at ASC`,
    [nodeId, projectId]
  );
}

export async function castVote(
  nodeId: string,
  projectId: number,
  userId: number,
  optionLetter: string,
  weight: number,
  rationale: string | null = null
): Promise<Vote> {
  // UPSERT: one vote per user per node
  const rows = await query(
    `INSERT INTO votes (node_id, project_id, user_id, option_letter, weight, rationale)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (node_id, project_id, user_id)
     DO UPDATE SET option_letter = $4, weight = $5, rationale = $6, updated_at = NOW()
     RETURNING *`,
    [nodeId, projectId, userId, optionLetter, weight, rationale]
  );
  if (rows[0]) {
    const user = await queryOne('SELECT username FROM users WHERE id = $1', [userId]);
    rows[0].username = user?.username;
  }
  return rows[0];
}

export async function removeVote(nodeId: string, projectId: number, userId: number): Promise<boolean> {
  const rows = await query(
    'DELETE FROM votes WHERE node_id = $1 AND project_id = $2 AND user_id = $3 RETURNING id',
    [nodeId, projectId, userId]
  );
  return rows.length > 0;
}

// ─── Custom Options API ──────────────────────────────────

export async function getCustomOptions(nodeId: string, projectId: number = 1): Promise<CustomOption[]> {
  return query(
    'SELECT * FROM custom_options WHERE node_id = $1 AND project_id = $2 ORDER BY created_at ASC',
    [nodeId, projectId]
  );
}

export async function addCustomOption(
  nodeId: string,
  projectId: number,
  letter: string,
  title: string,
  createdBy: number | null = null
): Promise<CustomOption> {
  const rows = await query(
    `INSERT INTO custom_options (node_id, project_id, letter, title, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (node_id, project_id, letter) DO UPDATE SET title = $4
     RETURNING *`,
    [nodeId, projectId, letter, title, createdBy]
  );
  return rows[0];
}


// ─── Comment Reactions API ───────────────────────────────

export async function toggleReaction(commentId: number, userId: number, reaction: 'like' | 'dislike'): Promise<{ likes: number; dislikes: number; userReaction: string | null }> {
  // Check existing reaction
  const existing = await queryOne(
    'SELECT reaction FROM comment_reactions WHERE comment_id = $1 AND user_id = $2',
    [commentId, userId]
  );

  if (existing) {
    if (existing.reaction === reaction) {
      // Same reaction — remove it (toggle off)
      await query('DELETE FROM comment_reactions WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);
    } else {
      // Different reaction — update
      await query('UPDATE comment_reactions SET reaction = $3 WHERE comment_id = $1 AND user_id = $2', [commentId, userId, reaction]);
    }
  } else {
    // No existing reaction — add new
    await query(
      'INSERT INTO comment_reactions (comment_id, user_id, reaction) VALUES ($1, $2, $3)',
      [commentId, userId, reaction]
    );
  }

  // Recount
  const likes = await queryOne('SELECT COUNT(*)::int AS count FROM comment_reactions WHERE comment_id = $1 AND reaction = $2', [commentId, 'like']);
  const dislikes = await queryOne('SELECT COUNT(*)::int AS count FROM comment_reactions WHERE comment_id = $1 AND reaction = $2', [commentId, 'dislike']);
  const userReact = await queryOne('SELECT reaction FROM comment_reactions WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);

  // Update denormalized counts
  await query('UPDATE comments SET likes = $2, dislikes = $3 WHERE id = $1', [commentId, likes?.count || 0, dislikes?.count || 0]);

  return {
    likes: likes?.count || 0,
    dislikes: dislikes?.count || 0,
    userReaction: userReact?.reaction || null,
  };
}

export async function getReactionsForComments(commentIds: number[], userId: number): Promise<Record<number, { likes: number; dislikes: number; userReaction: string | null }>> {
  if (commentIds.length === 0) return {};
  const result: Record<number, any> = {};
  for (const id of commentIds) {
    result[id] = { likes: 0, dislikes: 0, userReaction: null };
  }

  const rows = await query(
    `SELECT comment_id, reaction FROM comment_reactions WHERE comment_id = ANY($1)`,
    [commentIds]
  );
  for (const r of rows) {
    if (r.reaction === 'like') result[r.comment_id].likes++;
    else result[r.comment_id].dislikes++;
  }

  const userRows = await query(
    `SELECT comment_id, reaction FROM comment_reactions WHERE comment_id = ANY($1) AND user_id = $2`,
    [commentIds, userId]
  );
  for (const r of userRows) {
    result[r.comment_id].userReaction = r.reaction;
  }

  return result;
}

// ─── Custom Options Update ───────────────────────────────

export async function updateCustomOption(
  nodeId: string, projectId: number, letter: string, newTitle: string
): Promise<CustomOption | null> {
  const rows = await query(
    `UPDATE custom_options SET title = $4
     WHERE node_id = $1 AND project_id = $2 AND letter = $3
     RETURNING *`,
    [nodeId, projectId, letter, newTitle]
  );
  return rows[0] || null;
}



// ─── AI Analysis ─────────────────────────────────────────

export async function saveAnalysis(nodeId: string, projectId: number, analysis: string, model: string, createdBy?: number): Promise<any> {
  const rows = await query(
    `INSERT INTO ai_analyses (node_id, project_id, analysis, model, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nodeId, projectId, analysis, model, createdBy || null]
  );
  return rows[0];
}

export async function getAnalysis(nodeId: string, projectId: number): Promise<any | null> {
  const rows = await query(
    `SELECT * FROM ai_analyses WHERE node_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [nodeId, projectId]
  );
  return rows[0] || null;
}
// ─── Users API ───────────────────────────────────────────

export async function getOrCreateUser(githubId: number, username: string, name: string | null, avatarUrl: string | null): Promise<User> {
  // Try to find by github_id
  let user = await queryOne('SELECT * FROM users WHERE github_id = $1', [githubId]);
  if (user) return user;

  // Create new user with developer role
  const rows = await query(
    'INSERT INTO users (github_id, username, name, avatar_url, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [githubId, username, name, avatarUrl, 'developer']
  );
  return rows[0];
}

export async function getUserById(id: number): Promise<User | null> {
  return queryOne('SELECT * FROM users WHERE id = $1', [id]);
}

// ─── Projects API ────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  return query('SELECT * FROM projects ORDER BY name ASC');
}

export async function getProject(id: number): Promise<Project | null> {
  return queryOne('SELECT * FROM projects WHERE id = $1', [id]);
}

export async function createProject(name: string, description: string | null, gitRepoUrl: string | null, gitBranch: string, gitPath: string): Promise<Project> {
  return queryOne(
    'INSERT INTO projects (name, description, git_repo_url, git_branch, git_path) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name, description, gitRepoUrl, gitBranch, gitPath]
  );
}
