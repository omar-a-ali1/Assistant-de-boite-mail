/**
 * Email import service: transactional, idempotent batch ingestion used by
 * the n8n sync workflow. Deduplication key = (mailbox, gmail_message_id);
 * threads are reused when they already exist.
 *
 * @module services/import.service
 */
const { withTransaction } = require('../config/db');
const threadModel = require('../models/thread.model');
const auditModel = require('../models/audit.model');
const syncModel = require('../models/sync.model');
const logger = require('../utils/logger');

/**
 * @param {{mailbox:string, cursor?:string|null, executionId?:string|null, messages:Array}} batch
 * @returns {Promise<{imported:number, skipped:number}>}
 */
async function importBatch({ mailbox, cursor, executionId, messages }) {
  return withTransaction(async (client) => {
    let imported = 0;
    let skipped = 0;

    for (const msg of messages) {
      const thread = await threadModel.upsert({
        client,
        mailbox,
        gmailThreadId: msg.gmailThreadId,
        subject: msg.subject || '',
        latestMessageAt: msg.receivedAt,
      });

      const insert = await client.query(
        `INSERT INTO emails (
           mailbox_address, gmail_message_id, thread_id, sender, recipients, subject, body_text, received_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (normalize_email(mailbox_address), gmail_message_id) DO NOTHING
         RETURNING id`,
        [
          mailbox,
          msg.gmailMessageId,
          thread.id,
          msg.sender,
          JSON.stringify(msg.recipients || []),
          msg.subject || '',
          msg.bodyText || '',
          msg.receivedAt,
        ]
      );

      if (insert.rowCount === 0) skipped += 1;
      else imported += 1;
    }

    // Advance the durable cursor only after the whole batch is committed.
    if (cursor) {
      await syncModel.advanceCursor({ client, mailbox, cursor });
    }

    await auditModel.record(
      {
        eventType: 'email_batch_imported',
        actor: 'n8n',
        resourceType: 'mailbox',
        metadata: { imported, skipped, executionId: executionId || null },
      },
      client
    );

    logger.info('email_batch_imported', { imported, skipped, count: messages.length });
    return { imported, skipped };
  });
}

module.exports = { importBatch };
