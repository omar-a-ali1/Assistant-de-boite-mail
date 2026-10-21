/**
 * Parameterized SQL for `emails`, including filter/search/pagination and
 * the aggregate queries backing the daily summary. Every query is scoped
 * to an owning user.
 *
 * @module models/email.model
 */
const { query } = require('../config/db');

/** Whitelist of sortable columns -> SQL expressions (never interpolate raw input). */
const SORT_COLUMNS = {
  received_at: 'e.received_at',
  subject: 'e.subject',
  sender: 'e.sender',
  priority: 'e.priority',
  category: 'e.category',
  status: 'e.processing_status',
};

/**
 * Fetch a page of emails with combinable filters.
 * Filters are combined with AND; unknown sort fields fall back to received_at.
 */
async function list(filters) {
  const {
    userId,
    page = 1,
    limit = 20,
    category,
    priority,
    status,
    sender,
    startDate,
    endDate,
    search,
    sortBy = 'received_at',
    sortOrder = 'desc',
  } = filters;

  const where = [];
  const params = [];
  const add = (clause, value) => {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  };

  add('e.user_id = ?', userId);
  if (category) add('e.category = ?', category);
  if (priority) add('e.priority = ?', priority);
  if (status) add('e.processing_status = ?', status);
  if (sender) add('e.sender ILIKE ?', `%${sender}%`);
  if (startDate) add('e.received_at >= ?', startDate);
  if (endDate) add('e.received_at <= ?', endDate);
  if (search) {
    params.push(search);
    const p = params.length;
    where.push(
      `(e.subject ILIKE '%' || $${p} || '%' OR e.body_text ILIKE '%' || $${p} || '%' OR e.sender ILIKE '%' || $${p} || '%')`
    );
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const sortExpr = SORT_COLUMNS[sortBy] || SORT_COLUMNS.received_at;
  const dir = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await query(
    `SELECT e.id, e.thread_id, e.gmail_message_id, e.sender, e.recipients, e.subject,
            e.received_at, e.category, e.priority, e.summary, e.expected_action,
            e.needs_review, e.processing_status,
            LEFT(e.body_text, 240) AS body_preview
     FROM emails e
     ${whereSql}
     ORDER BY ${sortExpr} ${dir}, e.id ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM emails e ${whereSql}`, countParams);

  return { rows, total: countRes.rows[0].total };
}

async function findById(id, userId) {
  const { rows } = await query(
    `SELECT id, user_id, mailbox_address, gmail_message_id, thread_id, sender, recipients, subject,
            body_text, received_at, category, priority, summary, expected_action,
            needs_review, processing_status, created_at, updated_at
     FROM emails WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId]
  );
  return rows[0] || null;
}

/** All messages of a thread, chronological order. */
async function findByThreadId(threadId, userId) {
  const { rows } = await query(
    `SELECT id, gmail_message_id, thread_id, sender, recipients, subject, body_text,
            received_at, category, priority, summary, expected_action, needs_review,
            processing_status, created_at
     FROM emails WHERE thread_id = $1 AND user_id = $2 ORDER BY received_at ASC, created_at ASC`,
    [threadId, userId]
  );
  return rows;
}

/** Aggregate counts by category and by status for a given local date. */
async function dailyCounts(date, userId) {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE category = 'client')::int        AS client,
       COUNT(*) FILTER (WHERE category = 'facture')::int       AS facture,
       COUNT(*) FILTER (WHERE category = 'rendez-vous')::int   AS rendez_vous,
       COUNT(*) FILTER (WHERE category = 'newsletter')::int    AS newsletter,
       COUNT(*) FILTER (WHERE category = 'spam probable')::int AS spam_probable,
       COUNT(*) FILTER (WHERE category = 'autre')::int         AS autre,
       COUNT(*) FILTER (WHERE processing_status = 'TO_PROCESS')::int  AS to_process,
       COUNT(*) FILTER (WHERE processing_status = 'DRAFT_READY')::int AS draft_ready,
       COUNT(*) FILTER (WHERE processing_status = 'REPLIED')::int     AS replied,
       COUNT(*) FILTER (WHERE processing_status = 'IGNORED')::int     AS ignored,
       COUNT(*) FILTER (WHERE priority = 3)::int AS priority_high,
       COUNT(*) FILTER (WHERE priority = 2)::int AS priority_medium,
       COUNT(*) FILTER (WHERE priority = 1)::int AS priority_low,
       COUNT(*) FILTER (WHERE needs_review)::int AS needs_review
     FROM emails
     WHERE user_id = $2
       AND received_at >= $1::date AND received_at < ($1::date + interval '1 day')`,
    [date, userId]
  );
  return rows[0];
}

/**
 * Selection pool for the "top 5 to handle" list: pending/draft emails
 * ordered deterministically by priority, then recency.
 */
async function priorityCandidates({ date, limit = 5, userId }) {
  const { rows } = await query(
    `SELECT e.id, e.thread_id, e.sender, e.subject, e.received_at, e.category,
            e.priority, e.processing_status, e.needs_review
     FROM emails e
     WHERE e.user_id = $3
       AND e.processing_status IN ('TO_PROCESS', 'DRAFT_READY')
       AND e.priority IS NOT NULL
       AND e.received_at < ($1::date + interval '1 day')
     ORDER BY e.priority DESC, e.needs_review DESC, e.received_at DESC
     LIMIT $2`,
    [date, limit, userId]
  );
  return rows;
}

async function updateClassification(id, { category, priority, summary, expectedAction, needsReview, client }) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `UPDATE emails
     SET category = $2, priority = $3, summary = $4, expected_action = $5,
         needs_review = $6, processing_status = 'DRAFT_READY', updated_at = now()
     WHERE id = $1
     RETURNING id, category, priority, summary, expected_action, needs_review, processing_status`,
    [id, category, priority, summary, expectedAction, needsReview]
  );
  return rows[0] || null;
}

async function updateProcessingStatus(id, status, client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `UPDATE emails SET processing_status = $2, updated_at = now() WHERE id = $1 RETURNING id, processing_status`,
    [id, status]
  );
  return rows[0] || null;
}

/** Emails not yet classified (for the classification workflow or a user sync). */
async function findUnclassified({ limit = 20, userId }) {
  const params = [];
  let where = 'category IS NULL';
  if (userId) {
    params.push(userId);
    where += ` AND user_id = $${params.length}`;
  }
  params.push(limit);
  const { rows } = await query(
    `SELECT id, user_id, subject, body_text, sender, received_at
     FROM emails
     WHERE ${where}
     ORDER BY received_at ASC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

module.exports = {
  list,
  findById,
  findByThreadId,
  dailyCounts,
  priorityCandidates,
  updateClassification,
  updateProcessingStatus,
  findUnclassified,
  SORT_COLUMNS,
};
