













questionId: row.questionId,
content: row.content,
createdAt: row.createdAt,
updatedAt: row.updatedAt,
author: {
  id: row.userId,
  firstName: row.firstName,
  lastName: row.lastName,
},
});

/**
 * Retrieves the owner of a specific question.
 * Throws a NotFoundError if the question does not exist.
 * @param {number|string} questionId - The ID of the question.
 * @returns {Promise<Object>} An object containing question_id and user_id.
 * @throws {NotFoundError} If the question is not found.
 */
const getQuestionOwner = async questionId => {
  const rows = await safeExecute(
    'SELECT question_id, user_id FROM questions WHERE question_id = ? LIMIT 1',
    [questionId],
  );
  if (rows.length === 0) {
    throw new NotFoundError('Question not found');
  }
  return rows[0];
};

/**
 * Creates a new answer for a specific question.
 * Validates that the user is not answering their own question.
 * @param {Object} params - The answer creation parameters.
 * @param {number|string} params.questionId - The ID of the question being answered.
 * @param {number|string} params.userId - The ID of the user creating the answer.
 * @param {string} params.content - The content of the answer.
 * @returns {Promise<Object>} The newly created answer object.
 * @throws {BadRequestError} If the user attempts to answer their own question.
 */
export const createAnswerService = async ({ questionId, userId, content }) => {
  const question = await getQuestionOwner(questionId);
  if (question.user_id === userId) {
    throw new BadRequestError('You cannot answer your own question');
  }

  const insertSql =
    'INSERT INTO answers (question_id, user_id, content) VALUES (?, ?, ?)';
  const result = await safeExecute(insertSql, [questionId, userId, content]);

  return getSingleAnswerService(result.insertId);
};

/**
 * Generates the SQL ORDER BY clause for answers based on the sort criteria.
 * @param {string} sortBy - The sort criteria ('newest' or 'oldest').
 * @returns {string} The SQL ORDER BY string.
 */
const getAnswerSortSql = sortBy => {
  if (sortBy === 'oldest') {
    return 'a.created_at ASC';
  }
  return 'a.created_at DESC';
};






























const rows = await safeExecute(listSql, [questionId]);

return {
  data: rows.map(mapAnswer),
  meta: {
    limit: normalizedLimit,
    total: rows.length,
    sortBy,
  },
};
};

/**
 * Retrieves a single answer by its ID.
 * @param {number|string} answerId - The ID of the answer.
 * @returns {Promise<Object>} The formatted answer object.
 * @throws {NotFoundError} If the answer is not found.
 */
export const getSingleAnswerService = async answerId => {
  const sql = `
SELECT
  a.answer_id AS id,
  a.question_id AS questionId,
  a.content,
  a.created_at AS createdAt,
  a.updated_at AS updatedAt,
  u.user_id AS userId,
  u.first_name AS firstName,
  u.last_name AS lastName
FROM answers a
JOIN users u ON u.user_id = a.user_id
WHERE a.answer_id = ?
LIMIT 1
  `;
const rows = await safeExecute(sql, [answerId]);
  if (rows.length === 0) {
    throw new NotFoundError('Answer not found');
  }




























  

export const updateAnswerService = async ({ answerId, userId, content }) => {
  const answer = await getAnswerOwner(answerId);
  if (answer.user_id !== userId) {
    throw new UnauthenticatedError(
      'You are not authorized to update this answer',
    );
  }

  await safeExecute(
    'UPDATE answers SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE answer_id = ?',
    [content, answerId],
  );
  return getSingleAnswerService(answerId);
};

/**
 * Deletes an existing answer.
 * Validates that the requesting user is the owner of the answer.
 * @param {Object} params - The deletion parameters.
 * @param {number|string} params.answerId - The ID of the answer to delete.
 * @param {number|string} params.userId - The ID of the user attempting the deletion.
 * @returns {Promise<Object>} An object containing the ID of the deleted answer.
 * @throws {UnauthenticatedError} If the user is not the owner of the answer.
 */
export const deleteAnswerService = async ({ answerId, userId }) => {
  const answer = await getAnswerOwner(answerId);
  if (answer.user_id !== userId) {
    throw new UnauthenticatedError(
      'You are not authorized to delete this answer',
    );
  }
