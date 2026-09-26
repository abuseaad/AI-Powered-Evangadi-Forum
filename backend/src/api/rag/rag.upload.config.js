import fs from 'fs';
import path from 'path';
import multer from 'multer';

/**
 * Absolute base folder where uploaded PDFs are stored on disk.
 * Controlled by RAG_UPLOAD_DIR in .env (defaults to "uploads/rag" under
 * the backend's working directory). Imported by rag.service.js to build
 * absolute paths for reading/deleting files, and by rag.controller.js to
 * serve the raw PDF back to the reader.
 */
export const UPLOADS_BASE = path.resolve(
  process.env.RAG_UPLOAD_DIR || 'uploads/rag',
);

/** Max upload size in bytes, from RAG_MAX_UPLOAD_MB in .env (default 5 MB). */
const MAX_UPLOAD_BYTES = (Number(process.env.RAG_MAX_UPLOAD_MB) || 5) * 1024 * 1024;

/**
 * Turns an original filename into a safe, URL-friendly slug
 * (e.g. "My Notes (v2).pdf" -> "my-notes-v2").
 * @param {string} originalName
 * @returns {string}
 */
function slugify(originalName) {
  const withoutExtension = originalName.replace(/\.[^/.]+$/, '');
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'document';
}

const storage = multer.diskStorage({
  // Each user's files live in their own subfolder: uploads/rag/<userId>/...
  // This matches the `storagePath = `${userId}/${file.filename}`` your
  // rag.service.js already builds and expects to find on disk.
  destination: (req, file, cb) => {
    const userId = req.user?.id;
    if (!userId) {
      return cb(new Error('Authentication required before upload.'));
    }
    const userDir = path.join(UPLOADS_BASE, String(userId));
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  // A slugified original name plus a timestamp keeps filenames readable
  // while guaranteeing two uploads never collide.
  filename: (req, file, cb) => {
    const unique = `${slugify(file.originalname)}-${Date.now()}.pdf`;
    cb(null, unique);
  },
});

/** Rejects anything that isn't a PDF, matching the UI's "Accepted format: PDF" notice. */
function fileFilter(req, file, cb) {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Only PDF files are accepted.'));
  }
  cb(null, true);
}

/** Configured multer instance — used in rag.route.js as `uploadPdf.single('file')`. */
export const uploadPdf = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});