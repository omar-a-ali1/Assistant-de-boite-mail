/**
 * Reply controller: submit (idempotent), status, safe retry.
 *
 * @module controllers/reply.controller
 */
const replyService = require('../services/reply.service');
const AppError = require('../lib/errors/AppError');
const { HTTP_REQUESTS } = require('../config/system');

async function submitReply(req, res, next) {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'A valid Idempotency-Key header is required.',
        400
      );
    }

    const { id } = req.validatedParams;
    const { body, draftId } = req.validatedBody;

    const { reply, reused } = await replyService.submitReply({
      emailId: id,
      idempotencyKey,
      body,
      draftId,
      userId: req.session.userId,
    });

    res.status(reused ? 200 : 202).json({
      data: {
        id: reply.id,
        status: reply.status,
        idempotencyKey: reply.idempotency_key,
        attemptCount: reply.attempt_count,
        reused,
        createdAt: reply.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getReply(req, res, next) {
  try {
    const data = await replyService.getReply(req.validatedParams.id, req.session.userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function retryReply(req, res, next) {
  try {
    const reply = await replyService.retry(req.validatedParams.id, req.session.userId);
    res.json({
      data: { id: reply.id, status: reply.status, attemptCount: reply.attempt_count },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitReply, getReply, retryReply };
