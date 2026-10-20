/**
 * Converts a Joi validation error into a safe, structured detail list.
 *
 * @module lib/utils/formatJoiErrors
 */

/**
 * @param {import('joi').ValidationError} error
 * @returns {Array<{field: string, message: string}>}
 */
function formatJoiErrors(error) {
  if (!error || !Array.isArray(error.details)) return [];
  return error.details.map((detail) => ({
    field: detail.path ? detail.path.join('.') : '',
    message: detail.message.replace(/"/g, "'"),
  }));
}

module.exports = formatJoiErrors;
