/**
 * Draft controller: AI draft generation and editing.
 * Drafts are never sent from here.
 *
 * @module controllers/draft.controller
 */
const emailModel = require('../models/email.model');
const draftModel = require('../models/draft.model');
const auditModel = require('../models/audit.model');
const aiService = require('../services/ai.service');
const AppError = require('../lib/errors/AppError');
const { HTTP_REQUESTS } = require('../config/system');

async function createDraft(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const { tone } = req.validatedBody;
    const userId = req.session.userId;

    const email = await emailModel.findById(id, userId);
    if (!email) throw new AppError(HTTP_REQUESTS[404].code, 'Email not found.', 404);

    // Only bounded context is sent to the AI provider.
    const generated = await aiService.generateDraft(
      { subject: email.subject, body: email.body_text, sender: email.sender },
      tone
    );

    const draft = await draftModel.insert({
      userId,
      threadId: email.thread_id,
      originalEmailId: email.id,
      body: generated.body,
      tone,
    });

    await emailModel.updateProcessingStatus(email.id, 'DRAFT_READY');
    await auditModel.record({
      eventType: 'draft_generated',
      actor: req.session.userId,
      resourceType: 'draft',
      resourceId: draft.id,
      metadata: { tone, source: generated.source },
    });

    res.status(201).json({
      data: {
        id: draft.id,
        threadId: draft.thread_id,
        originalEmailId: draft.original_email_id,
        body: draft.body,
        tone: draft.tone,
        aiGenerated: true,
        createdAt: draft.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function updateDraft(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const { body, tone } = req.validatedBody;

    const userId = req.session.userId;
    const existing = await draftModel.findById(id, userId);
    if (!existing) throw new AppError(HTTP_REQUESTS[404].code, 'Draft not found.', 404);

    const updated = await draftModel.updateBody(id, body, tone, userId);
    await auditModel.record({
      eventType: 'draft_edited',
      actor: req.session.userId,
      resourceType: 'draft',
      resourceId: id,
      metadata: {},
    });

    res.json({
      data: {
        id: updated.id,
        threadId: updated.thread_id,
        body: updated.body,
        tone: updated.tone,
        editedByUser: updated.edited_by_user,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createDraft, updateDraft };
