import express from "express";
import authRoutes from "./auth/routes/auth.routes.js";
import questionRoutes from "./question/routes/question.route.js";
import answerRoutes from "./answer/routes/answer.route.js";
import ragRoutes from "./rag/routes/rag.route.js";

export const mainRouter = express.Router();

// Authentication routes
mainRouter.use("/auth", authRoutes);

// Question routes
mainRouter.use("/questions", questionRoutes);

// Answer routes
mainRouter.use("/answers", answerRoutes);

// RAG document routes
mainRouter.use("/rag/documents", ragRoutes);