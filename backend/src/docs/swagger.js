/**
 * OpenAPI 3.0.3 specification for the Evangadi Forum API.
 */
const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Evangadi Forum API',
    version: '1.0.0',
    description:
      'AI-powered community forum API with semantic search, RAG document querying, ' +
      'AI draft coaching, and answer-fit assessment powered by Google Gemini.',
    contact: {
      name: 'Evangadi Forum Team',
    },
  },
  servers: [
    {
      url: 'http://localhost:3777',
      description: 'Local development server',
    },
  ],

  // ─── Reusable components ───────────────────────────────────────────────────
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from POST /api/auth/login',
      },
    },

    schemas: {
      // ── Auth ──────────────────────────────────────────────────────────────
      RegisterRequest: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'password'],
        properties: {
          firstName: { type: 'string', minLength: 3, example: 'Abebe' },
          lastName:  { type: 'string', minLength: 3, example: 'Kebede' },
          email:     { type: 'string', format: 'email', example: 'abebe@example.com' },
          password:  { type: 'string', minLength: 6, example: 'secret123' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'abebe@example.com' },
          password: { type: 'string', example: 'secret123' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id:        { type: 'integer', example: 1 },
          firstName: { type: 'string',  example: 'Abebe' },
          lastName:  { type: 'string',  example: 'Kebede' },
          email:     { type: 'string',  example: 'abebe@example.com' },
          createdAt: { type: 'string',  format: 'date-time' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string',  example: 'Login successful.' },
          user:    { $ref: '#/components/schemas/User' },
          token:   { type: 'string',  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
      },

      // ── Question ──────────────────────────────────────────────────────────
      QuestionRequest: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title:   { type: 'string', minLength: 5, maxLength: 255, example: 'Why does my React state reset after navigation?' },
          content: { type: 'string', minLength: 10, example: 'I store a draft in component state, navigate away, come back and the draft is gone.' },
        },
      },
      Question: {
        type: 'object',
        properties: {
          id:           { type: 'integer',  example: 42 },
          questionHash: { type: 'string',   example: 'a1b2c3d4e5f6g7h8', description: '16-char hex identifier' },
          title:        { type: 'string',   example: 'Why does my React state reset after navigation?' },
          content:      { type: 'string',   example: 'I store a draft in component state...' },
          answerCount:  { type: 'integer',  example: 3 },
          createdAt:    { type: 'string',   format: 'date-time' },
          updatedAt:    { type: 'string',   format: 'date-time' },
          author: {
            type: 'object',
            properties: {
              id:        { type: 'integer', example: 1 },
              firstName: { type: 'string',  example: 'Abebe' },
              lastName:  { type: 'string',  example: 'Kebede' },
            },
          },
        },
      },
      QuestionWithScore: {
        allOf: [
          { $ref: '#/components/schemas/Question' },
          {
            type: 'object',
            properties: {
              score: { type: 'number', format: 'float', example: 0.87, description: 'Cosine similarity score (0–1)' },
            },
          },
        ],
      },

      // ── Answer ────────────────────────────────────────────────────────────
      AnswerRequest: {
        type: 'object',
        required: ['questionId', 'content'],
        properties: {
          questionId: { type: 'integer', minimum: 1, example: 42 },
          content:    { type: 'string',  minLength: 3, example: 'You should use `useRef` or `localStorage` to persist the value across navigation.' },
        },
      },
      AnswerUpdateRequest: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 3, example: 'Updated explanation with code example.' },
        },
      },
      Answer: {
        type: 'object',
        properties: {
          id:         { type: 'integer', example: 7 },
          questionId: { type: 'integer', example: 42 },
          content:    { type: 'string',  example: 'Use `useRef` or `localStorage`.' },
          createdAt:  { type: 'string',  format: 'date-time' },
          updatedAt:  { type: 'string',  format: 'date-time' },
          author: {
            type: 'object',
            properties: {
              id:        { type: 'integer', example: 2 },
              firstName: { type: 'string',  example: 'Sara' },
              lastName:  { type: 'string',  example: 'Haile' },
            },
          },
        },
      },

      // ── RAG Document ──────────────────────────────────────────────────────
      RagDocument: {
        type: 'object',
        properties: {
          id:         { type: 'integer', example: 3 },
          filename:   { type: 'string',  example: 'react-hooks-guide.pdf' },
          chunkCount: { type: 'integer', example: 47 },
          status:     { type: 'string',  enum: ['ready', 'processing', 'failed'], example: 'ready' },
          createdAt:  { type: 'string',  format: 'date-time' },
          userId:     { type: 'integer', example: 1 },
        },
      },
      RagChunk: {
        type: 'object',
        properties: {
          chunkId:  { type: 'integer', example: 12 },
          excerpt:  { type: 'string',  example: 'useEffect runs after every render by default...' },
          score:    { type: 'number',  format: 'float', example: 0.91 },
        },
      },
      RagQueryRequest: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', example: 'How do I prevent useEffect from running on every render?' },
        },
      },
      RagQueryResponse: {
        type: 'object',
        properties: {
          answer: { type: 'string', example: 'Pass a dependency array as the second argument to useEffect...' },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                chunk_id: { type: 'integer', example: 12 },
                excerpt:  { type: 'string',  example: 'useEffect runs after every render...' },
                page:     { type: 'string',  example: '4' },
              },
            },
          },
        },
      },

      // ── AI endpoints ──────────────────────────────────────────────────────
      DraftCoachRequest: {
        type: 'object',
        required: ['content'],
        properties: {
          title:   { type: 'string', example: 'React state reset on navigation' },
          content: { type: 'string', example: 'My state disappears when I navigate back.' },
        },
      },
      DraftCoachResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string',  example: 'Draft suggestions generated' },
          data: {
            type: 'object',
            properties: {
              tips: {
                type: 'array',
                items: { type: 'string' },
                example: [
                  'Add a code snippet showing the component state initialisation.',
                  'Mention which React Router version you are using.',
                  'Include the exact error or unexpected behaviour you observe.',
                ],
              },
            },
          },
        },
      },
      AnswerFitRequest: {
        type: 'object',
        required: ['answerText'],
        properties: {
          answerText: { type: 'string', example: 'You should persist state with useRef or Context.' },
        },
      },
      AnswerFitResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string',  example: 'Answer fit assessed.' },
          data: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['strong', 'partial', 'weak'], example: 'strong' },
              note:  { type: 'string', example: 'Your answer directly addresses the problem and provides a working solution.' },
            },
          },
        },
      },

      // ── Common ────────────────────────────────────────────────────────────
      SuccessEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string',  example: 'Something went wrong.' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string',  example: 'Validation failed.' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field:   { type: 'string', example: 'email' },
                message: { type: 'string', example: 'Must be a valid email address.' },
              },
            },
          },
        },
      },
    },

    // ── Shared response objects ──────────────────────────────────────────────
    responses: {
      Unauthorized: {
        description: 'Missing or invalid JWT token',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
        },
      },
      Forbidden: {
        description: 'Authenticated but not authorised to access this resource',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
        },
      },
      BadRequest: {
        description: 'Validation error or bad input',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } },
        },
      },
      InternalError: {
        description: 'Unexpected server error',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
        },
      },
    },

    // ── Shared parameters ────────────────────────────────────────────────────
    parameters: {
      questionHash: {
        name: 'questionHash',
        in: 'path',
        required: true,
        description: '16-character lowercase hex question identifier',
        schema: { type: 'string', pattern: '^[a-f0-9]{16}$', example: 'a1b2c3d4e5f6a7b8' },
      },
      answerId: {
        name: 'answerId',
        in: 'path',
        required: true,
        description: 'Numeric answer ID',
        schema: { type: 'integer', minimum: 1, example: 7 },
      },
      documentId: {
        name: 'documentId',
        in: 'path',
        required: true,
        description: 'Numeric RAG document ID',
        schema: { type: 'integer', minimum: 1, example: 3 },
      },
    },
  },

  // ─── Paths ─────────────────────────────────────────────────────────────────
  paths: {

    // ── Health ──────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Returns server status and current timestamp. No authentication required.',
        operationId: 'getHealth',
        responses: {
          200: {
            description: 'Server is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status:    { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Auth ────────────────────────────────────────────────────────────────
    '/api/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        operationId: 'registerUser',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          201: {
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          409: {
            description: 'Email already registered',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          500: { $ref: '#/components/responses/InternalError' },
        },
      },
    },

    '/api/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login and receive a JWT token',
        operationId: 'loginUser',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Login successful — returns JWT token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: {
            description: 'Invalid email or password',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          500: { $ref: '#/components/responses/InternalError' },
        },
      },
    },

    // ── Questions ───────────────────────────────────────────────────────────
    '/api/questions': {
      post: {
        tags: ['Questions'],
        summary: 'Create a new question',
        description: 'Creates a question and automatically generates a Gemini vector embedding for semantic search.',
        operationId: 'createQuestion',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/QuestionRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Question created successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Question' },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          500: { $ref: '#/components/responses/InternalError' },
        },
      },

      get: {
        tags: ['Questions'],
        summary: 'List questions',
        description: 'Returns up to 100 questions, sorted newest first. Supports keyword search and filtering to the current user\'s questions.',
        operationId: 'listQuestions',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'search',
            in: 'query',
            required: false,
            description: 'Keyword filter applied to title and content (SQL LIKE)',
            schema: { type: 'string', example: 'React state' },
          },
          {
            name: 'mine',
            in: 'query',
            required: false,
            description: 'If true, returns only questions authored by the authenticated user',
            schema: { type: 'boolean', example: false },
          },
        ],
        responses: {
          200: {
            description: 'Questions fetched successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Question' },
                        },
                        meta: {
                          type: 'object',
                          properties: {
                            limit:     { type: 'integer', example: 100 },
                            total:     { type: 'integer', example: 45 },
                            sortBy:    { type: 'string',  example: 'newest' },
                            sortOrder: { type: 'string',  example: 'desc' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          500: { $ref: '#/components/responses/InternalError' },
        },
      },
    },

    '/api/questions/search': {
      get: {
        tags: ['Questions'],
        summary: 'Semantic search questions',
        description: 'Converts the query to a Gemini vector embedding and returns the most similar questions ranked by cosine similarity.',
        operationId: 'searchQuestionsSemantic',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'query',
            in: 'query',
            required: true,
            description: 'Natural language search query (min 5 characters)',
            schema: { type: 'string', minLength: 5, example: 'How do I persist state across route changes?' },
          },
          {
            name: 'k',
            in: 'query',
            required: false,
            description: 'Maximum number of results (1–20)',
            schema: { type: 'integer', minimum: 1, maximum: 20, example: 5 },
          },
          {
            name: 'threshold',
            in: 'query',
            required: false,
            description: 'Minimum cosine similarity score (0–1)',
            schema: { type: 'number', minimum: 0, maximum: 1, example: 0.75 },
          },
        ],
        responses: {
          200: {
            description: 'Semantic search results',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/QuestionWithScore' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          503: {
            description: 'Gemini embedding service unavailable',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    '/api/questions/draft-coach': {
      post: {
        tags: ['Questions', 'AI'],
        summary: 'AI Draft Coach — improve a question draft',
        description: 'Sends the draft title and body to Gemini and receives actionable tips for making the question clearer and easier to answer.',
        operationId: 'draftCoach',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/DraftCoachRequest' } },
          },
        },
        responses: {
          200: {
            description: 'AI coaching tips returned',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/DraftCoachResponse' } },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          503: {
            description: 'Gemini service unavailable',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    '/api/questions/backfill-embeddings': {
      post: {
        tags: ['Questions', 'AI'],
        summary: 'Backfill failed embeddings',
        description: 'Re-generates Gemini vector embeddings for questions that previously failed (status = "failed" or missing vector). Useful after resolving API key issues.',
        operationId: 'backfillEmbeddings',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Backfill completed',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          description: 'Counts of processed, succeeded, and failed questions',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          503: {
            description: 'Gemini service unavailable',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    '/api/questions/{questionHash}': {
      get: {
        tags: ['Questions'],
        summary: 'Get a single question with its answers',
        operationId: 'getQuestion',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/questionHash' }],
        responses: {
          200: {
            description: 'Question and answers fetched successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        question: { $ref: '#/components/schemas/Question' },
                        answers: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Answer' },
                        },
                        answersMeta: {
                          type: 'object',
                          properties: {
                            limit: { type: 'integer', example: 100 },
                            total: { type: 'integer', example: 3 },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/questions/{questionHash}/similar': {
      get: {
        tags: ['Questions', 'AI'],
        summary: 'Find semantically similar questions',
        description: 'Uses the stored embedding for this question to find the most similar other questions via cosine similarity.',
        operationId: 'getSimilarQuestions',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/questionHash' },
          {
            name: 'k',
            in: 'query',
            required: false,
            description: 'Maximum number of results (1–20)',
            schema: { type: 'integer', minimum: 1, maximum: 20, example: 5 },
          },
          {
            name: 'threshold',
            in: 'query',
            required: false,
            description: 'Minimum cosine similarity score (0–1)',
            schema: { type: 'number', minimum: 0, maximum: 1, example: 0.5 },
          },
        ],
        responses: {
          200: {
            description: 'Similar questions returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/QuestionWithScore' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/questions/{questionHash}/answer-fit': {
      post: {
        tags: ['Questions', 'AI'],
        summary: 'AI Answer Fit — assess how well a draft answer addresses a question',
        description: 'Gemini evaluates the draft answer against the question and returns a relevance level (strong / partial / weak) with an explanation note.',
        operationId: 'assessAnswerFit',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/questionHash' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AnswerFitRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Answer fit assessed',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AnswerFitResponse' } },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          503: {
            description: 'Gemini service unavailable',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    // ── Answers ─────────────────────────────────────────────────────────────
    '/api/answers': {
      post: {
        tags: ['Answers'],
        summary: 'Post a new answer',
        operationId: 'createAnswer',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AnswerRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Answer posted successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        answer: { $ref: '#/components/schemas/Answer' },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },

      get: {
        tags: ['Answers'],
        summary: 'List answers for a question',
        description: 'Returns all answers for the given question, ordered oldest first.',
        operationId: 'listAnswers',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'questionId',
            in: 'query',
            required: true,
            description: 'ID of the question to fetch answers for',
            schema: { type: 'integer', minimum: 1, example: 42 },
          },
        ],
        responses: {
          200: {
            description: 'Answers returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        answers: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Answer' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/answers/{answerId}': {
      get: {
        tags: ['Answers'],
        summary: 'Get a single answer',
        operationId: 'getAnswer',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/answerId' }],
        responses: {
          200: {
            description: 'Answer returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        answer: { $ref: '#/components/schemas/Answer' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },

      put: {
        tags: ['Answers'],
        summary: 'Update an answer',
        description: 'Updates the content of an answer. Only the original author may update their answer.',
        operationId: 'updateAnswer',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/answerId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AnswerUpdateRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Answer updated successfully',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        answer: { $ref: '#/components/schemas/Answer' },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },

      delete: {
        tags: ['Answers'],
        summary: 'Delete an answer',
        description: 'Deletes an answer. Only the original author may delete their answer.',
        operationId: 'deleteAnswer',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/answerId' }],
        responses: {
          200: {
            description: 'Answer deleted successfully',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── RAG Documents ────────────────────────────────────────────────────────
    '/api/rag/documents': {
      post: {
        tags: ['RAG Documents'],
        summary: 'Upload a PDF document',
        description:
          'Accepts a PDF file (max 10 MB), chunks it into ~900-character sections, ' +
          'generates Gemini embeddings for each chunk, and stores them for semantic search. ' +
          'Each user is limited to 20 documents.',
        operationId: 'uploadDocument',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'PDF file (max 10 MB)',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Document uploaded and processed',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/RagDocument' },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          413: {
            description: 'File exceeds size limit (10 MB)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },

      get: {
        tags: ['RAG Documents'],
        summary: 'List the authenticated user\'s documents',
        operationId: 'listDocuments',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Documents returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/RagDocument' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/rag/documents/{documentId}': {
      get: {
        tags: ['RAG Documents'],
        summary: 'Get document metadata',
        operationId: 'getDocument',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/documentId' }],
        responses: {
          200: {
            description: 'Document metadata returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/RagDocument' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },

      delete: {
        tags: ['RAG Documents'],
        summary: 'Delete a document',
        description: 'Deletes the document, all its chunks, and associated embeddings. Only the owner may delete.',
        operationId: 'deleteDocument',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/documentId' }],
        responses: {
          200: {
            description: 'Document deleted successfully',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/rag/documents/{documentId}/file': {
      get: {
        tags: ['RAG Documents'],
        summary: 'Download the original PDF file',
        operationId: 'downloadDocumentFile',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/documentId' }],
        responses: {
          200: {
            description: 'PDF file stream',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/rag/documents/{documentId}/search': {
      get: {
        tags: ['RAG Documents'],
        summary: 'Semantic search within a document',
        description: 'Embeds the query with Gemini and returns the top-k most similar chunks from the document.',
        operationId: 'searchDocument',
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/documentId' },
          {
            name: 'query',
            in: 'query',
            required: true,
            description: 'Search text',
            schema: { type: 'string', example: 'how to use useEffect dependency array' },
          },
          {
            name: 'k',
            in: 'query',
            required: false,
            description: 'Max chunks to return (1–20, default 10)',
            schema: { type: 'integer', minimum: 1, maximum: 20, example: 10 },
          },
        ],
        responses: {
          200: {
            description: 'Ranked chunk excerpts returned',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/RagChunk' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/rag/documents/{documentId}/query': {
      post: {
        tags: ['RAG Documents'],
        summary: 'Query a document with AI (RAG)',
        description:
          'Retrieves the most relevant chunks from the document via semantic search, ' +
          'then passes them to Gemini as context to generate a grounded answer with source citations.',
        operationId: 'queryDocument',
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/documentId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RagQueryRequest' } },
          },
        },
        responses: {
          200: {
            description: 'AI-generated answer with citations',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessEnvelope' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/RagQueryResponse' },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          503: {
            description: 'Gemini service unavailable',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
  },

  // ─── Tags (section ordering and descriptions) ───────────────────────────────
  tags: [
    { name: 'System',        description: 'Health and status endpoints' },
    { name: 'Authentication', description: 'Register and login — returns JWT for protected routes' },
    { name: 'Questions',     description: 'CRUD and search for forum questions' },
    { name: 'Answers',       description: 'CRUD for answers to questions' },
    { name: 'AI',            description: 'Gemini-powered coaching, fit assessment, and semantic search' },
    { name: 'RAG Documents', description: 'Upload PDFs, search within them, and query them with AI' },
  ],
};

export default swaggerSpec;