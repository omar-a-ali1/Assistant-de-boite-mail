/**
 * Parameterized SQL for the `users` table.
 *
 * @module models/user.model
 */
const { query } = require('../config/db');

async function findByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, password_hash, display_name, created_at, updated_at
     FROM users
     WHERE normalize_email(email) = normalize_email($1)
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT id, email, display_name, created_at, updated_at
     FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function insert({ email, passwordHash, displayName }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, created_at, updated_at`,
    [email, passwordHash, displayName]
  );
  return rows[0];
}

module.exports = { findByEmail, findById, insert };
