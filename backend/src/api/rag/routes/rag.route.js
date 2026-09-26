import express from 'express';
import { authenticateUser } from '../../../middleware/authentication.js';
import { BadRequestError } from '../../../utils/errors/index.js';
import { uploadPdf } from '../rag.upload.config.js';
import {
  createDocumentController,
  listDocumentsController,
  getDocumentMetaController,
  getDocumentFileController,
  deleteDocumentController,
  searchInDocumentController,
  queryDocumentController,
} from '../controller/rag.controller.js';
import {
  documentIdParamValidation,
  searchInDocumentValidation,
  queryDocumentValidation,
} from '../validation/rag.validation.js';

const router = express.Router();

router.use(authenticateUser);

/**
 * Wraps multer's single-file upload so a file-related failure (wrong type,
 * too large, no user folder) becomes a normal BadRequestError instead of
 * an unhandled multer error, matching every other error in this app.
 */
function handleUpload(req, res, next) {
  uploadPdf.single('file')(req, res, (err) => {
    if (err) {
      return next(new BadRequestError(err.message || 'Failed to upload file.'));
    }
    next();
  });
}

// GET /api/rag/documents
router.get('/documents', listDocumentsController);

// POST /api/rag/documents  (multipart/form-data, field name "file")
router.post('/documents', handleUpload, createDocumentController);

// GET /api/rag/documents/:documentId
router.get(
  '/documents/:documentId',
  documentIdParamValidation,
  getDocumentMetaController,
);

// GET /api/rag/documents/:documentId/file  (raw PDF bytes, for the reader)
router.get(
  '/documents/:documentId/file',
  documentIdParamValidation,
  getDocumentFileController,
);

// GET /api/rag/documents/:documentId/search?query=...&k=...
router.get(
  '/documents/:documentId/search',
  searchInDocumentValidation,
  searchInDocumentController,
);

// POST /api/rag/documents/:documentId/query  { query }
router.post(
  '/documents/:documentId/query',
  queryDocumentValidation,
  queryDocumentController,
);

// DELETE /api/rag/documents/:documentId
router.delete(
  '/documents/:documentId',
  documentIdParamValidation,
  deleteDocumentController,
);

export default router;