import { apiClient } from '../core/api.client.js';

async function postAnswer(questionId, content) {
  const response = await apiClient.post('/api/answers', { questionId, content });
  return response.data;
}

export const answerService = { postAnswer };