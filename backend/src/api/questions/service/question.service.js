import crypto from 'crypto';
import { safeExecute } from '../../../../db/config.js';
import { BadRequestError, NotFoundError } from '../../../../utils/errors/index.js';
import {
  findSimilarQuestionsByQuestionId,
  findSimilarQuestionsByText,
  generateQuestionEmbedding,
  getVectorConfig,
  normalizeQuestionText,
  storeQuestionVector,
} from './vector.service.js';

const generateQuestionHash = () => crypto.randomBytes(8).toString('hex');

/**
 * Creates a new question and stores its vector embedding for semantic search.
 * @param {Object} payload - The question data
 * @param {string} payload.userId - ID of the user creating the question
 * @param {string} payload.title - Title of the question
 * @param {string} payload.content - Content/body of the question
 * @returns {Promise<Object>} Object containing the created question
 */
export const createQuestionWithVectorService = async payload => {
  // Extract required fields from the payload
  const { userId, title, content } = payload;

  // Prepare the SQL statement for inserting a new question
  const insertQuestionSql =
    'INSERT INTO questions (question_hash, user_id, title, content) VALUES (?, ?, ?, ?)';

  // Generate a unique hash for the question
  const questionHash = generateQuestionHash();
  let questionResult;

  try {
    // Execute the insertion query safely
    questionResult = await safeExecute(insertQuestionSql, [
      questionHash,
      userId,
      title,
      content,
    ]);
  } catch (error) {
    // Handle specific foreign key constraint error for non-existent user
    if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
      throw new BadRequestError('User does not exist.');
    }
    // Re-throw any other unexpected errors
    throw error;
  }

  // Retrieve the auto-generated ID of the newly inserted question
  const questionId = questionResult.insertId;

  // Construct the result  object representing the created question
  const creationResult = {
    id: questionId,
    questionHash,
    title,
    content,
    userId,
  };

  // Normalize the question text (e.g., title) to prepare it for vector embedding
const sourceText = normalizeQuestionText({
  title: payload.title,
});

try {
  // Generate the vector embedding for the normalized question text
  const embeddingResult = await generateQuestionEmbedding(sourceText, {
    questionId: creationResult.id,
  });

  // Validate that a valid embedding was returned from the API
  if (
    !embeddingResult ||
    !embeddingResult.embedding ||
    embeddingResult.embedding.length === 0
  ) {
    throw new Error('Gemini API returned an empty or invalid embedding');
  }

  // Store the generated vector embedding in the database with a 'ready' status
  await storeQuestionVector({
    questionId: creationResult.id,
    sourceText,
    embedding: embeddingResult.embedding,
    status: 'ready',
  });
} catch (error) {