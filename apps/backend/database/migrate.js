/**
 * SQL migration runner.
 *
 * - Acquires a PostgreSQL advisory lock so concurrent runners cannot
 *   apply migrations simultaneously.
 * - Applies unapplied `*.sql` files in lexicographic order.
 * - Records each successful migration in `schema_migrations`.
 * - Fails loudly on any error (never silently ignores failures).
 * - Never drops user data.
 *
 * Usage: `node database/migrate.js`
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pool, withTransaction, closePool } = require('../src/config/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const ADVISORY_LOCK_KEY = 927_401_113;

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          serial PRIMARY KEY,
      name        text NOT NULL UNIQUE,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function checksumOf(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function run() {
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    lockAcquired = true;

    await ensureMigrationsTable(client);
    const applied = await client.query('SELECT name, checksum FROM schema_migrations');
    const appliedMap = new Map(applied.rows.map((r) => [r.name, r.checksum]));

    const files = listMigrationFiles();
    let appliedCount = 0;

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const checksum = checksumOf(filePath);
      const prior = appliedMap.get(file);

      if (prior) {
        if (prior !== checksum) {
          throw new Error(
            `Migration "${file}" was modified after being applied. ` +
              `Checksums differ. Refusing to continue (create a new migration instead).`
          );
        }
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      // Each migration runs in its own transaction: an all-or-nothing unit.
      await withTransaction(async (tx) => {
        await tx.query(sql);
        await tx.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
      });
      appliedCount += 1;
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied ${file}`);
    }

    // eslint-disable-next-line no-console
    console.log(`[migrate] done. ${appliedCount} migration(s) applied, ${files.length} total.`);
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    }
    client.release();
  }
}

run()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[migrate] FAILED: ${err.message}`);
    closePool().finally(() => process.exit(1));
  });
