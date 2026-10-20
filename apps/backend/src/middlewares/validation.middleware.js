/**
 * Request Validation Middleware
 *
 * Provides `validate` for request body, `validateQuery` for query params
 * and `validateParams` for route params. Errors are surfaced as
 * ValidationError (400) and rendered by the central error handler.
 *
 * @module middlewares/validation.middleware
 */

const ValidationError = require('../lib/errors/ValidationError');
const formatJoiErrors = require('../lib/utils/formatJoiErrors');
const { HTTP_REQUESTS } = require('../config/system');

function buildValidator(getValue) {
  return (schema, options = {}) => {
    const middleware = (req, res, next) => {
      const { error, value } = schema.validate(getValue(req), {
        abortEarly: false,
        stripUnknown: options.stripUnknown ?? true,
        convert: true,
      });

      if (error) {
        const validationError = new ValidationError(HTTP_REQUESTS[400].message);
        validationError.fields = formatJoiErrors(error);
        return next(validationError);
      }

      Object.assign(req, options.assignTo || {});
      return middleware._onValid(req, next, value);
    };
    middleware._onValid = () => next;
    middleware._validationSchema = schema;
    return middleware;
  };
}

/**
 * Validate `req.body`, expose cleaned value as `req.validatedBody`.
 */
const validate = (schema) => {
  const middleware = (req, res, next) => {
    const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
    if (error) {
      const validationError = new ValidationError(HTTP_REQUESTS[400].message);
      validationError.fields = formatJoiErrors(error);
      return next(validationError);
    }
    req.validatedBody = value;
    next();
  };
  middleware._validationSchema = schema;
  middleware._label = 'validate(body)';
  return middleware;
};

/**
 * Validate `req.query`, expose cleaned value as `req.validatedQuery`.
 */
const validateQuery = (schema) => {
  const middleware = (req, res, next) => {
    const { error, value } = schema.validate(req.query ?? {}, { abortEarly: false, stripUnknown: true });
    if (error) {
      const validationError = new ValidationError(HTTP_REQUESTS[400].message);
      validationError.fields = formatJoiErrors(error);
      return next(validationError);
    }
    req.validatedQuery = value;
    next();
  };
  middleware._queryValidationSchema = schema;
  middleware._label = 'validateQuery';
  return middleware;
};

/**
 * Validate `req.params`, expose cleaned value as `req.validatedParams`.
 */
const validateParams = (schema) => {
  const middleware = (req, res, next) => {
    const { error, value } = schema.validate(req.params ?? {}, { abortEarly: false, stripUnknown: true });
    if (error) {
      const validationError = new ValidationError(HTTP_REQUESTS[400].message);
      validationError.fields = formatJoiErrors(error);
      return next(validationError);
    }
    req.validatedParams = value;
    next();
  };
  middleware._paramsValidationSchema = schema;
  middleware._label = 'validateParams';
  return middleware;
};

module.exports = validate;
module.exports.validate = validate;
module.exports.validateQuery = validateQuery;
module.exports.validateParams = validateParams;
