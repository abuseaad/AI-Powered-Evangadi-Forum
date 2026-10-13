import path from "path";
import fs from "fs/promises";
import { PDFParse } from "pdf-parse";
import { GoogleGenAI } from "@google/genai";
import { safeExecute } from "../../../../db/config.js";
import {
  NotFoundError,
  BadRequestError,
  ServiceUnavailableError,
} from "../../../utils/errors/index.js";
import { calculateCosineSimilarity } from "../../question/service/vector.service.js";
import { UPLOADS_BASE } from "../rag.upload.config.js";

const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const CHUNK_SIZE = 1000; //contain upto 1000 characters
const CHUNK_OVERLAP = 150; //repeats the last 150 character of the previous character
const DEFAULT_K = 5;
const SEARCH_THRESHOLD = 0.5;
const EMBED_INTERVAL_MS = 700; // ~85 req/min — safely under the 100/min free-tier cap

/** @param {number} ms - milliseconds to pause */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Splits `text` into overlapping chunks for embedding.
 * @param {string} text
 * @param {number} chunkSize - max characters per chunk
 * @param {number} overlap - characters repeated from the previous chunk
 * @returns {string[]}
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

/**
 * Extracts the suggested retry delay from a Gemini 429 error body.
 * Falls back to 20 s if the `RetryInfo` detail is absent or unparseable.
 * @param {Error} error
 * @returns {number} milliseconds to wait before retrying
 */
function parseRetryDelayMs(error) {
  try {
    const body = JSON.parse(error.message);
    const retryInfo = body?.error?.details?.find(
      (d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
    );
    if (retryInfo?.retryDelay) {
      return Math.ceil(parseFloat(retryInfo.retryDelay) * 1000) + 2000;
    }
  } catch {}
  return 20000;
}

/**
 * Calls the Gemini embedding model with automatic 429 retry (up to 3 attempts).
 * @param {string} text - content to embed
 * @param {"RETRIEVAL_DOCUMENT"|"RETRIEVAL_QUERY"} taskType
 * @returns {Promise<number[]>} 768-dimensional embedding vector
 */
async function generateEmbedding(text, taskType = "RETRIEVAL_DOCUMENT") {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: GEMINI_EMBEDDING_MODEL,
        contents: text,
        config: { taskType, outputDimensionality: 768 },
      });
      return response.embeddings[0].values;
    } catch (error) {
      if (error.status === 429 && attempt < 3) {
        const delay = parseRetryDelayMs(error);
        console.warn(
          `Embedding rate-limited; retrying in ${delay}ms (attempt ${attempt + 1}/3)`,
        );
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Normalises a raw DB row into the document shape returned by all service calls.
 * @param {object} row
 * @returns {object}
 */
function mapDocumentRow(row) {
  return {
    document_id: row.document_id,
    title: row.title,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    status: row.status,
    error_message: row.error_message ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_id: row.user_id,
    storage_path: row.storage_path,
  };
}

/**
 * Fetches a document row and throws `NotFoundError` if it doesn't exist or
 * belongs to a different user.
 * @param {number} documentId
 * @param {number} userId
 * @returns {Promise<object>} raw DB row
 */
export async function assertOwnedDocument(documentId, userId) {
  const rows = await safeExecute(
    "SELECT * FROM documents WHERE document_id = ? AND user_id = ?",
    [documentId, userId],
  );
  if (rows.length === 0) throw new NotFoundError("Document not found.");
  return rows[0];
}

/**
 * Full RAG ingestion pipeline: persists the document record, parses the PDF,
 * chunks the text, generates embeddings for each chunk, and stores them.
 * The document status is set to `'ready'` on success or `'failed'` on error.
 * @param {{ file: Express.Multer.File, userId: number }} param0
 * @returns {Promise<object>} the created document row
 */
export async function createDocumentFromUploadService({ file, userId }) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${userId}/${unique}.pdf`;
  const absPath = path.join(UPLOADS_BASE, storagePath);

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, file.buffer);

  const insertResult = await safeExecute(
    `INSERT INTO documents (user_id, title, mime_type, byte_size, status, storage_path)
     VALUES (?, ?, ?, ?, 'processing', ?)`,
    [userId, file.originalname, file.mimetype, file.size, storagePath],
  );
  const documentId = insertResult.insertId;

  const updateStatus = async (status, errorMessage = null) => {
    await safeExecute(
      "UPDATE documents SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE document_id = ?",
      [status, errorMessage, documentId],
    );
  };

  try {
    const fileBuffer = file.buffer;
    const parser = new PDFParse({ data: fileBuffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    const rawText = pdfData.text.trim();

    if (!rawText) {
      await updateStatus("failed", "PDF contains no extractable text.");
    } else {
      const chunks = chunkText(rawText);

      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i];

        const chunkResult = await safeExecute(
          "INSERT INTO document_chunks (document_id, chunk_index, content) VALUES (?, ?, ?)",
          [documentId, i, chunkContent],
        );
        const chunkId = chunkResult.insertId;

        const embedding = await generateEmbedding(
          chunkContent,
          "RETRIEVAL_DOCUMENT",
        );

        await safeExecute(
          "INSERT INTO document_chunk_vectors (chunk_id, source_text, embedding) VALUES (?, ?, ?)",
          [chunkId, chunkContent, JSON.stringify(embedding)],
        );

        if (i < chunks.length - 1) await sleep(EMBED_INTERVAL_MS);
      }

      await updateStatus("ready");
    }
  } catch (error) {
    console.error("RAG document processing error:", error);
    await updateStatus("failed", error.message);
  }

  const docRows = await safeExecute(
    "SELECT * FROM documents WHERE document_id = ?",
    [documentId],
  );
  return mapDocumentRow(docRows[0]);
}

/**
 * Returns all documents owned by `userId`, newest first.
 * Storage path is intentionally omitted from the list payload.
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
export async function listDocumentsForUserService(userId) {
  const rows = await safeExecute(
    "SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
  return rows.map((row) => ({
    document_id: row.document_id,
    title: row.title,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    status: row.status,
    error_message: row.error_message ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Returns full metadata for a single document (including `storage_path`).
 * Throws `NotFoundError` if the document doesn't exist or isn't owned by the user.
 * @param {number} documentId
 * @param {number} userId
 * @returns {Promise<object>}
 */
export async function getDocumentMetaService(documentId, userId) {
  const doc = await assertOwnedDocument(documentId, userId);
  return mapDocumentRow(doc);
}

/**
 * Deletes the document record (cascades to chunks and vectors) and removes
 * the PDF file from disk. A missing file on disk is silently ignored.
 * @param {number} documentId
 * @param {number} userId
 * @returns {Promise<{ id: number }>}
 */
export async function deleteDocumentService(documentId, userId) {
  const doc = await assertOwnedDocument(documentId, userId);

  const absolutePath = path.join(UPLOADS_BASE, doc.storage_path);
  try {
    await fs.unlink(absolutePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Failed to delete file from disk:", err);
    }
  }

  await safeExecute("DELETE FROM documents WHERE document_id = ?", [
    documentId,
  ]);

  return { id: documentId };
}

/**
 * Embeds `query` and returns the top-`k` chunks ranked by cosine similarity.
 * Only chunks scoring ≥ `SEARCH_THRESHOLD` (0.5) are included.
 * @param {number} documentId
 * @param {number} userId
 * @param {string} query
 * @param {number} [k=5]
 * @returns {Promise<{ query: string, results: object[] }>}
 */
export async function searchInDocumentService(
  documentId,
  userId,
  query,
  k = DEFAULT_K,
) {
  const doc = await assertOwnedDocument(documentId, userId);

  if (doc.status !== "ready") {
    throw new BadRequestError("Document is not ready for search.");
  }

  let queryEmbedding;
  try {
    queryEmbedding = await generateEmbedding(query, "RETRIEVAL_QUERY");
  } catch (error) {
    throw new ServiceUnavailableError("Failed to generate query embedding.");
  }

  const rows = await safeExecute(
    `SELECT dcv.chunk_id, dcv.embedding, dc.chunk_index, dc.content
     FROM document_chunk_vectors dcv
     JOIN document_chunks dc ON dc.chunk_id = dcv.chunk_id
     WHERE dc.document_id = ?`,
    [documentId],
  );

  if (rows.length === 0) return { query, results: [] };

  const scored = [];
  for (const row of rows) {
    try {
      const chunkEmbedding =
        typeof row.embedding === "string"
          ? JSON.parse(row.embedding)
          : row.embedding;
      const score = calculateCosineSimilarity(queryEmbedding, chunkEmbedding);
      if (score >= SEARCH_THRESHOLD) {
        scored.push({
          chunkId: row.chunk_id,
          chunkIndex: row.chunk_index,
          score: Number(score.toFixed(6)),
          excerpt: row.content,
        });
      }
    } catch (err) {
      // skip chunk with invalid embedding
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return { query, results: scored.slice(0, k) };
}

/**
 * RAG query: retrieves the top-k relevant chunks via `searchInDocumentService`,
 * builds a grounded prompt, and returns a Gemini-generated answer with citations.
 * @param {number} documentId
 * @param {number} userId
 * @param {string} query
 * @returns {Promise<{ answer: string, citations: object[], chunksUsed: number[] }>}
 */
export async function queryDocumentService(documentId, userId, query) {
  const { results } = await searchInDocumentService(
    documentId,
    userId,
    query,
    DEFAULT_K,
  );

  if (results.length === 0) {
    return {
      answer: "No relevant content found in the document for your query.",
      citations: [],
      chunksUsed: [],
    };
  }

  const context = results.map((r, i) => `[${i + 1}] ${r.excerpt}`).join("\n\n");

  const prompt = `You are a helpful assistant. Answer the user's question based ONLY on the provided document excerpts. If the answer cannot be found in the excerpts, say so clearly.

DOCUMENT EXCERPTS:
${context}

USER QUESTION:
${query}

Provide a clear, concise answer based solely on the above excerpts. Cite sources using [1], [2], etc.`;

  let answer;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
    });
    answer = response?.text || "Unable to generate an answer.";
  } catch (error) {
    throw new ServiceUnavailableError("Failed to generate AI answer.");
  }

  return {
    answer,
    citations: results.map((r, i) => ({
      ref: i + 1,
      chunkIndex: r.chunkIndex,
    })),
    chunksUsed: results.map((r) => r.chunkId),
  };
}
