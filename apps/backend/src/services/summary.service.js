/**
 * Daily summary service: computes the "Today" dashboard purely from
 * stored records and selects the top emails to address first with an
 * explicit, deterministic reason for each.
 *
 * @module services/summary.service
 */
const emailModel = require('../models/email.model');

const CATEGORY_LABELS = {
  client: 'client',
  facture: 'facture',
  'rendez-vous': 'rendez-vous',
  newsletter: 'newsletter',
  'spam probable': 'spam probable',
  autre: 'autre',
};

/**
 * Deterministic reason explaining why an email is prioritized.
 * @param {object} email
 * @returns {string}
 */
function buildReason(email) {
  const parts = [];
  if (email.priority === 3) parts.push('priorité haute');
  else if (email.priority === 2) parts.push('priorité moyenne');
  else parts.push('priorité basse');

  if (email.needs_review) parts.push('classification à vérifier');
  if (email.processing_status === 'DRAFT_READY') parts.push('brouillon prêt à envoyer');
  else if (email.processing_status === 'TO_PROCESS') parts.push('en attente de traitement');
  if (email.category) parts.push(`catégorie ${CATEGORY_LABELS[email.category] || email.category}`);

  return `Sélectionné : ${parts.join(', ')}.`;
}

/**
 * @param {string} date - ISO date (YYYY-MM-DD)
 */
async function buildSummary(date) {
  const [counts, candidates] = await Promise.all([
    emailModel.dailyCounts(date),
    emailModel.priorityCandidates({ date, limit: 5 }),
  ]);

  return {
    date,
    total: counts.total,
    byCategory: {
      client: counts.client,
      facture: counts.facture,
      'rendez-vous': counts.rendez_vous,
      newsletter: counts.newsletter,
      'spam probable': counts.spam_probable,
      autre: counts.autre,
    },
    byStatus: {
      TO_PROCESS: counts.to_process,
      DRAFT_READY: counts.draft_ready,
      REPLIED: counts.replied,
      IGNORED: counts.ignored,
    },
    priority: {
      high: counts.priority_high,
      medium: counts.priority_medium,
      low: counts.priority_low,
    },
    needsReview: counts.needs_review,
    topEmails: candidates.map((e) => ({
      id: e.id,
      threadId: e.thread_id,
      sender: e.sender,
      subject: e.subject,
      receivedAt: e.received_at,
      category: e.category,
      priority: e.priority,
      status: e.processing_status,
      reason: buildReason(e),
    })),
  };
}

module.exports = { buildSummary };
