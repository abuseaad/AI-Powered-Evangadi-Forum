
import { GoogleGenAI } from "@google/genai";
import { safeExecute } from "../../../../db/config.js";
import { ServiceUnavailableError } from "../../../utils/errors/index.js";

const GEMINI_EMBEDDING_MODEL =
	process.env.GEMINI_EMBEDDING_MODEL;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RECOMMEND_THRESHOLD = Number(process.env.RECOMMEND_THRESHOLD) || 0.75;
const RECOMMEND_K = Number(process.env.RECOMMEND_K) || 5;

if (!GEMINI_API_KEY) {
	throw new Error("GEMINI_API_KEY environment variable is required");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * Utility to collapse consecutive whitespace characters into a single space
 * and trim leading/trailing whitespace for consistent text formatting.
 * @param {string} value - The input text to normalize.
 * @returns {string} The normalized text with collapsed whitespace and trimmed ends.
 */
function normalizeWhitespace(value) {
	return value.replace(/\s+/g, " ").trim();
}

/**
 * Normalize the question title by converting to lowercase, applying Unicode NFKC normalization,
 * and collapsing multiple whitespace characters into single spaces. This ensures consistent
 * text formatting for downstream tasks such as duplicate detection and vector generation.
 *
 * @example "What's NEW in    AI?" → "what's new in ai?"
 * @param {Object} params - An object containing the question title.
 * @param {string} params.title - The question title.
 * @returns {string} The normalized question text.
 */
export function normalizeQuestionText({ title }) {
	return normalizeWhitespace(`${title || ""}`.normalize("NFKC").toLowerCase());
}

/**
 * Calculate cosine similarity between two embedding vectors.
 *
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 *
 * @param {number[]} vectorA - First embedding vector.
 * @param {number[]} vectorB - Second embedding vector.
 * @returns {number} Similarity score between -1 and 1 (typically 0 to 1 for embeddings).
 * @throws {Error} If vectors have di fferent lengths.
 */
export function calculateCosineSimilarity(vectorA, vectorB) {
	// Validate vectors have same length
	if (vectorA.length !== vectorB.length) {
		throw new Error(
			`Vectors must have the same length. Got ${vectorA.length} and ${vectorB.length}.`,
		);
	}

	// Calculate dot product (sum of element-wise multiplication)
	let dotProduct = 0;
	for (let i = 0; i < vectorA.length; i++) {
		dotProduct += vectorA[i] * vectorB[i];
	}

	// Calculate magnitude of vectorA (square root of sum of squares)
	let magnitudeA = 0;
	for (let i = 0; i < vectorA.length; i++) {
		magnitudeA += vectorA[i] * vectorA[i];
	}
	magnitudeA = Math.sqrt(magnitudeA);
	// Calculate magnitude of vectorB (square root of sum of squares)
	let magnitudeB = 0;
	for (let i = 0; i < vectorB.length; i++) {
		magnitudeB += vectorB[i] * vectorB[i];
	}
	magnitudeB = Math.sqrt(magnitudeB);

	// Handle edge case: return 0 if either magnitude is 0
	if (magnitudeA === 0 || magnitudeB === 0) {
		return 0;
	}

	// Return dot product divided by product of magnitudes
	return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Generate a normalized embedding for the provided question text using the Gemini API.
 *
 * @param {string} sourceText - The text to embed.
 * @param {Object} [options] - Optional parameters to customize the embedding generation.
 * @param {string} [options.taskType='RETRIEVAL_DOCUMENT'] - The specific Gemini task type.
 *        Use 'RETRIEVAL_QUERY' when generating embeddings for user searches.
 * @returns {Promise<{embedding: Array<number>}>} The normalized embedding vector.
 * @throws {Error} If the embedding response is invalid or missing values.
 */
export async function generateQuestionEmbedding(sourceText, options = {}) {
	const { taskType = "RETRIEVAL_DOCUMENT" } = options;

	try {
		const response = await ai.models.embedContent({
			model: GEMINI_EMBEDDING_MODEL,
			contents: sourceText,
			config: {
				taskType: taskType,
				outputDimensionality: 768,
			},
		});

		const embeddingLength = response.embeddings[0].values.length;
		console.log(`Length of embedding: ${embeddingLength}`);

		const values = response.embeddings[0].values;

		if (!Array.isArray(values) || values.length === 0) {
			throw new Error("Gemini embedding response does not contain values.");
		}

		return {
			embedding: values,
		};
	} catch (error) {
		console.error("[Error]:", error);
		console.error("***************************");
		throw error;
	}
}

/**
 * Validate that an embedding is a valid array of numbers.
 * @param {Array} embedding - The embedding to validate.
 * @throws {Error} If embedding is invalid.
 */
function validateEmbedding(embedding) {
	if (!Array.isArray(embedding)) {
		throw new Error("Embedding must be an array.");
	}

	if (embedding.length === 0) {
		throw new Error("Embedding cannot be empty.");
	}

	if (embedding.every((v) => typeof v !== "number" || isNaN(v))) {
		throw new Error("Embedding must contain only valid numbers.");
	}
}

/**
 * Store or update embedding vector in MySQL question_vectors table.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for upsert behavior.
 *
 * @param {Object} payload - The payload containing question and embedding data.
 * @param {number|string} payload.questionId - The ID of the question.
 * @param {string} payload.sourceText - The normalized source text used for embedding.
 * @param {Array<number>} payload.embedding - The full-dimensional embedding vector.
 * @param {string} [payload.status="ready"] - The status of the vector (e.g., 'ready', 'failed').
 * @returns {Promise<void>}
 */
export async function storeQuestionVector({
	questionId,
	sourceText,
	embedding = [],
	status = "ready",
}) {
	// Handle empty embeddings for failed status
	if (status === "failed" || !embedding || embedding.length === 0) {
		const sql = `
            INSERT INTO question_vectors (question_id, source_text, embedding, status)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                source_text = VALUES(source_text),
                embedding = VALUES(embedding),
                status = VALUES(status),
                updated_at = CURRENT_TIMESTAMP
        `;

		await safeExecute(sql, [
			questionId,
			sourceText,
			JSON.stringify(embedding),
			"failed",
		]);
		return;
	}

	// Validate embedding before storage
	validateEmbedding(embedding);

	// Store embedding as JSON string using JSON.stringify()
	const embeddingJson = JSON.stringify(embedding);

	// Implement MySQL INSERT ... ON DUPLICATE KEY UPDATE for upsert
	const sql = `
        INSERT INTO question_vectors (question_id, source_text, embedding, status)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            source_text = VALUES(source_text),
            embedding = VALUES(embedding),
            status = VALUES(status),
            updated_at = CURRENT_TIMESTAMP
    `;

	try {
		await safeExecute(sql, [questionId, sourceText, embeddingJson, status]);
	} catch (error) {
		console.error("=== MYSQL UPSERT ERROR ===");
		console.error("Operation: storeQuestionVector");
		console.error("Question ID:", questionId);
		console.error("Embedding length:", embedding.length);
		console.error("Status:", status);
		console.error("SQL:", sql.trim().replace(/\s+/g, " "));
		console.error("Error:", error);
		console.error("***************************");
		throw error;
	}
}

/**
 * Retrieve all ready embeddings from MySQL question_vectors table.
 * Parses JSON embedding strings to JavaScript arrays and validates them.
 * Invalid embeddings are skipped with a warning logged.
 *
 * @returns {Promise<Array<{questionId: number, embedding: number[]}>>} Array of question embeddings
 */
export async function retrieveReadyEmbeddings() {
	// Query question_vectors table with status='ready' filter
	const sql = `
        SELECT question_id, embedding
        FROM question_vectors
        WHERE status = ?
    `;

	try {
		const rows = await safeExecute(sql, ["ready"]);

		// Parse and validate embeddings
		const embeddings = [];
		for (const row of rows) {
			try {
				// The database driver might already parse JSON columns into objects/arrays.
				// If it's already an array, use it directly; otherwise, parse it.
				const embedding =
					typeof row.embedding === "string"
						? JSON.parse(row.embedding)
						: row.embedding;

				// Add valid embedding to results
				embeddings.push({
					questionId: row.question_id,
					embedding: embedding,
				});
			} catch (parseError) {
				console.warn(
					`Skipping question ${row.question_id}: failed to parse embedding JSON`,
					parseError,
				);
				continue;
			}
		}

		return embeddings;
	} catch (error) {
		console.error("=== MYSQL RETRIEVE EMBEDDINGS ERROR ===");
		console.error("Operation: retrieveReadyEmbeddings");
		console.error("Error:", error);
		console.error("***************************");
		throw error;
	}
}

/**
 * Find similar questions by generating an embedding for the provided text and searching MySQL.
 * @param {Object} params - Search parameters.
 * @param {string} params.sourceText - The text to search for similar questions.
 * @param {number} params.threshold - Minimum similarity score threshold.
 * @param {number} params.k - Maximum number of results to return.
 * @returns {Promise<Object>} The generated embedding and similar questions.
 */
export async function findSimilarQuestionsByText({ sourceText, threshold, k }) {
	// Normalize parameters
	const normalizedK = k || RECOMMEND_K;
	const normalizedThreshold = threshold || RECOMMEND_THRESHOLD;

	// Use RETRIEVAL_QUERY task type when searching against stored documents
	let embeddingResult;
	try {
		embeddingResult = await generateQuestionEmbedding(sourceText, {
			taskType: "RETRIEVAL_QUERY",
		});
	} catch (error) {
		console.error("=== GEMINI API ERROR DURING SEARCH ===");
		console.error("Operation: findSimilarQuestionsByText");
		console.error("Search text:", sourceText);
		console.error("Error:", error);
		console.error("***************************");
		throw new ServiceUnavailableError(
			"Failed to generate embedding for search query. Please try again later.",
		);
	}

	const queryEmbedding = embeddingResult.embedding; // [0.012323, -0.12324, ......]

	// Retrieve all ready embeddings from MySQL
	let storedEmbeddings;
	try {
		storedEmbeddings = await retrieveReadyEmbeddings();
	} catch (error) {
		console.error("=== DATABASE ERROR DURING SEARCH ===");
		console.error("Operation: findSimilarQuestionsByText");
		console.error("Search text:", sourceText);
		console.error("Error:", error);
		console.error("***************************");
		throw error;
	}

	// Calculate cosine similarity for each stored embedding
	const similarities = [];
	for (const stored of storedEmbeddings) {
		try {
			const score = calculateCosineSimilarity(queryEmbedding, stored.embedding);

			// Filter by threshold
			if (score >= normalizedThreshold) {
				similarities.push({
					questionId: stored.questionId,
					score: score,
				});
			}
		} catch (error) {
			console.warn(
				`Failed to calculate similarity for question ${stored.questionId}:`,
				error.message,
			);
			continue;
		}
	}

	// Sort by score descending
	similarities.sort((a, b) => b.score - a.score);

	// Limit to top k results
	const topResults = similarities.slice(0, normalizedK);

	if (topResults.length === 0) {
		return {
			...embeddingResult,
			similarQuestions: [],
		};
	}

	// Fetch question details using IN clause
	const questionIds = topResults.map((r) => r.questionId);
	const placeholders = questionIds.map(() => "?").join(",");

	const sql = `
        SELECT
            q.question_id AS questionId,
            q.question_hash AS questionHash,
            q.title,
            q.content,
            q.created_at AS createdAt,
            q.updated_at AS updatedAt,
            u.user_id AS userId,
            u.first_name AS firstName,
            u.last_name AS lastName,
            COUNT(DISTINCT a.answer_id) AS answerCount
        FROM questions q
        JOIN users u ON u.user_id = q.user_id
        LEFT JOIN answers a ON a.question_id = q.question_id
        WHERE q.question_id IN (${placeholders})
        GROUP BY q.question_id, u.user_id
    `;

	let rows;
	try {
		rows = await safeExecute(sql, questionIds);
	} catch (error) {
		console.error("=== DATABASE ERROR FETCHING QUESTION DETAILS ===");
		console.error("Operation: findSimilarQuestionsByText - fetch details");
		console.error("Question IDs:", questionIds);
		console.error("Error:", error);
		console.error("***************************");
		throw error;
	}

	// Map MySQL results to question objects
	const questionMap = {};
	rows.forEach((row) => {
		questionMap[String(row.questionId)] = {
			id: row.questionId,
			questionHash: row.questionHash,
			title: row.title,
			content: row.content,
			answerCount: row.answerCount,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			author: {
				id: row.userId,
				firstName: row.firstName,
				lastName: row.lastName,
			},
		};
	});

	// Return results with scores, preserving sort order
	const similarQuestions = topResults
		.filter((result) => questionMap[String(result.questionId)])
		.map((result) => ({
			score: Number(result.score.toFixed(6)),
			...questionMap[String(result.questionId)],
		}));

	return {
		...embeddingResult,
		similarQuestions,
	};
}

/**
 * Find similar questions using the pre-calculated embedding of an existing question from MySQL.
 * @param {Object} params - Search parameters.
 * @param {number|string} params.questionId - The ID of the question to find similarities for.
 * @param {number} params.threshold - Minimum similarity score threshold.
 * @param {number} params.k - Maximum number of results to return.
 * @returns {Promise<Array<Object>>} A list of similar questions.
 */
export async function findSimilarQuestionsByQuestionId({
	questionId,
	threshold,
	k,
}) {
	// Normalize parameters
	const normalizedK = k > 0 ? Math.min(k, 20) : RECOMMEND_K;
	const normalizedThreshold =
		threshold >= 0 && threshold <= 1 ? threshold : RECOMMEND_THRESHOLD;

	// Retrieve source question embedding from MySQL
	const sql = `
        SELECT embedding, status
        FROM question_vectors
        WHERE question_id = ?
    `;

	let sourceEmbedding;
	try {
		const rows = await safeExecute(sql, [questionId]);

		// Return empty array if no embedding or status ≠ 'ready'
		if (rows.length === 0) {
			return [];
		}

		const row = rows[0];

		if (row.status !== "ready") {
			return [];
		}
        // Parse  source embedding from JSON string to array if necessary    

	let sourceEmbedding =
			typeof row.embedding === "string"
				? JSON.parse(row.embedding)
				: row.embedding;

		// Validate source embedding
		if (!Array.isArray(sourceEmbedding) || sourceEmbedding.length === 0) {
			console.warn(
				`Source question ${questionId} has invalid embedding format.`,
			);
			return [];
		}

		if (sourceEmbedding.every((v) => typeof v !== "number" || isNaN(v))) {
			console.warn(
				`Source question ${questionId} has invalid embedding values.`,
			);
			return [];
		}
	} catch (parseError) {
		console.warn(
			`Failed to parse embedding for question ${questionId}:`,
			parseError,
		);
		return [];
	}

	// Retrieve all other ready embeddings from MySQL
	let storedEmbeddings;
	try {
		storedEmbeddings = await retrieveReadyEmbeddings();
	} catch (error) {
		console.error("=== DATABASE ERROR IN SIMILAR QUESTIONS SEARCH ===");
		console.error(
			"Operation: findSimilarQuestionsByQuestionId - retrieve embeddings",
		);
		console.error("Question ID:", questionId);
		console.error("Error:", error);
		console.error("***************************");
		throw error;
	}

	// Calculate cosine similarity for each stored embedding
	const similarities = [];
	for (const stored of storedEmbeddings) {
		// Exclude source question from results
		if (String(stored.questionId) === String(questionId)) {
			continue;
		}
		try {
			const score = calculateCosineSimilarity(
				sourceEmbedding,
				stored.embedding,
			);

			if (score >= normalizedThreshold) {
				similarities.push({
					questionId: stored.questionId,
					score: score,
				});
			}
		} catch (error) {
			console.warn(
				`Failed to calculate similarity for question ${stored.questionId}:`,
				error.message,
			);
			continue;
		}
	}

	// Sort by score descending
	similarities.sort((a, b) => b.score - a.score);

	// Limit to top k results
	const topResults = similarities.slice(0, normalizedK);

	if (topResults.length === 0) {
		return [];
	}

	// Fetch question details using IN clause
	const questionIds = topResults.map((r) => r.questionId);
	const placeholders = questionIds.map(() => "?").join(",");

	const detailsSql = `
        SELECT
            q.question_id AS questionId,
            q.question_hash AS questionHash,
            q.title,
            q.content,
            q.created_at AS createdAt,
            q.updated_at AS updatedAt,
            u.user_id AS userId,
            u.first_name AS firstName,
            u.last_name AS lastName,
            COUNT(DISTINCT a.answer_id) AS answerCount
        FROM questions q
        JOIN users u ON u.user_id = q.user_id
        LEFT JOIN answers a ON a.question_id = q.question_id
        WHERE q.question_id IN (${placeholders})
        GROUP BY q.question_id, u.user_id
    `;

	let detailsRows;
	try {
		detailsRows = await safeExecute(detailsSql, questionIds);
	} catch (error) {
		console.error("=== DATABASE ERROR FETCHING QUESTION DETAILS ===");
		console.error(
			"Operation: findSimilarQuestionsByQuestionId - fetch details",
		);
		console.error("Source Question ID:", questionId);
		console.error("Target Question IDs:", questionIds);
		console.error("SQL:", detailsSql.trim().replace(/\s+/g, " "));
		console.error("Error:", error);
		console.error("***************************");
		throw error;
	}

	// Map MySQL results to question objects
	const questionMap = {};
	detailsRows.forEach((detailRow) => {
		questionMap[String(detailRow.questionId)] = {
			id: detailRow.questionId,
			questionHash: detailRow.questionHash,
			title: detailRow.title,
			content: detailRow.content,
			answerCount: detailRow.answerCount,
			createdAt: detailRow.createdAt,
			updatedAt: detailRow.updatedAt,
			author: {
				id: detailRow.userId,
				firstName: detailRow.firstName,
				lastName: detailRow.lastName,
			},
		};
	});

	// Return results with scores, preserving sort order
	return topResults
		.filter((result) => questionMap[String(result.questionId)])
		.map((result) => ({
			score: Number(result.score.toFixed(6)),
			...questionMap[String(result.questionId)],
		}));
}

/**
 * Get the current vector search configuration values from environment variables or defaults.
 * @returns {Object} The current vector configuration values.
 */
export function getVectorConfig() {
	return {
		recommendThreshold: RECOMMEND_THRESHOLD,
		recommendK: RECOMMEND_K,
	};
}
