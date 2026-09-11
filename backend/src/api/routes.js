import express from 'express';
import authRoutes from './auth/routes/auth.routes.js';

export const mainRouter = express.Router();



// Authentication routes
// /api/auth
mainRouter.use('/auth', authRoutes);
