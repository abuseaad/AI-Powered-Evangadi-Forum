import { StatusCodes } from "http-status-codes";

// Question services handle all database operations:
// create, list, single fetch, semantic search, and similarity search
import {
  createQuestionWithVectorService,
  getQuestionsService,
  getSingleQuestionService,
  searchQuestionsSemanticService,
  getSimilarQuestionsService,
} from "../service/question.service.js";

// Gemini AI services handle the two AI-powered features:
// draft coaching and answer relevance scoring
import {
  generateQuestionDraftCoachService,
  assessAnswerAgainstQuestionService,
} from "../service/geminiTextCoach.service.js";

// ============================================================
// CONSTANTS
// ============================================================
// Minimum cosine similarity score (0–1) for a result to be included.
// 0.75 means only results that are at least 75% similar are returned.
// const RECOMMEND_THRESHOLD = 0.75;
const RECOMMEND_THRESHOLD = Number(process.env.RECOMMEND_THRESHOLD) || 0.75;

// Default number of results returned by search/similar endpoints
const DEFAULT_K = 5;

// ============================================================
// CONTROLLER: Create Question
// Route: POST /api/questions
// Access: Protected (JWT required)
// ============================================================
// Extracts title and content from the request body, then calls
// the service which saves the question to the DB AND generates
// a vector embedding via Gemini for future semantic search.
export const createQuestionController = async (req, res, next) => {
  try {
    // Pull validated fields from the request body
    const { title, content } = req.body;

    // req.user.id comes from the JWT middleware — it's the logged-in user's ID
    const result = await createQuestionWithVectorService({
      userId: req.user.id,
      title,
      content,
    });

    // 201 Created — standard HTTP status for a successfully created resource
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Question posted successfully.",
      data: result.question, // returns the newly created question row
    });
  } catch (error) {
    next(error); // passes any error to the global error handler middleware
  }
};

// ============================================================
// CONTROLLER: List Questions
// Route: GET /api/questions
// Access: Protected (JWT required)
// ============================================================
// Supports two optional query filters:
//   ?search=keyword  — SQL LIKE filter on title and content
//   ?mine=true       — returns only the logged-in user's questions
// Always returns a max of 100 results, sorted newest first.
export const getQuestionsController = async (req, res, next) => {
  try {
    // Bundle query params and the authenticated user's ID into a filters object
    const filters = {
      search: req.query.search, // optional keyword filter
      mine: req.query.mine, // optional boolean — "show only my questions"
      userId: req.user.id, // needed to apply the 'mine' filter in the service
    };

    // Service builds the dynamic SQL query based on which filters are present
//     const { questions, total } = await getQuestionsService(filters);

//     res.status(StatusCodes.OK).json({
//       success: true,
//       message: "Questions fetched successfully.",
//       data: questions,
//       meta: {
//         limit: 100, // max records per request (hardcoded per spec)
//         total, // total matching records found
//         sortBy: "newest",
//         sortOrder: "desc",
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };
    // Service builds the dynamic SQL query based on which filters are present
    const { data: questions, meta } = await getQuestionsService(filters);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Questions fetched successfully.",
      data: questions,
      meta,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CONTROLLER: Get Single Question
// Route: GET /api/questions/:questionHash
// Access: Protected (JWT required)
// ============================================================
// Fetches full details for one question — including the author
// info and all answers with their authors — using the unique
// 16-character hex hash in the URL (avoids exposing numeric IDs).
export const getSingleQuestionController = async (req, res, next) => {
  try {
    // questionHash is the 16-char hex identifier from the URL param
    const { questionHash } = req.params;

    // Service returns the question object and its array of answers
    // If the hash doesn't match any record, the service throws a NotFoundError (404)
    const { question, answers } = await getSingleQuestionService({
      questionHash,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Question fetched successfully",
      question,
      answers,
      answersMeta: {
        limit: 100,
        total: answers.length, // count the answers returned
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CONTROLLER: Semantic Search
// Route: GET /api/questions/search?query=...&k=5&threshold=0.75
// Access: Protected (JWT required)
// ============================================================
// Unlike a SQL LIKE search, this converts the user's text query
// into a vector embedding via Gemini, then finds questions whose
// stored embeddings are mathematically similar (cosine similarity).
// This means it understands meaning, not just matching keywords.
export const searchQuestionsSemanticController = async (req, res, next) => {
  try {
    const query = req.query.query; // the search text (min 5 chars)
    const k = req.query.k ?? DEFAULT_K; // max results to return (default 5)
    const threshold = req.query.threshold ?? RECOMMEND_THRESHOLD; // min similarity score (default 0.75)

    // Service embeds the query, fetches all stored vectors, computes cosine
    // similarity for each, filters by threshold, and returns the top k results
//     const { results } = await searchQuestionsSemanticService({
//       query,
//       k,
//       threshold,
//     });

//     res.status(StatusCodes.OK).json({
//       success: true,
//       message: "Semantic search completed successfully",
//       data: results, // each result includes a 'score' field (cosine similarity 0–1)
//       meta: {
//         total: results.length,
//         k,
//         threshold,
//         query,
//         questionHash: null, // not applicable for text-based search
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };
    const { data: results, meta } = await searchQuestionsSemanticService({
      query,
      k,
      threshold,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Semantic search completed successfully",
      data: results, // each result includes a 'score' field (cosine similarity 0–1)
      meta,
    });
      } catch (error) {
    next(error);
  }
};

// ============================================================
// CONTROLLER: Similar Questions
// Route: GET /api/questions/:questionHash/similar
// Access: Protected (JWT required)
// ============================================================
// Given a specific question's hash, finds other questions that
// are semantically similar by comparing their stored vector
// embeddings. The source question itself is excluded from results.
export const getSimilarQuestionsController = async (req, res, next) => {
  try {
    const { questionHash } = req.params; // the source question's hash
    const k = req.query.k ?? DEFAULT_K; // how many similar questions to return
    const threshold = req.query.threshold ?? RECOMMEND_THRESHOLD; // similarity cutoff

    // Service looks up the source question's vector, computes cosine similarity
    // against all other stored vectors, and returns the top matches
//     const { results } = await getSimilarQuestionsService({
//       questionHash,
//       k,
//       threshold,
//     });

//     res.status(StatusCodes.OK).json({
//       success: true,
//       message: "Similar questions fetched successfully",
//       data: results,
//       meta: {
//         total: results.length,
//         k,
//         threshold,
//         query: null, // not applicable for hash-based search
//         questionHash, // echoed back so the client knows which question was the source
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };
    const { data: results, meta } = await getSimilarQuestionsService({
      questionHash,
      k,
      threshold,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Similar questions fetched successfully",
      data: results,
      meta,
    });
      } catch (error) {
    next(error);
  }
};

// ============================================================
// CONTROLLER: AI Draft Coach
// Route: POST /api/questions/draft-coach
// Access: Protected (JWT required)
// ============================================================
// Before posting, a user can submit their draft title and content
// here to get AI-generated tips for improving their question.
// Gemini acts as a "programming forum coach" and returns actionable tips.
export const generateQuestionDraftCoachController = async (req, res, next) => {
  try {
    const { title, content } = req.body; // title is optional; content is required

    // Service builds a prompt, calls Gemini generateContent,
    // and parses the response into a structured { tips: [...] } object
    const data = await generateQuestionDraftCoachService({ title, content });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Draft suggestions generated",
      data, // e.g. { tips: ["Add a code snippet", "Include error messages"] }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CONTROLLER: AI Answer Fit Assessment
// Route: POST /api/questions/:questionHash/answer-fit
// Access: Protected (JWT required)
// ============================================================
// Before submitting an answer, a user can have the AI evaluate
// how well their draft answer actually addresses the question.
// Returns a level (strong / partial / weak) and an explanation note.
export const assessAnswerAgainstQuestionController = async (req, res, next) => {
  try {
    const { questionHash } = req.params; // which question is being answered
    const { answerText } = req.body; // the draft answer to evaluate

    // First, fetch the original question so we can pass its title and content to Gemini
    const { question } = await getSingleQuestionService({ questionHash });

    // Service sends both the original question and the draft answer to Gemini,
    // which responds with a fit level and a coaching note
    const data = await assessAnswerAgainstQuestionService({
      questionTitle: question.title,
      questionContent: question.content,
      answerText,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Answer fit assessed.",
      data, // e.g. { level: "strong", note: "Your answer is highly relevant..." }
    });
  } catch (error) {
    next(error);
  }
};
