import { StatusCodes } from 'http-status-codes';
import {
  createAnswerService,
  deleteAnswerService,
  getAnswersService,
  getSingleAnswerService,
  updateAnswerService,
} from '../service/answer.service.js';

/**
 * Handles creating a new answer.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next function.
 * @returns {Promise<void>}
 */
export const createAnswerController = async (req, res, next) => {
  try {
    const { questionId, content } = req.body;
    const answer = await createAnswerService({
      questionId,
      content,
      userId: req.user.id,
    });
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Answer posted successfully.',
      data: answer,
    });
  } catch (error) {
    next(error);
  }
};