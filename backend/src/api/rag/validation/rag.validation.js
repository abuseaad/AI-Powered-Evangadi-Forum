import { body, param, query } from 'express-validator';
import { validationErrorHandler } from '../../../middleware/validation-handler.js';

/** Validates the :documentId route param on any single-document endpoint. */
export const documentIdParamValidation = [
  param('documentId')
    .isInt({ min: 1 })
    .withMessage('documentId must be a positive integer')
    .toInt(),
  validationErrorHandler,
];

/** GET /api/rag/documents/:documentId/search?query=...&k=... */
export const searchInDocumentValidation = [
  param('documentId')
    .isInt({ min: 1 })
    .withMessage('documentId must be a positive integer')
    .toInt(),
  query('query')
    .notEmpty()
    .withMessage('query is required')
    .isString()
    .withMessage('query must be a string')
    .isLength({ min: 3 })
    .withMessage('query must be at least 3 characters')
    .trim(),
  query('k')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('k must be an integer between 1 and 20')
    .toInt(),
  validationErrorHandler,
];

/** POST /api/rag/documents/:documentId/query */
export const queryDocumentValidation = [
  param('documentId')
    .isInt({ min: 1 })
    .withMessage('documentId must be a positive integer')
    .toInt(),
  body('query')
    .notEmpty()
    .withMessage('query is required')
    .isString()
    .withMessage('query must be a string')
    .isLength({ min: 3 })
    .withMessage('query must be at least 3 characters')
    .trim(),
  validationErrorHandler,
];