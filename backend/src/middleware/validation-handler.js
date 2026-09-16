import { validationResult } from 'express-validator';

/**
 * Validation error handler middleware for express-validator results.
 * Should be used as middleware in routes after validation arrays.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export const validationErrorHandler = async (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  const sanitizedErrors = errors.array().map(err => ({
    field: err.path,
    message: err.msg,
  }));

  const error = new Error('Validation failed');
  error.statusCode = 400;
  error.details = sanitizedErrors;
  next(error);
};
