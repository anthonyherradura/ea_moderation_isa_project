import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

// Prototype storage: SQLite (built into Node) so there is nothing to install.
// The schema and the parameterized queries are written to port to MySQL as-is.
mkdirSync(dirname(config.dbFile), { recursive: true });
export const db = new DatabaseSync(config.dbFile);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
    api_calls     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- One row per scored item. The text itself is NOT stored here (privacy):
  -- it is only kept when a human needs to look at it, in review_cases.
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('message', 'username')),
    decision   TEXT NOT NULL CHECK (decision IN ('allowed', 'review', 'masked')),
    top_label  TEXT,
    top_score  REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS review_cases (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id    INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,
    text          TEXT NOT NULL,
    ai_decision   TEXT NOT NULL CHECK (ai_decision IN ('review', 'masked', 'fallback')),
    top_label     TEXT,
    top_score     REAL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'upheld', 'overturned')),
    appeal_note   TEXT,
    decision_note TEXT,
    decided_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at    TEXT,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS endpoint_stats (
    method   TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (method, endpoint)
  );
`);

for (const seed of config.seeds) {
  if (!seed.email || !seed.password) continue;
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(seed.email);
  if (!exists) {
    db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
      .run(seed.email, bcrypt.hashSync(seed.password, 10), seed.role);
  }
}
