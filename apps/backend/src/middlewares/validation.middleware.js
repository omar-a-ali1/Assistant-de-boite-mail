/**
 * Request Validation Middleware
 *
 * Provides `validate` for request body and `validateQuery` for query params.
 * Both attach their Joi schema to the returned middleware so the Swagger
 * auto-loader can generate OpenAPI documentation automatically.
 *
 * @module middlewares/validation
 */

const ValidationError = require('../lib/errors/ValidationError');
const formatJoiErrors = require('../lib/utils/formatJoiErrors');
const { HTTP_REQUESTS } = require('../config/system');

/**
 * Create a body validation middleware for a given Joi schema
 *
 * Validates `req.body`, attaches cleaned value to `req.validatedBody`.
 *
 * @param {import('joi').ObjectSchema} schema - Joi schema to validate against
 * @returns {Function} Express middleware function with `_validationSchema` attached
 */
const validate = (schema) => {
  const middleware = (req, res, next) => {
    const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false });

    if (error) {
      const details = formatJoiErrors(error);

      const validationError = new ValidationError(HTTP_REQUESTS[400].message);
      validationError.fields = details;

      return next(validationError);
    }

    req.validatedBody = value;
    next();
  };

  middleware._validationSchema = schema;
  middleware._label = `validate(body)`;
  return middleware;
};

/**
 * Create a query validation middleware for a given Joi schema
 *
 * Validates `req.query`, attaches cleaned value to `req.validatedQuery`.
 *
 * @param {import('joi').ObjectSchema} schema - Joi schema to validate against
 * @returns {Function} Express middleware function with `_queryValidationSchema` attached
 */
const validateQuery = (schema) => {
  const middleware = (req, res, next) => {
    const { error, value } = schema.validate(req.query ?? {}, { abortEarly: false, allowUnknown: true });

    if (error) {
      const details = formatJoiErrors(error);

      const validationError = new ValidationError(HTTP_REQUESTS[400].message);
      validationError.fields = details;

      return next(validationError);
    }

    req.validatedQuery = value;
    next();
  };

  middleware._queryValidationSchema = schema;
  middleware._label = `validateQuery`;
  return middleware;
};

module.exports = validate;
module.exports.validateQuery = validateQuery;