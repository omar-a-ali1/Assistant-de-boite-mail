/**
 * Append-only audit trail. Metadata must never contain secrets or full
 * email bodies.
 *
 * @module models/audit.model
 */
const { query } = require('../config/db');

async function record({ eventType, actor, resourceType, resourceId, metadata }, client) {
  const run = client ? client.query.bind(client) : query;
  await run(
    `INSERT INTO audit_events (event_type, actor, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventType, actor || null, resourceType || null, resourceId || null, JSON.stringify(metadata || {})]
  );
}

module.exports = { record };
