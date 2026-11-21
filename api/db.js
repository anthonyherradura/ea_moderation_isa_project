import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

// MySQL connection pool. Every query goes through these helpers with `?`
// placeholders (parameterized), never string concatenation.
const pool = mysql.createPool({ uri: config.databaseUrl, connectionLimit: 10, timezone: 'Z' });

/** All rows. */
export async function all(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** First row, or undefined. */
export async function one(sql, params = []) {
  return (await all(sql, params))[0];
}

/** INSERT/UPDATE/DELETE. Returns { insertId, affectedRows }. */
export async function run(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role          ENUM('user', 'moderator', 'admin') NOT NULL DEFAULT 'user',
    api_calls     INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // One row per scored item. The text itself is NOT stored here (privacy):
  // it is only kept when a human needs to look at it, in review_cases.
  `CREATE TABLE IF NOT EXISTS messages (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    kind       ENUM('message', 'username') NOT NULL,
    decision   ENUM('allowed', 'review', 'masked') NOT NULL,
    top_label  VARCHAR(20),
    top_score  DOUBLE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS review_cases (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    message_id    INT NOT NULL,
    user_id       INT NOT NULL,
    kind          ENUM('message', 'username') NOT NULL,
    text          VARCHAR(500) NOT NULL,
    ai_decision   ENUM('review', 'masked', 'fallback') NOT NULL,
    top_label     VARCHAR(20),
    top_score     DOUBLE,
    status        ENUM('pending', 'upheld', 'overturned') NOT NULL DEFAULT 'pending',
    appeal_note   VARCHAR(500),
    decision_note VARCHAR(500),
    decided_by    INT NULL,
    decided_at    TIMESTAMP NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS endpoint_stats (
    method   VARCHAR(10) NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    requests INT NOT NULL DEFAULT 0,
    PRIMARY KEY (method, endpoint)
  )`,
];

/** Creates the tables if needed and the seed admin/moderator accounts. */
export async function initDb() {
  for (const statement of SCHEMA) await pool.query(statement);
  for (const seed of config.seeds) {
    if (!seed.email || !seed.password) continue;
    if (await one('SELECT id FROM users WHERE email = ?', [seed.email])) continue;
    await run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [
      seed.email,
      bcrypt.hashSync(seed.password, 10),
      seed.role,
    ]);
  }
}
