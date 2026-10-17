# AI-Powered Evangadi Forum

A full-stack question-and-answer forum with AI built in. Users can ask and answer questions, find related questions by **meaning** (not just keywords), get AI feedback while writing, and upload private PDFs to search and chat with them using **Retrieval-Augmented Generation (RAG)**.

This is my personal version of the Evangadi forum project that I first built as part of a team.

---

## Features

**Forum**
- Register and log in (JWT authentication, bcrypt-hashed passwords)
- Ask questions with a Markdown editor (toolbar, smart paste for links and code)
- Answer, edit, and delete your own answers
- Code blocks with syntax highlighting and a copy button
- "My Questions" page for the questions you created

**AI features (Google Gemini)**
- **AI Search:** semantic search over all questions using embeddings
- **Related questions:** similar questions shown beside every question
- **AI Draft Coach:** feedback on a question before you post it
- **Answer Fit:** an AI check of how well a draft answer addresses the question

**Knowledge Base (RAG)**
- Upload private PDFs (up to 10 MB each)
- Semantic search inside a selected PDF
- Ask AI: answers grounded in the PDF, with numbered source references

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, React Router, Axios, react-markdown, Framer Motion |
| Backend | Node.js (ES modules), Express 5, express-validator, multer, pdf-parse |
| Database | MySQL (embeddings stored as JSON columns) |
| AI | Google Gemini (`@google/genai`): embeddings and text generation |
| Auth | JSON Web Tokens, bcryptjs |
| Hosting | Railway (backend and MySQL), Vercel (frontend) |
| Testing | Vitest and Testing Library (frontend), `node --test` (backend) |

## How it fits together

```
 Browser (React + Vite)
        |  HTTPS / JSON + JWT
        v
 Express API  ──────────►  Google Gemini API
   |   |                   (embeddings, text)
   |   └─ PDF files on disk (uploads/)
   v
 MySQL  (users, questions, answers, documents, chunks, vectors)
```

---

## Project structure

```
AI-Powered-Evangadi-Forum/
├── backend/
│   ├── index.js                  App entry: middleware, /health, /api router
│   ├── db/
│   │   ├── config.js             MySQL connection pool
│   │   └── schema.sql            All tables (import once)
│   └── src/
│       ├── api/
│       │   ├── routes.js         Mounts every feature router under /api
│       │   ├── auth/             register, login
│       │   ├── question/         questions, semantic search, related, AI coach, answer fit
│       │   ├── answer/           create, list, get, update, delete
│       │   └── rag/              PDF upload, document search, document Q&A
│       │   (each feature: routes → controller → service, plus validation)
│       ├── middleware/           authentication, validation-handler, error-handler
│       ├── utils/errors/         custom error classes
│       └── docs/swagger.js       OpenAPI spec served at /api/docs
├── frontend/
│   ├── index.html
│   ├── vercel.json               Sends every path to index.html (React Router on Vercel)
│   └── src/
│       ├── App.jsx               Route table
│       ├── components/           Layout, Navbar, Sidebar, ProtectedRoute, RagAnswerBody, HighlightedCodeBlock
│       ├── contexts/             AuthContext (user and token state)
│       ├── pages/                One folder per page (JSX + CSS module)
│       ├── services/             API calls: core (axios client), auth, question, answer, rag
│       ├── lib/                  Helpers (time formatting, markdown formatting)
│       └── styles/               Global styles and design tokens
└── ui-designs/                   Design references for each page
```

## Frontend pages

| Route | Page | Access |
| --- | --- | --- |
| `/` | Landing page | Public |
| `/auth` | Login and register | Public |
| `/dashboard` | Question feed, keyword and AI search, stats | Logged in |
| `/questions/ask` | Ask a question (Markdown editor, AI Draft Coach) | Logged in |
| `/my-questions` | Questions you created | Logged in |
| `/questions/:questionHash` | Question, answers, related questions, answer editor | Logged in |
| `/rag-documents` | PDF Knowledge Base: preview, semantic search, Ask AI | Logged in |

---

## Getting started (local)

### Prerequisites
- Node.js 20 or newer
- MySQL 8 (XAMPP or a standalone install works)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### 1. Clone
```bash
git clone https://github.com/abuseaad/AI-Powered-Evangadi-Forum.git
cd AI-Powered-Evangadi-Forum
```

### 2. Create the database
Create an empty database, then import the schema (it contains no `CREATE DATABASE` line):
```bash
mysql -u root -p -e "CREATE DATABASE evangadi_forum CHARACTER SET utf8mb4;"
mysql -u root -p evangadi_forum < backend/db/schema.sql
```
In phpMyAdmin: create the database, open **Import**, and choose `backend/db/schema.sql`.

The schema starts with `DROP TABLE IF EXISTS`, so importing it again on a database that has data **erases that data**.

### 3. Start the backend
```bash
cd backend
npm install
npm run dev
```
Set the backend environment variables first (see the table below). Expected output: `Database connection established successfully.` and the server port. Check `http://localhost:3777/health`.

### 4. Start the frontend
```bash
cd frontend
npm install
npm run dev
```
Open the URL Vite prints (usually `http://localhost:5173`). The backend must be running.

---

## Environment variables

### Backend

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3777` | Server port (Railway sets it automatically) |
| `DB_HOST` | In production | `localhost` | MySQL host |
| `DB_USER` | In production | `root` | MySQL user |
| `DB_PASS` | In production | empty | MySQL password |
| `DB_NAME` | In production | `evangadi_forum` | Database name |
| `JWT_SECRET` | **Yes** | none | Secret used to sign tokens. The server stops at startup without it. |
| `JWT_EXPIRES_IN` | No | `1d` | Token lifetime |
| `GEMINI_API_KEY` | **Yes** | none | Google Gemini API key. The server stops at startup without it. |
| `GEMINI_EMBEDDING_MODEL` | No | `gemini-embedding-001` | Model used for embeddings |
| `GEMINI_TEXT_MODEL` | Recommended | built-in fallback | Text model for Draft Coach, Answer Fit, and RAG answers |
| `RECOMMEND_THRESHOLD` | No | `0.75` | Minimum similarity for related questions |
| `RECOMMEND_K` | No | `5` | Number of related questions returned |

Fixed in code (not configurable): PDF upload max 10 MB, chunks of 1000 characters with 150 overlap, PDF search returns up to 5 passages with a minimum similarity of 0.5.

### Frontend

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | In production | Backend URL with no trailing slash. Falls back to `http://localhost:3777`. |

Vite reads this value **at build time**, so after changing it on Vercel you must redeploy.

---

## API overview

All endpoints except `/health`, register, and login need the header `Authorization: Bearer <token>`. Exact request and response shapes are in Swagger at `/api/docs`.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Health check |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Log in and receive a JWT |
| POST | `/api/questions` | Create a question |
| GET | `/api/questions` | List questions (`?search=` keyword, `?mine=true`) |
| GET | `/api/questions/search` | Semantic (AI) search, `?query=` with at least 5 characters |
| GET | `/api/questions/:questionHash` | One question with its answers |
| GET | `/api/questions/:questionHash/similar` | Related questions |
| POST | `/api/questions/draft-coach` | AI feedback on a question draft |
| POST | `/api/questions/:questionHash/answer-fit` | AI check of a draft answer |
| POST | `/api/questions/backfill-embeddings` | Re-create missing question embeddings |
| POST | `/api/answers` | Post an answer |
| GET | `/api/answers` | List answers for a question |
| GET | `/api/answers/:answerId` | One answer |
| PUT | `/api/answers/:answerId` | Edit your answer |
| DELETE | `/api/answers/:answerId` | Delete your answer |
| POST | `/api/rag/documents` | Upload a PDF |
| GET | `/api/rag/documents` | List your documents |
| GET | `/api/rag/documents/:documentId` | Document details |
| DELETE | `/api/rag/documents/:documentId` | Delete a document |
| GET | `/api/rag/documents/:documentId/file` | Download the original PDF |
| GET | `/api/rag/documents/:documentId/search` | Semantic search inside a PDF |
| POST | `/api/rag/documents/:documentId/query` | Ask AI about a PDF (answer and citations) |

## Database

Tables created by `backend/db/schema.sql`: `users`, `questions`, `question_vectors`, `answers`, `documents`, `document_chunks`, `document_chunk_vectors`.

## How the AI features work

1. **Embeddings:** when a question is posted, Gemini turns it into a vector stored in `question_vectors`.
2. **Semantic search and related questions:** the query is embedded and compared with stored vectors by cosine similarity.
3. **RAG on PDFs:** an uploaded PDF is read with `pdf-parse`, split into overlapping chunks, and each chunk is embedded. A question retrieves the most similar chunks, and Gemini answers using only those chunks, returning numbered citations.

---

## Scripts

| Folder | Command | What it does |
| --- | --- | --- |
| `backend` | `npm run dev` | Start with auto-restart (`node --watch`) |
| `backend` | `npm start` | Start normally (used in production) |
| `backend` | `npm test` | Run backend tests |
| `frontend` | `npm run dev` | Start the Vite dev server |
| `frontend` | `npm run build` | Production build into `dist/` |
| `frontend` | `npm run preview` | Preview the production build |
| `frontend` | `npm test` | Run Vitest once |
| `frontend` | `npm run lint` | Run ESLint |

---

## Deployment

### Backend and MySQL on Railway
1. Create a Railway project and add **MySQL**. Import `backend/db/schema.sql` into it.
2. Add a service from this GitHub repo and set **Root Directory** to `backend`. Railway runs `npm start`.
3. In **Variables**, add (use your MySQL service name in the references):
   ```
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASS=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   JWT_SECRET=<a new long random string>
   GEMINI_API_KEY=<your key>
   GEMINI_TEXT_MODEL=<your model>
   ```
   Do not add `PORT`.
4. **Settings → Networking → Generate Domain**, then test `/health`.
5. Attach a **Volume** mounted at `/app/uploads`. Without it, uploaded PDFs are deleted on every redeploy.

Generate a secret with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend on Vercel
1. On vercel.com choose **Add New → Project** and import the repo.
2. Set **Root Directory** to `frontend` and **Framework Preset** to Vite.
3. Add the environment variable `VITE_API_BASE_URL` with your Railway backend URL.
4. Click **Deploy**.

`frontend/vercel.json` sends every path to `index.html`; without it, refreshing a page such as `/dashboard` returns a 404:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `JWT_SECRET environment variable is required` | Add `JWT_SECRET` to the backend environment (local or Railway Variables) |
| `GEMINI_API_KEY environment variable is required` | Add `GEMINI_API_KEY` the same way |
| `Table ... doesn't exist` | Import `backend/db/schema.sql` into the database named in `DB_NAME` |
| `Cannot GET /` on the backend URL | Normal. The API has no page at `/`. Use `/health` or `/api/docs`. |
| "Network Error" on login (deployed) | `VITE_API_BASE_URL` is wrong or missing. Fix it and redeploy. |
| 404 after refreshing a page on Vercel | `frontend/vercel.json` is missing |
| AI Search button missing | It appears after 5 typed characters, which is the backend minimum |
| Uploaded PDFs disappear on Railway | Add a Volume mounted at `/app/uploads` |

---

## Author

Built by [Sadik Jemal]